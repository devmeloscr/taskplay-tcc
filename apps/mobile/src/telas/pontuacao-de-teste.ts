import {
  pontosPorConclusao,
  pontosSeConcluirAgora,
  rotuloDaFaixa,
} from '@taskplay/shared-util-gamification';
import type { TaskScoring } from '@taskplay/shared-types';
import type { StatusDaTarefa } from '../api/cliente';

export function pontuacaoComoNoServidor(tarefa: {
  points: number;
  dueAt: string;
  status: StatusDaTarefa;
  completedAt: string | null;
}): TaskScoring {
  if (tarefa.status === 'PENDING' || tarefa.status === 'REJECTED' || tarefa.status === 'EXPIRED') {
    const previsao = pontosSeConcluirAgora(tarefa.points, new Date(tarefa.dueAt));
    return {
      delivered: null,
      ifCompletedNow: {
        points: previsao.pontos,
        fullPoints: previsao.pontosCheios,
        band: previsao.faixa,
        bandLabel: rotuloDaFaixa(previsao.faixa),
        validUntil: null,
      },
    };
  }

  if ((tarefa.status === 'SUBMITTED' || tarefa.status === 'APPROVED') && tarefa.completedAt) {
    const entrega = pontosPorConclusao(
      tarefa.points,
      new Date(tarefa.dueAt),
      new Date(tarefa.completedAt),
    );
    return {
      delivered: {
        points: entrega.pontos,
        fullPoints: entrega.pontosCheios,
        band: entrega.faixa,
        bandLabel: rotuloDaFaixa(entrega.faixa),
        credited: tarefa.status === 'APPROVED',
      },
      ifCompletedNow: null,
    };
  }

  return { delivered: null, ifCompletedNow: null };
}
