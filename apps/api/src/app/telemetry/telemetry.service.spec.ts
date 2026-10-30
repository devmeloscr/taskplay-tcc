import { UserRole } from '@taskplay/api-database';
import { pseudonymize } from '@taskplay/api-observability';
import type { Actor } from '../auth/auth.types';
import { TelemetryService } from './telemetry.service';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const FILHO_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const FILHO_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';

function ator(userId: string): Actor {
  return {
    userId,
    familyId: FAMILIA,
    role: UserRole.CHILD,
    scope: 'telemetry',
    deviceId: 'aparelho-1',
  };
}

describe('TelemetryService', () => {
  let logger: { info: jest.Mock; setContext: jest.Mock };
  let service: TelemetryService;

  beforeEach(() => {
    process.env['TELEMETRY_PSEUDONYM_SALT'] = 'salt-de-teste';
    logger = { info: jest.fn(), setContext: jest.fn() };
    service = new TelemetryService(logger as never);
  });

  const evento = {
    type: 'app.opened' as const,
    occurredAt: '2026-08-24T12:00:00.000Z',
  };

  it('atribui o evento ao ator do token', () => {
    service.record([evento], ator(FILHO_A));

    const [registro] = logger.info.mock.calls[0];
    expect(registro.actor).toBe(pseudonymize(FILHO_A));
    expect(registro.familyId).toBe(FAMILIA);
  });

  it('ignora identidade forjada no corpo do evento', () => {
    const forjado = { ...evento, actorId: FILHO_B, familyId: 'familia-alheia' } as never;
    service.record([forjado], ator(FILHO_A));

    const [registro] = logger.info.mock.calls[0];
    expect(registro.actor).toBe(pseudonymize(FILHO_A));
    expect(registro.actor).not.toBe(pseudonymize(FILHO_B));
    expect(registro.familyId).toBe(FAMILIA);
  });

  it('nunca registra o identificador real', () => {
    service.record([evento], ator(FILHO_A));
    const [registro] = logger.info.mock.calls[0];
    expect(JSON.stringify(registro)).not.toContain(FILHO_A);
  });

  it('registra o momento da recepcao junto do momento de ocorrencia', () => {
    service.record([evento], ator(FILHO_A));
    const [registro] = logger.info.mock.calls[0];
    expect(registro.occurredAt).toBe(evento.occurredAt);
    expect(Date.parse(registro.receivedAt)).not.toBeNaN();
  });

  it('mantem o pseudonimo estavel entre lotes do mesmo ator', () => {
    // A analise precisa distinguir "a mesma crianca voltou dez vezes" de "dez
    // criancas diferentes".
    service.record([evento], ator(FILHO_A));
    service.record([evento], ator(FILHO_A));
    expect(logger.info.mock.calls[0][0].actor).toBe(logger.info.mock.calls[1][0].actor);
  });
});
