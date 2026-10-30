import {
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  NotificationType,
  Prisma,
  PrismaService,
  ReviewDecision,
  TaskStatus,
  TransactionReason,
  UserRole,
} from '@taskplay/api-database';
import type {
  CreateTaskRequest,
  ReviewTaskRequest,
  SubmitTaskRequest,
  UpdateTaskRequest,
} from '@taskplay/shared-types';
import { chaveEhDaFamilia, StorageService } from '@taskplay/api-storage';
import { NotificationsService } from '../notifications/notifications.service';
import {
  penalidadePorVencimento,
  pontosPorConclusao,
  rotuloDaFaixa,
} from '@taskplay/shared-util-gamification';
import type { Actor } from '../auth/auth.types';
import { TelemetryService } from '../telemetry/telemetry.service';
import { pontuacaoDaTarefa } from './pontuacao-da-tarefa';
import { WalletService } from './wallet.service';

const TRANSICOES: Record<TaskStatus, readonly TaskStatus[]> = {
  [TaskStatus.PENDING]: [TaskStatus.SUBMITTED, TaskStatus.EXPIRED, TaskStatus.CANCELLED],
  [TaskStatus.SUBMITTED]: [TaskStatus.APPROVED, TaskStatus.REJECTED, TaskStatus.CANCELLED],
  [TaskStatus.REJECTED]: [TaskStatus.SUBMITTED, TaskStatus.EXPIRED, TaskStatus.CANCELLED],
  [TaskStatus.APPROVED]: [],
  [TaskStatus.EXPIRED]: [TaskStatus.SUBMITTED, TaskStatus.CANCELLED],
  [TaskStatus.CANCELLED]: [],
};

