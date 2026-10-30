import { NotificationType, StoreItemKind, TaskStatus, UserRole } from '@taskplay/api-database';
import {
  ANTECEDENCIA_DO_LEMBRETE_HORAS,
  DURACAO_DA_COBRANCA_DIAS,
  INTERVALO_DA_COBRANCA_HORAS,
  INTERVALO_DO_LEMBRETE_DA_LOJA_DIAS,
  NotificationsService,
  SALDO_PARA_LEMBRAR_DA_LOJA,
} from './notifications.service';
import { APARELHO_NAO_REGISTRADO, TOKEN_EXPO } from './expo-push.client';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const TAREFA = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const APARELHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const TOKEN = 'ExponentPushToken[abcDEF123_-]';

const agora = new Date('2026-09-01T12:00:00.000Z');

function pendente(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    familyId: FAMILIA,
    userId: FILHO,
    type: NotificationType.TASK_ASSIGNED,
    title: 'Nova tarefa',
    body: 'Arrumar a cama vale 20 pontos.',
    taskId: TAREFA,
    persistentUntil: null,
    ...overrides,
  };
}

function criarPrisma() {
  return {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    task: { findUnique: jest.fn() },
    device: {
      update: jest.fn(),
      findMany: jest.fn().mockResolvedValue([{ id: APARELHO, pushToken: TOKEN }]),
    },
  };
}

describe('formato do token', () => {
  it.each(['ExponentPushToken[xxxxxxxx]', 'ExpoPushToken[aB3_-9]'])('aceita %s', (token) => {
    expect(TOKEN_EXPO.test(token)).toBe(true);
  });

  it.each(['fcm-token-qualquer', 'ExponentPushToken[]', 'ExponentPushToken[a b]', ''])(
    'recusa %s',
    (token) => {
      // Um token malformado so falharia no momento do envio, horas depois, na
      // rotina - longe de quem o cadastrou e sem ninguem para ver o erro.
      expect(TOKEN_EXPO.test(token)).toBe(false);
    },
  );
});

