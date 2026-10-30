import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { telemetryBatch } from '@taskplay/shared-telemetry';
import { AllowTelemetryScope, CurrentUser } from '../auth/auth.decorators';
import type { Actor } from '../auth/auth.types';
import { parseBody } from '../auth/zod-validation';
import { TelemetryService } from './telemetry.service';

@Controller('telemetry')
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  @Post('events')
  @HttpCode(202)
  @AllowTelemetryScope()
  ingest(@CurrentUser() actor: Actor, @Body() body: unknown) {
    const { events } = parseBody(telemetryBatch, body, 'Lote de telemetria inválido');

    this.telemetry.record(events, actor);
    // 202: o cliente nao precisa esperar o processamento; telemetria jamais
    // deve atrasar a experiencia de uso do aplicativo.
    return { accepted: events.length };
  }
}
