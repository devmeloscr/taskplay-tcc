import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { UserRole } from '@taskplay/api-database';
import { createStoreItemRequest, useTransferLetterRequest } from '@taskplay/shared-types';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { Actor } from '../auth/auth.types';
import { parseBody } from '../auth/zod-validation';
import { StoreService } from './store.service';

/** Loja de recompensas (RF07) e Carta de Transferência (RF09). */
@Controller('store')
export class StoreController {
  constructor(private readonly store: StoreService) {}

  @Get('items')
  listarItens(@CurrentUser() actor: Actor) {
    return this.store.listarItens(actor);
  }

  @Post('items')
  @Roles(UserRole.PARENT)
  criarItem(@CurrentUser() actor: Actor, @Body() body: unknown) {
    return this.store.criarItem(actor, parseBody(createStoreItemRequest, body, 'Item inválido'));
  }

  @Delete('items/:id')
  @Roles(UserRole.PARENT)
  desativarItem(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.store.desativarItem(actor, id);
  }

  @Get('purchases')
  listarCompras(@CurrentUser() actor: Actor) {
    return this.store.listarCompras(actor);
  }

  @Post('items/:id/purchase')
  comprar(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.store.comprar(actor, id);
  }

  @Post('purchases/:id/fulfillment')
  @Roles(UserRole.PARENT)
  entregar(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.store.entregar(actor, id);
  }

  @Post('purchases/:id/cancellation')
  @Roles(UserRole.PARENT)
  cancelar(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.store.cancelarCompra(actor, id);
  }

  /** O filho usa a carta que comprou, apontando tarefa e destinatario. */
  @Post('transfer-letter')
  usarCarta(@CurrentUser() actor: Actor, @Body() body: unknown) {
    return this.store.usarCartaDeTransferencia(
      actor,
      parseBody(useTransferLetterRequest, body, 'Transferência inválida'),
    );
  }
}
