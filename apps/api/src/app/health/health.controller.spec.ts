import type { PrismaService } from '@taskplay/api-database';
import type { Response } from 'express';
import { HealthController } from './health.controller';

function respostaFalsa() {
  const res = { status: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('HealthController', () => {
  it('responde ok sem mexer no status quando o banco atende', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const res = respostaFalsa();

    const corpo = await new HealthController(prisma as unknown as PrismaService).check(
      res as unknown as Response,
    );

    expect(corpo).toMatchObject({ status: 'ok', database: 'up' });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('responde 503 quando o banco cai', async () => {
    // Um 200 com "database":"down" no corpo passou cinco dias por saudavel:
    // monitor de disponibilidade le o status, nao o JSON.
    const prisma = { $queryRaw: jest.fn().mockRejectedValue(new Error('No space left on device')) };
    const res = respostaFalsa();

    const corpo = await new HealthController(prisma as unknown as PrismaService).check(
      res as unknown as Response,
    );

    expect(corpo).toMatchObject({ status: 'degraded', database: 'down' });
    expect(res.status).toHaveBeenCalledWith(503);
  });
});
