import type { TelemetryEvent } from '@taskplay/shared-telemetry';
import type { Deposito } from '../api/deposito';
import { enfileirar, lerFila } from './fila';
import { esquecerPassagemEmAndamento, esvaziarFilas } from './envio';

const mockSelecionarPerfil = jest.fn();
const mockEnviarTelemetria = jest.fn();
const mockTodosOsPerfisComToken = jest.fn();
const mockTokenDoPerfil = jest.fn();

jest.mock('../api/cliente', () => ({
  api: {
    selecionarPerfil: (...args: unknown[]) => mockSelecionarPerfil(...args),
    enviarTelemetria: (...args: unknown[]) => mockEnviarTelemetria(...args),
  },
}));

jest.mock('../api/armazenamento', () => ({
  todosOsPerfisComToken: () => mockTodosOsPerfisComToken(),
  tokenDoPerfil: (id: string) => mockTokenDoPerfil(id),
}));

function depositoDeMemoria(): Deposito {
  const dados = new Map<string, string>();
  return {
    ler: async (chave) => dados.get(chave) ?? null,
    gravar: async (chave, valor) => void dados.set(chave, valor),
    apagar: async (chave) => void dados.delete(chave),
  };
}

const abertura = (quando: string): TelemetryEvent => ({
  type: 'app.opened',
  occurredAt: quando,
});

describe('envio das filas de telemetria', () => {
  let onde: Deposito;

  beforeEach(() => {
    esquecerPassagemEmAndamento();
    onde = depositoDeMemoria();
    mockSelecionarPerfil.mockReset().mockResolvedValue({
      accessToken: 'token-de-telemetria',
      expiresIn: 900,
      scope: 'telemetry',
    });
    mockEnviarTelemetria.mockReset().mockResolvedValue({ accepted: 1 });
    mockTodosOsPerfisComToken.mockReset().mockResolvedValue(['pedro', 'julia']);
    mockTokenDoPerfil.mockReset().mockImplementation(async (id: string) => `refresh-de-${id}`);
  });

  it('pede o token de cada perfil com o refresh token DAQUELE perfil', async () => {
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    await enfileirar('julia', abertura('2026-08-31T19:05:00.000Z'), onde);

    await esvaziarFilas(onde);

    expect(mockSelecionarPerfil).toHaveBeenCalledWith({
      refreshToken: 'refresh-de-pedro',
      userId: 'pedro',
      scope: 'telemetry',
    });
    expect(mockSelecionarPerfil).toHaveBeenCalledWith({
      refreshToken: 'refresh-de-julia',
      userId: 'julia',
      scope: 'telemetry',
    });
  });

  it('pede escopo telemetry, que nao rotaciona a sessao em uso', async () => {
    // Escopo `full` rotacionaria o refresh token daquele perfil e derrubaria a
    // sessao que outra crianca tem aberta na tela.
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    mockTodosOsPerfisComToken.mockResolvedValue(['pedro']);

    await esvaziarFilas(onde);

    expect(mockSelecionarPerfil.mock.calls[0][0].scope).toBe('telemetry');
    expect(mockSelecionarPerfil.mock.calls[0][0].pin).toBeUndefined();
  });

  it('esvazia a fila de um perfil que nao esta na tela', async () => {
    // O caso do tablet de familia: o mais velho ficou sem sinal, o mais novo
    // trocou de perfil e a rede voltou. A fila do mais velho sai atribuida a ele.
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    mockTodosOsPerfisComToken.mockResolvedValue(['pedro']);

    const resultado = await esvaziarFilas(onde);

    expect(resultado).toEqual({ perfis: 1, eventos: 1 });
    expect(await lerFila('pedro', onde)).toEqual([]);
  });

  it('nao envia o evento no corpo com dono declarado', async () => {
    // O `id` local nunca sai daqui: ele existe so para remover o que foi aceito.
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    mockTodosOsPerfisComToken.mockResolvedValue(['pedro']);

    await esvaziarFilas(onde);

    expect(mockEnviarTelemetria).toHaveBeenCalledWith('token-de-telemetria', [
      { type: 'app.opened', occurredAt: '2026-08-31T19:00:00.000Z' },
    ]);
  });

  it('guarda os eventos quando a rede falha', async () => {
    // Sem sinal e o estado normal de metade do tempo num wi-fi domestico. Perder
    // o dado por isso seria perder o que o teste de campo de 30 dias mediu.
    mockEnviarTelemetria.mockRejectedValue(new Error('Network request failed'));
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    mockTodosOsPerfisComToken.mockResolvedValue(['pedro']);

    await expect(esvaziarFilas(onde)).resolves.toEqual({ perfis: 0, eventos: 0 });
    expect(await lerFila('pedro', onde)).toHaveLength(1);
  });

  it('a falha de um perfil nao impede os outros', async () => {
    // A sessao de um perfil pode ter sido revogada no servidor enquanto as
    // demais continuam validas.
    mockSelecionarPerfil.mockImplementation(async ({ userId }: { userId: string }) => {
      if (userId === 'pedro') throw new Error('sessao revogada');
      return { accessToken: 'token', expiresIn: 900, scope: 'telemetry' };
    });
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    await enfileirar('julia', abertura('2026-08-31T19:05:00.000Z'), onde);

    const resultado = await esvaziarFilas(onde);

    expect(resultado.eventos).toBe(1);
    expect(await lerFila('pedro', onde)).toHaveLength(1);
    expect(await lerFila('julia', onde)).toEqual([]);
  });

  it('nao envia quando o perfil ja nao tem refresh token guardado', async () => {
    // Sem ele nao ha como provar quem gerou os eventos, e mandar com o token de
    // outro perfil e exatamente o erro que esta fila existe para evitar.
    mockTokenDoPerfil.mockResolvedValue(null);
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    mockTodosOsPerfisComToken.mockResolvedValue(['pedro']);

    await esvaziarFilas(onde);

    expect(mockEnviarTelemetria).not.toHaveBeenCalled();
    expect(await lerFila('pedro', onde)).toHaveLength(1);
  });

  it('nao envia o mesmo lote duas vezes quando duas passagens coincidem', async () => {
    await enfileirar('pedro', abertura('2026-08-31T19:00:00.000Z'), onde);
    mockTodosOsPerfisComToken.mockResolvedValue(['pedro']);

    await Promise.all([esvaziarFilas(onde), esvaziarFilas(onde)]);

    expect(mockEnviarTelemetria).toHaveBeenCalledTimes(1);
  });
});
