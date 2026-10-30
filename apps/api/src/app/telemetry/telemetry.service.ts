import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { pseudonymize } from '@taskplay/api-observability';
import type { TelemetryEvent } from '@taskplay/shared-telemetry';

export interface SujeitoDoEvento {
  userId: string;
  familyId: string;
}

@Injectable()
export class TelemetryService {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(TelemetryService.name);
  }

  record(events: readonly TelemetryEvent[], sujeito: SujeitoDoEvento): void {
    const actorPseudonym = pseudonymize(sujeito.userId);
    const receivedAt = new Date().toISOString();

    for (const event of events) {
      this.logger.info(
        {
          ...event,
          // `telemetry: true` marca a linha como dado de pesquisa, permitindo
          // separa-la do log operacional nas consultas do SigNoz.
          telemetry: true,
          actor: actorPseudonym,
          familyId: sujeito.familyId,
          receivedAt,
        },
        `evento de telemetria: ${event.type}`,
      );
    }
  }
}
