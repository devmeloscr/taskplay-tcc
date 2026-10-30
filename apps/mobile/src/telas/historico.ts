import type { EntradaDoHistorico } from '../api/cliente';

/** Uma entrada como a tela a desenha: duas linhas de texto e o momento. */
export interface LinhaDoHistorico {
  /** Quem fez o que, com quem. Sempre presente. */
  titulo: string;
  /** "De X para Y". Ausente nas acoes que nao alteram um campo. */
  mudanca: string | null;
  quando: string;
}

/** O que se escreve no lugar de um valor que nao existe. */
const EM_BRANCO = 'em branco';

const VERBOS: Record<EntradaDoHistorico['action'], (alvo: string) => string> = {
  MEMBER_CREATED: (alvo) => `cadastrou ${alvo}`,
  MEMBER_RENAMED: (alvo) => `mudou o nome de ${alvo}`,
  MEMBER_BIRTH_DATE_CHANGED: (alvo) => `alterou a data de nascimento de ${alvo}`,
  MEMBER_PIN_SET: (alvo) => `criou um PIN para ${alvo}`,
  MEMBER_PIN_CHANGED: (alvo) => `trocou o PIN de ${alvo}`,
  MEMBER_PIN_REMOVED: (alvo) => `tirou o PIN de ${alvo}`,
  MEMBER_DEACTIVATED: (alvo) => `removeu ${alvo} da família`,
  MEMBER_REACTIVATED: (alvo) => `devolveu ${alvo} à família`,
};

export function linhaDoHistorico(entrada: EntradaDoHistorico): LinhaDoHistorico {
  return {
    titulo: `${entrada.actorName} ${VERBOS[entrada.action](entrada.targetName)}`,
    mudanca: mudanca(entrada),
    quando: momentoExato(entrada.createdAt),
  };
}

function mudanca(entrada: EntradaDoHistorico): string | null {
  if (entrada.field === null || entrada.field === 'pin') return null;
  if (entrada.action === 'MEMBER_CREATED') return null;

  const antes = valorEmPalavras(entrada.field, entrada.beforeValue);
  const depois = valorEmPalavras(entrada.field, entrada.afterValue);
  return `De ${antes} para ${depois}`;
}

function valorEmPalavras(campo: string, valor: string | null): string {
  if (valor === null) return EM_BRANCO;
  if (campo !== 'birthDate') return valor;

  const partes = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : valor;
}

export function momentoExato(iso: string): string {
  const data = new Date(iso);
  const doisDigitos = (valor: number) => String(valor).padStart(2, '0');
  const hora = `${data.getHours()}h${doisDigitos(data.getMinutes())}`;
  return `${doisDigitos(data.getDate())}/${doisDigitos(data.getMonth() + 1)}/${data.getFullYear()} às ${hora}`;
}
