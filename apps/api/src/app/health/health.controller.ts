import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { PrismaService } from '@taskplay/api-database';
import type { Response } from 'express';
import { Public } from '../auth/auth.decorators';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  // Aberta: um endpoint de saude que exige token nao serve para monitoramento,
  // que precisa justamente detectar quando a autenticacao parou de funcionar.
  @Get()
  @Public()
  async check(@Res({ passthrough: true }) res: Response) {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    // passthrough mantem o retorno como corpo; so o status muda. O corpo segue
    // igual nos dois casos, para quem diagnostica ver o que caiu.
    if (database === 'down') res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
