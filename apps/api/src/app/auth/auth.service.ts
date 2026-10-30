import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, PrismaService, UserRole, DeviceMode } from '@taskplay/api-database';
import type {
  DeviceInfo,
  EnrollRequest,
  LoginRequest,
  RegisterRequest,
  SessionRequest,
  TokenPair,
  TokenScope,
} from '@taskplay/shared-types';
import { ENROLLMENT_TTL_MINUTES, LOCKOUT, loadAuthConfig, type AuthConfig } from './auth.config';
import type { AccessTokenPayload, Actor } from './auth.types';
import { pseudonymize } from '@taskplay/api-observability';
import { PinoLogger } from 'nestjs-pino';
import { TCLE_VIGENTE } from './tcle';
import { corpoDeErro } from './zod-validation';
import { CARTA_DE_TRANSFERENCIA } from '../tasks/catalogo-de-sistema';
import {
  generateEnrollmentCode,
  generateRefreshToken,
  hashFingerprint,
  hashSecret,
  hashToken,
  tokenFingerprint,
  verifySecret,
} from './crypto';

@Injectable()
export class AuthService {
  private readonly config: AuthConfig;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly logger: PinoLogger,
  ) {
    this.config = loadAuthConfig();
    this.logger.setContext(AuthService.name);
  }

  async register(input: RegisterRequest): Promise<TokenPair> {
    if (input.acceptedTcleVersion !== TCLE_VIGENTE.version) {
      throw new ConflictException(
        corpoDeErro('Cadastro inválido', [
          {
            path: 'acceptedTcleVersion',
            code: 'outdated',
            message:
              'O Termo de Consentimento foi atualizado. Leia a versão atual e concorde de novo.',
          },
        ]),
      );
    }

    const [passwordHash, pinHash] = await Promise.all([
      hashSecret(input.password),
      hashSecret(input.pin),
    ]);

    const { user, device } = await this.criarFamilia(input, passwordHash, pinHash);

    this.logger.info(
      {
        consentimento: true,
        evento: 'tcle.aceito',
        familia: pseudonymize(user.familyId),
        versao: input.acceptedTcleVersion,
      },
      'TCLE aceito no cadastro da familia',
    );

    return this.issueTokens(user.id, user.familyId, user.role, device.id, 'full');
  }

  private async criarFamilia(input: RegisterRequest, passwordHash: string, pinHash: string) {
    try {
      return await this.escreverFamilia(input, passwordHash, pinHash);
    } catch (erro) {
      if (
        erro instanceof Prisma.PrismaClientKnownRequestError &&
        erro.code === 'P2002' &&
        colisaoEm(erro, 'email')
      ) {
        // Vai com `path`, na mesma forma das recusas de schema: assim a tela
        // acende a borda do campo de e-mail sem precisar interpretar o texto.
        const jaCadastrado = 'Já existe uma conta com este e-mail';
        throw new ConflictException(
          corpoDeErro('Cadastro inválido', [
            { path: 'email', code: 'duplicate', message: jaCadastrado },
          ]),
        );
      }
      throw erro;
    }
  }

  private async escreverFamilia(input: RegisterRequest, passwordHash: string, pinHash: string) {
    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          name: input.familyName,
          tcleVersion: input.acceptedTcleVersion,
          tcleAcceptedAt: new Date(),
        },
      });

      const created = await tx.user.create({
        data: {
          familyId: family.id,
          name: input.name,
          role: UserRole.PARENT,
          email: input.email.toLowerCase(),
          passwordHash,
          pinHash,
          wallet: { create: {} },
        },
      });

      await tx.storeItem.create({
        data: {
          familyId: family.id,
          createdById: created.id,
          ...CARTA_DE_TRANSFERENCIA,
        },
      });

      const registered = await tx.device.create({
        data: {
          familyId: family.id,
          mode: DeviceMode.SHARED,
          label: input.device.label,
          platform: input.device.platform,
          model: input.device.model,
          lastSeenAt: new Date(),
        },
      });

      return { user: created, device: registered };
    });
  }

  async login(input: LoginRequest): Promise<TokenPair> {
    const email = input.email.toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Mensagem unica para e-mail inexistente e senha errada: distinguir os dois
    // casos entrega ao atacante quais e-mails existem no sistema.
    if (!user || !user.passwordHash || user.deactivatedAt) {
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    this.assertNotLocked(user.lockedUntil);

    if (!(await verifySecret(input.password, user.passwordHash))) {
      await this.registerFailure(user.id, user.failedAuthAttempts);
      throw new UnauthorizedException('E-mail ou senha inválidos');
    }

    await this.clearFailures(user.id);

    const device = await this.prisma.device.create({
      data: {
        familyId: user.familyId,
        mode: DeviceMode.SHARED,
        label: input.device.label,
        platform: input.device.platform,
        model: input.device.model,
        lastSeenAt: new Date(),
      },
    });

    return this.issueTokens(user.id, user.familyId, user.role, device.id, 'full');
  }

  async listProfiles(refreshToken: string) {
    const session = await this.requireSession(refreshToken);
    const device = session.device;

    if (device.mode === DeviceMode.PERSONAL) {
      return [this.toProfileSummary(session.user)];
    }

    const members = await this.prisma.user.findMany({
      where: { familyId: device.familyId, deactivatedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
    });

    return members.map((member) => this.toProfileSummary(member));
  }

  async createSession(input: SessionRequest): Promise<TokenPair> {
    const session = await this.requireSession(input.refreshToken);
    const device = session.device;

    const target = await this.prisma.user.findFirst({
      where: { id: input.userId, familyId: device.familyId, deactivatedAt: null },
    });
    if (!target) {
      throw new NotFoundException('Perfil não encontrado nesta família');
    }

    // Num aparelho pessoal nao ha seletor: ele serve a um perfil so.
    if (device.mode === DeviceMode.PERSONAL && target.id !== session.userId) {
      throw new ForbiddenException('Este aparelho está vinculado a um único perfil');
    }

    const scope: TokenScope = input.scope ?? 'full';

    if (scope === 'full' && this.requiresPin(target)) {
      this.assertNotLocked(target.lockedUntil);

      if (!input.pin) {
        throw new UnauthorizedException('PIN obrigatório para este perfil');
      }
      if (!target.pinHash || !(await verifySecret(input.pin, target.pinHash))) {
        await this.registerFailure(target.id, target.failedAuthAttempts);
        throw new UnauthorizedException('PIN inválido');
      }
      await this.clearFailures(target.id);
    }

    await this.prisma.device.update({
      where: { id: device.id },
      data: { lastSeenAt: new Date() },
    });

    return this.issueTokens(target.id, device.familyId, target.role, device.id, scope);
  }

  /** Rotaciona o par do perfil corrente. Nunca troca de perfil. */
  async refresh(refreshToken: string): Promise<TokenPair> {
    const session = await this.requireSession(refreshToken);
    return this.issueTokens(
      session.userId,
      session.device.familyId,
      session.user.role,
      session.deviceId,
      'full',
    );
  }

  /** Encerra a sessao de um perfil neste aparelho. Os demais continuam. */
  async logout(refreshToken: string): Promise<void> {
    const hash = hashToken(refreshToken);
    await this.prisma.deviceSession.updateMany({
      where: { refreshTokenHash: hash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async createEnrollment(actor: Actor, userId: string): Promise<{ code: string; expiresAt: Date }> {
    const target = await this.prisma.user.findFirst({
      where: { id: userId, familyId: actor.familyId, deactivatedAt: null },
    });
    if (!target) {
      throw new NotFoundException('Perfil não encontrado nesta família');
    }

    const code = generateEnrollmentCode();
    const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MINUTES * 60_000);

    await this.prisma.deviceEnrollment.create({
      data: {
        familyId: actor.familyId,
        userId: target.id,
        codeHash: hashToken(code),
        expiresAt,
        createdById: actor.userId,
      },
    });

    return { code, expiresAt };
  }

  async enroll(input: EnrollRequest): Promise<TokenPair> {
    const enrollment = await this.prisma.deviceEnrollment.findFirst({
      where: { codeHash: hashToken(input.code.toUpperCase()), usedAt: null },
      include: { user: true },
    });

    if (!enrollment || enrollment.expiresAt <= new Date() || enrollment.user.deactivatedAt) {
      throw new UnauthorizedException('Código inválido ou expirado');
    }

    const device = await this.prisma.$transaction(async (tx) => {
      // Marca o uso condicionando a `usedAt: null` na propria escrita: dois
      // aparelhos digitando o mesmo codigo ao mesmo tempo nao entram os dois.
      const consumed = await tx.deviceEnrollment.updateMany({
        where: { id: enrollment.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (consumed.count === 0) {
        throw new UnauthorizedException('Código inválido ou expirado');
      }

      return tx.device.create({
        data: {
          familyId: enrollment.familyId,
          mode: DeviceMode.PERSONAL,
          label: input.device.label,
          platform: input.device.platform,
          model: input.device.model,
          lastSeenAt: new Date(),
        },
      });
    });

    return this.issueTokens(
      enrollment.userId,
      enrollment.familyId,
      enrollment.user.role,
      device.id,
      'full',
    );
  }

  async revokeDevice(actor: Actor, deviceId: string): Promise<void> {
    const device = await this.prisma.device.findFirst({
      where: { id: deviceId, familyId: actor.familyId },
    });
    if (!device) {
      throw new NotFoundException('Aparelho não encontrado nesta família');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.device.update({ where: { id: deviceId }, data: { revokedAt: now } }),
      this.prisma.deviceSession.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }

  async listMembers(actor: Actor) {
    return this.prisma.user.findMany({
      where: { familyId: actor.familyId, deactivatedAt: null },
      orderBy: [{ role: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, role: true },
    });
  }

  async me(actor: Actor) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { id: true, name: true, role: true, birthDate: true, familyId: true },
    });

    if (!user) {
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    return { ...user, deviceId: actor.deviceId, scope: actor.scope };
  }

  private async issueTokens(
    userId: string,
    familyId: string,
    role: UserRole,
    deviceId: string,
    scope: TokenScope,
  ): Promise<TokenPair> {
    const payload: AccessTokenPayload = { sub: userId, fid: familyId, role, scope, did: deviceId };
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: this.config.accessTokenTtlSeconds,
    });

    if (scope === 'telemetry') {
      return { accessToken, expiresIn: this.config.accessTokenTtlSeconds, scope };
    }

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + this.config.refreshTokenTtlDays * 86_400_000);
    const data = {
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      revokedAt: null,
      lastUsedAt: new Date(),
    };

    // Um perfil tem no maximo uma sessao por aparelho: entrar de novo renova a
    // linha em vez de acumular sessoes orfas que ninguem consegue revogar.
    const anterior = await this.prisma.deviceSession.findUnique({
      where: { deviceId_userId: { deviceId, userId } },
      select: { refreshTokenHash: true },
    });

    await this.prisma.deviceSession.upsert({
      where: { deviceId_userId: { deviceId, userId } },
      create: { deviceId, userId, ...data },
      update: data,
    });

    if (anterior) {
      this.logger.info(
        {
          auth: true,
          evento: 'sessao.rotacionada',
          deviceId,
          aposentado: hashFingerprint(anterior.refreshTokenHash),
        },
        'refresh token rotacionado',
      );
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: this.config.accessTokenTtlSeconds,
      scope,
    };
  }

  /** Resolve o refresh token numa sessao viva, ou recusa. */
  private async requireSession(refreshToken: string) {
    const session = await this.prisma.deviceSession.findFirst({
      where: { refreshTokenHash: hashToken(refreshToken), revokedAt: null },
      include: { device: true, user: true },
    });

    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt <= new Date() ||
      session.device.revokedAt !== null ||
      session.user.deactivatedAt !== null
    ) {
      this.logger.warn(
        {
          auth: true,
          evento: 'sessao.recusada',
          apresentado: tokenFingerprint(refreshToken),
          motivo: !session ? 'desconhecido' : 'invalida',
        },
        'refresh token recusado',
      );
      throw new UnauthorizedException('Sessão inválida ou expirada');
    }

    return session;
  }

  private requiresPin(user: { role: UserRole; pinHash: string | null }): boolean {
    return user.role === UserRole.PARENT || user.pinHash !== null;
  }

  private toProfileSummary(user: { id: string; name: string; role: UserRole; pinHash: string | null }) {
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      // Dica de interface: diz a tela se deve pedir o PIN antes de chamar. Nao
      // e controle de acesso - a exigencia vale porque o servidor a repete.
      requiresPin: this.requiresPin(user),
    };
  }

  private assertNotLocked(lockedUntil: Date | null): void {
    if (lockedUntil && lockedUntil > new Date()) {
      const segundos = Math.ceil((lockedUntil.getTime() - Date.now()) / 1000);
      throw new ForbiddenException(`Muitas tentativas. Tente novamente em ${segundos} segundos.`);
    }
  }

  private async registerFailure(userId: string, currentAttempts: number): Promise<void> {
    const attempts = currentAttempts + 1;
    let lockedUntil: Date | null = null;

    if (attempts >= LOCKOUT.threshold) {
      const excedente = attempts - LOCKOUT.threshold;
      const segundos = Math.min(LOCKOUT.baseSeconds * 2 ** excedente, LOCKOUT.maxSeconds);
      lockedUntil = new Date(Date.now() + segundos * 1000);
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { failedAuthAttempts: attempts, lockedUntil },
    });
  }

  private async clearFailures(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { failedAuthAttempts: 0, lockedUntil: null },
    });
  }
}

export function colisaoEm(erro: Prisma.PrismaClientKnownRequestError, coluna: string): boolean {
  const meta = (erro.meta ?? {}) as {
    target?: unknown;
    driverAdapterError?: { cause?: { constraint?: unknown; originalMessage?: unknown } };
  };
  const causa = meta.driverAdapterError?.cause;

  const pistas = [
    JSON.stringify(meta.target ?? ''),
    JSON.stringify(causa?.constraint ?? ''),
    String(causa?.originalMessage ?? ''),
  ];

  return pistas.some((pista) => pista.includes(coluna));
}
