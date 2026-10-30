import { TaskStatus } from '@taskplay/api-database';
import type { TaskScoring } from '@taskplay/shared-types';
import {
  fimDaFaixaAtual,
  pontosPorConclusao,
  pontosSeConcluirAgora,
  rotuloDaFaixa,
} from '@taskplay/shared-util-gamification';

export function pontuacaoDaTarefa(
  task: { points: number; dueAt: Date; status: TaskStatus; completedAt: Date | null },
  agora: Date = new Date(),
): TaskScoring {
  const entregavel =
    task.status === TaskStatus.PENDING ||
    task.status === TaskStatus.REJECTED ||
    task.status === TaskStatus.EXPIRED;

  if (entregavel) {
    const previsao = pontosSeConcluirAgora(task.points, task.dueAt, agora);
    const fim = fimDaFaixaAtual(task.dueAt, agora);
    return {
      delivered: null,
      ifCompletedNow: {
        points: previsao.pontos,
        fullPoints: previsao.pontosCheios,
        band: previsao.faixa,
        bandLabel: rotuloDaFaixa(previsao.faixa),
        validUntil: fim ? fim.toISOString() : null,
      },
    };
  }

  const decidida =
    (task.status === TaskStatus.SUBMITTED || task.status === TaskStatus.APPROVED) &&
    task.completedAt !== null;

  if (!decidida || !task.completedAt) return { delivered: null, ifCompletedNow: null };

  const entrega = pontosPorConclusao(task.points, task.dueAt, task.completedAt);
  return {
    delivered: {
      points: entrega.pontos,
      fullPoints: entrega.pontosCheios,
      band: entrega.faixa,
      bandLabel: rotuloDaFaixa(entrega.faixa),
      credited: task.status === TaskStatus.APPROVED,
    },
    ifCompletedNow: null,
  };
}
