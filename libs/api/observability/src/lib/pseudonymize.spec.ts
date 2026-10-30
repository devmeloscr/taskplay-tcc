import { pseudonymize } from './pseudonymize';

describe('pseudonymize', () => {
  const saltOriginal = process.env['TELEMETRY_PSEUDONYM_SALT'];
  beforeEach(() => { process.env['TELEMETRY_PSEUDONYM_SALT'] = 'salt-de-teste'; });
  afterAll(() => { process.env['TELEMETRY_PSEUDONYM_SALT'] = saltOriginal; });

  it('produz sempre o mesmo pseudonimo para o mesmo id', () => {
    // Requisito da analise: distinguir "a mesma crianca voltou" de
    // "criancas diferentes" sem identificar ninguem.
    expect(pseudonymize('crianca-1')).toBe(pseudonymize('crianca-1'));
  });

  it('produz pseudonimos distintos para ids distintos', () => {
    expect(pseudonymize('crianca-1')).not.toBe(pseudonymize('crianca-2'));
  });

  it('nao deixa o id original aparecer no resultado', () => {
    expect(pseudonymize('joao-da-silva')).not.toContain('joao');
  });

  it('muda o resultado quando o salt muda', () => {
    const comSaltA = pseudonymize('crianca-1');
    process.env['TELEMETRY_PSEUDONYM_SALT'] = 'outro-salt';
    expect(pseudonymize('crianca-1')).not.toBe(comSaltA);
  });

  it('recusa operar sem salt configurado', () => {
    // Falhar ruidosamente e preferivel a registrar dado de menor sem protecao.
    delete process.env['TELEMETRY_PSEUDONYM_SALT'];
    expect(() => pseudonymize('crianca-1')).toThrow(/TELEMETRY_PSEUDONYM_SALT/);
  });
});
