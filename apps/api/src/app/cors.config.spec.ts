import { origensPermitidas } from './cors.config';

describe('origens permitidas para CORS', () => {
  /** Reproduz a checagem que o Nest faz contra a lista. */
  function aceita(origens: (string | RegExp)[] | null, origem: string): boolean {
    return (origens ?? []).some((regra) =>
      typeof regra === 'string' ? regra === origem : regra.test(origem),
    );
  }

  it('libera o servidor de desenvolvimento do Expo em qualquer porta', () => {
    const dev = origensPermitidas({ NODE_ENV: 'development' });

    expect(aceita(dev, 'http://localhost:8081')).toBe(true);
    expect(aceita(dev, 'http://localhost:19000')).toBe(true);
    expect(aceita(dev, 'http://127.0.0.1:19006')).toBe(true);
  });

  it('nao libera outra maquina, nem em desenvolvimento', () => {
    // O que delimita a permissao e a maquina, nao a porta.
    const dev = origensPermitidas({ NODE_ENV: 'development' });

    expect(aceita(dev, 'http://malicioso.test')).toBe(false);
    expect(aceita(dev, 'http://localhost.malicioso.test:8081')).toBe(false);
  });

  it('mantem o CORS desligado em producao sem declaracao explicita', () => {
    expect(origensPermitidas({ NODE_ENV: 'production' })).toBeNull();
  });

  it('respeita a lista declarada, inclusive em producao', () => {
    expect(
      origensPermitidas({ NODE_ENV: 'production', CORS_ORIGINS: 'https://app.taskplay.test' }),
    ).toEqual(['https://app.taskplay.test']);
  });

  it('ignora espacos e entradas vazias na lista', () => {
    expect(origensPermitidas({ CORS_ORIGINS: ' http://a.test , , http://b.test ' })).toEqual([
      'http://a.test',
      'http://b.test',
    ]);
  });
});
