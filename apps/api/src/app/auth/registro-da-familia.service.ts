import { ForbiddenException, Injectable } from '@nestjs/common';
import { FamilyAuditAction, Prisma, PrismaService, UserRole } from '@taskplay/api-database';
import { pseudonymize } from '@taskplay/api-observability';
import type { FamilyAuditEntry } from '@taskplay/shared-types';
import { PinoLogger } from 'nestjs-pino';
import type { Actor } from './auth.types';

const LIMITE_DO_HISTORICO = 200;

export interface Alteracao {
  action: FamilyAuditAction;
  actor: { id: string; name: string };
  target: { id: string; name: string };
  /** Campo tocado, no nome do contrato. Ausente quando nao ha campo. */
  field?: string;
  before?: string | null;
  after?: string | null;
}

@Injectable()
export class RegistroDaFamiliaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RegistroDaFamiliaService.name);
  }

  async registrar(
    tx: Prisma.TransactionClient,
    familyId: string,
    alteracoes: readonly Alteracao[],
  ): Promise<void> {
    if (alteracoes.length === 0) return;

    await tx.familyAuditLog.createMany({
      data: alteracoes.map((alteracao) => ({
        familyId,
        action: alteracao.action,
        actorId: alteracao.actor.id,
        actorName: alteracao.actor.name,
        targetId: alteracao.target.id,
        targetName: alteracao.target.name,
        field: alteracao.field ?? null,
        beforeValue: alteracao.before ?? null,
        afterValue: alteracao.after ?? null,
      })),
    });

    for (const alteracao of alteracoes) {
      this.logger.info(
        {
          familia: true,
          evento: 'familia.administrada',
          acao: alteracao.action,
          campo: alteracao.field ?? null,
          ator: pseudonymize(alteracao.actor.id),
          alvo: pseudonymize(alteracao.target.id),
        },
        'perfil de membro alterado pelo responsavel',
      );
    }
  }

  async listar(actor: Actor): Promise<FamilyAuditEntry[]> {
    if (actor.role !== UserRole.PARENT) {
      throw new ForbiddenException('Apenas um responsável vê o histórico da família');
    }

    const linhas = await this.prisma.familyAuditLog.findMany({
      where: { familyId: actor.familyId },
      orderBy: { createdAt: 'desc' },
      take: LIMITE_DO_HISTORICO,
    });

    return linhas.map((linha) => ({
      id: linha.id,
      action: linha.action,
      actorId: linha.actorId,
      actorName: linha.actorName,
      targetId: linha.targetId,
      targetName: linha.targetName,
      field: linha.field,
      beforeValue: linha.beforeValue,
      afterValue: linha.afterValue,
      createdAt: linha.createdAt.toISOString(),
    }));
  }
}
