import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DeviceMode, Prisma, UserRole } from '@taskplay/api-database';
import { AuthService } from './auth.service';
import { TCLE_VIGENTE } from './tcle';
import type { AccessTokenPayload } from './auth.types';
import { hashSecret, hashToken } from './crypto';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';

type Dublê = ReturnType<typeof criarPrisma>;

function criarPrisma() {
  return {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    device: { create: jest.fn(), update: jest.fn(), findFirst: jest.fn() },
    deviceSession: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
      updateMany: jest.fn(),
    },
    deviceEnrollment: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn() },
    family: { create: jest.fn() },
    storeItem: { create: jest.fn() },
    $transaction: jest.fn(),
  };
}

function criarServico(prisma: Dublê) {
  const jwt = new JwtService({ secret: SEGREDO, signOptions: { algorithm: 'HS256' } });
  const logger = { info: jest.fn(), warn: jest.fn(), setContext: jest.fn() };
  return {
    service: new AuthService(prisma as never, jwt, logger as never),
    jwt,
    logger,
  };
}

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const APARELHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const RESPONSAVEL = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';

function sessaoViva(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sessao-1',
    deviceId: APARELHO,
    userId: RESPONSAVEL,
    expiresAt: new Date(Date.now() + 86_400_000),
    revokedAt: null,
    device: { id: APARELHO, familyId: FAMILIA, mode: DeviceMode.SHARED, revokedAt: null },
    user: { id: RESPONSAVEL, role: UserRole.PARENT, deactivatedAt: null },
    ...overrides,
  };
}

