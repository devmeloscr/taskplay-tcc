import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  NotificationType,
  PrismaService,
  PurchaseStatus,
  StoreItemKind,
  TaskStatus,
  TransactionReason,
  UserRole,
} from '@taskplay/api-database';
import type { CreateStoreItemRequest, UseTransferLetterRequest } from '@taskplay/shared-types';
import type { Actor } from '../auth/auth.types';
import { NotificationsService } from '../notifications/notifications.service';
import { TelemetryService } from '../telemetry/telemetry.service';
import { WalletService } from './wallet.service';

@Injectable()
export class StoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly telemetry: TelemetryService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Catalogo ativo da familia. */
  async listarItens(actor: Actor) {
    return this.prisma.storeItem.findMany({
      where: { familyId: actor.familyId, active: true },
      orderBy: [{ kind: 'asc' }, { costPoints: 'asc' }],
    });
  }

  /** Cria um item. So o responsavel (RolesGuard). */
  async criarItem(actor: Actor, input: CreateStoreItemRequest) {
    return this.prisma.storeItem.create({
      data: {
        familyId: actor.familyId,
        createdById: actor.userId,
        name: input.name,
        description: input.description,
        costPoints: input.costPoints,
        stock: input.stock,
        // Apenas a Carta de Transferência nasce como item de sistema, e ela e
        // criada junto da familia. O que o responsavel cadastra e recompensa.
        kind: StoreItemKind.REWARD,
      },
    });
  }

  async desativarItem(actor: Actor, itemId: string) {
    const item = await this.prisma.storeItem.findFirst({
      where: { id: itemId, familyId: actor.familyId },
    });
    if (!item) throw new NotFoundException('Item não encontrado nesta família');
    if (item.kind === StoreItemKind.TRANSFER_LETTER) {
      throw new UnprocessableEntityException('A Carta de Transferência não sai da loja');
    }

    return this.prisma.storeItem.update({ where: { id: itemId }, data: { active: false } });
  }

  async comprar(actor: Actor, itemId: string) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const item = await tx.storeItem.findFirst({
        where: { id: itemId, familyId: actor.familyId, active: true },
      });
      if (!item) throw new NotFoundException('Item não encontrado no catálogo desta família');

      if (item.stock !== null) {
        if (item.stock <= 0) throw new ConflictException('Item esgotado');
        // Condiciona a escrita ao estoque ainda positivo: dois irmaos comprando
        // a ultima unidade ao mesmo tempo nao levam os dois.
        const baixa = await tx.storeItem.updateMany({
          where: { id: item.id, stock: { gt: 0 } },
          data: { stock: { decrement: 1 } },
        });
        if (baixa.count === 0) throw new ConflictException('Item esgotado');
      }

      const purchase = await tx.purchase.create({
        data: {
          familyId: actor.familyId,
          itemId: item.id,
          buyerId: actor.userId,
          costPoints: item.costPoints,
        },
      });

      const lancamento = await this.wallet.aplicar(tx, {
        userId: actor.userId,
        delta: -item.costPoints,
        reason: TransactionReason.STORE_PURCHASE,
        purchaseId: purchase.id,
        note: item.name,
      });

      return { purchase, item, lancamento };
    });

    const agora = new Date().toISOString();
    this.telemetry.record(
      [
        {
          type: 'store.item.purchased',
          occurredAt: agora,
          itemId: resultado.item.id,
          pointsSpent: resultado.purchase.costPoints,
        },
        {
          type: 'points.changed',
          occurredAt: agora,
          delta: resultado.lancamento.delta,
          balanceAfter: resultado.lancamento.balanceAfter,
          reason: 'store_purchase',
        },
      ],
      { userId: actor.userId, familyId: actor.familyId },
    );

    return resultado.purchase;
  }

  /** Compras do ator; o responsavel ve as da familia inteira. */
  async listarCompras(actor: Actor) {
    return this.prisma.purchase.findMany({
      where: {
        familyId: actor.familyId,
        ...(actor.role === 'CHILD' ? { buyerId: actor.userId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        item: { select: { id: true, name: true, kind: true } },
        buyer: { select: { id: true, name: true } },
      },
    });
  }

  /** O responsavel marca a recompensa como entregue. */
  async entregar(actor: Actor, purchaseId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id: purchaseId, familyId: actor.familyId },
      include: { item: true },
    });
    if (!purchase) throw new NotFoundException('Compra não encontrada nesta família');
    if (purchase.status !== PurchaseStatus.PENDING) {
      throw new ConflictException('Compra já encerrada');
    }
    // A Carta de Transferência se conclui pelo uso, e nao por entrega manual:
    // marca-la como entregue aqui a consumiria sem repassar tarefa nenhuma.
    if (purchase.item.kind === StoreItemKind.TRANSFER_LETTER) {
      throw new ConflictException('A Carta de Transferência é concluída pelo uso');
    }

    return this.prisma.purchase.update({
      where: { id: purchaseId },
      data: {
        status: PurchaseStatus.FULFILLED,
        fulfilledById: actor.userId,
        fulfilledAt: new Date(),
      },
    });
  }

  async cancelarCompra(actor: Actor, purchaseId: string) {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: purchaseId, familyId: actor.familyId },
        include: { item: true },
      });
      if (!purchase) throw new NotFoundException('Compra não encontrada nesta família');
      if (purchase.status !== PurchaseStatus.PENDING) {
        throw new ConflictException('Compra já encerrada');
      }

      await tx.purchase.update({
        where: { id: purchaseId },
        data: { status: PurchaseStatus.CANCELLED },
      });

      if (purchase.item.stock !== null) {
        await tx.storeItem.update({
          where: { id: purchase.itemId },
          data: { stock: { increment: 1 } },
        });
      }

      const lancamento = await this.wallet.aplicar(tx, {
        userId: purchase.buyerId,
        delta: purchase.costPoints,
        reason: TransactionReason.MANUAL_ADJUSTMENT,
        purchaseId: purchase.id,
        note: `Estorno: ${purchase.item.name}`,
      });

      return { purchase, lancamento };
    });

    this.telemetry.record(
      [
        {
          type: 'points.changed',
          occurredAt: new Date().toISOString(),
          delta: resultado.lancamento.delta,
          balanceAfter: resultado.lancamento.balanceAfter,
          reason: 'manual_adjustment',
        },
      ],
      { userId: resultado.purchase.buyerId, familyId: actor.familyId },
    );

    return resultado.purchase;
  }

  async usarCartaDeTransferencia(actor: Actor, input: UseTransferLetterRequest) {
    return this.prisma.$transaction(async (tx) => {
      const purchase = await tx.purchase.findFirst({
        where: { id: input.purchaseId, familyId: actor.familyId },
        include: { item: true },
      });
      if (!purchase) throw new NotFoundException('Compra não encontrada nesta família');
      if (purchase.item.kind !== StoreItemKind.TRANSFER_LETTER) {
        throw new UnprocessableEntityException('Esta compra não é uma Carta de Transferência');
      }
      if (purchase.buyerId !== actor.userId) {
        throw new ForbiddenException('Esta carta pertence a outro membro');
      }
      if (purchase.status !== PurchaseStatus.PENDING) {
        throw new ConflictException('Carta já utilizada ou cancelada');
      }

      const task = await tx.task.findFirst({
        where: { id: input.taskId, familyId: actor.familyId },
      });
      if (!task) throw new NotFoundException('Tarefa não encontrada nesta família');
      if (task.assigneeId !== actor.userId) {
        throw new ForbiddenException('Só se repassa a própria tarefa');
      }
      // Repassar tarefa ja concluida ou encerrada transferiria o credito de um
      // trabalho que a outra pessoa nao fez.
      if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.REJECTED) {
        throw new ConflictException('Só tarefa pendente pode ser repassada');
      }
      if (input.toUserId === actor.userId) {
        throw new UnprocessableEntityException('Repassar para si mesmo não é repasse');
      }

      const destinatario = await tx.user.findFirst({
        where: { id: input.toUserId, familyId: actor.familyId, deactivatedAt: null },
      });
      if (!destinatario) throw new NotFoundException('Destinatário não encontrado nesta família');

      const repassada = await tx.task.update({
        where: { id: task.id },
        data: { assigneeId: input.toUserId, status: TaskStatus.PENDING },
      });

      await tx.notification.deleteMany({
        where: { taskId: task.id, userId: actor.userId, sentAt: null },
      });
      const remetente = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { name: true },
      });
      await this.notifications.registrar(tx, {
        familyId: actor.familyId,
        userId: input.toUserId,
        type: NotificationType.TASK_TRANSFERRED,
        title: `${remetente?.name ?? 'Alguém'} repassou uma tarefa para você`,
        body:
          destinatario.role === UserRole.PARENT
            ? `"${repassada.title}": quando terminar, é só marcar como feita.`
            : `"${repassada.title}" vale ${repassada.points} pontos.`,
        taskId: task.id,
      });
      await this.notifications.agendarLembrete(tx, repassada);

      await tx.purchase.update({
        where: { id: purchase.id },
        data: {
          status: PurchaseStatus.FULFILLED,
          fulfilledById: actor.userId,
          fulfilledAt: new Date(),
        },
      });

      return tx.taskTransfer.create({
        data: {
          taskId: task.id,
          fromUserId: actor.userId,
          toUserId: input.toUserId,
          purchaseId: purchase.id,
        },
      });
    });
  }
}
