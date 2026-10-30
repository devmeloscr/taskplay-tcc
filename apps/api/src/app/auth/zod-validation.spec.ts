import { BadRequestException } from '@nestjs/common';
import { registerRequest } from '@taskplay/shared-types';
import { parseBody } from './zod-validation';

describe('parseBody', () => {
  const corpoValido = {
    familyName: 'Familia Souza',
    name: 'Ana',
    email: 'ana@exemplo.com',
    password: 'senha-forte-1',
    pin: '4821',
    device: { label: 'iPhone da Ana', platform: 'ios' as const },
    acceptedTcleVersion: '2026-09-25',
  };

  function recusa(corpo: unknown) {
    try {
      parseBody(registerRequest, corpo, 'Cadastro inválido');
    } catch (erro) {
      const resposta = (erro as BadRequestException).getResponse() as {
        error: string;
        message: string;
        issues: { path: string; code: string; message: string }[];
      };
      return resposta;
    }
    throw new Error('esperava recusa');
  }

  it('devolve o corpo valido sem alteracao', () => {
    expect(parseBody(registerRequest, corpoValido, 'Cadastro inválido')).toMatchObject({
      email: 'ana@exemplo.com',
      pin: '4821',
    });
  });

  it('diz qual regra o campo violou, e nao apenas que o cadastro falhou', () => {
    const resposta = recusa({ ...corpoValido, password: 'curta' });

    expect(resposta.message).toBe('A senha deve ter ao menos 8 caracteres');
    expect(resposta.issues).toEqual([
      { path: 'password', code: 'too_small', message: 'A senha deve ter ao menos 8 caracteres' },
    ]);
    // O resumo generico continua no corpo, mas sai do campo que os clientes leem.
    expect(resposta.error).toBe('Cadastro inválido');
  });

  it('distingue e-mail mal formado de e-mail ausente', () => {
    expect(recusa({ ...corpoValido, email: 'ana@' }).message).toContain('formato inválido');

    const semEmail: Record<string, unknown> = { ...corpoValido };
    delete semEmail['email'];
    expect(recusa(semEmail).message).toBe('Informe o e-mail');
  });

  it('nomeia a regra do PIN em vez de descrever a expressao regular', () => {
    expect(recusa({ ...corpoValido, pin: '12a4' }).message).toBe(
      'O PIN deve ter exatamente 4 dígitos',
    );
  });

  it('aponta o campo aninhado do aparelho pelo caminho completo', () => {
    const resposta = recusa({ ...corpoValido, device: { label: '', platform: 'web' } });

    expect(resposta.issues.map((i) => i.path)).toEqual(['device.label', 'device.platform']);
    expect(resposta.issues[1]?.message).toContain('"ios" ou "android"');
  });

  it('relata todos os campos recusados de uma vez', () => {
    const resposta = recusa({ ...corpoValido, familyName: '', password: 'curta', pin: '1' });

    expect(resposta.issues.map((i) => i.path)).toEqual(['familyName', 'password', 'pin']);
  });

  it('nunca ecoa o valor recebido', () => {
    // A senha e o PIN passariam pelo log de qualquer intermediario que registre
    // resposta de erro. O corpo carrega o caminho e a regra, jamais o segredo.
    const serializado = JSON.stringify(recusa({ ...corpoValido, password: 'segredo', pin: '99' }));

    expect(serializado).not.toContain('segredo1');
    expect(serializado).not.toContain('99');
  });
});
