import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UserRole } from '@taskplay/api-database';
import { ConsentimentoService } from './consentimento.service';
import type { Actor } from './auth.types';
import { hashSecret } from './crypto';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const PAI = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

const ator: Actor = {
  userId: PAI,
  familyId: FAMILIA,
  role: UserRole.PARENT,
  scope: 'full',
  deviceId: 'aparelho-1',
};

describe('ConsentimentoService', () => {
  let prisma: {
    user: { findFirst: jest.Mock; count: jest.Mock };
    task: { count: jest.Mock };
    family: { delete: jest.Mock };
  };
  let storage: { apagarFamilia: jest.Mock };
  let logger: { warn: jest.Mock; setContext: jest.Mock };
  let service: ConsentimentoService;
  let senhaHash: string;
  let pinHash: string;

  beforeAll(async () => {
    process.env['TELEMETRY_PSEUDONYM_SALT'] = 'salt-de-teste';
    [senhaHash, pinHash] = await Promise.all([hashSecret('senha-forte-1'), hashSecret('4821')]);
  });

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: PAI, familyId: FAMILIA, passwordHash: senhaHash, pinHash }),
        count: jest.fn().mockResolvedValue(3),
      },
      task: { count: jest.fn().mockResolvedValue(12) },
      family: { delete: jest.fn() },
    };
    storage = { apagarFamilia: jest.fn().mockResolvedValue(4) };
    logger = { warn: jest.fn(), setContext: jest.fn() };
    service = new ConsentimentoService(prisma as never, storage as never, logger as never);
  });

  it('remove as fotos ANTES da familia', async () => {
    const ordem: string[] = [];
    storage.apagarFamilia.mockImplementation(async () => {
      ordem.push('fotos');
      return 4;
    });
    prisma.family.delete.mockImplementation(async () => {
      ordem.push('banco');
    });

    await service.revogar(ator, 'senha-forte-1', '4821');

    expect(ordem).toEqual(['fotos', 'banco']);
  });

  it('nao apaga nada com a senha errada', async () => {
    await expect(service.revogar(ator, 'senha-errada', '4821')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(storage.apagarFamilia).not.toHaveBeenCalled();
    expect(prisma.family.delete).not.toHaveBeenCalled();
  });

  it('preserva a familia se a remocao das fotos falhar', async () => {
    // A operacao pode ser repetida; o inverso deixaria fotos orfas para sempre.
    storage.apagarFamilia.mockRejectedValue(new Error('armazenamento indisponivel'));
    await expect(service.revogar(ator, 'senha-forte-1', '4821')).rejects.toThrow();
    expect(prisma.family.delete).not.toHaveBeenCalled();
  });

  it('nao apaga nada com o PIN errado', async () => {
    // A senha certa nao basta: o PIN prova que quem esta com o aparelho na mao
    // e o dono do perfil, e nao alguem que o pegou ja aberto.
    await expect(service.revogar(ator, 'senha-forte-1', '0000')).rejects.toThrow(
      UnauthorizedException,
    );
    expect(storage.apagarFamilia).not.toHaveBeenCalled();
    expect(prisma.family.delete).not.toHaveBeenCalled();
  });

  it('nao diz qual dos dois segredos falhou', async () => {
    // Dizer "senha certa, PIN errado" faria da tela um oraculo para quem esta
    // testando combinacoes com o aparelho na mao.
    const comSenhaErrada = await service
      .revogar(ator, 'errada', '4821')
      .catch((e) => e.message);
    const comPinErrado = await service
      .revogar(ator, 'senha-forte-1', '0000')
      .catch((e) => e.message);
    expect(comSenhaErrada).toBe(comPinErrado);
  });

  it('recusa quem nao tem senha cadastrada', async () => {
    // Um perfil de filho nao pode revogar o consentimento da familia.
    prisma.user.findFirst.mockResolvedValue({ id: PAI, familyId: FAMILIA, passwordHash: null });
    await expect(service.revogar(ator, 'qualquer', '4821')).rejects.toThrow(ForbiddenException);
  });

  it('recusa responsavel sem PIN cadastrado', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: PAI,
      familyId: FAMILIA,
      passwordHash: senhaHash,
      pinHash: null,
    });
    await expect(service.revogar(ator, 'senha-forte-1', '4821')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('recusa perfil de filho antes de qualquer consulta', async () => {
    // O `@Roles(PARENT)` da rota ja barra, mas a regra e repetida onde a
    // remocao acontece: se a rota for reorganizada um dia, ela continua valendo.
    const filho = { ...ator, role: UserRole.CHILD };
    await expect(service.revogar(filho, 'senha-forte-1', '4821')).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('recusa ator de outra familia', async () => {
    // O findFirst filtra por familyId; nao achar significa que o ator nao
    // pertence a familia que o token declara.
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.revogar(ator, 'senha-forte-1', '4821')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('registra a saida sem registrar quem saiu', async () => {
    await service.revogar(ator, 'senha-forte-1', '4821');

    const [registro] = logger.warn.mock.calls[0];
    expect(registro).toMatchObject({
      consentimento: true,
      evento: 'tcle.revogado',
      membros: 3,
      tarefas: 12,
      fotosRemovidas: 4,
    });
    expect(JSON.stringify(registro)).not.toContain(FAMILIA);
  });

  it('devolve o que foi removido', async () => {
    expect(await service.revogar(ator, 'senha-forte-1', '4821')).toEqual({
      fotosRemovidas: 4,
      membros: 3,
      tarefas: 12,
    });
  });
});
