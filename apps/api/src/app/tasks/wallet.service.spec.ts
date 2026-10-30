import { UnprocessableEntityException } from '@nestjs/common';
import { TransactionReason } from '@taskplay/api-database';
import { WalletService } from './wallet.service';

const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function criarTx(saldo = 100, lifetime = 300) {
  return {
    wallet: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'carteira-1', userId: FILHO, balance: saldo, lifetimeEarned: lifetime,
      }),
      update: jest.fn().mockImplementation(
        (args: { data: { balance: number; lifetimeEarned?: number } }) => ({
          balance: args.data.balance,
          lifetimeEarned: args.data.lifetimeEarned ?? lifetime,
        }),
      ),
    },
    walletTransaction: { create: jest.fn() },
  };
}

describe('WalletService', () => {
  const service = new WalletService({} as never);

  it('escreve saldo e lancamento na mesma chamada', async () => {
    const tx = criarTx();

    await service.aplicar(tx as never, {
      userId: FILHO, delta: 20, reason: TransactionReason.TASK_COMPLETED, taskId: 'tarefa-1',
    });

    expect(tx.wallet.update).toHaveBeenCalledTimes(1);
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('grava balanceAfter em cada lancamento', async () => {
    // Redundante em relacao a soma dos deltas, e e esse o ponto: permite
    // auditar o razao sem recalcular tudo.
    const tx = criarTx(100);

    await service.aplicar(tx as never, {
      userId: FILHO, delta: -30, reason: TransactionReason.STORE_PURCHASE,
    });

    expect(tx.walletTransaction.create.mock.calls[0][0].data).toMatchObject({
      delta: -30, balanceAfter: 70,
    });
  });

  it('lifetimeEarned cresce no credito e nao muda no debito', async () => {
    const credito = criarTx(100, 300);
    await service.aplicar(credito as never, {
      userId: FILHO, delta: 20, reason: TransactionReason.TASK_COMPLETED,
    });
    expect(credito.wallet.update.mock.calls[0][0].data.lifetimeEarned).toBe(320);

    const debito = criarTx(100, 300);
    await service.aplicar(debito as never, {
      userId: FILHO, delta: -20, reason: TransactionReason.LATE_PENALTY,
    });
    expect(debito.wallet.update.mock.calls[0][0].data.lifetimeEarned).toBeUndefined();
  });

  it('recusa lancamento que deixaria o saldo negativo', async () => {
    // A restricao CHECK do banco recusaria de qualquer forma; esta verificacao
    // produz uma mensagem util em vez de um erro de driver.
    const tx = criarTx(10);
    await expect(
      service.aplicar(tx as never, {
        userId: FILHO, delta: -50, reason: TransactionReason.LATE_PENALTY,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('permite zerar o saldo exatamente', async () => {
    const tx = criarTx(10);
    const r = await service.aplicar(tx as never, {
      userId: FILHO, delta: -10, reason: TransactionReason.LATE_PENALTY,
    });
    expect(r.balanceAfter).toBe(0);
  });

  it('recusa operar sobre membro sem carteira', async () => {
    const tx = criarTx();
    tx.wallet.findUnique.mockResolvedValue(null);
    await expect(
      service.aplicar(tx as never, {
        userId: FILHO, delta: 10, reason: TransactionReason.MANUAL_ADJUSTMENT,
      }),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
