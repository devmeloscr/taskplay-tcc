import { api } from '../api/cliente';
import { todosOsPerfisComToken, tokenDoPerfil } from '../api/armazenamento';
import { deposito, type Deposito } from '../api/deposito';
import { lerFila, LOTE_MAXIMO, removerEnviados } from './fila';

let emAndamento: Promise<void> | null = null;

export interface ResultadoDoEnvio {
  perfis: number;
  eventos: number;
}

async function enviarDeUmPerfil(perfilId: string, onde: Deposito): Promise<number> {
  const fila = await lerFila(perfilId, onde);
  if (fila.length === 0) return 0;

  const refreshToken = await tokenDoPerfil(perfilId);
  if (!refreshToken) return 0;

  const lote = fila.slice(0, LOTE_MAXIMO);
  const { accessToken } = await api.selecionarPerfil({
    refreshToken,
    userId: perfilId,
    scope: 'telemetry',
  });

  await api.enviarTelemetria(
    accessToken,
    lote.map((e) => e.evento),
  );

  await removerEnviados(perfilId, lote, onde);
  return lote.length;
}

export async function esvaziarFilas(onde: Deposito = deposito): Promise<ResultadoDoEnvio> {
  if (emAndamento) {
    await emAndamento;
    return { perfis: 0, eventos: 0 };
  }

  const resultado: ResultadoDoEnvio = { perfis: 0, eventos: 0 };

  const passagem = (async () => {
    const perfis = await todosOsPerfisComToken();
    for (const perfilId of perfis) {
      try {
        const enviados = await enviarDeUmPerfil(perfilId, onde);
        if (enviados > 0) {
          resultado.perfis += 1;
          resultado.eventos += enviados;
        }
      } catch {
        // Uma fila que falha nao impede as outras: a sessao de um perfil pode
        // ter sido revogada no servidor enquanto as demais continuam validas.
      }
    }
  })();

  emAndamento = passagem;
  try {
    await passagem;
  } finally {
    emAndamento = null;
  }

  return resultado;
}

/** Zera a trava. Existe para os testes, que compartilham o modulo entre casos. */
export function esquecerPassagemEmAndamento(): void {
  emAndamento = null;
}
