import {
  FAIXAS_DE_ATRASO,
  rotuloDaFaixa,
  type FaixaDeAtraso,
} from '@taskplay/shared-util-gamification';
import type { TaskScoring } from '@taskplay/shared-types';

const MINUTO = 60_000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

function meiaNoiteDe(data: Date): number {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate()).getTime();
}

/** Diferenca em dias de calendario, e nao em blocos de 24 horas. */
function diasDeCalendario(de: Date, ate: Date): number {
  return Math.round((meiaNoiteDe(ate) - meiaNoiteDe(de)) / DIA);
}

function horaCurta(data: Date): string {
  const minutos = data.getMinutes();
  return minutos === 0
    ? `${data.getHours()}h`
    : `${data.getHours()}h${String(minutos).padStart(2, '0')}`;
}

function dataCurta(data: Date): string {
  return `${String(data.getDate()).padStart(2, '0')}/${String(data.getMonth() + 1).padStart(2, '0')}`;
}

export function prazoEmPalavras(dueAt: string, agora: Date = new Date()): string {
  const prazo = new Date(dueAt);
  const dias = diasDeCalendario(agora, prazo);
  const atrasado = prazo.getTime() < agora.getTime();

  if (dias === 0) return atrasado ? `Venceu hoje às ${horaCurta(prazo)}` : `Hoje às ${horaCurta(prazo)}`;
  if (dias === 1) return `Amanhã às ${horaCurta(prazo)}`;
  if (dias === -1) return `Venceu ontem às ${horaCurta(prazo)}`;
  if (dias > 1 && dias <= 7) return `Em ${dias} dias, ${dataCurta(prazo)} às ${horaCurta(prazo)}`;
  if (dias < -1 && dias >= -7) return `Venceu há ${-dias} dias`;
  return `${atrasado ? 'Venceu em ' : ''}${dataCurta(prazo)}/${prazo.getFullYear()} às ${horaCurta(prazo)}`;
}

/** Data curta de um lancamento do extrato. */
export function momentoEmPalavras(iso: string, agora: Date = new Date()): string {
  const data = new Date(iso);
  const dias = diasDeCalendario(data, agora);
  if (dias === 0) return `Hoje às ${horaCurta(data)}`;
  if (dias === 1) return `Ontem às ${horaCurta(data)}`;
  if (dias <= 7) return `Há ${dias} dias`;
  return `${dataCurta(data)}/${data.getFullYear()}`;
}

export function pontosComSinal(delta: number): string {
  return `${delta > 0 ? '+' : ''}${delta} ${Math.abs(delta) === 1 ? 'ponto' : 'pontos'}`;
}

export function pontos(valor: number): string {
  return `${valor} ${Math.abs(valor) === 1 ? 'ponto' : 'pontos'}`;
}

export interface PontosDaEntrega {
  /** O que a entrega rendeu, ou rendera, depois da faixa de atraso. */
  valor: number;
  /** O que a tarefa anunciava valer quando foi criada. */
  cheios: number;
  /** Verdadeiro quando o atraso ja cortou parte dos pontos. */
  reduzido: boolean;
  /** Nome da faixa aplicada, em palavras. */
  faixa: string;
  /** Aprovada: o corte ja esta no razao. Enviada: acontece se for aprovada. */
  creditado: boolean;
}

export function pontosDaEntrega(tarefa: {
  points: number;
  scoring: TaskScoring;
}): PontosDaEntrega {
  const decidida = tarefa.scoring.delivered;
  if (!decidida) {
    return {
      valor: tarefa.points,
      cheios: tarefa.points,
      reduzido: false,
      faixa: rotuloDaFaixa('no_prazo'),
      creditado: false,
    };
  }

  return {
    valor: decidida.points,
    cheios: decidida.fullPoints,
    reduzido: decidida.points < decidida.fullPoints,
    faixa: decidida.bandLabel,
    creditado: decidida.credited,
  };
}

export const IDADE_MINIMA = 6;
export const IDADE_MAXIMA = 16;

export function notaEmPalavras(nota: string): string {
  const antiga = nota.match(/^Atraso: faixa (\w+)$/);
  if (!antiga) return nota;
  const id = antiga[1] as FaixaDeAtraso;
  return FAIXAS_DE_ATRASO.some((faixa) => faixa.id === id) ? rotuloDaFaixa(id) : nota;
}

export function mascaraDeDataDeNascimento(digitado: string): string {
  const digitos = digitado.replace(/\D/g, '').slice(0, 8);
  return [digitos.slice(0, 2), digitos.slice(2, 4), digitos.slice(4, 8)]
    .filter((parte) => parte.length > 0)
    .join('/');
}

export function dataDeNascimentoParaIso(
  digitado: string,
  hoje: Date = new Date(),
): { iso: string } | { erro: string } {
  const partes = digitado.trim().match(/^(\d{2})\/?(\d{2})\/?(\d{4})$/);
  if (!partes) return { erro: 'Escreva a data assim: 31/12/2016' };

  const [, dia, mes, ano] = partes.map(Number) as unknown as [unknown, number, number, number];
  const data = new Date(ano, mes - 1, dia);
  if (data.getFullYear() !== ano || data.getMonth() !== mes - 1 || data.getDate() !== dia) {
    return { erro: 'Essa data não existe no calendário' };
  }

  const idade = idadeEm(data, hoje);
  if (idade < IDADE_MINIMA || idade > IDADE_MAXIMA) {
    return { erro: `O estudo acompanha de ${IDADE_MINIMA} a ${IDADE_MAXIMA} anos` };
  }

  return { iso: `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}` };
}

/** Idade em anos completos. O aniversario de hoje ja conta. */
export function idadeEm(nascimento: Date, hoje: Date): number {
  let idade = hoje.getFullYear() - nascimento.getFullYear();
  const aniversario = new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate());
  if (hoje < aniversario) idade -= 1;
  return idade;
}
