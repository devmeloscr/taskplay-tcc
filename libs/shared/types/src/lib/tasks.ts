import { z } from 'zod';
import type { FaixaDeAtraso } from '@taskplay/shared-util-gamification';
import './idioma';

/** Criacao de tarefa pelo responsavel (RF02). */
export const createTaskRequest = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  assigneeId: z.uuid(),
  points: z.number().int().min(0).max(1000),
  dueAt: z.iso.datetime(),
  verification: z.enum(['MANUAL', 'IMAGE']).default('MANUAL'),
  /** Preenchido quando a tarefa nasce como compensacao de outra vencida. */
  compensationForId: z.uuid().optional(),
});

export const updateTaskRequest = z.object({
  title: z.string().min(1).max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  assigneeId: z.uuid().optional(),
  points: z.number().int().min(0).max(1000).optional(),
  dueAt: z.iso.datetime().optional(),
  /** Sem `default`, ao contrario da criacao: aqui a ausencia mantem o que ha. */
  verification: z.enum(['MANUAL', 'IMAGE']).optional(),
});

export const submitTaskRequest = z.object({
  note: z.string().max(500).optional(),
});

/** Verificacao manual pelo responsavel (RF04). */
export const reviewTaskRequest = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().max(500).optional(),
});

/** Item do catalogo de recompensas da familia (RF07). */
export const createStoreItemRequest = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  costPoints: z.number().int().min(0).max(100000),
  /** Nulo significa estoque ilimitado. */
  stock: z.number().int().min(0).optional(),
});

export const useTransferLetterRequest = z.object({
  purchaseId: z.uuid(),
  taskId: z.uuid(),
  toUserId: z.uuid(),
});

/** Ajuste manual de saldo pelo responsavel. */
export const adjustBalanceRequest = z.object({
  userId: z.uuid(),
  delta: z.number().int().refine((v) => v !== 0, 'O ajuste não pode ser zero'),
  note: z.string().min(1).max(255),
});

export const registerPushTokenRequest = z.object({
  pushToken: z
    .string()
    .regex(/^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/, 'Token do Expo em formato inválido'),
});

export type RegisterPushTokenRequest = z.infer<typeof registerPushTokenRequest>;
export type CreateTaskRequest = z.infer<typeof createTaskRequest>;
export type UpdateTaskRequest = z.infer<typeof updateTaskRequest>;
export type SubmitTaskRequest = z.infer<typeof submitTaskRequest>;
export type ReviewTaskRequest = z.infer<typeof reviewTaskRequest>;
export type CreateStoreItemRequest = z.infer<typeof createStoreItemRequest>;
export type UseTransferLetterRequest = z.infer<typeof useTransferLetterRequest>;
export type AdjustBalanceRequest = z.infer<typeof adjustBalanceRequest>;

/** Quanto a entrega ja feita vale. Presente em `SUBMITTED` e `APPROVED`. */
export interface DeliveredPoints {
  /** Creditado, ou a creditar na aprovacao. A faixa foi decidida na entrega. */
  points: number;
  /** Valor de face da tarefa, para a tela poder mostrar "15 de 20". */
  fullPoints: number;
  band: FaixaDeAtraso;
  /** A faixa em palavras; o identificador nao vai para a tela. */
  bandLabel: string;
  /** Verdadeiro so depois da aprovacao: antes disso o valor e previsao. */
  credited: boolean;
}

/** Quanto renderia se fosse entregue agora. Presente nos estados entregaveis. */
export interface PointsIfCompletedNow {
  points: number;
  fullPoints: number;
  band: FaixaDeAtraso;
  bandLabel: string;
  validUntil: string | null;
}

export interface TaskScoring {
  delivered: DeliveredPoints | null;
  ifCompletedNow: PointsIfCompletedNow | null;
}
