import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  FamilyAuditAction,
  Prisma,
  PrismaService,
  User,
  UserRole,
} from '@taskplay/api-database';
import type { CreateMemberRequest, UpdateMemberRequest } from '@taskplay/shared-types';
import type { Actor } from './auth.types';
import { hashSecret } from './crypto';
import { Alteracao, RegistroDaFamiliaService } from './registro-da-familia.service';

export interface MembroGerenciado {
  id: string;
  name: string;
  role: UserRole;
  birthDate: string | null;
  hasPin: boolean;
  deactivatedAt: string | null;
}

@Injectable()
export class MembrosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly registro: RegistroDaFamiliaService,
  ) {}

  async listar(actor: Actor): Promise<MembroGerenciado[]> {
    const membros = await this.prisma.user.findMany({
      where: { familyId: actor.familyId },
      orderBy: [
        { deactivatedAt: { sort: 'asc', nulls: 'first' } },
        { role: 'asc' },
        { name: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        role: true,
        birthDate: true,
        pinHash: true,
        deactivatedAt: true,
      },
    });

    return membros.map((membro) => ({
      id: membro.id,
      name: membro.name,
      role: membro.role,
      birthDate: formatarData(membro.birthDate),
      hasPin: membro.pinHash !== null,
      deactivatedAt: membro.deactivatedAt?.toISOString() ?? null,
    }));
  }

  /** Cria o perfil de um filho, e registra quem o criou. */
  async criar(actor: Actor, input: CreateMemberRequest) {
    const ator = await this.carregarAtor(actor);
    const pinHash = input.pin ? await hashSecret(input.pin) : null;

    return this.prisma.$transaction(async (tx) => {
      const criado = await tx.user.create({
        data: {
          familyId: actor.familyId,
          name: input.name,
          role: UserRole.CHILD,
          birthDate: input.birthDate ? new Date(input.birthDate) : null,
          pinHash,
          wallet: { create: {} },
        },
        select: { id: true, name: true, role: true, birthDate: true },
      });

      const alteracoes: Alteracao[] = [
        {
          action: FamilyAuditAction.MEMBER_CREATED,
          actor: ator,
          target: criado,
          field: 'name',
          after: criado.name,
        },
      ];
      await this.registro.registrar(tx, actor.familyId, alteracoes);

      return criado;
    });
  }

  async atualizar(actor: Actor, memberId: string, input: UpdateMemberRequest) {
    const { ator, alvo } = await this.carregarAtorEAlvo(actor, memberId);

    if (alvo.deactivatedAt) {
      throw new ConflictException('Este perfil foi removido da família; restaure antes de editar');
    }

    const dados: Prisma.UserUpdateInput = {};
    const alteracoes: Alteracao[] = [];
    const identificacao = { actor: ator, target: { id: alvo.id, name: alvo.name } };

    if (input.name !== undefined && input.name !== alvo.name) {
      dados.name = input.name;
      alteracoes.push({
        ...identificacao,
        action: FamilyAuditAction.MEMBER_RENAMED,
        field: 'name',
        before: alvo.name,
        after: input.name,
      });
    }

    if (input.birthDate !== undefined) {
      const antes = formatarData(alvo.birthDate);
      const depois = input.birthDate;
      if (antes !== depois) {
        dados.birthDate = depois ? new Date(depois) : null;
        alteracoes.push({
          ...identificacao,
          action: FamilyAuditAction.MEMBER_BIRTH_DATE_CHANGED,
          field: 'birthDate',
          before: antes,
          after: depois,
        });
      }
    }

    if (input.pin !== undefined) {
      dados.pinHash = input.pin === null ? null : await hashSecret(input.pin);
      dados.failedAuthAttempts = 0;
      dados.lockedUntil = null;
      alteracoes.push({
        ...identificacao,
        action: acaoDePin(input.pin, alvo.pinHash),
        field: 'pin',
      });
    }

    if (alteracoes.length === 0) {
      return this.paraResposta(alvo);
    }

    return this.prisma.$transaction(async (tx) => {
      const atualizado = await tx.user.update({ where: { id: alvo.id }, data: dados });

      await this.registro.registrar(tx, actor.familyId, alteracoes);
      return this.paraResposta(atualizado);
    });
  }

  async remover(actor: Actor, memberId: string) {
    const { ator, alvo } = await this.carregarAtorEAlvo(actor, memberId);

    if (alvo.deactivatedAt) {
      throw new ConflictException('Este perfil já foi removido da família');
    }

    const agora = new Date();

    return this.prisma.$transaction(async (tx) => {
      const removido = await tx.user.update({
        where: { id: alvo.id },
        data: { deactivatedAt: agora },
      });

      await tx.deviceSession.updateMany({
        where: { userId: alvo.id, revokedAt: null },
        data: { revokedAt: agora },
      });

      await tx.deviceEnrollment.updateMany({
        where: { userId: alvo.id, usedAt: null },
        data: { usedAt: agora },
      });

      await this.registro.registrar(tx, actor.familyId, [
        {
          action: FamilyAuditAction.MEMBER_DEACTIVATED,
          actor: ator,
          target: { id: alvo.id, name: alvo.name },
        },
      ]);

      return this.paraResposta(removido);
    });
  }

  async restaurar(actor: Actor, memberId: string) {
    const { ator, alvo } = await this.carregarAtorEAlvo(actor, memberId);

    if (!alvo.deactivatedAt) {
      throw new ConflictException('Este perfil já faz parte da família');
    }

    return this.prisma.$transaction(async (tx) => {
      const restaurado = await tx.user.update({
        where: { id: alvo.id },
        data: { deactivatedAt: null },
      });

      await this.registro.registrar(tx, actor.familyId, [
        {
          action: FamilyAuditAction.MEMBER_REACTIVATED,
          actor: ator,
          target: { id: alvo.id, name: alvo.name },
        },
      ]);

      return this.paraResposta(restaurado);
    });
  }

  private async carregarAtor(actor: Actor): Promise<{ id: string; name: string }> {
    const ator = await this.prisma.user.findFirst({
      where: { id: actor.userId, familyId: actor.familyId },
      select: { id: true, name: true },
    });
    if (!ator) throw new UnauthorizedException('Sessão inválida ou expirada');
    return ator;
  }

  private async carregarAtorEAlvo(actor: Actor, memberId: string) {
    const [ator, alvo] = await Promise.all([
      this.carregarAtor(actor),
      this.prisma.user.findFirst({ where: { id: memberId, familyId: actor.familyId } }),
    ]);

    // A mesma resposta para "nao existe" e "e de outra familia": distinguir os
    // dois diria a quem tentasse ids ao acaso quais perfis existem no sistema.
    if (!alvo) throw new NotFoundException('Perfil não encontrado nesta família');

    if (alvo.role !== UserRole.CHILD) {
      throw new ForbiddenException('Só o perfil de um filho pode ser gerenciado aqui');
    }

    return { ator, alvo };
  }

  private paraResposta(membro: User): MembroGerenciado {
    return {
      id: membro.id,
      name: membro.name,
      role: membro.role,
      birthDate: formatarData(membro.birthDate),
      hasPin: membro.pinHash !== null,
      deactivatedAt: membro.deactivatedAt?.toISOString() ?? null,
    };
  }
}

function formatarData(data: Date | null): string | null {
  return data ? data.toISOString().slice(0, 10) : null;
}

function acaoDePin(pin: string | null, pinHashAtual: string | null): FamilyAuditAction {
  if (pin === null) return FamilyAuditAction.MEMBER_PIN_REMOVED;
  return pinHashAtual === null
    ? FamilyAuditAction.MEMBER_PIN_SET
    : FamilyAuditAction.MEMBER_PIN_CHANGED;
}