describe('NotificationsService', () => {
  let prisma: ReturnType<typeof criarPrisma>;
  let expo: { enviar: jest.Mock; recibos: jest.Mock };
  let logger: { info: jest.Mock; error: jest.Mock; setContext: jest.Mock };
  let service: NotificationsService;

  beforeEach(() => {
    prisma = criarPrisma();
    expo = { enviar: jest.fn().mockResolvedValue([]), recibos: jest.fn().mockResolvedValue({}) };
    logger = { info: jest.fn(), error: jest.fn(), setContext: jest.fn() };
    service = new NotificationsService(prisma as never, expo as never, logger as never);
  });

  describe('lembrete da loja sem recompensa', () => {
    const PAI = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';
    const MAE = '3f2504e0-4f89-41d3-9a0c-0305e82c3306';
    const tx = {
      storeItem: { count: jest.fn() },
      notification: { findFirst: jest.fn(), create: jest.fn() },
      user: { findMany: jest.fn() },
    };
    const crianca = { familyId: FAMILIA, nome: 'Ana', saldo: 130 };

    beforeEach(() => {
      tx.storeItem.count.mockReset().mockResolvedValue(0);
      tx.notification.findFirst.mockReset().mockResolvedValue(null);
      tx.notification.create.mockReset();
      tx.user.findMany.mockReset().mockResolvedValue([{ id: PAI }]);
    });

    it('avisa o responsavel quando ha pontos e nenhuma recompensa', async () => {
      await service.lembrarDaLojaSemRecompensa(tx as never, crianca, agora);

      expect(tx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          familyId: FAMILIA,
          userId: PAI,
          type: NotificationType.STORE_WITHOUT_REWARDS,
          body: expect.stringContaining('Ana já tem 130 pontos'),
        }),
      });
    });

    it('nao avisa abaixo do limite', async () => {
      await service.lembrarDaLojaSemRecompensa(
        tx as never,
        { ...crianca, saldo: SALDO_PARA_LEMBRAR_DA_LOJA - 1 },
        agora,
      );
      expect(tx.storeItem.count).not.toHaveBeenCalled();
      expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it('avisa exatamente no limite', async () => {
      await service.lembrarDaLojaSemRecompensa(
        tx as never,
        { ...crianca, saldo: SALDO_PARA_LEMBRAR_DA_LOJA },
        agora,
      );
      expect(tx.notification.create).toHaveBeenCalledTimes(1);
    });

    it('conta so recompensa ativa, e nao a Carta de Transferencia', async () => {
      // A carta e criada pelo sistema em toda loja; conta-la faria o aviso
      // nunca disparar.
      await service.lembrarDaLojaSemRecompensa(tx as never, crianca, agora);
      expect(tx.storeItem.count).toHaveBeenCalledWith({
        where: { familyId: FAMILIA, kind: StoreItemKind.REWARD, active: true },
      });
    });

    it('nao avisa quando a loja ja tem recompensa', async () => {
      tx.storeItem.count.mockResolvedValue(1);
      await service.lembrarDaLojaSemRecompensa(tx as never, crianca, agora);
      expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it('nao repete dentro do intervalo', async () => {
      tx.notification.findFirst.mockResolvedValue({ id: 'anterior' });
      await service.lembrarDaLojaSemRecompensa(tx as never, crianca, agora);

      expect(tx.notification.findFirst).toHaveBeenCalledWith({
        where: {
          familyId: FAMILIA,
          type: NotificationType.STORE_WITHOUT_REWARDS,
          createdAt: {
            gte: new Date(agora.getTime() - INTERVALO_DO_LEMBRETE_DA_LOJA_DIAS * 86_400_000),
          },
        },
      });
      expect(tx.notification.create).not.toHaveBeenCalled();
    });

    it('avisa cada responsavel ativo da familia', async () => {
      tx.user.findMany.mockResolvedValue([{ id: PAI }, { id: MAE }]);
      await service.lembrarDaLojaSemRecompensa(tx as never, crianca, agora);

      expect(tx.user.findMany).toHaveBeenCalledWith({
        where: { familyId: FAMILIA, role: UserRole.PARENT, deactivatedAt: null },
        select: { id: true },
      });
      expect(tx.notification.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('lembrete de prazo', () => {
    const tx = { notification: { create: jest.fn() } };

    beforeEach(() => tx.notification.create.mockReset());

    it('agenda para algumas horas antes do vencimento', async () => {
      const dueAt = new Date(agora.getTime() + 24 * 3_600_000);
      await service.agendarLembrete(
        tx as never,
        { id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, title: 'Lavar a louca', dueAt },
        agora,
      );

      const { data } = tx.notification.create.mock.calls[0][0];
      expect(data.type).toBe(NotificationType.TASK_DUE_SOON);
      expect(data.scheduledFor.getTime()).toBe(
        dueAt.getTime() - ANTECEDENCIA_DO_LEMBRETE_HORAS * 3_600_000,
      );
    });

    it('nao agenda lembrete para o passado', async () => {
      // Tarefa criada com prazo para daqui a uma hora: o proprio aviso de
      // atribuicao ja cumpre o papel do lembrete.
      const dueAt = new Date(agora.getTime() + 3_600_000);
      const r = await service.agendarLembrete(
        tx as never,
        { id: TAREFA, familyId: FAMILIA, assigneeId: FILHO, title: 'Urgente', dueAt },
        agora,
      );

      expect(r).toBeNull();
      expect(tx.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('despacho', () => {
    it('alcanca o aparelho compartilhado mesmo sem sessao da crianca', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

      await service.despachar(agora);

      const { where } = prisma.device.findMany.mock.calls[0][0];
      expect(where.familyId).toBe(FAMILIA);
      expect(where.revokedAt).toBeNull();
      const [compartilhado, pessoal] = where.OR;
      expect(compartilhado.mode).toBe('SHARED');
      // O aparelho pessoal, esse sim, exige sessao: o celular do filho de 14
      // anos nao recebe a cobranca do irmao.
      expect(pessoal.mode).toBe('PERSONAL');
      expect(pessoal.sessions.some.userId).toBe(FILHO);
    });

    it('envia para todos os aparelhos alcancados', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      prisma.device.findMany.mockResolvedValue([
        { id: APARELHO, pushToken: TOKEN },
        { id: 'aparelho-2', pushToken: 'ExpoPushToken[outro]' },
      ]);
      expo.enviar.mockResolvedValue([
        { status: 'ok', id: 'ticket-1' },
        { status: 'ok', id: 'ticket-2' },
      ]);

      const r = await service.despachar(agora);

      expect(expo.enviar.mock.calls[0][0]).toHaveLength(2);
      expect(r.enviadas).toBe(2);
    });

    it('marca como enviada mesmo sem aparelho alcancavel', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      prisma.device.findMany.mockResolvedValue([]);

      await service.despachar(agora);

      const { data } = prisma.notification.updateMany.mock.calls[0][0];
      expect(data.sentAt).toBe(agora);
      expect(data.pushError).toContain('sem aparelho');
    });

    it('guarda o ticket, que ainda nao e entrega', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 'ticket-1' }]);

      await service.despachar(agora);

      expect(prisma.notification.update.mock.calls[0][0].data).toMatchObject({
        sentAt: agora,
        pushTicketId: 'ticket-1',
      });
    });

    it('limpa o token quando o aparelho nao existe mais', async () => {
      // Sem isso, o sistema enviaria para aparelhos desinstalados durante os 30
      // dias inteiros de coleta.
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      expo.enviar.mockResolvedValue([
        { status: 'error', message: 'nao registrado', details: { error: APARELHO_NAO_REGISTRADO } },
      ]);

      const r = await service.despachar(agora);

      expect(prisma.device.update).toHaveBeenCalledWith({
        where: { id: APARELHO },
        data: { pushToken: null, pushTokenUpdatedAt: null },
      });
      expect(r.falhas).toBe(1);
    });

    it('registra o erro sem limpar o token em falha passageira', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      expo.enviar.mockResolvedValue([
        { status: 'error', message: 'servico indisponivel', details: { error: 'MessageRateExceeded' } },
      ]);

      await service.despachar(agora);

      expect(prisma.device.update).not.toHaveBeenCalled();
      expect(prisma.notification.update.mock.calls[0][0].data.pushError).toBe('MessageRateExceeded');
    });

    it('prioriza a cobranca de atraso', async () => {
      prisma.notification.findMany.mockResolvedValue([
        pendente({ type: NotificationType.TASK_OVERDUE }),
      ]);
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 't' }]);

      await service.despachar(agora);

      expect(expo.enviar.mock.calls[0][0][0].priority).toBe('high');
    });

    it('leva so identificadores no data, e nao o texto de novo', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 't' }]);

      await service.despachar(agora);

      const mensagem = expo.enviar.mock.calls[0][0][0];
      expect(mensagem.data).toEqual({
        notificationId: 'notif-1',
        type: NotificationType.TASK_ASSIGNED,
        taskId: TAREFA,
      });
    });
  });

  describe('cobranca persistente (RF08)', () => {
    const cobranca = () =>
      pendente({
        type: NotificationType.TASK_OVERDUE,
        persistentUntil: new Date(agora.getTime() + DURACAO_DA_COBRANCA_DIAS * 86_400_000),
      });

    it('cria a proxima cobranca enquanto a tarefa segue vencida', async () => {
      prisma.notification.findMany.mockResolvedValue([cobranca()]);
      prisma.task.findUnique.mockResolvedValue({ status: TaskStatus.EXPIRED });
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 't' }]);

      await service.despachar(agora);

      const { data } = prisma.notification.create.mock.calls[0][0];
      expect(data.type).toBe(NotificationType.TASK_OVERDUE);
      expect(data.scheduledFor.getTime()).toBe(
        agora.getTime() + INTERVALO_DA_COBRANCA_HORAS * 3_600_000,
      );
    });

    it('para de cobrar quando a crianca conclui a tarefa', async () => {
      // Continuar cobrando quem ja resolveu e o oposto de penalidade
      // construtiva.
      prisma.notification.findMany.mockResolvedValue([cobranca()]);
      prisma.task.findUnique.mockResolvedValue({ status: TaskStatus.SUBMITTED });
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 't' }]);

      await service.despachar(agora);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('para de cobrar ao fim da janela', async () => {
      // Passados os dias, a tarefa ja rendeu penalidade e possivelmente
      // compensacao; continuar cobrando so desgasta.
      prisma.notification.findMany.mockResolvedValue([
        pendente({
          type: NotificationType.TASK_OVERDUE,
          persistentUntil: new Date(agora.getTime() + 3_600_000),
        }),
      ]);
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 't' }]);

      await service.despachar(agora);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });

    it('nao reemite notificacao comum', async () => {
      prisma.notification.findMany.mockResolvedValue([pendente()]);
      expo.enviar.mockResolvedValue([{ status: 'ok', id: 't' }]);

      await service.despachar(agora);

      expect(prisma.notification.create).not.toHaveBeenCalled();
    });
  });

  describe('recibos', () => {
    it('trata recibo ausente como ainda indisponivel, e nao como falha', async () => {
      // O Expo publica os recibos com atraso; a proxima passagem tenta de novo.
      prisma.notification.findMany.mockResolvedValue([{ id: 'n1', pushTicketId: 't1' }]);
      expo.recibos.mockResolvedValue({});

      expect(await service.conferirRecibos()).toEqual({ conferidos: 1, comErro: 0 });
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('registra o erro do recibo', async () => {
      prisma.notification.findMany.mockResolvedValue([{ id: 'n1', pushTicketId: 't1' }]);
      expo.recibos.mockResolvedValue({
        t1: { status: 'error', message: 'x', details: { error: APARELHO_NAO_REGISTRADO } },
      });

      const r = await service.conferirRecibos();

      expect(r.comErro).toBe(1);
      expect(prisma.notification.update.mock.calls[0][0].data.pushError).toBe(
        APARELHO_NAO_REGISTRADO,
      );
    });

    it('nao consulta nada quando nao ha o que conferir', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      expect(await service.conferirRecibos()).toEqual({ conferidos: 0, comErro: 0 });
      expect(expo.recibos).not.toHaveBeenCalled();
    });
  });
});
