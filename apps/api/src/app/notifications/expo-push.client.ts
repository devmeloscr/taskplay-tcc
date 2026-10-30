import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

const ENDPOINT_ENVIO = 'https://exp.host/--/api/v2/push/send';
const ENDPOINT_RECIBOS = 'https://exp.host/--/api/v2/push/getReceipts';

export const LOTE_MAXIMO = 100;

export interface MensagemPush {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: 'default' | 'normal' | 'high';
  channelId?: string;
}

export interface TicketDeEnvio {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface Recibo {
  status: 'ok' | 'error';
  message?: string;
  details?: { error?: string };
}

export const APARELHO_NAO_REGISTRADO = 'DeviceNotRegistered';

@Injectable()
export class ExpoPushClient {
  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(ExpoPushClient.name);
  }

  async enviar(mensagens: readonly MensagemPush[]): Promise<TicketDeEnvio[]> {
    if (mensagens.length === 0) return [];
    if (mensagens.length > LOTE_MAXIMO) {
      throw new Error(`Lote de ${mensagens.length} mensagens excede o máximo de ${LOTE_MAXIMO}`);
    }

    const resposta = await fetch(ENDPOINT_ENVIO, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify(mensagens),
    });

    if (!resposta.ok) {
      throw new Error(`Expo Push respondeu ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { data?: TicketDeEnvio[]; errors?: unknown[] };
    if (corpo.errors?.length) {
      this.logger.error({ errors: corpo.errors }, 'Expo Push devolveu erros de requisição');
    }

    return corpo.data ?? [];
  }

  /** Consulta os recibos, que dizem se a entrega de fato aconteceu. */
  async recibos(ids: readonly string[]): Promise<Record<string, Recibo>> {
    if (ids.length === 0) return {};

    const resposta = await fetch(ENDPOINT_RECIBOS, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ids: [...ids] }),
    });

    if (!resposta.ok) {
      throw new Error(`Expo Push (recibos) respondeu ${resposta.status}`);
    }

    const corpo = (await resposta.json()) as { data?: Record<string, Recibo> };
    return corpo.data ?? {};
  }
}

export const TOKEN_EXPO = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/;
