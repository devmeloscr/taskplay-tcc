import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { TcleDocument } from '@taskplay/shared-types';
import { Cadastro } from './Cadastro';
import { ErroDaApi, ErroDeTransporte } from '../api/cliente';
import { CORES } from './tema';

const mockCadastrar = jest.fn();

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ cadastrar: mockCadastrar }),
}));

const TERMO: TcleDocument = {
  version: '2026-09-25',
  title: 'Termo de Consentimento Livre e Esclarecido',
  summary: ['A participação é voluntária.'],
  sections: [{ title: 'Sobre a pesquisa', paragraphs: ['Pesquisa de Trabalho de Curso.'] }],
};

let mockTermo: {
  data?: TcleDocument;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  error: unknown;
  refetch: jest.Mock;
};

jest.mock('../api/consultas', () => ({
  useTermo: () => mockTermo,
}));

describe('Cadastro', () => {
  beforeEach(() => {
    mockCadastrar.mockReset();
    mockTermo = {
      data: TERMO,
      isPending: false,
      isError: false,
      isFetching: false,
      error: null,
      refetch: jest.fn(),
    };
  });

  function recusa(issues: { path: string; code: string; message: string }[], status = 400) {
    mockCadastrar.mockRejectedValue(
      new ErroDaApi(status, issues[0].message, {
        error: 'Cadastro inválido',
        message: issues[0].message,
        issues,
      }),
    );
  }

  /** Preenche o formulario com valores que passam na validacao local. */
  function preencher() {
    fireEvent.changeText(screen.getByLabelText('Nome da família'), 'Família Souza');
    fireEvent.changeText(screen.getByLabelText('Seu nome'), 'Ana');
    fireEvent.changeText(screen.getByLabelText('Seu e-mail'), 'ana@exemplo.com');
    fireEvent.changeText(screen.getByLabelText('Senha (ao menos 8 caracteres)'), 'senha-forte-1');
    fireEvent.changeText(screen.getByLabelText('PIN de 4 dígitos'), '4821');
  }

  function irAoTermo() {
    preencher();
    fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));
  }

  function enviar() {
    irAoTermo();
    fireEvent.press(screen.getByRole('button', { name: 'Li e concordo' }));
  }

  describe('etapa do termo', () => {
    it('confere o formulario antes de mostrar o termo', () => {
      // Sem esta conferencia, a senha curta so seria recusada depois de o
      // responsavel ler e aceitar o termo.
      render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
      fireEvent.press(screen.getByRole('button', { name: 'Continuar' }));

      expect(screen.getByText('Informe o nome da família')).toBeTruthy();
      expect(screen.getByLabelText(/^Nome da família/)).toHaveStyle({
        borderColor: CORES.erro,
      });
      expect(screen.queryByRole('button', { name: 'Li e concordo' })).toBeNull();
      expect(mockCadastrar).not.toHaveBeenCalled();
    });

    it('mostra o resumo e so abre o texto completo em "Ler mais"', () => {
      render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
      irAoTermo();

      expect(screen.getByText(TERMO.summary[0])).toBeTruthy();
      const secao = TERMO.sections[0].title;
      expect(screen.queryByText(secao)).toBeNull();

      fireEvent.press(screen.getByRole('button', { name: 'Ler mais' }));
      expect(screen.getByText(secao)).toBeTruthy();
    });

    it('so cria a conta no aceite, e envia a versao do termo exibido', async () => {
      mockCadastrar.mockResolvedValue(undefined);
      render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
      irAoTermo();

      // Chegar ao termo nao cria nada: a conta nasce do toque em concordar.
      expect(mockCadastrar).not.toHaveBeenCalled();

      fireEvent.press(screen.getByRole('button', { name: 'Li e concordo' }));
      await waitFor(() =>
        expect(mockCadastrar).toHaveBeenCalledWith({
          familyName: 'Família Souza',
          name: 'Ana',
          email: 'ana@exemplo.com',
          password: 'senha-forte-1',
          pin: '4821',
          acceptedTcleVersion: TERMO.version,
        }),
      );
    });

    it('busca o termo de novo quando ele mudou durante a leitura', async () => {
      recusa(
        [
          {
            path: 'acceptedTcleVersion',
            code: 'outdated',
            message:
              'O Termo de Consentimento foi atualizado. Leia a versão atual e concorde de novo.',
          },
        ],
        409,
      );
      render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
      enviar();

      expect(await screen.findByText(/foi atualizado/)).toBeTruthy();
      expect(mockTermo.refetch).toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Li e concordo' })).toBeTruthy();
    });

    it('sem o termo carregado, nao oferece o aceite', () => {
      // Um "Li e concordo" sobre uma tela sem texto registraria aceite sem
      // leitura.
      mockTermo = { ...mockTermo, data: undefined, isError: true, error: new Error('falhou') };
      render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
      irAoTermo();

      expect(screen.queryByRole('button', { name: 'Li e concordo' })).toBeNull();
      fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
      expect(mockTermo.refetch).toHaveBeenCalled();
      // A saida continua: o responsavel pode voltar e revisar o que digitou.
      expect(screen.getByRole('button', { name: 'Voltar ao formulário' })).toBeTruthy();
    });

    it('volta ao formulario sem perder o que foi digitado', () => {
      render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
      irAoTermo();

      fireEvent.press(screen.getByRole('button', { name: 'Voltar ao formulário' }));

      expect(screen.getByLabelText('Seu e-mail').props.value).toBe('ana@exemplo.com');
      expect(mockCadastrar).not.toHaveBeenCalled();
    });
  });

  it('escreve a frase abaixo do campo que a causou e acende a borda', async () => {
    recusa([
      {
        path: 'email',
        code: 'invalid_format',
        message: 'E-mail em formato inválido',
      },
      {
        path: 'password',
        code: 'too_small',
        message: 'A senha deve ter ao menos 8 caracteres',
      },
    ]);
    render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
    enviar();

    expect(await screen.findByText('E-mail em formato inválido')).toBeTruthy();
    expect(screen.getByText('A senha deve ter ao menos 8 caracteres')).toBeTruthy();

    // A borda e reforco do texto, e nunca o unico sinal - mas precisa existir.
    expect(screen.getByLabelText(/^Seu e-mail/)).toHaveStyle({
      borderColor: CORES.erro,
    });
    // O campo que passou continua com a borda normal.
    expect(screen.getByLabelText('Nome da família')).toHaveStyle({
      borderColor: CORES.borda,
    });
  });

  it('leva o erro para o rotulo lido em voz alta, e nao so para a cor', async () => {
    recusa([
      {
        path: 'pin',
        code: 'invalid_format',
        message: 'O PIN deve ter 4 digitos',
      },
    ]);
    render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
    enviar();

    expect(await screen.findByLabelText('PIN de 4 dígitos. O PIN deve ter 4 digitos')).toBeTruthy();
  });

  it('apaga a marca do campo assim que a pessoa digita nele', async () => {
    recusa([
      {
        path: 'email',
        code: 'invalid_format',
        message: 'E-mail em formato inválido',
      },
    ]);
    render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
    enviar();
    await screen.findByText('E-mail em formato inválido');

    fireEvent.changeText(screen.getByLabelText(/^Seu e-mail/), 'ana@exemplo.com');

    // Insistir no veredito enquanto a correcao esta sendo digitada e afirmar
    // algo que o servidor ainda nao conferiu.
    expect(screen.queryByText('E-mail em formato inválido')).toBeNull();
    expect(screen.getByLabelText('Seu e-mail')).toHaveStyle({
      borderColor: CORES.borda,
    });
  });

  it('nao engole a recusa que nao tem campo na tela', async () => {
    // `device` e montado pelo aplicativo, nao digitado. Sem este cuidado, a
    // recusa sumiria e o botao pareceria quebrado.
    recusa([
      {
        path: 'device.platform',
        code: 'invalid_value',
        message: 'Plataforma nao reconhecida',
      },
    ]);
    render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
    enviar();

    expect(await screen.findByText('Plataforma nao reconhecida')).toBeTruthy();
  });

  it('aponta o campo de e-mail quando a conta ja existe', async () => {
    // O 409 nao vem da validacao de schema, mas chega na mesma forma, com
    // `path` - por isso acende o campo certo sem interpretar o texto.
    recusa(
      [
        {
          path: 'email',
          code: 'duplicate',
          message: 'Já existe uma conta com este e-mail',
        },
      ],
      409,
    );
    render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
    enviar();

    expect(await screen.findByText('Já existe uma conta com este e-mail')).toBeTruthy();
    expect(screen.getByLabelText(/^Seu e-mail/)).toHaveStyle({
      borderColor: CORES.erro,
    });
  });

  it('traduz a falha de rede, sem culpar campo nenhum', async () => {
    mockCadastrar.mockRejectedValue(
      new ErroDeTransporte(new TypeError('Failed to fetch'), {
        metodo: 'POST',
        caminho: '/auth/register',
        comArquivo: false,
      }),
    );
    render(<Cadastro irParaEntrar={jest.fn()} irParaConvite={jest.fn()} />);
    enviar();

    expect(await screen.findByText(/Sem conexão com o TaskPlay/)).toBeTruthy();
    expect(screen.queryByText('Failed to fetch')).toBeNull();
    // Sem campo culpado, a tela fica no termo: tentar de novo e tocar outra vez
    // em "Li e concordo", e nao refazer o formulario.
    expect(screen.getByRole('button', { name: 'Li e concordo' })).toBeTruthy();
  });
});
