import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService, UserRole } from '@taskplay/api-database';
import { pseudonymize } from '@taskplay/api-observability';
import { StorageService } from '@taskplay/api-storage';
import { PinoLogger } from 'nestjs-pino';
import type { Actor } from './auth.types';
import { verifySecret } from './crypto';

export interface ResultadoDaRevogacao {
  fotosRemovidas: number;
  membros: number;
  tarefas: number;
}

@Injectable()
export class ConsentimentoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsentimentoService.name);
  }

  async revogar(actor: Actor, senha: string, pin: string): Promise<ResultadoDaRevogacao> {
    if (actor.role !== UserRole.PARENT) {
      throw new ForbiddenException('Apenas um responsável pode revogar o consentimento');
    }

    const responsavel = await this.prisma.user.findFirst({
      where: { id: actor.userId, familyId: actor.familyId },
    });

    if (!responsavel?.passwordHash || !responsavel.pinHash) {
      throw new ForbiddenException(
        'Apenas um responsável com senha e PIN pode revogar o consentimento',
      );
    }
    const [senhaConfere, pinConfere] = await Promise.all([
      verifySecret(senha, responsavel.passwordHash),
      verifySecret(pin, responsavel.pinHash),
    ]);
    if (!senhaConfere || !pinConfere) {
      throw new UnauthorizedException('Senha ou PIN inválidos');
    }

    const [membros, tarefas] = await Promise.all([
      this.prisma.user.count({ where: { familyId: actor.familyId } }),
      this.prisma.task.count({ where: { familyId: actor.familyId } }),
    ]);

    const fotosRemovidas = await this.storage.apagarFamilia(actor.familyId);

    // O cascade a partir de Family leva usuarios, tarefas, evidencias,
    // carteiras, lancamentos, compras, aparelhos, sessoes e notificacoes.
    await this.prisma.family.delete({ where: { id: actor.familyId } });

    this.logger.warn(
      {
        consentimento: true,
        evento: 'tcle.revogado',
        familia: pseudonymize(actor.familyId),
        membros,
        tarefas,
        fotosRemovidas,
      },
      'consentimento revogado; dados da familia removidos',
    );

    return { fotosRemovidas, membros, tarefas };
  }
}