export function podeTransicionar(de: TaskStatus, para: TaskStatus): boolean {
  return TRANSICOES[de].includes(para);
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
    private readonly telemetry: TelemetryService,
    private readonly storage: StorageService,
    private readonly notifications: NotificationsService,
  ) {}

  async criar(actor: Actor, input: CreateTaskRequest) {
    await this.exigirMembroDaFamilia(actor.familyId, input.assigneeId);

    if (input.compensationForId) {
      const original = await this.prisma.task.findFirst({
        where: { id: input.compensationForId, familyId: actor.familyId },
      });
      if (!original) {
        throw new NotFoundException('Tarefa de origem não encontrada nesta família');
      }
      if (original.status !== TaskStatus.EXPIRED) {
        throw new ConflictException('Só uma tarefa vencida gera compensação');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          familyId: actor.familyId,
          title: input.title,
          description: input.description,
          createdById: actor.userId,
          assigneeId: input.assigneeId,
          points: input.points,
          dueAt: new Date(input.dueAt),
          verification: input.verification,
          compensationForId: input.compensationForId,
        },
      });

      await this.notifications.registrar(tx, {
        familyId: task.familyId,
        userId: task.assigneeId,
        type: NotificationType.TASK_ASSIGNED,
        title: 'Nova tarefa para você',
        body: `"${task.title}" vale ${task.points} pontos.`,
        taskId: task.id,
      });
      await this.notifications.agendarLembrete(tx, task);

      return task;
    });
  }

  async listar(actor: Actor, status?: TaskStatus) {
    const tarefas = await this.prisma.task.findMany({
      where: {
        familyId: actor.familyId,
        ...(actor.role === UserRole.CHILD ? { assigneeId: actor.userId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: [{ dueAt: 'asc' }],
      include: {
        assignee: { select: { id: true, name: true } },
        evidences: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const agora = new Date();
    return tarefas.map((tarefa) => this.comPontuacao(tarefa, agora));
  }

  private comPontuacao<
    T extends { points: number; dueAt: Date; status: TaskStatus; completedAt: Date | null },
  >(task: T, agora: Date = new Date()) {
    return { ...task, scoring: pontuacaoDaTarefa(task, agora) };
  }

  async obter(actor: Actor, taskId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        id: taskId,
        familyId: actor.familyId,
        ...(actor.role === UserRole.CHILD ? { assigneeId: actor.userId } : {}),
      },
      include: {
        assignee: { select: { id: true, name: true } },
        evidences: { orderBy: { createdAt: 'desc' } },
        transfers: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!task) throw new NotFoundException('Tarefa não encontrada');
    return this.comPontuacao(task);
  }

  async atualizar(actor: Actor, taskId: string, input: UpdateTaskRequest) {
    const task = await this.exigirTarefaDaFamilia(actor.familyId, taskId);

    if (task.status !== TaskStatus.PENDING && task.status !== TaskStatus.REJECTED) {
      throw new ConflictException('Tarefa já concluída ou encerrada não pode ser alterada');
    }

    const novoDestinatario =
      input.assigneeId && input.assigneeId !== task.assigneeId ? input.assigneeId : undefined;

    if (novoDestinatario) {
      if (task.status !== TaskStatus.PENDING) {
        throw new ConflictException('Tarefa que já teve entrega não muda de destinatário');
      }
      await this.exigirMembroDaFamilia(actor.familyId, novoDestinatario);
    }

    const novoPrazo = input.dueAt ? new Date(input.dueAt) : undefined;
    const mudouOPrazo = novoPrazo !== undefined && novoPrazo.getTime() !== task.dueAt.getTime();

    return this.prisma.$transaction(async (tx) => {
      const atualizada = await tx.task.update({
        where: { id: taskId },
        data: {
          title: input.title,
          // `null` apaga o detalhe; `undefined` mantem o que ha (contrato).
          description: input.description,
          assigneeId: novoDestinatario,
          points: input.points,
          dueAt: novoPrazo,
          verification: input.verification,
        },
      });

      if (novoDestinatario) {
        await tx.notification.deleteMany({
          where: { taskId: task.id, userId: task.assigneeId, sentAt: null },
        });
        await this.notifications.registrar(tx, {
          familyId: atualizada.familyId,
          userId: atualizada.assigneeId,
          type: NotificationType.TASK_ASSIGNED,
          title: 'Nova tarefa para você',
          body: `"${atualizada.title}" vale ${atualizada.points} pontos.`,
          taskId: atualizada.id,
        });
      } else if (mudouOPrazo) {
        await tx.notification.deleteMany({
          where: { taskId: task.id, type: NotificationType.TASK_DUE_SOON, sentAt: null },
        });
      }

      if (novoDestinatario || mudouOPrazo) {
        await this.notifications.agendarLembrete(tx, atualizada);
      }

      return atualizada;
    });
  }

  async concluir(
    actor: Actor,
    taskId: string,
    input: SubmitTaskRequest,
    imagem?: { buffer: Buffer; mimetype: string },
  ) {
    const task = await this.exigirTarefaDaFamilia(actor.familyId, taskId);

    if (task.assigneeId !== actor.userId) {
      throw new ForbiddenException('Esta tarefa é de outro membro');
    }
    this.exigirTransicao(task.status, TaskStatus.SUBMITTED);
    const peloResponsavel = actor.role === UserRole.PARENT;

    const agora = new Date();
    const imageKey = imagem
      ? await this.storage.guardarEvidencia(
          actor.familyId,
          task.id,
          imagem.buffer,
          imagem.mimetype,
        )
      : undefined;

    const concluida = await this.prisma.$transaction(async (tx) => {
      if (imageKey || input.note) {
        await tx.taskEvidence.create({
          data: {
            taskId: task.id,
            submittedById: actor.userId,
            imageKey,
            note: input.note,
          },
        });
      }

      if (task.status === TaskStatus.EXPIRED) {
        await tx.notification.deleteMany({
          where: { taskId: task.id, type: NotificationType.TASK_OVERDUE, sentAt: null },
        });
      }

      if (peloResponsavel) {
        // Encerrada na hora, o lembrete de "vence em breve" ainda na fila
        // avisaria de uma tarefa ja feita.
        await tx.notification.deleteMany({
          where: { taskId: task.id, type: NotificationType.TASK_DUE_SOON, sentAt: null },
        });
        await tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.SUBMITTED, completedAt: agora },
        });
        this.exigirTransicao(TaskStatus.SUBMITTED, TaskStatus.APPROVED);
        return tx.task.update({
          where: { id: task.id },
          data: { status: TaskStatus.APPROVED, reviewedAt: agora },
        });
      }

      return tx.task.update({
        where: { id: task.id },
        data: { status: TaskStatus.SUBMITTED, completedAt: agora },
      });
    });

    if (peloResponsavel) {
      // O evento sai marcado, e sem pontos. Sem a marca, a tarefa feita pelo
      // adulto entraria na taxa de conclusao no prazo, que mede as criancas.
      const pontuacao = pontosPorConclusao(task.points, task.dueAt, agora);
      this.telemetry.record(
        [
          {
            type: 'task.completed',
            occurredAt: agora.toISOString(),
            taskId: task.id,
            onTime: pontuacao.onTime,
            minutesLate: pontuacao.minutosDeAtraso,
            pointsAwarded: 0,
            completedByParent: true,
          },
        ],
        { userId: actor.userId, familyId: actor.familyId },
      );
    }

    return concluida;
  }

  async lerImagemDaEvidencia(actor: Actor, evidenceId: string) {
    const evidencia = await this.prisma.taskEvidence.findFirst({
      where: {
        id: evidenceId,
        task: {
          familyId: actor.familyId,
          ...(actor.role === UserRole.CHILD ? { assigneeId: actor.userId } : {}),
        },
      },
    });

    if (!evidencia?.imageKey) {
      throw new NotFoundException('Evidência sem imagem');
    }
    if (evidencia.imageDiscardedAt) {
      // 410 e nao 404: a foto existiu e foi apagada pela politica de retencao.
      // A distincao importa para o responsavel entender o que aconteceu.
      throw new GoneException('A imagem foi excluída pela política de retenção');
    }
    if (!chaveEhDaFamilia(evidencia.imageKey, actor.familyId)) {
      throw new ForbiddenException('Imagem fora do escopo desta família');
    }

    return this.storage.lerEvidencia(evidencia.imageKey);
  }

  async processarRetencaoDeImagens(agora: Date = new Date()): Promise<{ excluidas: number; falhas: number }> {
    const { aposVerificacaoDias, maximaDias } = this.storage.retencao;
    const limiteAposVerificacao = new Date(agora.getTime() - aposVerificacaoDias * 86_400_000);
    const limiteAbsoluto = new Date(agora.getTime() - maximaDias * 86_400_000);

    const vencidas = await this.prisma.taskEvidence.findMany({
      where: {
        imageKey: { not: null },
        imageDiscardedAt: null,
        OR: [
          { reviewedAt: { lt: limiteAposVerificacao } },
          { createdAt: { lt: limiteAbsoluto } },
        ],
      },
      select: { id: true, imageKey: true },
      take: 500,
    });

    let excluidas = 0;
    let falhas = 0;

    for (const evidencia of vencidas) {
      if (!evidencia.imageKey) continue;
      try {
        await this.storage.apagarEvidencia(evidencia.imageKey);
        await this.prisma.taskEvidence.update({
          where: { id: evidencia.id },
          data: { imageDiscardedAt: agora },
        });
        excluidas += 1;
      } catch {
        // Uma falha isolada nao pode impedir as demais exclusoes: sao dados de
        // menores que ja passaram do prazo.
        falhas += 1;
      }
    }

    return { excluidas, falhas };
  }

  async verificar(actor: Actor, taskId: string, input: ReviewTaskRequest) {
    const task = await this.exigirTarefaDaFamilia(actor.familyId, taskId);

    if (task.assigneeId === actor.userId) {
      throw new ForbiddenException('Ninguém verifica a própria tarefa');
    }

    const destino =
      input.decision === 'APPROVED' ? TaskStatus.APPROVED : TaskStatus.REJECTED;
    this.exigirTransicao(task.status, destino);

    const agora = new Date();
    const conclusao = task.completedAt ?? agora;

    const resultado = await this.prisma.$transaction(async (tx) => {
      const ultimaEvidencia = await tx.taskEvidence.findFirst({
        where: { taskId: task.id },
        orderBy: { createdAt: 'desc' },
      });
      if (ultimaEvidencia) {
        await tx.taskEvidence.update({
          where: { id: ultimaEvidencia.id },
          data: {
            reviewDecision:
              input.decision === 'APPROVED' ? ReviewDecision.APPROVED : ReviewDecision.REJECTED,
            reviewedById: actor.userId,
            reviewedAt: agora,
            reviewComment: input.comment,
          },
        });
      }

      const atualizada = await tx.task.update({
        where: { id: task.id },
        data: { status: destino, reviewedAt: agora },
      });

      if (destino !== TaskStatus.APPROVED) {
        await this.notifications.registrar(tx, {
          familyId: task.familyId,
          userId: task.assigneeId,
          type: NotificationType.TASK_REJECTED,
          title: 'Tarefa devolvida',
          body: input.comment
            ? `"${task.title}": ${input.comment}`
            : `"${task.title}" precisa de ajustes. Você pode enviar de novo.`,
          taskId: task.id,
        });
        return { task: atualizada, pontuacao: null, lancamento: null };
      }

      const pontuacao = pontosPorConclusao(task.points, task.dueAt, conclusao);
      const lancamento = await this.wallet.aplicar(tx, {
        userId: task.assigneeId,
        delta: pontuacao.pontos,
        reason: TransactionReason.TASK_COMPLETED,
        taskId: task.id,
        note: pontuacao.onTime ? undefined : rotuloDaFaixa(pontuacao.faixa),
      });

      await this.notifications.registrar(tx, {
        familyId: task.familyId,
        userId: task.assigneeId,
        type: NotificationType.TASK_APPROVED,
        title: 'Tarefa aprovada!',
        body: pontuacao.onTime
          ? `"${task.title}" rendeu ${pontuacao.pontos} pontos.`
          : `"${task.title}" rendeu ${pontuacao.pontos} de ${pontuacao.pontosCheios} pontos, por causa do atraso.`,
        taskId: task.id,
      });

      const crianca = await tx.user.findUnique({
        where: { id: task.assigneeId },
        select: { name: true },
      });
      await this.notifications.lembrarDaLojaSemRecompensa(
        tx,
        { familyId: task.familyId, nome: crianca?.name ?? 'Seu filho', saldo: lancamento.balanceAfter },
        agora,
      );

      return { task: atualizada, pontuacao, lancamento };
    });

    if (resultado.pontuacao && resultado.lancamento) {
      this.telemetry.record(
        [
          {
            type: 'task.completed',
            occurredAt: conclusao.toISOString(),
            taskId: task.id,
            onTime: resultado.pontuacao.onTime,
            minutesLate: resultado.pontuacao.minutosDeAtraso,
            pointsAwarded: resultado.pontuacao.pontos,
          },
          {
            type: 'points.changed',
            occurredAt: agora.toISOString(),
            delta: resultado.lancamento.delta,
            balanceAfter: resultado.lancamento.balanceAfter,
            reason: 'task_completed',
          },
        ],
        { userId: task.assigneeId, familyId: actor.familyId },
      );
    }

    return resultado;
  }

  /** Cancelamento pelo responsavel. Nao gera pontos nem penalidade. */
  async cancelar(actor: Actor, taskId: string) {
    const task = await this.exigirTarefaDaFamilia(actor.familyId, taskId);
    this.exigirTransicao(task.status, TaskStatus.CANCELLED);

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status: TaskStatus.CANCELLED },
    });
  }

  async processarVencidas(agora: Date = new Date()): Promise<{ processadas: number; debitado: number }> {
    const vencidas = await this.prisma.task.findMany({
      where: {
        status: { in: [TaskStatus.PENDING, TaskStatus.REJECTED] },
        dueAt: { lt: agora },
      },
      // O indice [status, dueAt] existe exatamente para esta consulta.
      orderBy: { dueAt: 'asc' },
      take: 500,
    });

    let processadas = 0;
    let debitado = 0;

    for (const task of vencidas) {
      const resultado = await this.venceUma(task.id, task.assigneeId, task.points, task.familyId, agora);
      if (resultado) {
        processadas += 1;
        debitado += resultado.debito;
      }
    }

    return { processadas, debitado };
  }

  private async venceUma(
    taskId: string,
    assigneeId: string,
    pontos: number,
    familyId: string,
    agora: Date,
  ): Promise<{ debito: number } | null> {
    const resultado = await this.prisma.$transaction(async (tx) => {
      const atual = await tx.task.findUnique({ where: { id: taskId } });
      if (!atual || (atual.status !== TaskStatus.PENDING && atual.status !== TaskStatus.REJECTED)) {
        return null;
      }

      await tx.task.update({ where: { id: taskId }, data: { status: TaskStatus.EXPIRED } });

      await this.notifications.cobrarVencida(
        tx,
        { id: taskId, familyId, assigneeId, title: atual.title },
        agora,
      );

      const wallet = await tx.wallet.findUnique({ where: { userId: assigneeId } });
      const penalidade = penalidadePorVencimento(pontos, wallet?.balance ?? 0);
      if (penalidade.debito === 0) {
        return { debito: 0, balanceAfter: wallet?.balance ?? 0 };
      }

      const lancamento = await this.wallet.aplicar(tx, {
        userId: assigneeId,
        delta: -penalidade.debito,
        reason: TransactionReason.LATE_PENALTY,
        taskId,
        note: penalidade.limitadoPeloSaldo
          ? `Penalidade limitada pelo saldo (pretendida: ${penalidade.debitoPretendido})`
          : undefined,
      });

      return { debito: penalidade.debito, balanceAfter: lancamento.balanceAfter };
    });

    if (resultado && resultado.debito > 0) {
      this.telemetry.record(
        [
          {
            type: 'points.changed',
            occurredAt: agora.toISOString(),
            delta: -resultado.debito,
            balanceAfter: resultado.balanceAfter,
            reason: 'late_penalty',
          },
        ],
        { userId: assigneeId, familyId },
      );
    }

    return resultado;
  }

  private exigirTransicao(de: TaskStatus, para: TaskStatus): void {
    if (!podeTransicionar(de, para)) {
      throw new ConflictException(`Transição inválida: ${de} -> ${para}`);
    }
  }

  private async exigirTarefaDaFamilia(familyId: string, taskId: string) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, familyId } });
    if (!task) throw new NotFoundException('Tarefa não encontrada nesta família');
    return task;
  }

  private async exigirMembroDaFamilia(familyId: string, userId: string) {
    const membro = await this.prisma.user.findFirst({
      where: { id: userId, familyId, deactivatedAt: null },
    });
    if (!membro) throw new NotFoundException('Membro não encontrado nesta família');
    return membro;
  }
}

export type PrismaTx = Prisma.TransactionClient;
