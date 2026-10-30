import { z } from 'zod';

const baseEvent = z.object({
  occurredAt: z.iso.datetime(),
});

/** Abertura do aplicativo. Base da metrica de frequencia de uso. */
export const appOpenedEvent = baseEvent.extend({
  type: z.literal('app.opened'),
});

/** Conclusao de uma tarefa. Base da taxa de conclusao no prazo x com atraso. */
export const taskCompletedEvent = baseEvent.extend({
  type: z.literal('task.completed'),
  taskId: z.uuid(),
  onTime: z.boolean(),
  /** Zero quando concluida no prazo; positivo quando houve atraso. */
  minutesLate: z.number().int().min(0),
  pointsAwarded: z.number().int(),
  completedByParent: z.literal(true).optional(),
});

export const pointsChangedEvent = baseEvent.extend({
  type: z.literal('points.changed'),
  delta: z.number().int(),
  balanceAfter: z.number().int().min(0),
  reason: z.enum(['task_completed', 'late_penalty', 'store_purchase', 'manual_adjustment']),
});

/** Compra na loja de recompensas. Base da metrica de itens comprados. */
export const storeItemPurchasedEvent = baseEvent.extend({
  type: z.literal('store.item.purchased'),
  itemId: z.string().min(1),
  pointsSpent: z.number().int().min(0),
});

export const taskImageVerificationEvent = baseEvent.extend({
  type: z.literal('task.verification.image'),
  taskId: z.uuid(),
  result: z.enum(['approved', 'rejected', 'inconclusive']),
  confidence: z.number().min(0).max(1),
  /** Se um responsavel precisou revisar manualmente o veredito da IA. */
  requiredManualReview: z.boolean(),
});

export const appFailedEvent = baseEvent.extend({
  type: z.literal('app.failed'),
  origin: z.enum(['api', 'transporte', 'aplicativo']),
  /** Caminho da rota, sem query string: `/tasks/:id/completion`. */
  route: z.string().max(120).optional(),
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
  status: z.number().int().min(100).max(599).optional(),
  /** A requisicao levava arquivo. Separa o envio de foto do resto. */
  withFile: z.boolean().optional(),
  requestId: z.uuid().optional(),
});

export const telemetryEvent = z.discriminatedUnion('type', [
  appOpenedEvent,
  taskCompletedEvent,
  pointsChangedEvent,
  storeItemPurchasedEvent,
  taskImageVerificationEvent,
  appFailedEvent,
]);

/** Lote de eventos: o aplicativo acumula offline e envia de uma vez. */
export const telemetryBatch = z.object({
  events: z.array(telemetryEvent).min(1).max(100),
});

export type TelemetryEvent = z.infer<typeof telemetryEvent>;
export type TelemetryEventType = TelemetryEvent['type'];
export type TelemetryBatch = z.infer<typeof telemetryBatch>;
