import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { TaskStatus, TransactionReason, UserRole } from '@taskplay/api-database';
import { podeTransicionar, TasksService } from './tasks.service';
import type { Actor } from '../auth/auth.types';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const PAI = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';
const OUTRO_FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3304';
const TAREFA = '3f2504e0-4f89-41d3-9a0c-0305e82c3305';

const prazo = new Date('2026-09-01T18:00:00.000Z');

function ator(role: UserRole, userId: string): Actor {
  return { userId, familyId: FAMILIA, role, scope: 'full', deviceId: 'aparelho-1' };
}

function tarefa(overrides: Record<string, unknown> = {}) {
  return {
    id: TAREFA,
    familyId: FAMILIA,
    assigneeId: FILHO,
    points: 20,
    dueAt: prazo,
    status: TaskStatus.SUBMITTED,
    completedAt: prazo,
    ...overrides,
  };
}

function criarPrisma() {
  const prisma = {
    task: { findFirst: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    taskEvidence: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    user: { findFirst: jest.fn(), findUnique: jest.fn().mockResolvedValue({ name: 'Ana' }) },
    wallet: { findUnique: jest.fn() },
    notification: { create: jest.fn(), deleteMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: unknown) =>
    typeof fn === 'function' ? (fn as (tx: unknown) => unknown)(prisma) : Promise.all(fn as never),
  );
  prisma.task.update.mockImplementation((args: { data: Record<string, unknown> }) => ({
    ...tarefa(),
    ...args.data,
  }));
  return prisma;
}

describe('maquina de estados', () => {
  it('permite o caminho normal da tarefa', () => {
    expect(podeTransicionar(TaskStatus.PENDING, TaskStatus.SUBMITTED)).toBe(true);
    expect(podeTransicionar(TaskStatus.SUBMITTED, TaskStatus.APPROVED)).toBe(true);
    expect(podeTransicionar(TaskStatus.SUBMITTED, TaskStatus.REJECTED)).toBe(true);
  });

  it('devolve a tarefa a crianca depois de recusada', () => {
    // Recusar nao encerra: o objetivo (c) trata a verificacao como oportunidade
    // de refazer, e nao como veredito final.
    expect(podeTransicionar(TaskStatus.REJECTED, TaskStatus.SUBMITTED)).toBe(true);
  });

  it.each([TaskStatus.APPROVED, TaskStatus.CANCELLED])('%s e terminal', (terminal) => {
    for (const destino of Object.values(TaskStatus)) {
      expect(podeTransicionar(terminal, destino)).toBe(false);
    }
  });

  it('deixa concluir uma tarefa que ja venceu', () => {
    expect(podeTransicionar(TaskStatus.EXPIRED, TaskStatus.SUBMITTED)).toBe(true);
    // Mas ninguem pula a verificacao: aprovar direto continua proibido.
    expect(podeTransicionar(TaskStatus.EXPIRED, TaskStatus.APPROVED)).toBe(false);
  });

  it('deixa o responsavel cancelar de qualquer estado nao terminal', () => {
    const naoTerminais = [
      TaskStatus.PENDING,
      TaskStatus.SUBMITTED,
      TaskStatus.REJECTED,
      TaskStatus.EXPIRED,
    ];
    for (const origem of naoTerminais) {
      expect(podeTransicionar(origem, TaskStatus.CANCELLED)).toBe(true);
    }
  });

  it('nao permite aprovar tarefa que ninguem concluiu', () => {
    // Aprovar direto do PENDING creditaria pontos por trabalho nao registrado,
    // e o evento task.completed sairia sem momento de conclusao.
    expect(podeTransicionar(TaskStatus.PENDING, TaskStatus.APPROVED)).toBe(false);
  });

  it('nao permite vencer tarefa ja entregue', () => {
    // A crianca fez a parte dela; a demora do adulto em verificar nao pode
    // virar penalidade para ela.
    expect(podeTransicionar(TaskStatus.SUBMITTED, TaskStatus.EXPIRED)).toBe(false);
  });
});

describe('TasksService', () => {
  let prisma: ReturnType<typeof criarPrisma>;
  let wallet: { aplicar: jest.Mock };
  let telemetry: { record: jest.Mock };
  let storage: {
    guardarEvidencia: jest.Mock;
    apagarEvidencia: jest.Mock;
    lerEvidencia: jest.Mock;
    retencao: { aposVerificacaoDias: number; maximaDias: number };
  };
  let notifications: {
    registrar: jest.Mock;
    agendarLembrete: jest.Mock;
    cobrarVencida: jest.Mock;
    lembrarDaLojaSemRecompensa: jest.Mock;
  };
  let service: TasksService;

  beforeEach(() => {
    prisma = criarPrisma();
    wallet = { aplicar: jest.fn().mockResolvedValue({ delta: 20, balanceAfter: 20, lifetimeEarned: 20 }) };
    telemetry = { record: jest.fn() };
    storage = {
      guardarEvidencia: jest.fn().mockResolvedValue(`familias/${FAMILIA}/tarefas/${TAREFA}/x.jpg`),
      apagarEvidencia: jest.fn(),
      lerEvidencia: jest.fn(),
      retencao: { aposVerificacaoDias: 7, maximaDias: 30 },
    };
    notifications = {
      registrar: jest.fn(),
      agendarLembrete: jest.fn(),
      cobrarVencida: jest.fn(),
      lembrarDaLojaSemRecompensa: jest.fn(),
    };
    service = new TasksService(
      prisma as never,
      wallet as never,
      telemetry as never,
      storage as never,
      notifications as never,
    );
  });

  describe('leitura', () => {
    it('entrega a pontuacao calculada junto da tarefa', async () => {
      prisma.task.findMany.mockResolvedValue([
        tarefa({ status: TaskStatus.PENDING, completedAt: null }),
      ]);

      const [primeira] = await service.listar(ator(UserRole.CHILD, FILHO));

      expect(primeira.scoring.ifCompletedNow).toMatchObject({ fullPoints: 20 });
      expect(primeira.scoring.delivered).toBeNull();
    });

    it('usa um unico relogio para a lista inteira', async () => {
      prisma.task.findMany.mockResolvedValue([
        tarefa({ id: 'a', status: TaskStatus.PENDING, completedAt: null }),
        tarefa({ id: 'b', status: TaskStatus.PENDING, completedAt: null }),
      ]);

      const [a, b] = await service.listar(ator(UserRole.CHILD, FILHO));

      expect(a.scoring.ifCompletedNow?.validUntil).toBe(b.scoring.ifCompletedNow?.validUntil);
    });

    it('traz o valor ja decidido na tarefa entregue', async () => {
      prisma.task.findFirst.mockResolvedValue(
        tarefa({
          status: TaskStatus.APPROVED,
          completedAt: new Date(prazo.getTime() + 16 * 60 * 60 * 1000),
        }),
      );

      const lida = await service.obter(ator(UserRole.CHILD, FILHO), TAREFA);

      expect(lida.scoring.delivered).toMatchObject({ points: 15, credited: true });
      expect(lida.scoring.ifCompletedNow).toBeNull();
    });
  });

  describe('conclusao', () => {
    it('recusa concluir tarefa de outro membro', () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      return expect(
        service.concluir(ator(UserRole.CHILD, OUTRO_FILHO), TAREFA, {}),
      ).rejects.toThrow(ForbiddenException);
    });

    it('marca completedAt no momento da entrega, e nao no da aprovacao', async () => {
      // Um pai que demora dois dias para aprovar nao pode transformar uma
      // entrega no prazo em atraso.
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING, completedAt: null }));
      const antes = Date.now();

      await service.concluir(ator(UserRole.CHILD, FILHO), TAREFA, {});

      const { data } = prisma.task.update.mock.calls.at(-1)[0];
      expect(data.status).toBe(TaskStatus.SUBMITTED);
      expect(data.completedAt.getTime()).toBeGreaterThanOrEqual(antes);
    });

    it('apaga as cobrancas na fila ao concluir tarefa vencida', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.EXPIRED }));

      await service.concluir(ator(UserRole.CHILD, FILHO), TAREFA, {});

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { taskId: TAREFA, type: 'TASK_OVERDUE', sentAt: null },
      });
    });

    it('recusa concluir tarefa ja aprovada', () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.APPROVED }));
      return expect(service.concluir(ator(UserRole.CHILD, FILHO), TAREFA, {})).rejects.toThrow(
        ConflictException,
      );
    });

    it('gera a chave da foto no servidor, com a familia do token', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));

      await service.concluir(ator(UserRole.CHILD, FILHO), TAREFA, {}, {
        buffer: Buffer.from('foto'),
        mimetype: 'image/jpeg',
      });

      expect(storage.guardarEvidencia).toHaveBeenCalledWith(
        FAMILIA,
        TAREFA,
        expect.any(Buffer),
        'image/jpeg',
      );
      expect(prisma.taskEvidence.create.mock.calls[0][0].data.imageKey).toContain(
        `familias/${FAMILIA}/`,
      );
    });

    it('nao chama o armazenamento quando nao ha foto', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      await service.concluir(ator(UserRole.CHILD, FILHO), TAREFA, { note: 'pronto' });
      expect(storage.guardarEvidencia).not.toHaveBeenCalled();
    });

    it('conclusao do filho fica aguardando verificacao e nao emite telemetria', async () => {
      // O task.completed da crianca sai na aprovacao, com os pontos creditados.
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      await service.concluir(ator(UserRole.CHILD, FILHO), TAREFA, {});
      expect(prisma.task.update.mock.calls.at(-1)[0].data.status).toBe(TaskStatus.SUBMITTED);
      expect(telemetry.record).not.toHaveBeenCalled();
    });

    describe('tarefa recebida pelo responsavel com a carta', () => {
      it('encerra na hora, passando por entregue e aprovada', async () => {
        prisma.task.findFirst.mockResolvedValue(
          tarefa({ assigneeId: PAI, status: TaskStatus.PENDING, completedAt: null }),
        );

        await service.concluir(ator(UserRole.PARENT, PAI), TAREFA, {});

        const estados = prisma.task.update.mock.calls.map((c) => c[0].data.status);
        expect(estados).toEqual([TaskStatus.SUBMITTED, TaskStatus.APPROVED]);
      });

      it('nao credita pontos', async () => {
        prisma.task.findFirst.mockResolvedValue(tarefa({ assigneeId: PAI, status: TaskStatus.PENDING }));
        await service.concluir(ator(UserRole.PARENT, PAI), TAREFA, {});
        expect(wallet.aplicar).not.toHaveBeenCalled();
      });

      it('apaga o lembrete de vencimento ainda na fila', async () => {
        prisma.task.findFirst.mockResolvedValue(tarefa({ assigneeId: PAI, status: TaskStatus.PENDING }));
        await service.concluir(ator(UserRole.PARENT, PAI), TAREFA, {});
        expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
          where: { taskId: TAREFA, type: 'TASK_DUE_SOON', sentAt: null },
        });
      });

      it('emite task.completed marcado e sem pontos, fora da taxa das criancas', async () => {
        prisma.task.findFirst.mockResolvedValue(tarefa({ assigneeId: PAI, status: TaskStatus.PENDING }));
        await service.concluir(ator(UserRole.PARENT, PAI), TAREFA, {});

        const [eventos, sujeito] = telemetry.record.mock.calls[0];
        expect(eventos).toEqual([
          expect.objectContaining({
            type: 'task.completed',
            pointsAwarded: 0,
            completedByParent: true,
          }),
        ]);
        expect(sujeito).toEqual({ userId: PAI, familyId: FAMILIA });
      });

      it('continua recusando concluir tarefa que e de outro membro', () => {
        prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
        return expect(
          service.concluir(ator(UserRole.PARENT, PAI), TAREFA, {}),
        ).rejects.toThrow(ForbiddenException);
      });
    });
  });

  describe('retencao de imagens', () => {
    const chave = `familias/${FAMILIA}/tarefas/${TAREFA}/foto.jpg`;

    it('apaga o objeto antes de marcar a linha', async () => {
      // Ordem inversa marcaria como excluida uma foto que continua em disco, e
      // nada voltaria a olhar para ela.
      const ordem: string[] = [];
      prisma.taskEvidence.findMany.mockResolvedValue([{ id: 'ev-1', imageKey: chave }]);
      storage.apagarEvidencia.mockImplementation(async () => {
        ordem.push('objeto');
      });
      prisma.taskEvidence.update.mockImplementation(async () => {
        ordem.push('linha');
      });

      const r = await service.processarRetencaoDeImagens();

      expect(ordem).toEqual(['objeto', 'linha']);
      expect(r).toEqual({ excluidas: 1, falhas: 0 });
    });

    it('preserva o registro da verificacao ao apagar a foto', async () => {
      // O resultado continua explicando por que a tarefa foi aprovada, mesmo
      // depois de a foto deixar de existir (RNF03).
      prisma.taskEvidence.findMany.mockResolvedValue([{ id: 'ev-1', imageKey: chave }]);

      await service.processarRetencaoDeImagens();

      const escrita = prisma.taskEvidence.update.mock.calls[0][0];
      expect(Object.keys(escrita.data)).toEqual(['imageDiscardedAt']);
    });

    it('busca por verificacao antiga OU envio antigo', async () => {
      const agora = new Date('2026-09-30T12:00:00.000Z');
      prisma.taskEvidence.findMany.mockResolvedValue([]);

      await service.processarRetencaoDeImagens(agora);

      const { where } = prisma.taskEvidence.findMany.mock.calls[0][0];
      expect(where.imageDiscardedAt).toBeNull();
      const [porVerificacao, porEnvio] = where.OR;
      // 7 dias apos a verificacao; 30 apos o envio.
      expect(porVerificacao.reviewedAt.lt.toISOString()).toBe('2026-09-23T12:00:00.000Z');
      expect(porEnvio.createdAt.lt.toISOString()).toBe('2026-08-31T12:00:00.000Z');
    });

    it('uma falha nao impede as demais exclusoes', async () => {
      // Sao dados de menores que ja passaram do prazo: parar na primeira falha
      // deixaria os outros armazenados por mais uma passagem inteira.
      prisma.taskEvidence.findMany.mockResolvedValue([
        { id: 'ev-1', imageKey: chave },
        { id: 'ev-2', imageKey: chave },
        { id: 'ev-3', imageKey: chave },
      ]);
      storage.apagarEvidencia
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('indisponivel'))
        .mockResolvedValueOnce(undefined);

      expect(await service.processarRetencaoDeImagens()).toEqual({ excluidas: 2, falhas: 1 });
    });
  });

  describe('verificacao', () => {
    it('ninguem verifica a propria tarefa', () => {
      // Vale tambem quando o ator e legitimamente um responsavel: e a fronteira
      // que todo o desenho da autenticacao existe para proteger.
      prisma.task.findFirst.mockResolvedValue(tarefa({ assigneeId: PAI }));
      return expect(
        service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('credita os pontos cheios quando a entrega foi no prazo', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ completedAt: prazo }));

      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' });

      expect(wallet.aplicar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          userId: FILHO,
          delta: 20,
          reason: TransactionReason.TASK_COMPLETED,
          taskId: TAREFA,
        }),
      );
    });

    it('aplica a faixa de atraso sobre os pontos', async () => {
      // Entrega 30h depois do prazo: faixa "ate_72h", metade dos pontos.
      const atrasada = new Date(prazo.getTime() + 30 * 60 * 60_000);
      prisma.task.findFirst.mockResolvedValue(tarefa({ completedAt: atrasada }));

      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' });

      // A nota vai para o historico da crianca: nome da faixa, e nao o
      // identificador `ate_72h` da constante.
      expect(wallet.aplicar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ delta: 10, note: 'Até 72h de atraso' }),
      );
    });

    it('confere a loja com o saldo novo e o nome da crianca', async () => {
      // O saldo e o do lancamento, e nao o anterior: e ele que diz se a
      // crianca chegou ao limite com esta tarefa.
      wallet.aplicar.mockResolvedValue({ delta: 20, balanceAfter: 120, lifetimeEarned: 120 });
      prisma.task.findFirst.mockResolvedValue(tarefa());

      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' });

      expect(notifications.lembrarDaLojaSemRecompensa).toHaveBeenCalledWith(
        expect.anything(),
        { familyId: FAMILIA, nome: 'Ana', saldo: 120 },
        expect.any(Date),
      );
    });

    it('nao confere a loja quando recusa', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa());
      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'REJECTED' });
      expect(notifications.lembrarDaLojaSemRecompensa).not.toHaveBeenCalled();
    });

    it('nao credita nada quando recusa', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa());
      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'REJECTED' });
      expect(wallet.aplicar).not.toHaveBeenCalled();
      expect(telemetry.record).not.toHaveBeenCalled();
    });

    it('atribui a telemetria ao FILHO, e nao ao responsavel que aprovou', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa());

      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' });

      const [eventos, sujeito] = telemetry.record.mock.calls[0];
      expect(sujeito).toEqual({ userId: FILHO, familyId: FAMILIA });
      expect(eventos.map((e: { type: string }) => e.type)).toEqual([
        'task.completed',
        'points.changed',
      ]);
    });

    it('o evento task.completed usa o momento da entrega', async () => {
      const atrasada = new Date(prazo.getTime() + 90 * 60_000);
      prisma.task.findFirst.mockResolvedValue(tarefa({ completedAt: atrasada }));

      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' });

      const [eventos] = telemetry.record.mock.calls[0];
      expect(eventos[0]).toMatchObject({
        occurredAt: atrasada.toISOString(),
        onTime: false,
        minutesLate: 90,
        pointsAwarded: 15,
      });
    });
  });

  describe('edicao', () => {
    it('recusa alterar tarefa ja concluida', async () => {
      // Mudar pontos ou prazo depois da entrega alteraria retroativamente o que
      // a crianca acordou fazer - e, se ja aprovada, divergiria do razao.
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.APPROVED }));

      await expect(
        service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, { points: 50 }),
      ).rejects.toThrow(ConflictException);
    });

    it('mantem o que nao foi enviado, e apaga o detalhe quando vem nulo', async () => {
      // A ausencia significa "nao mexer"; `null` e a unica ausencia que apaga,
      // e sem ela um detalhe escrito por engano nunca sairia da tarefa.
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));

      await service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, {
        title: 'Arrumar a cama',
        description: null,
      });

      const { data } = prisma.task.update.mock.calls.at(-1)[0];
      expect(data).toMatchObject({ title: 'Arrumar a cama', description: null });
      expect(data.points).toBeUndefined();
      expect(data.dueAt).toBeUndefined();
      expect(data.assigneeId).toBeUndefined();
    });

    it('avisa quem passou a receber a tarefa', async () => {
      // A mesma razao de `criar`: "tarefa atribuida sem aviso" e um estado que
      // so aparece no dia em que a crianca e cobrada por algo que nao sabia.
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      prisma.user.findFirst.mockResolvedValue({ id: OUTRO_FILHO, familyId: FAMILIA });

      await service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, { assigneeId: OUTRO_FILHO });

      expect(notifications.registrar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: OUTRO_FILHO, type: 'TASK_ASSIGNED' }),
      );
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { taskId: TAREFA, userId: FILHO, sentAt: null },
      });
      expect(notifications.agendarLembrete).toHaveBeenCalled();
    });

    it('recusa trocar o destinatario de tarefa que ja voltou para refazer', async () => {
      // Ha evidencia anexada, e ela e daquela crianca: passar a tarefa adiante
      // entregaria a foto de um filho ao irmao.
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.REJECTED }));
      prisma.user.findFirst.mockResolvedValue({ id: OUTRO_FILHO, familyId: FAMILIA });

      await expect(
        service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, { assigneeId: OUTRO_FILHO }),
      ).rejects.toThrow(ConflictException);
    });

    it('recusa passar a tarefa a quem nao e da familia', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      prisma.user.findFirst.mockResolvedValue(null);

      await expect(
        service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, { assigneeId: OUTRO_FILHO }),
      ).rejects.toThrow(NotFoundException);
    });

    it('refaz o lembrete quando o prazo muda', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));

      await service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, {
        dueAt: new Date(prazo.getTime() + 86_400_000).toISOString(),
      });

      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
        where: { taskId: TAREFA, type: 'TASK_DUE_SOON', sentAt: null },
      });
      expect(notifications.agendarLembrete).toHaveBeenCalled();
    });

    it('nao mexe no lembrete quando o prazo enviado e o que ja estava la', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));

      await service.atualizar(ator(UserRole.PARENT, PAI), TAREFA, {
        title: 'Arrumar a cama',
        dueAt: prazo.toISOString(),
      });

      expect(prisma.notification.deleteMany).not.toHaveBeenCalled();
      expect(notifications.agendarLembrete).not.toHaveBeenCalled();
    });
  });

  describe('avisos', () => {
    it('cria aviso e lembrete na mesma transacao da tarefa', async () => {
      // "Tarefa atribuida sem aviso" e um estado que so aparece no dia em que a
      // crianca e cobrada por algo que nunca soube que tinha.
      prisma.user.findFirst.mockResolvedValue({ id: FILHO, familyId: FAMILIA });
      prisma.task.create.mockResolvedValue(tarefa({ title: 'Arrumar a cama' }));

      await service.criar(ator(UserRole.PARENT, PAI), {
        title: 'Arrumar a cama',
        assigneeId: FILHO,
        points: 20,
        dueAt: prazo.toISOString(),
        verification: 'MANUAL',
      });

      expect(notifications.registrar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: FILHO, type: 'TASK_ASSIGNED' }),
      );
      expect(notifications.agendarLembrete).toHaveBeenCalled();
    });

    it('avisa o filho ao aprovar, com os pontos que rendeu', async () => {
      prisma.task.findFirst.mockResolvedValue(tarefa());
      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, { decision: 'APPROVED' });

      expect(notifications.registrar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: FILHO, type: 'TASK_APPROVED' }),
      );
    });

    it('leva o comentario do responsavel ao devolver a tarefa', async () => {
      // Recusar sem dizer o motivo transforma a verificacao em veredito, que e
      // o oposto do que o objetivo (c) pretende.
      prisma.task.findFirst.mockResolvedValue(tarefa());
      await service.verificar(ator(UserRole.PARENT, PAI), TAREFA, {
        decision: 'REJECTED',
        comment: 'Faltou guardar os brinquedos',
      });

      const [, dados] = notifications.registrar.mock.calls[0];
      expect(dados.type).toBe('TASK_REJECTED');
      expect(dados.body).toContain('Faltou guardar os brinquedos');
    });

    it('cobra a tarefa que venceu', async () => {
      prisma.task.findMany.mockResolvedValue([tarefa({ status: TaskStatus.PENDING })]);
      prisma.task.findUnique.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      prisma.wallet.findUnique.mockResolvedValue({ balance: 100 });

      await service.processarVencidas();

      expect(notifications.cobrarVencida).toHaveBeenCalled();
    });
  });

  describe('compensacao', () => {
    it('so uma tarefa vencida gera compensacao', async () => {
      prisma.user.findFirst.mockResolvedValue({ id: FILHO, familyId: FAMILIA });
      prisma.task.findFirst.mockResolvedValue(tarefa({ status: TaskStatus.APPROVED }));

      await expect(
        service.criar(ator(UserRole.PARENT, PAI), {
          title: 'Compensacao',
          assigneeId: FILHO,
          points: 10,
          dueAt: prazo.toISOString(),
          verification: 'MANUAL',
          compensationForId: TAREFA,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('recusa atribuir tarefa a quem nao e da familia', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      await expect(
        service.criar(ator(UserRole.PARENT, PAI), {
          title: 'Tarefa',
          assigneeId: OUTRO_FILHO,
          points: 10,
          dueAt: prazo.toISOString(),
          verification: 'MANUAL',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('vencimento', () => {
    it('nao vence tarefa concluida entre a varredura e a escrita', async () => {
      // Janela real: a varredura leu PENDING, a crianca concluiu, e so entao a
      // transacao rodou. Vence-la aqui puniria quem entregou.
      prisma.task.findMany.mockResolvedValue([tarefa({ status: TaskStatus.PENDING })]);
      prisma.task.findUnique.mockResolvedValue(tarefa({ status: TaskStatus.SUBMITTED }));

      const r = await service.processarVencidas();

      expect(r.processadas).toBe(0);
      expect(wallet.aplicar).not.toHaveBeenCalled();
    });

    it('debita metade dos pontos da tarefa vencida', async () => {
      prisma.task.findMany.mockResolvedValue([tarefa({ status: TaskStatus.PENDING })]);
      prisma.task.findUnique.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      prisma.wallet.findUnique.mockResolvedValue({ balance: 100 });
      wallet.aplicar.mockResolvedValue({ delta: -10, balanceAfter: 90, lifetimeEarned: 100 });

      const r = await service.processarVencidas();

      expect(r).toEqual({ processadas: 1, debitado: 10 });
      expect(wallet.aplicar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ delta: -10, reason: TransactionReason.LATE_PENALTY }),
      );
    });

    it('limita o debito ao saldo, sem gerar divida', async () => {
      prisma.task.findMany.mockResolvedValue([tarefa({ status: TaskStatus.PENDING })]);
      prisma.task.findUnique.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      prisma.wallet.findUnique.mockResolvedValue({ balance: 3 });
      wallet.aplicar.mockResolvedValue({ delta: -3, balanceAfter: 0, lifetimeEarned: 100 });

      const r = await service.processarVencidas();

      expect(r.debitado).toBe(3);
      const lancamento = wallet.aplicar.mock.calls[0][1];
      expect(lancamento.delta).toBe(-3);
      expect(lancamento.note).toContain('limitada pelo saldo');
    });

    it('nao lanca nada para quem esta zerado', async () => {
      prisma.task.findMany.mockResolvedValue([tarefa({ status: TaskStatus.PENDING })]);
      prisma.task.findUnique.mockResolvedValue(tarefa({ status: TaskStatus.PENDING }));
      prisma.wallet.findUnique.mockResolvedValue({ balance: 0 });

      const r = await service.processarVencidas();

      expect(r).toEqual({ processadas: 1, debitado: 0 });
      expect(wallet.aplicar).not.toHaveBeenCalled();
      // Sem lancamento nao ha evento: registrar delta zero poluiria a serie de
      // "pontuacao acumulada" com pontos que nunca mudaram.
      expect(telemetry.record).not.toHaveBeenCalled();
    });
  });
});
