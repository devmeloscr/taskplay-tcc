import { ForbiddenException } from '@nestjs/common';
import { FamilyAuditAction, UserRole } from '@taskplay/api-database';
import { RegistroDaFamiliaService } from './registro-da-familia.service';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3501';
const RESPONSAVEL = '3f2504e0-4f89-41d3-9a0c-0305e82c3502';
const FILHO = '3f2504e0-4f89-41d3-9a0c-0305e82c3503';

const alteracao = {
  action: FamilyAuditAction.MEMBER_RENAMED,
  actor: { id: RESPONSAVEL, name: 'Ana' },
  target: { id: FILHO, name: 'Pedrinho' },
  field: 'name',
  before: 'Pedrinho',
  after: 'Pedro',
};

describe('RegistroDaFamiliaService', () => {
  let prisma: { familyAuditLog: { createMany: jest.Mock; findMany: jest.Mock } };
  let tx: { familyAuditLog: { createMany: jest.Mock } };
  let logger: { info: jest.Mock; setContext: jest.Mock };
  let service: RegistroDaFamiliaService;

  beforeEach(() => {
    process.env['TELEMETRY_PSEUDONYM_SALT'] = 'salt-de-teste';
    prisma = { familyAuditLog: { createMany: jest.fn(), findMany: jest.fn() } };
    tx = { familyAuditLog: { createMany: jest.fn() } };
    logger = { info: jest.fn(), setContext: jest.fn() };
    service = new RegistroDaFamiliaService(prisma as never, logger as never);
  });

  it('grava quem fez, quem foi afetado, o que mudou e de que para o que', async () => {
    await service.registrar(tx as never, FAMILIA, [alteracao]);

    expect(tx.familyAuditLog.createMany.mock.calls[0][0].data[0]).toEqual({
      familyId: FAMILIA,
      action: FamilyAuditAction.MEMBER_RENAMED,
      actorId: RESPONSAVEL,
      actorName: 'Ana',
      targetId: FILHO,
      targetName: 'Pedrinho',
      field: 'name',
      beforeValue: 'Pedrinho',
      afterValue: 'Pedro',
    });
  });

  it('escreve pelo cliente da transacao, e nunca por fora dela', async () => {
    await service.registrar(tx as never, FAMILIA, [alteracao]);

    expect(tx.familyAuditLog.createMany).toHaveBeenCalled();
    expect(prisma.familyAuditLog.createMany).not.toHaveBeenCalled();
  });

  // O log sai do servidor e vai para uma ferramenta externa. Nome de crianca,
  // nome de responsavel e data de nascimento nao sobem para la.
  it('não leva nome nem valor para o log estruturado', async () => {
    await service.registrar(tx as never, FAMILIA, [alteracao]);

    const registrado = JSON.stringify(logger.info.mock.calls[0][0]);
    expect(registrado).not.toContain('Ana');
    expect(registrado).not.toContain('Pedrinho');
    expect(registrado).not.toContain('Pedro');
    expect(logger.info.mock.calls[0][0]).toMatchObject({
      evento: 'familia.administrada',
      acao: FamilyAuditAction.MEMBER_RENAMED,
      campo: 'name',
    });
  });

  it('pseudonimiza os identificadores que sobem ao log', async () => {
    await service.registrar(tx as never, FAMILIA, [alteracao]);

    const { ator, alvo } = logger.info.mock.calls[0][0];
    expect(ator).not.toBe(RESPONSAVEL);
    expect(alvo).not.toBe(FILHO);
    expect(ator).toMatch(/^[0-9a-f]{32}$/);
  });

  it('nao escreve nada quando a operacao nao alterou campo nenhum', async () => {
    await service.registrar(tx as never, FAMILIA, []);

    expect(tx.familyAuditLog.createMany).not.toHaveBeenCalled();
    expect(logger.info).not.toHaveBeenCalled();
  });

  describe('leitura', () => {
    it('recusa o historico a um filho', async () => {
      await expect(
        service.listar({
          userId: FILHO,
          familyId: FAMILIA,
          role: UserRole.CHILD,
          scope: 'full',
          deviceId: 'd',
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.familyAuditLog.findMany).not.toHaveBeenCalled();
    });

    it('devolve a familia do token, do mais recente ao mais antigo', async () => {
      prisma.familyAuditLog.findMany.mockResolvedValue([
        {
          id: 'linha-1',
          action: FamilyAuditAction.MEMBER_DEACTIVATED,
          actorId: RESPONSAVEL,
          actorName: 'Ana',
          targetId: FILHO,
          targetName: 'Pedro',
          field: null,
          beforeValue: null,
          afterValue: null,
          createdAt: new Date('2026-09-12T10:00:00.000Z'),
        },
      ]);

      const historico = await service.listar({
        userId: RESPONSAVEL,
        familyId: FAMILIA,
        role: UserRole.PARENT,
        scope: 'full',
        deviceId: 'd',
      });

      expect(prisma.familyAuditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { familyId: FAMILIA },
          orderBy: { createdAt: 'desc' },
        }),
      );
      expect(historico[0].createdAt).toBe('2026-09-12T10:00:00.000Z');
    });
  });
});
