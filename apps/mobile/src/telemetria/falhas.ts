import type { TelemetryEvent } from '@taskplay/shared-telemetry';
import { ErroDaApi, ErroDeTransporte } from '../api/cliente';

export function rotaGenerica(caminho: string): string {
  return caminho
    .split('?')[0]
    .split('/')
    .map((parte) => (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(parte) ? ':id' : parte))
    .join('/')
    .slice(0, 120);
}

export function eventoDeFalha(erro: unknown, agora = new Date()): TelemetryEvent | null {
  const occurredAt = agora.toISOString();

  if (erro instanceof ErroDaApi) {
    if (erro.status === 401) return null;
    return semUndefined({
      type: 'app.failed',
      occurredAt,
      origin: 'api',
      status: erro.status,
      route: erro.detalhe?.caminho ? rotaGenerica(erro.detalhe.caminho) : undefined,
      method: metodo(erro.detalhe?.metodo),
      withFile: erro.detalhe?.comArquivo,
      requestId: erro.detalhe?.requestId,
    });
  }

  if (erro instanceof ErroDeTransporte) {
    return semUndefined({
      type: 'app.failed',
      occurredAt,
      origin: 'transporte',
      route: rotaGenerica(erro.contexto.caminho),
      method: metodo(erro.contexto.metodo),
      withFile: erro.contexto.comArquivo,
      requestId: erro.contexto.requestId,
    });
  }

  return { type: 'app.failed', occurredAt, origin: 'aplicativo' };
}

const METODOS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

function metodo(valor: string | undefined): (typeof METODOS)[number] | undefined {
  return METODOS.find((m) => m === valor);
}

function semUndefined(evento: Record<string, unknown>): TelemetryEvent {
  return Object.fromEntries(
    Object.entries(evento).filter(([, valor]) => valor !== undefined),
  ) as TelemetryEvent;
}
