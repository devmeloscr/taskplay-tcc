import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PurchaseStatus, StoreItemKind, TaskStatus, TransactionReason, UserRole } from '@taskplay/api-database';
import { StoreService } from './store.service';
import type { Actor } from '../auth/auth.types';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const IRMA = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const ITEM = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const COMPRA = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';
const TAREFA = '3f2504e0-4f89-41d3-9a0c-0305e82c3306';
const RESPONSAVEL = '3f2504e0-4f89-41d3-9a0c-0305e82c3307';

const filho: Actor = {
  userId: FILHO,
  familyId: FAMILIA,
  role: UserRole.CHILD,
  scope: 'full',
  deviceId: 'aparelho-1',
};

function criarPrisma() {
  const prisma = {
    storeItem: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    purchase: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    // A tarefa atualizada volta com os dados gravados, como no Prisma: e dela
    // que o aviso de repasse tira o titulo e os pontos.
    task: {
      findFirst: jest.fn(),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: { assigneeId?: string; status?: string } }) => ({
        id: where.id,
        familyId: 'familia',
        title: 'Lavar a louça',
        points: 20,
        dueAt: new Date('2026-09-30T18:00:00.000Z'),
        ...data,
      })),
    },
    taskTransfer: { create: jest.fn() },
    user: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue({ name: 'Pedro' }) },
    notification: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: unknown) =>
    (fn as (tx: unknown) => unknown)(prisma),
  );
  return prisma;
}

