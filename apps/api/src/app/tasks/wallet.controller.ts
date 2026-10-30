import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PrismaService, TransactionReason, UserRole } from '@taskplay/api-database';
import { adjustBalanceRequest } from '@taskplay/shared-types';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { Actor } from '../auth/auth.types';
import { parseBody } from '../auth/zod-validation';
import { TelemetryService } from '../telemetry/telemetry.service';
import { WalletService } from './wallet.service';

/** Carteira de pontos (RF06). */
@Controller('wallet')
export class WalletController {
  constructor(
    private readonly wallet: WalletService,
    private readonly prisma: PrismaService,
    private readonly telemetry: TelemetryService,
  ) {}

  /** Extrato do proprio ator. */
  @Get()
  meuExtrato(@CurrentUser() actor: Actor) {
    return this.wallet.extrato(actor.userId);
  }

  @Get('members/:id')
  @Roles(UserRole.PARENT)
  async extratoDeMembro(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.exigirMembroDaFamilia(actor, id);
    return this.wallet.extrato(id);
  }

  @Post('adjustments')
  @Roles(UserRole.PARENT)
  async ajustar(@CurrentUser() actor: Actor, @Body() body: unknown) {
    const input = parseBody(adjustBalanceRequest, body, 'Ajuste inválido');
    await this.exigirMembroDaFamilia(actor, input.userId);

    const lancamento = await this.prisma.$transaction((tx) =>
      this.wallet.aplicar(tx, {
        userId: input.userId,
        delta: input.delta,
        reason: TransactionReason.MANUAL_ADJUSTMENT,
        note: input.note,
      }),
    );

    this.telemetry.record(
      [
        {
          type: 'points.changed',
          occurredAt: new Date().toISOString(),
          delta: lancamento.delta,
          balanceAfter: lancamento.balanceAfter,
          reason: 'manual_adjustment',
        },
      ],
      { userId: input.userId, familyId: actor.familyId },
    );

    return lancamento;
  }

  private async exigirMembroDaFamilia(actor: Actor, userId: string) {
    const membro = await this.prisma.user.findFirst({
      where: { id: userId, familyId: actor.familyId },
    });
    if (!membro) throw new ForbiddenException('Membro não encontrado nesta família');
    return membro;
  }
}
