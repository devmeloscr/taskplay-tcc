import type { TelemetryEvent } from '@taskplay/shared-telemetry';
import type { Deposito } from '../api/deposito';
import {
  enfileirar,
  esquecerFila,
  lerFila,
  removerEnviados,
  TETO_POR_PERFIL,
} from './fila';

function depositoDeMemoria(): Deposito & { dados: Map<string, string> } {
  const dados = new Map<string, string>();
  return {
    dados,
    ler: async (chave) => dados.get(chave) ?? null,
    gravar: async (chave, valor) => void dados.set(chave, valor),
    apagar: async (chave) => void dados.delete(chave),
  };
}

const abertura = (quando: string): TelemetryEvent => ({
  type: 'app.opened',
  occurredAt: quando,
});

describe('fila de telemetria por perfil', () => {
  it('mantem as filas de dois perfis separadas', async () => {
    const onde = depositoDeMemoria();
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    await enfileirar('julia', abertura('2026-08-31T19:05:00.000Z'), onde);
    await enfileirar('pedro', abertura('2026-08-31T20:00:00.000Z'), onde);

    expect(await lerFila('pedro', onde)).toHaveLength(2);
    expect(await lerFila('julia', onde)).toHaveLength(1);
  });

  it('nao guarda quem originou o evento: isso vem do token', async () => {
    // O catalogo compartilhado nao tem campo para o ator, e a fila nao pode
    // inventar um. O id do perfil e a CHAVE do deposito, nunca conteudo.
    const onde = depositoDeMemoria();
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);

    const guardado = [...onde.dados.values()][0];
    expect(JSON.parse(guardado)[0].evento).toEqual({
      type: 'app.opened',
      occurredAt: '2026-08-31T19:00:00.000Z',
    });
  });

  it('descarta o evento mais antigo ao chegar ao teto', async () => {
    // Recusar o novo congelaria a fila no primeiro dia de silencio, e o aparelho
    // pararia de registrar justamente o periodo recente.
    const onde = depositoDeMemoria();
    for (let i = 0; i < TETO_POR_PERFIL + 3; i += 1) {
      await enfileirar('pedro', abertura(new Date(Date.UTC(2026, 7, 31, 0, i)).toISOString()), onde);
    }

    const fila = await lerFila('pedro', onde);
    expect(fila).toHaveLength(TETO_POR_PERFIL);
    expect(fila[0].evento.occurredAt).toBe('2026-08-31T00:03:00.000Z');
  });

  it('remove por id, preservando o que chegou durante o envio', async () => {
    // O caso que o id existe para cobrir: entre ler a fila e confirmar o envio,
    // a tela enfileirou outro evento. Remover "os N primeiros" o apagaria junto.
    const onde = depositoDeMemoria();
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    const emVoo = await lerFila('pedro', onde);

    await enfileirar('pedro', abertura('2026-08-31T19:01:00.000Z'), onde);
    await removerEnviados('pedro', emVoo, onde);

    const restante = await lerFila('pedro', onde);
    expect(restante).toHaveLength(1);
    expect(restante[0].evento.occurredAt).toBe('2026-08-31T19:01:00.000Z');
  });

  it('nao lanca quando o deposito falha', async () => {
    // Telemetria jamais pode interromper o uso que ela mede: travar aqui
    // trocaria a perda de alguns eventos pela perda da familia inteira.
    const quebrado: Deposito = {
      ler: async () => {
        throw new Error('disco cheio');
      },
      gravar: async () => {
        throw new Error('disco cheio');
      },
      apagar: async () => undefined,
    };
    await expect(enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), quebrado)).resolves.toBeUndefined();
  });

  it('sobrevive a um arquivo corrompido comecando do zero', async () => {
    const onde = depositoDeMemoria();
    onde.dados.set('taskplay.telemetria.pedro', 'isto nao e json');

    expect(await lerFila('pedro', onde)).toEqual([]);
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    expect(await lerFila('pedro', onde)).toHaveLength(1);
  });

  it('esquece a fila de um perfil sem tocar na dos outros', async () => {
    const onde = depositoDeMemoria();
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    await enfileirar('julia', abertura('2026-08-31T19:00:00.000Z'), onde);

    await esquecerFila('pedro', onde);

    expect(await lerFila('pedro', onde)).toEqual([]);
    expect(await lerFila('julia', onde)).toHaveLength(1);
  });
});
