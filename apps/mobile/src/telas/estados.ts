import type { StatusDaTarefa } from '../api/cliente';
import { CORES } from './tema';

export interface Estado {
  texto: string;
  cor: string;
}

export const ESTADO_DA_TAREFA: Record<StatusDaTarefa, Estado> = {
  PENDING: { texto: 'A fazer', cor: CORES.primaria },
  SUBMITTED: { texto: 'Esperando conferência', cor: CORES.responsavel },
  APPROVED: { texto: 'Aprovada', cor: CORES.sucesso },
  REJECTED: { texto: 'Refazer', cor: CORES.atencao },
  EXPIRED: { texto: 'Venceu, ainda dá', cor: CORES.atencao },
  CANCELLED: { texto: 'Cancelada', cor: CORES.textoSuave },
};

export const GRUPOS = {
  fazer: ['PENDING', 'REJECTED', 'EXPIRED'],
  conferir: ['SUBMITTED'],
  encerradas: ['APPROVED', 'CANCELLED'],
} as const satisfies Record<string, readonly StatusDaTarefa[]>;

export type Grupo = keyof typeof GRUPOS;

export function grupoDe(status: StatusDaTarefa): Grupo {
  if ((GRUPOS.fazer as readonly StatusDaTarefa[]).includes(status)) return 'fazer';
  if ((GRUPOS.conferir as readonly StatusDaTarefa[]).includes(status)) return 'conferir';
  return 'encerradas';
}

export const ESTADO_DA_COMPRA = {
  PENDING: { texto: 'Aguardando entrega', cor: CORES.atencao },
  FULFILLED: { texto: 'Entregue', cor: CORES.sucesso },
  CANCELLED: { texto: 'Cancelada, pontos devolvidos', cor: CORES.textoSuave },
} as const;
