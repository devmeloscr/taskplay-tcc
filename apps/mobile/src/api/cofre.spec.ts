import { cofreDoNavegador } from './cofre';

describe('cofre do navegador', () => {
  const dev = __DEV__;

  beforeEach(() => {
    const memoria = new Map<string, string>();
    (globalThis as { localStorage: unknown }).localStorage = {
      getItem: (chave: string) => memoria.get(chave) ?? null,
      setItem: (chave: string, valor: string) => memoria.set(chave, valor),
      removeItem: (chave: string) => memoria.delete(chave),
      clear: () => memoria.clear(),
    };
  });

  afterEach(() => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    globalThis.localStorage?.clear();
  });

  it('guarda e devolve o segredo em desenvolvimento', async () => {
    await cofreDoNavegador.gravar('taskplay.perfis', '{"pai":"token"}');
    expect(await cofreDoNavegador.ler('taskplay.perfis')).toBe('{"pai":"token"}');

    await cofreDoNavegador.apagar('taskplay.perfis');
    expect(await cofreDoNavegador.ler('taskplay.perfis')).toBeNull();
  });

  it('se recusa a guardar fora do desenvolvimento', async () => {
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;

    await expect(cofreDoNavegador.gravar('taskplay.perfis', 'segredo')).rejects.toThrow(
      /desenvolvimento/,
    );
    await expect(cofreDoNavegador.ler('taskplay.perfis')).rejects.toThrow(/desenvolvimento/);
  });
});