describe('AuthService', () => {
  let prisma: Dublê;
  let service: AuthService;
  let jwt: JwtService;
  let logger: { info: jest.Mock; warn: jest.Mock; setContext: jest.Mock };

  beforeEach(() => {
    process.env['AUTH_JWT_SECRET'] = SEGREDO;
    // O cadastro registra o aceite do TCLE com a familia pseudonimizada.
    process.env['TELEMETRY_PSEUDONYM_SALT'] = 'salt-de-teste';
    prisma = criarPrisma();
    prisma.deviceSession.upsert.mockResolvedValue({});
    prisma.device.update.mockResolvedValue({});
    prisma.user.update.mockResolvedValue({});
    ({ service, jwt, logger } = criarServico(prisma));
  });

  describe('configuracao', () => {
    it('recusa subir sem segredo de assinatura', () => {
      delete process.env['AUTH_JWT_SECRET'];
      expect(() => criarServico(prisma)).toThrow(/AUTH_JWT_SECRET/);
    });

    it('recusa segredo curto demais', () => {
      process.env['AUTH_JWT_SECRET'] = 'curto';
      expect(() => criarServico(prisma)).toThrow(/curto/);
    });
  });

  describe('primeiro cadastro', () => {
    const cadastro = {
      familyName: 'Familia Souza',
      name: 'Ana',
      email: 'Ana@Exemplo.com',
      password: 'senha-forte-1',
      pin: '4821',
      device: { label: 'iPhone da Ana', platform: 'ios' as const },
      acceptedTcleVersion: TCLE_VIGENTE.version,
    };

    it('recusa o aceite de uma versao que nao e a vigente, apontando o campo', async () => {
      // O termo mora no servidor e pode mudar enquanto alguem le a versao
      // anterior. O `409` com `path` e o que deixa o aplicativo buscar a nova.
      const erro: ConflictException = await service
        .register({ ...cadastro, acceptedTcleVersion: '2020-01-01' })
        .catch((e) => e);

      expect(erro).toBeInstanceOf(ConflictException);
      expect(erro.getResponse()).toMatchObject({
        issues: [{ path: 'acceptedTcleVersion', code: 'outdated' }],
      });
      // Nada foi escrito: a recusa vem antes da transacao.
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('grava o aceite do TCLE na familia, com a hora do servidor', async () => {
      prisma.$transaction.mockImplementation((escrever: (tx: Dublê) => unknown) =>
        escrever(prisma),
      );
      prisma.family.create.mockResolvedValue({ id: FAMILIA });
      prisma.user.create.mockResolvedValue({ id: RESPONSAVEL, familyId: FAMILIA, role: 'PARENT' });
      prisma.storeItem.create.mockResolvedValue({});
      prisma.device.create.mockResolvedValue({ id: APARELHO });

      const antes = Date.now();
      await service.register(cadastro);

      const { data } = prisma.family.create.mock.calls[0][0];
      expect(data.tcleVersion).toBe(TCLE_VIGENTE.version);
      expect(data.tcleAcceptedAt).toBeInstanceOf(Date);
      expect(data.tcleAcceptedAt.getTime()).toBeGreaterThanOrEqual(antes);

      // O evento conta a adesao sem dizer qual familia aderiu.
      const [campos] = logger.info.mock.calls.find(([c]) => c.evento === 'tcle.aceito');
      expect(campos).toMatchObject({ consentimento: true, versao: TCLE_VIGENTE.version });
      expect(JSON.stringify(campos)).not.toContain(FAMILIA);
    });

    function colisaoDoDriver() {
      return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
        meta: {
          modelName: 'User',
          driverAdapterError: {
            name: 'DriverAdapterError',
            cause: {
              kind: 'UniqueConstraintViolation',
              originalCode: '23505',
              originalMessage:
                'duplicate key value violates unique constraint "users_email_key"',
              constraint: { fields: ['email'] },
            },
          },
        },
      });
    }

    it('traduz e-mail ja cadastrado em 409 com o motivo dito', async () => {
      prisma.$transaction.mockRejectedValue(colisaoDoDriver());

      await expect(service.register(cadastro)).rejects.toBeInstanceOf(ConflictException);

      // A recusa aponta o campo, na mesma forma das violacoes de schema: e o
      // que deixa a tela acender a borda do e-mail sem ler o texto da mensagem.
      const erro: ConflictException = await service.register(cadastro).catch((e) => e);
      expect(erro.getResponse()).toEqual({
        error: 'Cadastro inválido',
        message: 'Já existe uma conta com este e-mail',
        issues: [
          { path: 'email', code: 'duplicate', message: 'Já existe uma conta com este e-mail' },
        ],
      });
    });

    it('traduz tambem o formato do motor de consultas proprio', async () => {
      // O `meta.target` continua sendo o formato sem driver adapter. Trocar de
      // adaptador nao pode reintroduzir o `500`.
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: 'test',
          meta: { target: ['users_email_key'] },
        }),
      );

      await expect(service.register(cadastro)).rejects.toBeInstanceOf(ConflictException);
    });

    it('deixa passar falha que nao seja colisao de e-mail', async () => {
      // Mascarar qualquer erro de escrita como "e-mail em uso" mandaria o
      // responsavel trocar de endereco por causa de um banco fora do ar.
      prisma.$transaction.mockRejectedValue(new Error('conexao recusada'));

      await expect(service.register(cadastro)).rejects.toThrow('conexao recusada');
    });
  });

  describe('selecao de perfil', () => {
    it('fixa papel e familia no token, sem consultar o cliente', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      const par = await service.createSession({
        refreshToken: 'opaco',
        userId: FILHO,
        scope: 'full',
      });

      const payload = jwt.verify<AccessTokenPayload>(par.accessToken);
      expect(payload.sub).toBe(FILHO);
      expect(payload.role).toBe(UserRole.CHILD);
      expect(payload.fid).toBe(FAMILIA);
      expect(payload.did).toBe(APARELHO);
    });

    it('entra como filho sem PIN quando o responsavel nao definiu um', async () => {
      // Atrito assimetrico deliberado: o adversario aqui e o irmao, nao a
      // internet, e atrito neste ponto custa dado de pesquisa.
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      await expect(
        service.createSession({ refreshToken: 'opaco', userId: FILHO, scope: 'full' }),
      ).resolves.toBeDefined();
    });

    it('exige PIN para voltar ao perfil do responsavel', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        pinHash: await hashSecret('4821'),
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      await expect(
        service.createSession({ refreshToken: 'opaco', userId: RESPONSAVEL, scope: 'full' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.createSession({
          refreshToken: 'opaco',
          userId: RESPONSAVEL,
          pin: '0000',
          scope: 'full',
        }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.createSession({
          refreshToken: 'opaco',
          userId: RESPONSAVEL,
          pin: '4821',
          scope: 'full',
        }),
      ).resolves.toBeDefined();
    });

    it('dispensa PIN no escopo telemetry, e so nele', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        pinHash: await hashSecret('4821'),
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      const par = await service.createSession({
        refreshToken: 'opaco',
        userId: RESPONSAVEL,
        scope: 'telemetry',
      });

      expect(par.scope).toBe('telemetry');
      expect(jwt.verify<AccessTokenPayload>(par.accessToken).scope).toBe('telemetry');
    });

    it('nao rotaciona a sessao ao emitir token de telemetria', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      const par = await service.createSession({
        refreshToken: 'opaco',
        userId: FILHO,
        scope: 'telemetry',
      });

      expect(prisma.deviceSession.upsert).not.toHaveBeenCalled();
      expect(par.refreshToken).toBeUndefined();
    });

    it('recusa perfil de outra familia', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      // O findFirst filtra por familyId; nao achar significa que o perfil
      // pedido nao pertence a familia do aparelho.
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.createSession({ refreshToken: 'opaco', userId: FILHO, scope: 'full' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('recusa seletor num aparelho pessoal', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(
        sessaoViva({
          userId: FILHO,
          device: {
            id: APARELHO,
            familyId: FAMILIA,
            mode: DeviceMode.PERSONAL,
            revokedAt: null,
          },
        }),
      );
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      await expect(
        service.createSession({ refreshToken: 'opaco', userId: RESPONSAVEL, scope: 'full' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('membros da familia', () => {
    it('consulta pelo familyId do token, e nunca por um campo do corpo', async () => {
      // Nao existe requisicao capaz de listar a familia de outra pessoa: o ator
      // nao informa `familyId` em lugar nenhum (RNF01).
      prisma.user.findMany.mockResolvedValue([]);
      await service.listMembers({
        userId: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        deviceId: APARELHO,
        scope: 'full',
      });

      expect(prisma.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { familyId: FAMILIA, deactivatedAt: null } }),
      );
    });

    it('devolve so o que a tela precisa, e nada alem', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listMembers({
        userId: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        deviceId: APARELHO,
        scope: 'full',
      });

      const { select } = prisma.user.findMany.mock.calls[0][0];
      expect(select).toEqual({ id: true, name: true, role: true });
    });

    it('omite membro desativado', async () => {
      prisma.user.findMany.mockResolvedValue([]);
      await service.listMembers({
        userId: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        deviceId: APARELHO,
        scope: 'full',
      });

      const { where } = prisma.user.findMany.mock.calls[0][0];
      expect(where.deactivatedAt).toBeNull();
    });
  });

  describe('bloqueio progressivo', () => {
    async function tentarPinErrado(tentativasAnteriores: number) {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        pinHash: await hashSecret('4821'),
        failedAuthAttempts: tentativasAnteriores,
        lockedUntil: null,
      });

      await expect(
        service.createSession({
          refreshToken: 'opaco',
          userId: RESPONSAVEL,
          pin: '0000',
          scope: 'full',
        }),
      ).rejects.toThrow(UnauthorizedException);

      return prisma.user.update.mock.calls.at(-1)?.[0].data;
    }

    it('nao bloqueia antes do limite', async () => {
      expect(await tentarPinErrado(0)).toEqual({ failedAuthAttempts: 1, lockedUntil: null });
      expect(await tentarPinErrado(3)).toEqual({ failedAuthAttempts: 4, lockedUntil: null });
    });

    it('bloqueia na quinta falha e dobra a espera', async () => {
      // Quatro digitos sao 10 mil combinacoes; nenhuma funcao de derivacao
      // salva isso. O que detem a busca exaustiva e este contador.
      const quinta = await tentarPinErrado(4);
      const sexta = await tentarPinErrado(5);

      const esperaQuinta = quinta.lockedUntil.getTime() - Date.now();
      const esperaSexta = sexta.lockedUntil.getTime() - Date.now();

      expect(esperaQuinta).toBeGreaterThan(55_000);
      expect(esperaQuinta).toBeLessThanOrEqual(60_000);
      expect(esperaSexta).toBeGreaterThan(115_000);
      expect(esperaSexta).toBeLessThanOrEqual(120_000);
    });

    it('limita a espera a 15 minutos', async () => {
      // Acima disso o atraso vira negacao de servico contra o proprio
      // responsavel, que perde acesso a familia por ter errado o PIN.
      const muitas = await tentarPinErrado(20);
      const espera = muitas.lockedUntil.getTime() - Date.now();
      expect(espera).toBeLessThanOrEqual(900_000);
      expect(espera).toBeGreaterThan(890_000);
    });

    it('recusa a tentativa enquanto o bloqueio vale', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        pinHash: await hashSecret('4821'),
        failedAuthAttempts: 5,
        lockedUntil: new Date(Date.now() + 60_000),
      });

      // Nem com o PIN certo: o bloqueio vale para a janela inteira, senao
      // bastaria acertar na tentativa seguinte a ultima falha.
      await expect(
        service.createSession({
          refreshToken: 'opaco',
          userId: RESPONSAVEL,
          pin: '4821',
          scope: 'full',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('zera o contador quando o PIN acerta', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        pinHash: await hashSecret('4821'),
        failedAuthAttempts: 3,
        lockedUntil: null,
      });

      await service.createSession({
        refreshToken: 'opaco',
        userId: RESPONSAVEL,
        pin: '4821',
        scope: 'full',
      });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: RESPONSAVEL },
        data: { failedAuthAttempts: 0, lockedUntil: null },
      });
    });
  });

  describe('sessao', () => {
    it.each([
      ['revogada', { revokedAt: new Date() }],
      ['expirada', { expiresAt: new Date(Date.now() - 1000) }],
      ['de aparelho revogado', {
        device: { id: APARELHO, familyId: FAMILIA, mode: DeviceMode.SHARED, revokedAt: new Date() },
      }],
      ['de membro desativado', {
        user: { id: RESPONSAVEL, role: UserRole.PARENT, deactivatedAt: new Date() },
      }],
    ])('recusa sessao %s', async (_nome, overrides) => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva(overrides));

      await expect(
        service.createSession({ refreshToken: 'opaco', userId: FILHO, scope: 'full' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa refresh token desconhecido', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(null);
      await expect(service.refresh('inventado')).rejects.toThrow(UnauthorizedException);
    });

    it('registra a impressao digital do token recusado', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(null);
      await service.refresh('token-perdido').catch(() => undefined);

      const [registro] = logger.warn.mock.calls[0];
      expect(registro).toMatchObject({ auth: true, evento: 'sessao.recusada' });
      expect(registro.apresentado).toHaveLength(12);
      // A impressao digital nao permite reconstruir o token nem autenticar com
      // ele: sao 12 caracteres de um hash de 64.
      expect(registro.apresentado).not.toContain('token-perdido');
      expect(registro.apresentado).toBe(hashToken('token-perdido').slice(0, 12));
    });

    it('registra qual token foi aposentado ao rotacionar', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.deviceSession.findUnique.mockResolvedValue({ refreshTokenHash: 'a'.repeat(64) });
      prisma.user.findFirst.mockResolvedValue({
        id: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      await service.createSession({ refreshToken: 'opaco', userId: FILHO, scope: 'full' });

      const rotacao = logger.info.mock.calls.find(
        ([r]) => r.evento === 'sessao.rotacionada',
      );
      expect(rotacao?.[0]).toMatchObject({ auth: true, aposentado: 'a'.repeat(12) });
    });

    it('nao registra rotacao quando a sessao e nova', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.deviceSession.findUnique.mockResolvedValue(null);
      prisma.user.findFirst.mockResolvedValue({
        id: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      await service.createSession({ refreshToken: 'opaco', userId: FILHO, scope: 'full' });

      expect(
        logger.info.mock.calls.some(([r]) => r.evento === 'sessao.rotacionada'),
      ).toBe(false);
    });

    it('guarda apenas o hash do refresh token', async () => {
      prisma.deviceSession.findFirst.mockResolvedValue(sessaoViva());
      prisma.user.findFirst.mockResolvedValue({
        id: FILHO,
        familyId: FAMILIA,
        role: UserRole.CHILD,
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      const par = await service.createSession({
        refreshToken: 'opaco',
        userId: FILHO,
        scope: 'full',
      });

      // Vazamento do banco nao entrega sessao ativa de ninguem.
      expect(par.refreshToken).toBeDefined();
      const gravado = prisma.deviceSession.upsert.mock.calls[0][0];
      expect(gravado.create.refreshTokenHash).toBe(hashToken(par.refreshToken as string));
      expect(JSON.stringify(gravado)).not.toContain(par.refreshToken);
    });
  });

  describe('codigo de convite', () => {
    const ator = {
      userId: RESPONSAVEL,
      familyId: FAMILIA,
      role: UserRole.PARENT,
      scope: 'full' as const,
      deviceId: APARELHO,
    };

    it('devolve o codigo em claro so uma vez e guarda o hash', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: FILHO, familyId: FAMILIA });
      prisma.deviceEnrollment.create.mockResolvedValue({});

      const { code, expiresAt } = await service.createEnrollment(ator, FILHO);

      expect(code).toMatch(/^[A-Z0-9]{6}$/);
      const gravado = prisma.deviceEnrollment.create.mock.calls[0][0].data;
      expect(gravado.codeHash).toBe(hashToken(code));
      expect(JSON.stringify(gravado)).not.toContain(code);

      // Janela estreita: e dela, e do uso unico, que vem a protecao de um
      // codigo curto o bastante para ser ditado em voz alta.
      const minutos = (expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutos).toBeGreaterThan(14);
      expect(minutos).toBeLessThanOrEqual(15);
    });

    it('recusa gerar codigo para perfil de outra familia', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(service.createEnrollment(ator, FILHO)).rejects.toThrow(NotFoundException);
    });

    it('recusa codigo expirado', async () => {
      prisma.deviceEnrollment.findFirst.mockResolvedValue({
        id: 'convite-1',
        familyId: FAMILIA,
        userId: FILHO,
        expiresAt: new Date(Date.now() - 1000),
        user: { role: UserRole.CHILD },
      });

      await expect(
        service.enroll({ code: 'ABC234', device: { label: 'Celular', platform: 'android' } }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa codigo ja consumido por outro aparelho', async () => {
      prisma.deviceEnrollment.findFirst.mockResolvedValue({
        id: 'convite-1',
        familyId: FAMILIA,
        userId: FILHO,
        expiresAt: new Date(Date.now() + 60_000),
        user: { role: UserRole.CHILD },
      });
      // A escrita condicionada a `usedAt: null` nao encontra linha: outro
      // aparelho chegou primeiro. Dois aparelhos com o mesmo codigo nao entram.
      prisma.deviceEnrollment.updateMany.mockResolvedValue({ count: 0 });
      prisma.$transaction.mockImplementation((fn: never) =>
        (fn as unknown as (tx: unknown) => unknown)(prisma),
      );

      await expect(
        service.enroll({ code: 'ABC234', device: { label: 'Celular', platform: 'android' } }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('entrada do responsavel', () => {
    it('nao distingue e-mail inexistente de senha errada', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const inexistente = await service
        .login({
          email: 'ninguem@exemplo.com',
          password: 'senha-forte-1',
          device: { label: 'iPhone', platform: 'ios' },
        })
        .catch((e) => e.message);

      prisma.user.findUnique.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        passwordHash: await hashSecret('outra-senha'),
        deactivatedAt: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });
      const senhaErrada = await service
        .login({
          email: 'ana@exemplo.com',
          password: 'senha-forte-1',
          device: { label: 'iPhone', platform: 'ios' },
        })
        .catch((e) => e.message);

      // Distinguir os dois casos entregaria quais e-mails existem no sistema.
      expect(inexistente).toBe(senhaErrada);
    });

    it('devolve 401, e nao 500, quando o proprio sujeito ja nao existe', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.me({
          userId: RESPONSAVEL,
          familyId: FAMILIA,
          role: UserRole.PARENT,
          scope: 'full',
          deviceId: APARELHO,
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('recusa membro desativado', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        passwordHash: await hashSecret('senha-forte-1'),
        deactivatedAt: new Date(),
        failedAuthAttempts: 0,
        lockedUntil: null,
      });

      await expect(
        service.login({
          email: 'ana@exemplo.com',
          password: 'senha-forte-1',
          device: { label: 'iPhone', platform: 'ios' },
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
