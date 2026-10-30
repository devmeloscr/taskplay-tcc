import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { PrismaService } from '@taskplay/api-database';
import { registerPushTokenRequest } from '@taskplay/shared-types';
import { CurrentUser } from '../auth/auth.decorators';
import type { Actor } from '../auth/auth.types';
import { parseBody } from '../auth/zod-validation';
import { NotificationsService } from './notifications.service';

/** Notificacoes (RF10). */
@Controller('notifications')
export class NotificationsController {
  constructor(
    private readonly notifications: NotificationsService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  listar(@CurrentUser() actor: Actor, @Query('naoLidas') naoLidas?: string) {
    return this.notifications.listar(actor, naoLidas === 'true');
  }

  @Post(':id/read')
  @HttpCode(204)
  async marcarLida(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.notifications.marcarLida(actor, id);
  }

  @Post('read-all')
  @HttpCode(200)
  marcarTodasLidas(@CurrentUser() actor: Actor) {
    return this.notifications.marcarTodasLidas(actor);
  }

  @Put('push-token')
  @HttpCode(204)
  async registrarToken(@CurrentUser() actor: Actor, @Body() body: unknown) {
    const { pushToken } = parseBody(registerPushTokenRequest, body, 'Token inválido');
    await this.prisma.device.update({
      where: { id: actor.deviceId },
      data: { pushToken, pushTokenUpdatedAt: new Date() },
    });
  }

  @Delete('push-token')
  @HttpCode(204)
  async removerToken(@CurrentUser() actor: Actor) {
    await this.prisma.device.update({
      where: { id: actor.deviceId },
      data: { pushToken: null, pushTokenUpdatedAt: null },
    });
  }
}
