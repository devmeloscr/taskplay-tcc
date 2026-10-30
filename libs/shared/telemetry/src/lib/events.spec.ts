import { telemetryBatch, telemetryEvent, type TelemetryEvent } from './events';

const base = { occurredAt: '2026-08-19T12:00:00.000Z' };
const umUuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('catalogo de eventos de telemetria', () => {
  it('aceita um evento valido de conclusao de tarefa', () => {
    const evento = {
      ...base,
      type: 'task.completed',
      taskId: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
      onTime: true,
      minutesLate: 0,
      pointsAwarded: 10,
    };
    expect(telemetryEvent.parse(evento)).toEqual(evento);
  });

  it('rejeita evento sem os campos exigidos pela metrica', () => {
    const incompleto = { ...base, type: 'task.completed', taskId: umUuid, pointsAwarded: 10 };
    expect(telemetryEvent.safeParse(incompleto).success).toBe(false);
  });

  it('descarta identidade declarada pelo cliente', () => {
    const forjado = {
      ...base,
      type: 'app.opened',
      actorId: 'outra-crianca',
      familyId: umUuid,
    };
    const evento = telemetryEvent.parse(forjado);
    expect(evento).not.toHaveProperty('actorId');
    expect(evento).not.toHaveProperty('familyId');
  });

  it('rejeita atraso negativo', () => {
    const invalido = {
      ...base,
      type: 'task.completed',
      taskId: umUuid,
      onTime: false,
      minutesLate: -5,
      pointsAwarded: 0,
    };
    expect(telemetryEvent.safeParse(invalido).success).toBe(false);
  });

  it('rejeita tipo de evento desconhecido', () => {
    expect(telemetryEvent.safeParse({ ...base, type: 'evento.inventado' }).success).toBe(false);
  });

  it('limita a confianca da IA ao intervalo de 0 a 1', () => {
    const forcado = {
      ...base,
      type: 'task.verification.image',
      taskId: umUuid,
      result: 'approved',
      confidence: 1.4,
      requiredManualReview: false,
    };
    expect(telemetryEvent.safeParse(forcado).success).toBe(false);
  });

  it('permite delta negativo em points.changed (penalidade por atraso)', () => {
    const penalidade: TelemetryEvent = {
      ...base,
      type: 'points.changed',
      delta: -5,
      balanceAfter: 20,
      reason: 'late_penalty',
    };
    expect(telemetryEvent.safeParse(penalidade).success).toBe(true);
  });

  it('recusa lote vazio e lote acima do limite', () => {
    expect(telemetryBatch.safeParse({ events: [] }).success).toBe(false);
    const umEvento = { ...base, type: 'app.opened' };
    expect(telemetryBatch.safeParse({ events: Array(101).fill(umEvento) }).success).toBe(false);
    expect(telemetryBatch.safeParse({ events: [umEvento] }).success).toBe(true);
  });
});
