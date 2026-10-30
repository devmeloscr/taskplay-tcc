import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma, PrismaService, TransactionReason } from '@taskplay/api-database';

/** Um lancamento a ser aplicado, sempre acompanhado do seu motivo. */
export interface Lancamento {
  userId: string;
  /** Positivo credita, negativo debita. */
  delta: number;
  reason: TransactionReason;
  note?: string;
  taskId?: string;
  purchaseId?: string;
}

export interface ResultadoDoLancamento {
  delta: number;
  balanceAfter: number;
  lifetimeEarned: number;
}

@Injectable()
export class WalletService {
  constructor(private readonly prisma: PrismaService) {}

  async aplicar(tx: Prisma.TransactionClient, lancamento: Lancamento): Promise<ResultadoDoLancamento> {
    const wallet = await tx.wallet.findUnique({ where: { userId: lancamento.userId } });
    if (!wallet) {
      // A carteira nasce junto do membro, na mesma transacao. Nao existir aqui
      // significa dado inconsistente, e nao entrada invalida do usuario.
      throw new UnprocessableEntityException('Carteira não encontrada para este membro');
    }

    const balanceAfter = wallet.balance + lancamento.delta;
    if (balanceAfter < 0) {
      throw new UnprocessableEntityException('Pontos insuficientes');
    }

    const [atualizada] = await Promise.all([
      tx.wallet.update({
        where: { id: wallet.id },
        data: {
          balance: balanceAfter,
          lifetimeEarned:
            lancamento.delta > 0 ? wallet.lifetimeEarned + lancamento.delta : undefined,
        },
      }),
      tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          delta: lancamento.delta,
          balanceAfter,
          reason: lancamento.reason,
          note: lancamento.note,
          taskId: lancamento.taskId,
          purchaseId: lancamento.purchaseId,
        },
      }),
    ]);

    return {
      delta: lancamento.delta,
      balanceAfter: atualizada.balance,
      lifetimeEarned: atualizada.lifetimeEarned,
    };
  }

  /** Saldo e histórico de um membro, para a tela de carteira. */
  async extrato(userId: string, limite = 50) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: limite,
          select: {
            id: true,
            delta: true,
            balanceAfter: true,
            reason: true,
            note: true,
            taskId: true,
            purchaseId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!wallet) {
      throw new UnprocessableEntityException('Carteira não encontrada para este membro');
    }

    return {
      balance: wallet.balance,
      lifetimeEarned: wallet.lifetimeEarned,
      transactions: wallet.transactions,
    };
  }

  async conferirIntegridade(userId: string): Promise<{ coerente: boolean; saldo: number; somaDosDeltas: number }> {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) {
      throw new UnprocessableEntityException('Carteira não encontrada para este membro');
    }
    const soma = await this.prisma.walletTransaction.aggregate({
      where: { walletId: wallet.id },
      _sum: { delta: true },
    });
    const somaDosDeltas = soma._sum.delta ?? 0;

    return { coerente: somaDosDeltas === wallet.balance, saldo: wallet.balance, somaDosDeltas };
  }
}
