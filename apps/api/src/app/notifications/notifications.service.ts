import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DeviceMode,
  NotificationType,
  Prisma,
  PrismaService,
  StoreItemKind,
  TaskStatus,
  UserRole,
} from '@taskplay/api-database';
import { PinoLogger } from 'nestjs-pino';
import type { Actor } from '../auth/auth.types';
import {
  APARELHO_NAO_REGISTRADO,
  ExpoPushClient,
  LOTE_MAXIMO,
  type MensagemPush,
} from './expo-push.client';

export const ANTECEDENCIA_DO_LEMBRETE_HORAS = 3;

export const INTERVALO_DA_COBRANCA_HORAS = 24;

export const DURACAO_DA_COBRANCA_DIAS = 7;

export const SALDO_PARA_LEMBRAR_DA_LOJA = 100;

export const INTERVALO_DO_LEMBRETE_DA_LOJA_DIAS = 7;

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expo: ExpoPushClient,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotificationsService.name);
  }

  async registrar(
    tx: Prisma.TransactionClient,
    dados: {
      familyId: string;
      userId: string;
      type: NotificationType;
      title: string;
      body: string;
      taskId?: string;
      scheduledFor?: Date;
      persistentUntil?: Date;
    },
  ) {
    return tx.notification.create({ data: dados });
  }

  /** Lembrete de prazo, agendado para pouco antes do vencimento. */
  async agendarLembrete(
    tx: Prisma.TransactionClient,
    task: { id: string; familyId: string; assigneeId: string; title: string; dueAt: Date },
    agora: Date = new Date(),
  ) {
    const quando = new Date(task.dueAt.getTime() - ANTECEDENCIA_DO_LEMBRETE_HORAS * 3_600_000);

    // Tarefa criada com prazo para daqui a uma hora nao gera lembrete para
    // ontem: nesse caso o proprio aviso de atribuicao ja cumpre o papel.
    if (quando <= agora) return null;

    return this.registrar(tx, {
      familyId: task.familyId,
      userId: task.assigneeId,
      type: NotificationType.TASK_DUE_SOON,
      title: 'Sua tarefa vence em breve',
      body: `"${task.title}" vence em ${ANTECEDENCIA_DO_LEMBRETE_HORAS} horas.`,
      taskId: task.id,
      scheduledFor: quando,
    });
  }

  async cobrarVencida(
    tx: Prisma.TransactionClient,
    task: { id: string; familyId: string; assigneeId: string; title: string },
    agora: Date = new Date(),
  ) {
    return this.registrar(tx, {
      familyId: task.familyId,
      userId: task.assigneeId,
      type: NotificationType.TASK_OVERDUE,
      title: 'Tarefa em atraso',
      body: `"${task.title}" venceu. Concluir agora ainda vale pontos.`,
      taskId: task.id,
      persistentUntil: new Date(agora.getTime() + DURACAO_DA_COBRANCA_DIAS * 86_400_000),
    });
  }

  async lembrarDaLojaSemRecompensa(
    tx: Prisma.TransactionClient,
    crianca: { familyId: string; nome: string; saldo: number },
    agora: Date = new Date(),
  ) {
    if (crianca.saldo < SALDO_PARA_LEMBRAR_DA_LOJA) return [];

    const recompensas = await tx.storeItem.count({
      where: { familyId: crianca.familyId, kind: StoreItemKind.REWARD, active: true },
    });
    if (recompensas > 0) return [];

    const desde = new Date(agora.getTime() - INTERVALO_DO_LEMBRETE_DA_LOJA_DIAS * 86_400_000);
    const recente = await tx.notification.findFirst({
      where: {
        familyId: crianca.familyId,
        type: NotificationType.STORE_WITHOUT_REWARDS,
        createdAt: { gte: desde },
      },
    });
    if (recente) return [];

    const responsaveis = await tx.user.findMany({
      where: { familyId: crianca.familyId, role: UserRole.PARENT, deactivatedAt: null },
      select: { id: true },
    });

    return Promise.all(
      responsaveis.map((r) =>
        this.registrar(tx, {
          familyId: crianca.familyId,
          userId: r.id,
          type: NotificationType.STORE_WITHOUT_REWARDS,
          title: 'A loja está sem recompensas',
          body: `${crianca.nome} já tem ${crianca.saldo} pontos e ainda não há nada para trocar. Que tal cadastrar uma recompensa?`,
        }),
      ),
    );
  }

  /** Notificacoes do ator. E a consulta que abre o aplicativo. */
  async listar(actor: Actor, apenasNaoLidas = false) {
    return this.prisma.notification.findMany({
      where: {
        userId: actor.userId,
        ...(apenasNaoLidas ? { readAt: null } : {}),
        // Agendada para o futuro ainda nao aconteceu para quem le.
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        taskId: true,
        sentAt: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async marcarLida(actor: Actor, notificationId: string) {
    const atualizadas = await this.prisma.notification.updateMany({
      where: { id: notificationId, userId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (atualizadas.count === 0) {
      throw new NotFoundException('Notificação não encontrada');
    }
  }

  async marcarTodasLidas(actor: Actor) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: actor.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { marcadas: count };
  }

  async despachar(agora: Date = new Date()): Promise<{ enviadas: number; semAparelho: number; falhas: number }> {
    const pendentes = await this.prisma.notification.findMany({
      where: {
        sentAt: null,
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: agora } }],
      },
      orderBy: { createdAt: 'asc' },
      take: LOTE_MAXIMO,
    });

    if (pendentes.length === 0) {
      return { enviadas: 0, semAparelho: 0, falhas: 0 };
    }

    const mensagens: MensagemPush[] = [];
    const origem: { notificationId: string; deviceId: string }[] = [];
    const semAparelho: string[] = [];

    for (const notificacao of pendentes) {
      const aparelhos = await this.aparelhosAlcancaveis(notificacao.familyId, notificacao.userId);

      if (aparelhos.length === 0) {
        semAparelho.push(notificacao.id);
        continue;
      }

      for (const device of aparelhos) {
        mensagens.push({
          to: device.pushToken as string,
          title: notificacao.title,
          body: notificacao.body,
          // O `data` leva apenas identificadores: e por ele que o aplicativo
          // abre direto na tarefa certa, sem repetir o conteudo do texto.
          data: {
            notificationId: notificacao.id,
            type: notificacao.type,
            taskId: notificacao.taskId,
          },
          priority: notificacao.type === NotificationType.TASK_OVERDUE ? 'high' : 'default',
        });
        origem.push({ notificationId: notificacao.id, deviceId: device.id });
      }
    }

    let falhas = 0;

    if (semAparelho.length > 0) {
      await this.prisma.notification.updateMany({
        where: { id: { in: semAparelho } },
        data: { sentAt: agora, pushError: 'sem aparelho com token' },
      });
    }

    if (mensagens.length > 0) {
      const tickets = await this.expo.enviar(mensagens);

      for (const [indice, ticket] of tickets.entries()) {
        const { notificationId, deviceId } = origem[indice];

        if (ticket.status === 'ok') {
          await this.prisma.notification.update({
            where: { id: notificationId },
            data: { sentAt: agora, pushTicketId: ticket.id },
          });
          continue;
        }

        falhas += 1;
        await this.prisma.notification.update({
          where: { id: notificationId },
          data: { sentAt: agora, pushError: (ticket.details?.error ?? ticket.message ?? 'erro').slice(0, 255) },
        });

        if (ticket.details?.error === APARELHO_NAO_REGISTRADO) {
          await this.limparToken(deviceId);
        }
      }
    }

    await this.reemitirCobrancas(pendentes, agora);

    return { enviadas: mensagens.length - falhas, semAparelho: semAparelho.length, falhas };
  }

  async conferirRecibos(): Promise<{ conferidos: number; comErro: number }> {
    const enviadas = await this.prisma.notification.findMany({
      where: { pushTicketId: { not: null }, pushError: null },
      orderBy: { sentAt: 'asc' },
      take: LOTE_MAXIMO,
      select: { id: true, pushTicketId: true },
    });

    if (enviadas.length === 0) return { conferidos: 0, comErro: 0 };

    const recibos = await this.expo.recibos(enviadas.map((n) => n.pushTicketId as string));
    let comErro = 0;

    for (const notificacao of enviadas) {
      const recibo = recibos[notificacao.pushTicketId as string];
      // Recibo ausente significa "ainda nao disponivel", e nao falha: o Expo os
      // publica com atraso. A proxima passagem tenta de novo.
      if (!recibo || recibo.status === 'ok') continue;

      comErro += 1;
      await this.prisma.notification.update({
        where: { id: notificacao.id },
        data: { pushError: (recibo.details?.error ?? recibo.message ?? 'erro').slice(0, 255) },
      });

      if (recibo.details?.error === APARELHO_NAO_REGISTRADO) {
        this.logger.info({ notificationId: notificacao.id }, 'aparelho desinstalado; token sera limpo');
      }
    }

    return { conferidos: enviadas.length, comErro };
  }

  private async reemitirCobrancas(
    pendentes: readonly { id: string; type: NotificationType; persistentUntil: Date | null; taskId: string | null; familyId: string; userId: string; title: string; body: string }[],
    agora: Date,
  ): Promise<void> {
    const proxima = new Date(agora.getTime() + INTERVALO_DA_COBRANCA_HORAS * 3_600_000);

    for (const notificacao of pendentes) {
      if (!notificacao.persistentUntil || notificacao.persistentUntil <= proxima) continue;
      if (!notificacao.taskId) continue;

      const task = await this.prisma.task.findUnique({
        where: { id: notificacao.taskId },
        select: { status: true },
      });
      if (task?.status !== TaskStatus.EXPIRED) continue;

      await this.prisma.notification.create({
        data: {
          familyId: notificacao.familyId,
          userId: notificacao.userId,
          type: notificacao.type,
          title: notificacao.title,
          body: notificacao.body,
          taskId: notificacao.taskId,
          scheduledFor: proxima,
          persistentUntil: notificacao.persistentUntil,
        },
      });
    }
  }

  private async aparelhosAlcancaveis(familyId: string, userId: string) {
    return this.prisma.device.findMany({
      where: {
        familyId,
        revokedAt: null,
        pushToken: { not: null },
        OR: [
          { mode: DeviceMode.SHARED },
          { mode: DeviceMode.PERSONAL, sessions: { some: { userId, revokedAt: null } } },
        ],
      },
      select: { id: true, pushToken: true },
    });
  }

  private async limparToken(deviceId: string): Promise<void> {
    await this.prisma.device.update({
      where: { id: deviceId },
      data: { pushToken: null, pushTokenUpdatedAt: null },
    });
  }
}
