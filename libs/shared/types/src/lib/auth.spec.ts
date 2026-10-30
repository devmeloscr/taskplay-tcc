import { z } from 'zod';
import {
  createMemberRequest,
  loginRequest,
  registerForm,
  registerRequest,
  sessionRequest,
} from './auth';
const VERSAO_QUALQUER = '2026-09-25';

describe('contrato de autenticacao', () => {
  const device = { label: 'iPhone da Ana', platform: 'ios' as const };

  it('aceita um cadastro completo de familia', () => {
    const corpo = {
      familyName: 'Familia Souza',
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'senha-forte-1',
      pin: '4821',
      device,
      acceptedTcleVersion: VERSAO_QUALQUER,
    };
    expect(registerRequest.safeParse(corpo).success).toBe(true);
  });

  describe('aceite do TCLE', () => {
    const corpo = {
      familyName: 'Familia Souza',
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'senha-forte-1',
      pin: '4821',
      device,
    };

    function frase(entrada: unknown) {
      const resultado = registerRequest.safeParse(entrada);
      return resultado.error?.issues.find((i) => i.path.join('.') === 'acceptedTcleVersion')
        ?.message;
    }

    it('recusa o cadastro sem aceite, dizendo que falta concordar', () => {
      // E o servidor que garante que toda familia aceitou: um cliente que
      // chame a rota sem passar pela tela do termo nao cria conta.
      expect(frase(corpo)).toBe(
        'É preciso concordar com o Termo de Consentimento para criar a conta',
      );
    });

    it('aceita qualquer versao no contrato: a vigente e conferida pelo servidor', () => {
      // A versao vigente mora na API e muda sem o aplicativo mudar junto; fixa-la
      // aqui faria cada troca do termo exigir uma versao nova do aplicativo.
      expect(frase({ ...corpo, acceptedTcleVersion: '2020-01-01' })).toBeUndefined();
      expect(frase({ ...corpo, acceptedTcleVersion: '' })).toBe(
        'É preciso concordar com o Termo de Consentimento para criar a conta',
      );
    });

    it('o formulario local nao cobra o aceite, que e a etapa seguinte', () => {
      const formulario = { ...corpo, device: undefined };
      expect(registerForm.safeParse(formulario).success).toBe(true);
    });
  });

  it('recusa PIN que nao seja de quatro digitos', () => {
    const base = {
      familyName: 'Familia Souza',
      name: 'Ana',
      email: 'ana@exemplo.com',
      password: 'senha-forte-1',
      device,
      acceptedTcleVersion: VERSAO_QUALQUER,
    };
    expect(registerRequest.safeParse({ ...base, pin: '123' }).success).toBe(false);
    expect(registerRequest.safeParse({ ...base, pin: '12345' }).success).toBe(false);
    expect(registerRequest.safeParse({ ...base, pin: '12a4' }).success).toBe(false);
    expect(registerRequest.safeParse({ ...base, pin: '1234' }).success).toBe(true);
  });

  it('nomeia a regra violada, campo a campo', () => {
    // A mesma frase que a API devolve no `400` e a que a tela pode mostrar
    // antes mesmo de chamar a rede: o schema e um so nos dois lados.
    const resultado = registerRequest.safeParse({
      familyName: '',
      name: 'Ana',
      email: 'ana@',
      password: 'curta',
      pin: '12a4',
      device: { label: 'iPhone da Ana', platform: 'palm' },
      acceptedTcleVersion: VERSAO_QUALQUER,
    });

    expect(resultado.success).toBe(false);
    const porCampo = Object.fromEntries(
      (resultado.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]),
    );
    expect(porCampo).toEqual({
      familyName: 'Informe o nome da família',
      email: 'E-mail em formato inválido (exemplo: nome@dominio.com)',
      password: 'A senha deve ter ao menos 8 caracteres',
      pin: 'O PIN deve ter exatamente 4 dígitos',
      'device.platform': 'A plataforma do aparelho deve ser "ios" ou "android"',
    });
  });

  it('mantem em portugues ate a mensagem que ninguem escreveu a mao', () => {
    const semTextoProprio = z.string().min(3).safeParse('a');
    expect(semTextoProprio.error?.issues[0]?.message).toMatch(/pequeno/i);
  });

  it('descarta identidade enviada pelo cliente', () => {
    const forjado = {
      email: 'ana@exemplo.com',
      password: 'senha-forte-1',
      device,
      familyId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      role: 'PARENT',
    };
    const resultado = loginRequest.parse(forjado);
    expect(resultado).not.toHaveProperty('familyId');
    expect(resultado).not.toHaveProperty('role');
  });

  it('assume escopo `full` quando o cliente nao pede outro', () => {
    const pedido = sessionRequest.parse({
      refreshToken: 'opaco',
      userId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });
    expect(pedido.scope).toBe('full');
  });

  it('nao pede e-mail nem senha para cadastrar um filho', () => {
    // Menos dado pessoal de menor coletado, conforme o RNF02 e o TCLE.
    const filho = createMemberRequest.parse({ name: 'Pedro', birthDate: '2016-04-02' });
    expect(filho).toEqual({ name: 'Pedro', birthDate: '2016-04-02' });
  });
});
