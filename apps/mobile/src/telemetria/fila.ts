import type { TelemetryEvent } from '@taskplay/shared-telemetry';
import { deposito, type Deposito } from '../api/deposito';

/** Prefixo da chave no deposito. Uma chave por perfil. */
const CHAVE = 'taskplay.telemetria';

export const TETO_POR_PERFIL = 500;

/** Maximo por requisicao. Vem do contrato: `telemetryBatch` aceita ate 100. */
export const LOTE_MAXIMO = 100;

export interface EventoEnfileirado {
  id: string;
  evento: TelemetryEvent;
}

function chaveDe(perfilId: string): string {
  return `${CHAVE}.${perfilId}`;
}

function novoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function lerFila(
  perfilId: string,
  onde: Deposito = deposito,
): Promise<EventoEnfileirado[]> {
  const bruto = await onde.ler(chaveDe(perfilId));
  if (!bruto) return [];
  try {
    const lido = JSON.parse(bruto);
    return Array.isArray(lido) ? (lido as EventoEnfileirado[]) : [];
  } catch {
    return [];
  }
}

export async function enfileirar(
  perfilId: string,
  evento: TelemetryEvent,
  onde: Deposito = deposito,
): Promise<void> {
  try {
    const fila = await lerFila(perfilId, onde);
    fila.push({ id: novoId(), evento });
    const cortada = fila.length > TETO_POR_PERFIL ? fila.slice(-TETO_POR_PERFIL) : fila;
    await onde.gravar(chaveDe(perfilId), JSON.stringify(cortada));
  } catch {
    // Ver acima.
  }
}

/** Remove da fila os eventos que o servidor aceitou, preservando os que chegaram depois. */
export async function removerEnviados(
  perfilId: string,
  enviados: readonly EventoEnfileirado[],
  onde: Deposito = deposito,
): Promise<void> {
  const ids = new Set(enviados.map((e) => e.id));
  const restante = (await lerFila(perfilId, onde)).filter((e) => !ids.has(e.id));
  if (restante.length === 0) {
    await onde.apagar(chaveDe(perfilId));
    return;
  }
  await onde.gravar(chaveDe(perfilId), JSON.stringify(restante));
}

export async function esquecerFila(perfilId: string, onde: Deposito = deposito): Promise<void> {
  await onde.apagar(chaveDe(perfilId));
}
