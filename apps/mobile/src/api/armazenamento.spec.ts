import {
  esquecerPerfil,
  esquecerTudo,
  guardarToken,
  qualquerToken,
  tokenDoPerfil,
} from './armazenamento';

jest.mock('expo-secure-store', () => {
  const cofre: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (chave: string) => cofre[chave] ?? null),
    setItemAsync: jest.fn(async (chave: string, valor: string) => {
      cofre[chave] = valor;
    }),
    deleteItemAsync: jest.fn(async (chave: string) => {
      delete cofre[chave];
    }),
  };
});

const PAI = 'perfil-pai';
const FILHO = 'perfil-filho';

describe('armazenamento de tokens', () => {
  beforeEach(() => esquecerTudo());

  it('guarda um token por perfil', async () => {
    await guardarToken(PAI, 'token-do-pai');
    await guardarToken(FILHO, 'token-do-filho');

    expect(await tokenDoPerfil(PAI)).toBe('token-do-pai');
    expect(await tokenDoPerfil(FILHO)).toBe('token-do-filho');
  });

  it('substitui o token ao rotacionar, sem tocar nos outros perfis', async () => {
    await guardarToken(PAI, 'antigo');
    await guardarToken(FILHO, 'do-filho');
    await guardarToken(PAI, 'novo');

    expect(await tokenDoPerfil(PAI)).toBe('novo');
    expect(await tokenDoPerfil(FILHO)).toBe('do-filho');
  });

  it('devolve qualquer token vivo para abrir o seletor', async () => {
    // Qualquer sessao viva prova que o aparelho pertence a familia, que e o que
    // a rota de perfis exige. Nao importa de qual perfil.
    expect(await qualquerToken()).toBeNull();
    await guardarToken(FILHO, 'do-filho');
    expect(await qualquerToken()).toBe('do-filho');
  });

  it('esquece um perfil sem derrubar o aparelho', async () => {
    await guardarToken(PAI, 'do-pai');
    await guardarToken(FILHO, 'do-filho');

    await esquecerPerfil(FILHO);

    expect(await tokenDoPerfil(FILHO)).toBeNull();
    expect(await qualquerToken()).toBe('do-pai');
  });

  it('volta ao estado inicial se o conteudo estiver corrompido', async () => {
    // Conteudo ilegivel significa que ninguem entra. Voltar ao login e melhor do
    // que travar o aplicativo num estado irrecuperavel.
    const cofre = jest.requireMock('expo-secure-store');
    await cofre.setItemAsync('taskplay.perfis', '{isso nao e json');

    expect(await qualquerToken()).toBeNull();
    expect(await tokenDoPerfil(PAI)).toBeNull();
  });

  it('nao guarda nada em claro fora do cofre', async () => {
    const cofre = jest.requireMock('expo-secure-store');
    await guardarToken(PAI, 'segredo-do-pai');

    // Toda escrita passa pelo SecureStore - Keychain/Keystore -, e nunca por
    // armazenamento comum, legivel em aparelho com root.
    expect(cofre.setItemAsync).toHaveBeenCalled();
    expect(cofre.setItemAsync.mock.calls.at(-1)[0]).toBe('taskplay.perfis');
  });
});