describe('StoreService', () => {
  let prisma: ReturnType<typeof criarPrisma>;
  let wallet: { aplicar: jest.Mock };
  let telemetry: { record: jest.Mock };
  let notifications: { registrar: jest.Mock; agendarLembrete: jest.Mock };
  let store: StoreService;

  beforeEach(() => {
    prisma = criarPrisma();
    wallet = { aplicar: jest.fn().mockResolvedValue({ delta: -50, balanceAfter: 50, lifetimeEarned: 100 }) };
    telemetry = { record: jest.fn() };
    notifications = { registrar: jest.fn(), agendarLembrete: jest.fn() };
    store = new StoreService(
      prisma as never,
      wallet as never,
      telemetry as never,
      notifications as never,
    );
  });

  describe('compra', () => {
    it('copia o preco praticado para a compra', async () => {
      // O responsavel pode reajustar o custo depois; o historico precisa
      // continuar explicando por que aqueles pontos foram debitados.
      prisma.storeItem.findFirst.mockResolvedValue({
        id: ITEM, familyId: FAMILIA, costPoints: 50, stock: null, name: 'Filme de sexta',
      });
      prisma.purchase.create.mockResolvedValue({ id: COMPRA, costPoints: 50 });

      await store.comprar(filho, ITEM);

      expect(prisma.purchase.create.mock.calls[0][0].data.costPoints).toBe(50);
      expect(wallet.aplicar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ delta: -50, reason: TransactionReason.STORE_PURCHASE }),
      );
    });

    it('recusa comprar item esgotado', async () => {
      prisma.storeItem.findFirst.mockResolvedValue({
        id: ITEM, familyId: FAMILIA, costPoints: 50, stock: 0, name: 'Sorvete',
      });
      await expect(store.comprar(filho, ITEM)).rejects.toThrow(ConflictException);
    });

    it('nao entrega a ultima unidade a dois irmaos ao mesmo tempo', async () => {
      // A baixa de estoque e condicionada a `stock > 0` na propria escrita.
      // Zero linhas afetadas significa que o outro chegou primeiro.
      prisma.storeItem.findFirst.mockResolvedValue({
        id: ITEM, familyId: FAMILIA, costPoints: 50, stock: 1, name: 'Sorvete',
      });
      prisma.storeItem.updateMany.mockResolvedValue({ count: 0 });

      await expect(store.comprar(filho, ITEM)).rejects.toThrow(ConflictException);
      expect(wallet.aplicar).not.toHaveBeenCalled();
    });

    it('emite compra e variacao de pontos como eventos do comprador', async () => {
      prisma.storeItem.findFirst.mockResolvedValue({
        id: ITEM, familyId: FAMILIA, costPoints: 50, stock: null, name: 'Filme',
      });
      prisma.purchase.create.mockResolvedValue({ id: COMPRA, costPoints: 50 });

      await store.comprar(filho, ITEM);

      const [eventos, sujeito] = telemetry.record.mock.calls[0];
      expect(sujeito).toEqual({ userId: FILHO, familyId: FAMILIA });
      expect(eventos.map((e: { type: string }) => e.type)).toEqual([
        'store.item.purchased',
        'points.changed',
      ]);
    });
  });

  describe('estorno', () => {
    it('estorna com um lancamento novo, sem apagar o debito', async () => {
      prisma.purchase.findFirst.mockResolvedValue({
        id: COMPRA, familyId: FAMILIA, buyerId: FILHO, itemId: ITEM, costPoints: 50,
        status: PurchaseStatus.PENDING, item: { name: 'Filme', stock: null },
      });
      wallet.aplicar.mockResolvedValue({ delta: 50, balanceAfter: 100, lifetimeEarned: 100 });

      await store.cancelarCompra(
        { ...filho, role: UserRole.PARENT },
        COMPRA,
      );

      expect(wallet.aplicar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ delta: 50, reason: TransactionReason.MANUAL_ADJUSTMENT }),
      );
      expect(prisma.purchase.update.mock.calls[0][0].data.status).toBe(PurchaseStatus.CANCELLED);
    });

    it('devolve a unidade ao estoque', async () => {
      prisma.purchase.findFirst.mockResolvedValue({
        id: COMPRA, familyId: FAMILIA, buyerId: FILHO, itemId: ITEM, costPoints: 50,
        status: PurchaseStatus.PENDING, item: { name: 'Sorvete', stock: 2 },
      });

      await store.cancelarCompra({ ...filho, role: UserRole.PARENT }, COMPRA);

      expect(prisma.storeItem.update).toHaveBeenCalledWith({
        where: { id: ITEM },
        data: { stock: { increment: 1 } },
      });
    });
  });

  describe('retirada de circulacao', () => {
    const responsavel: Actor = { ...filho, userId: RESPONSAVEL, role: UserRole.PARENT };

    it('desativa a recompensa em vez de apaga-la', async () => {
      prisma.storeItem.findFirst.mockResolvedValue({
        id: ITEM, familyId: FAMILIA, kind: StoreItemKind.REWARD, name: 'Sorvete',
      });

      await store.desativarItem(responsavel, ITEM);

      expect(prisma.storeItem.update).toHaveBeenCalledWith({
        where: { id: ITEM },
        data: { active: false },
      });
    });

    it('recusa retirar a Carta de Transferência', async () => {
      // Item de sistema, criado junto da familia e sem rota que o traga de
      // volta: retira-lo desligaria o RF09 de forma permanente.
      prisma.storeItem.findFirst.mockResolvedValue({
        id: ITEM, familyId: FAMILIA, kind: StoreItemKind.TRANSFER_LETTER,
        name: 'Carta de Transferência',
      });

      await expect(store.desativarItem(responsavel, ITEM)).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(prisma.storeItem.update).not.toHaveBeenCalled();
    });

    it('nao alcanca item de outra familia', async () => {
      // A consulta ja casa `familyId`; o `findFirst` vazio e o RNF01 agindo.
      prisma.storeItem.findFirst.mockResolvedValue(null);

      await expect(store.desativarItem(responsavel, ITEM)).rejects.toThrow(NotFoundException);
    });
  });

  describe('Carta de Transferência', () => {
    const carta = {
      id: COMPRA, familyId: FAMILIA, buyerId: FILHO, status: PurchaseStatus.PENDING,
      item: { kind: StoreItemKind.TRANSFER_LETTER, name: 'Carta de Transferência' },
    };

    it('repassa a tarefa e consome a carta', async () => {
      prisma.purchase.findFirst.mockResolvedValue(carta);
      prisma.task.findFirst.mockResolvedValue({
        id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, status: TaskStatus.PENDING,
      });
      prisma.user.findFirst.mockResolvedValue({
        id: IRMA, familyId: FAMILIA, role: UserRole.CHILD,
      });

      await store.usarCartaDeTransferencia(filho, {
        purchaseId: COMPRA, taskId: TAREFA, toUserId: IRMA,
      });

      expect(prisma.task.update.mock.calls[0][0].data.assigneeId).toBe(IRMA);
      expect(prisma.purchase.update.mock.calls[0][0].data.status).toBe(PurchaseStatus.FULFILLED);
      // A ligacao com a compra e o que distingue, na analise, o repasse
      // comprado pela crianca da reatribuicao feita pelo adulto.
      expect(prisma.taskTransfer.create.mock.calls[0][0].data).toMatchObject({
        fromUserId: FILHO, toUserId: IRMA, purchaseId: COMPRA,
      });
    });

    it('recusa usar carta de outro membro', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ ...carta, buyerId: IRMA });
      await expect(
        store.usarCartaDeTransferencia(filho, { purchaseId: COMPRA, taskId: TAREFA, toUserId: IRMA }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('recusa usar a mesma carta duas vezes', async () => {
      prisma.purchase.findFirst.mockResolvedValue({ ...carta, status: PurchaseStatus.FULFILLED });
      await expect(
        store.usarCartaDeTransferencia(filho, { purchaseId: COMPRA, taskId: TAREFA, toUserId: IRMA }),
      ).rejects.toThrow(ConflictException);
    });

    it('recusa repassar tarefa ja concluida', async () => {
      // Transferiria o credito de um trabalho que a outra pessoa nao fez.
      prisma.purchase.findFirst.mockResolvedValue(carta);
      prisma.task.findFirst.mockResolvedValue({
        id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, status: TaskStatus.SUBMITTED,
      });
      await expect(
        store.usarCartaDeTransferencia(filho, { purchaseId: COMPRA, taskId: TAREFA, toUserId: IRMA }),
      ).rejects.toThrow(ConflictException);
    });

    it('recusa repassar para si mesmo', async () => {
      prisma.purchase.findFirst.mockResolvedValue(carta);
      prisma.task.findFirst.mockResolvedValue({
        id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, status: TaskStatus.PENDING,
      });
      await expect(
        store.usarCartaDeTransferencia(filho, { purchaseId: COMPRA, taskId: TAREFA, toUserId: FILHO }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('repassa para o responsavel', async () => {
      prisma.purchase.findFirst.mockResolvedValue(carta);
      prisma.task.findFirst.mockResolvedValue({
        id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, status: TaskStatus.PENDING,
      });
      prisma.user.findFirst.mockResolvedValue({
        id: RESPONSAVEL, familyId: FAMILIA, role: UserRole.PARENT,
      });

      await store.usarCartaDeTransferencia(filho, {
        purchaseId: COMPRA, taskId: TAREFA, toUserId: RESPONSAVEL,
      });

      expect(prisma.task.update).toHaveBeenCalledWith({
        where: { id: TAREFA },
        data: { assigneeId: RESPONSAVEL, status: TaskStatus.PENDING },
      });
    });

    describe('aviso a quem recebe', () => {
      beforeEach(() => {
        prisma.purchase.findFirst.mockResolvedValue(carta);
        prisma.task.findFirst.mockResolvedValue({
          id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, status: TaskStatus.PENDING,
        });
      });

      it('avisa o irmao, com o nome de quem repassou e os pontos', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: IRMA, familyId: FAMILIA, role: UserRole.CHILD });
        await store.usarCartaDeTransferencia(filho, { purchaseId: COMPRA, taskId: TAREFA, toUserId: IRMA });

        expect(notifications.registrar).toHaveBeenCalledWith(prisma, {
          familyId: FAMILIA,
          userId: IRMA,
          type: 'TASK_TRANSFERRED',
          title: 'Pedro repassou uma tarefa para você',
          body: '"Lavar a louça" vale 20 pontos.',
          taskId: TAREFA,
        });
      });

      it('diz ao responsavel que basta marcar como feita, sem falar em pontos', async () => {
        prisma.user.findFirst.mockResolvedValue({
          id: RESPONSAVEL, familyId: FAMILIA, role: UserRole.PARENT,
        });
        await store.usarCartaDeTransferencia(filho, {
          purchaseId: COMPRA, taskId: TAREFA, toUserId: RESPONSAVEL,
        });

        expect(notifications.registrar.mock.calls[0][1].body).toBe(
          '"Lavar a louça": quando terminar, é só marcar como feita.',
        );
      });

      it('apaga os avisos na fila de quem repassou e agenda o lembrete do novo dono', async () => {
        prisma.user.findFirst.mockResolvedValue({ id: IRMA, familyId: FAMILIA, role: UserRole.CHILD });
        await store.usarCartaDeTransferencia(filho, { purchaseId: COMPRA, taskId: TAREFA, toUserId: IRMA });

        expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
          where: { taskId: TAREFA, userId: FILHO, sentAt: null },
        });
        expect(notifications.agendarLembrete).toHaveBeenCalledWith(
          prisma,
          expect.objectContaining({ id: TAREFA, assigneeId: IRMA }),
        );
      });
    });

    it('recusa entregar a carta como recompensa comum', async () => {
      // Marca-la como entregue a consumiria sem repassar tarefa nenhuma.
      prisma.purchase.findFirst.mockResolvedValue(carta);
      await expect(
        store.entregar({ ...filho, role: UserRole.PARENT }, COMPRA),
      ).rejects.toThrow(ConflictException);
    });
  });
});
