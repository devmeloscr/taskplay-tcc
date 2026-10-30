export const FAIXAS_DE_ATRASO = [
  { id: 'no_prazo', maxMinutosAtraso: 0, fator: 1, rotulo: 'No prazo' },
  { id: 'ate_24h', maxMinutosAtraso: 24 * 60, fator: 0.75, rotulo: 'Até 24h de atraso' },
  { id: 'ate_72h', maxMinutosAtraso: 72 * 60, fator: 0.5, rotulo: 'Até 72h de atraso' },
  { id: 'acima_de_72h', maxMinutosAtraso: null, fator: 0.25, rotulo: 'Mais de 72h de atraso' },
] as const;

export type FaixaDeAtraso = (typeof FAIXAS_DE_ATRASO)[number]['id'];

export function rotuloDaFaixa(faixa: FaixaDeAtraso): string {
  return FAIXAS_DE_ATRASO.find((f) => f.id === faixa)?.rotulo ?? faixa;
}

export interface ResultadoDaConclusao {
  /** Pontos efetivamente creditados. */
  pontos: number;
  /** Pontos que a tarefa valeria se entregue no prazo. */
  pontosCheios: number;
  faixa: FaixaDeAtraso;
  onTime: boolean;
  /** Zero quando no prazo; positivo quando houve atraso. */
  minutosDeAtraso: number;
}

/** Minutos inteiros de atraso; zero quando entregue no prazo. */
export function minutosDeAtraso(dueAt: Date, completedAt: Date): number {
  const diff = completedAt.getTime() - dueAt.getTime();
  return diff <= 0 ? 0 : Math.floor(diff / 60_000);
}

export function pontosPorConclusao(
  pontosCheios: number,
  dueAt: Date,
  completedAt: Date,
): ResultadoDaConclusao {
  const atraso = minutosDeAtraso(dueAt, completedAt);
  const faixa =
    FAIXAS_DE_ATRASO.find((f) => f.maxMinutosAtraso !== null && atraso <= f.maxMinutosAtraso) ??
    FAIXAS_DE_ATRASO[FAIXAS_DE_ATRASO.length - 1];

  const bruto = Math.round(pontosCheios * faixa.fator);
  const pontos = pontosCheios > 0 ? Math.max(1, bruto) : 0;

  return {
    pontos,
    pontosCheios,
    faixa: faixa.id,
    onTime: atraso === 0,
    minutosDeAtraso: atraso,
  };
}

export function pontosSeConcluirAgora(
  pontosCheios: number,
  dueAt: Date,
  agora: Date = new Date(),
): ResultadoDaConclusao {
  return pontosPorConclusao(pontosCheios, dueAt, agora);
}

export function fimDaFaixaAtual(dueAt: Date, agora: Date = new Date()): Date | null {
  const atraso = minutosDeAtraso(dueAt, agora);
  const faixa = FAIXAS_DE_ATRASO.find(
    (f) => f.maxMinutosAtraso !== null && atraso <= f.maxMinutosAtraso,
  );
  const limite = faixa?.maxMinutosAtraso;
  return limite === undefined || limite === null
    ? null
    : new Date(dueAt.getTime() + limite * 60_000);
}

export const FATOR_DE_PENALIDADE_POR_VENCIMENTO = 0.5;

export interface ResultadoDaPenalidade {
  /** Valor efetivamente debitado, sempre positivo ou zero. */
  debito: number;
  /** Valor que seria debitado se houvesse saldo suficiente. */
  debitoPretendido: number;
  /** Verdadeiro quando o saldo insuficiente reduziu o debito. */
  limitadoPeloSaldo: boolean;
}

export function penalidadePorVencimento(
  pontosDaTarefa: number,
  saldoAtual: number,
): ResultadoDaPenalidade {
  const pretendido = Math.max(0, Math.round(pontosDaTarefa * FATOR_DE_PENALIDADE_POR_VENCIMENTO));
  const debito = Math.min(pretendido, Math.max(0, saldoAtual));

  return {
    debito,
    debitoPretendido: pretendido,
    limitadoPeloSaldo: debito < pretendido,
  };
}
