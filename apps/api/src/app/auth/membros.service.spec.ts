import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { FamilyAuditAction, UserRole } from '@taskplay/api-database';
import { MembrosService } from './membros.service';
import { verifySecret } from './crypto';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3401';
const RESPONSAVEL = '3f2504e0-4f89-41d3-9a0c-0305e82c3402';
const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3403';
const OUTRO_RESPONSAVEL = '3f2504e0-4f89-41d3-9a0c-0305e82c3404';

const ator = {
  userId: RESPONSAVEL,
  familyId: FAMILIA,
  role: UserRole.PARENT,
  scope: 'full' as const,
  deviceId: '3f2504e0-4f89-41d3-9a0c-0305e82c3405',
};

function criarPrisma() {
  const prisma = {
    user: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    deviceSession: { updateMany: jest.fn() },
    deviceEnrollment: { updateMany: jest.fn() },
    familyAuditLog: { createMany: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(prisma));
  return prisma;
}

function filho(overrides: Record<string, unknown> = {}) {
  return {
    id: FILHO,
    familyId: FAMILIA,
    name: 'Pedro',
    role: UserRole.CHILD,
    birthDate: null,
    pinHash: null,
    deactivatedAt: null,
    failedAuthAttempts: 0,
    lockedUntil: null,
    ...overrides,
  };
}

describe('MembrosService', () => {
  let prisma: ReturnType<typeof criarPrisma>;
  let registro: { registrar: jest.Mock; listar: jest.Mock };
  let service: MembrosService;

  beforeEach(() => {
    prisma = criarPrisma();
    registro = { registrar: jest.fn(), listar: jest.fn() };
    service = new MembrosService(prisma as never, registro as never);
  });

  /** Responde as duas consultas de `carregarAtorEAlvo`, nesta ordem. */
  function comAtorEAlvo(alvo: ReturnType<typeof filho>) {
    prisma.user.findFirst
      .mockResolvedValueOnce({ id: RESPONSAVEL, name: 'Ana' })
      .mockResolvedValueOnce(alvo);
  }

  describe('quem pode ser gerenciado', () => {
    it('recusa um perfil de outra familia como inexistente', async () => {
      prisma.user.findFirst
        .mockResolvedValueOnce({ id: RESPONSAVEL, name: 'Ana' })
        .mockResolvedValueOnce(null);

      await expect(service.atualizar(ator, FILHO, { name: 'Novo' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(registro.registrar).not.toHaveBeenCalled();
    });

    // Sem esta regra, um toque removeria do nucleo o unico perfil capaz de
    // aprovar tarefa, gerir a loja e sair do estudo - sem volta pelo aplicativo.
    it('recusa gerenciar o perfil de um responsavel', async () => {
      comAtorEAlvo(filho({ id: OUTRO_RESPONSAVEL, role: UserRole.PARENT }));

      await expect(service.remover(ator, OUTRO_RESPONSAVEL)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('alteracao de nome e data', () => {
    it('registra uma entrada por campo, com o valor antes e depois', async () => {
      comAtorEAlvo(filho({ name: 'Pedrinho', birthDate: new Date('2016-04-01T00:00:00.000Z') }));
      prisma.user.update.mockResolvedValue(filho({ name: 'Pedro' }));

      await service.atualizar(ator, FILHO, { name: 'Pedro', birthDate: '2016-04-02' });

      const alteracoes = registro.registrar.mock.calls[0][2];
      expect(alteracoes).toHaveLength(2);
      expect(alteracoes[0]).toMatchObject({
        action: FamilyAuditAction.MEMBER_RENAMED,
        actor: { id: RESPONSAVEL, name: 'Ana' },
        target: { id: FILHO, name: 'Pedrinho' },
        field: 'name',
        before: 'Pedrinho',
        after: 'Pedro',
      });
      expect(alteracoes[1]).toMatchObject({
        action: FamilyAuditAction.MEMBER_BIRTH_DATE_CHANGED,
        field: 'birthDate',
        before: '2016-04-01',
        after: '2016-04-02',
      });
    });

    // O nome copiado e o do MOMENTO do fato: lido por join, o historico de uma
    // renomeacao trocaria de sujeito na leitura seguinte.
    it('copia para o registro o nome que o alvo tinha antes da troca', async () => {
      comAtorEAlvo(filho({ name: 'Pedrinho' }));
      prisma.user.update.mockResolvedValue(filho({ name: 'Pedro' }));

      await service.atualizar(ator, FILHO, { name: 'Pedro' });

      expect(registro.registrar.mock.calls[0][2][0].target.name).toBe('Pedrinho');
    });

    it('nao registra nem escreve quando o valor enviado e o que ja esta la', async () => {
      comAtorEAlvo(filho({ name: 'Pedro' }));

      const resultado = await service.atualizar(ator, FILHO, { name: 'Pedro' });

      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(registro.registrar).not.toHaveBeenCalled();
      expect(resultado.name).toBe('Pedro');
    });

    // `null` apaga; `undefined` mantem. Sem a distincao nao haveria como tirar
    // uma data digitada errada.
    it('apaga a data de nascimento com null e registra a ausencia', async () => {
      comAtorEAlvo(filho({ birthDate: new Date('2016-04-01T00:00:00.000Z') }));
      prisma.user.update.mockResolvedValue(filho());

      await service.atualizar(ator, FILHO, { birthDate: null });

      expect(prisma.user.update.mock.calls[0][0].data.birthDate).toBeNull();
      expect(registro.registrar.mock.calls[0][2][0]).toMatchObject({
        before: '2016-04-01',
        after: null,
      });
    });
  });

  describe('PIN', () => {
    it('distingue definir, trocar e remover', async () => {
      const casos: Array<[string | null, string | null, FamilyAuditAction]> = [
        ['1234', null, FamilyAuditAction.MEMBER_PIN_SET],
        ['1234', 'hash-antigo', FamilyAuditAction.MEMBER_PIN_CHANGED],
        [null, 'hash-antigo', FamilyAuditAction.MEMBER_PIN_REMOVED],
      ];

      for (const [pin, pinHash, esperado] of casos) {
        prisma = criarPrisma();
        registro = { registrar: jest.fn(), listar: jest.fn() };
        service = new MembrosService(prisma as never, registro as never);
        comAtorEAlvo(filho({ pinHash }));
        prisma.user.update.mockResolvedValue(filho({ pinHash }));

        await service.atualizar(ator, FILHO, { pin });

        expect(registro.registrar.mock.calls[0][2][0].action).toBe(esperado);
      }
    });

    // A garantia central do registro: o PIN nao aparece nele nem como valor
    // anterior, nem como valor novo, nem como hash.
    it('nunca leva o PIN ao registro, em nenhuma das tres acoes', async () => {
      comAtorEAlvo(filho({ pinHash: 'hash-antigo' }));
      prisma.user.update.mockResolvedValue(filho());

      await service.atualizar(ator, FILHO, { pin: '4321' });

      const alteracao = registro.registrar.mock.calls[0][2][0];
      expect(alteracao.before ?? null).toBeNull();
      expect(alteracao.after ?? null).toBeNull();
      expect(JSON.stringify(alteracao)).not.toContain('4321');
      expect(JSON.stringify(alteracao)).not.toContain('hash-antigo');
    });

    it('guarda o PIN derivado, e nunca os quatro digitos', async () => {
      comAtorEAlvo(filho());
      prisma.user.update.mockResolvedValue(filho());

      await service.atualizar(ator, FILHO, { pin: '1234' });

      const { pinHash } = prisma.user.update.mock.calls[0][0].data;
      expect(pinHash).not.toBe('1234');
      await expect(verifySecret('1234', pinHash)).resolves.toBe(true);
    });

    // O bloqueio existe para proteger um segredo. Trocado o segredo, as
    // tentativas gastas contra o anterior deixam de dizer respeito a ele.
    it('zera o bloqueio progressivo junto com a troca do PIN', async () => {
      comAtorEAlvo(filho({ pinHash: 'hash-antigo', failedAuthAttempts: 5, lockedUntil: new Date() }));
      prisma.user.update.mockResolvedValue(filho());

      await service.atualizar(ator, FILHO, { pin: null });

      expect(prisma.user.update.mock.calls[0][0].data).toMatchObject({
        pinHash: null,
        failedAuthAttempts: 0,
        lockedUntil: null,
      });
    });
  });

  describe('remocao e restauracao', () => {
    // Sem encerrar as sessoes, a remocao seria cosmetica: o perfil sumiria do
    // seletor enquanto o aparelho do adolescente seguia dentro dele.
    it('marca a saida e encerra sessoes e codigos pendentes', async () => {
      comAtorEAlvo(filho());
      prisma.user.update.mockResolvedValue(filho({ deactivatedAt: new Date() }));

      await service.remover(ator, FILHO);

      expect(prisma.user.update.mock.calls[0][0].data.deactivatedAt).toBeInstanceOf(Date);
      expect(prisma.deviceSession.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: FILHO, revokedAt: null } }),
      );
      expect(prisma.deviceEnrollment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: FILHO, usedAt: null } }),
      );
      expect(registro.registrar.mock.calls[0][2][0]).toMatchObject({
        action: FamilyAuditAction.MEMBER_DEACTIVATED,
        target: { id: FILHO, name: 'Pedro' },
      });
    });

    it('recusa remover quem ja saiu, e restaurar quem nunca saiu', async () => {
      comAtorEAlvo(filho({ deactivatedAt: new Date() }));
      await expect(service.remover(ator, FILHO)).rejects.toBeInstanceOf(ConflictException);

      comAtorEAlvo(filho());
      await expect(service.restaurar(ator, FILHO)).rejects.toBeInstanceOf(ConflictException);
    });

    it('restaura o perfil sem devolver sessoes nem codigos', async () => {
      comAtorEAlvo(filho({ deactivatedAt: new Date() }));
      prisma.user.update.mockResolvedValue(filho());

      await service.restaurar(ator, FILHO);

      expect(prisma.user.update.mock.calls[0][0].data).toEqual({ deactivatedAt: null });
      expect(prisma.deviceSession.updateMany).not.toHaveBeenCalled();
      expect(prisma.deviceEnrollment.updateMany).not.toHaveBeenCalled();
      expect(registro.registrar.mock.calls[0][2][0].action).toBe(
        FamilyAuditAction.MEMBER_REACTIVATED,
      );
    });
  });

  describe('cadastro', () => {
    // O cadastro e UMA entrada: data e PIN informados no formulario nao sao
    // alteracoes de um perfil que existia, e sim como ele nasceu.
    it('registra o cadastro como uma unica entrada', async () => {
      prisma.user.findFirst.mockResolvedValueOnce({ id: RESPONSAVEL, name: 'Ana' });
      prisma.user.create.mockResolvedValue({
        id: FILHO,
        name: 'Pedro',
        role: UserRole.CHILD,
        birthDate: null,
      });

      await service.criar(ator, { name: 'Pedro', birthDate: '2016-04-01', pin: '1234' });

      const alteracoes = registro.registrar.mock.calls[0][2];
      expect(alteracoes).toHaveLength(1);
      expect(alteracoes[0]).toMatchObject({
        action: FamilyAuditAction.MEMBER_CREATED,
        field: 'name',
        after: 'Pedro',
      });
    });
  });

  describe('listagem para gestao', () => {
    it('poe quem esta na familia antes de quem saiu', async () => {
      prisma.user.findMany.mockResolvedValue([]);

      await service.listar(ator);

      expect(prisma.user.findMany.mock.calls[0][0].orderBy[0]).toEqual({
        deactivatedAt: { sort: 'asc', nulls: 'first' },
      });
    });

    it('traz quem saiu do nucleo e diz se ha PIN, sem expor o hash', async () => {
      prisma.user.findMany.mockResolvedValue([
        filho({ pinHash: 'hash-secreto' }),
        filho({ id: 'outro', name: 'Ana', deactivatedAt: new Date('2026-09-01T12:00:00.000Z') }),
      ]);

      const lista = await service.listar(ator);

      expect(lista[0]).toMatchObject({ hasPin: true, deactivatedAt: null });
      expect(JSON.stringify(lista)).not.toContain('hash-secreto');
      expect(lista[1].deactivatedAt).toBe('2026-09-01T12:00:00.000Z');
    });
  });
});
