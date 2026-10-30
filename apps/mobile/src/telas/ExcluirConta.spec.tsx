import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ExcluirConta } from './ExcluirConta';
import { ErroDaApi } from '../api/cliente';
import { CORES } from './tema';

const mockExcluirConta = jest.fn();
const mockSair = jest.fn();

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ excluirConta: mockExcluirConta, sair: mockSair }),
}));

describe('ExcluirConta', () => {
  beforeEach(() => {
    mockExcluirConta.mockReset();
    mockSair.mockReset();
    mockExcluirConta.mockResolvedValue({ fotosRemovidas: 4, membros: 3, tarefas: 12 });
  });

  function preencher({ senha = 'senha-forte-1', pin = '4821', texto = 'REMOVER TUDO' } = {}) {
    fireEvent.changeText(screen.getByLabelText('Sua senha'), senha);
    fireEvent.changeText(screen.getByLabelText('Seu PIN de 4 dígitos'), pin);
    fireEvent.changeText(screen.getByLabelText(/^Digite REMOVER TUDO/), texto);
  }

  const botao = () => screen.getByRole('button', { name: 'Remover tudo' });

  it('mantem o botao travado ate senha, PIN e o texto exato', () => {
    render(<ExcluirConta voltar={jest.fn()} />);
    expect(botao()).toBeDisabled();

    preencher({ texto: 'remover tudo' });
    // Minusculas nao valem: o texto por extenso e a ultima tranca contra o
    // toque acidental, e conferi-lo por aproximacao o desfaria.
    expect(botao()).toBeDisabled();

    preencher({ pin: '48' });
    expect(botao()).toBeDisabled();

    preencher();
    expect(botao()).toBeEnabled();
  });

  it('exige senha e PIN juntos, e manda os dois', async () => {
    render(<ExcluirConta voltar={jest.fn()} />);
    preencher();
    fireEvent.press(botao());

    await screen.findByText('Dados removidos');
    expect(mockExcluirConta).toHaveBeenCalledWith({ password: 'senha-forte-1', pin: '4821' });
  });

  it('conta o que saiu antes de encerrar a sessao', async () => {
    // Quem exerce o direito de sair precisa ver que ele foi exercido, e nao ser
    // jogado de volta ao cadastro sem explicacao.
    render(<ExcluirConta voltar={jest.fn()} />);
    preencher();
    fireEvent.press(botao());

    expect(await screen.findByText(/3 perfis, 12 tarefas e 4 fotos/)).toBeTruthy();
    expect(mockSair).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Concluir' }));
    expect(mockSair).toHaveBeenCalled();
  });

  it('marca o campo quando o servidor recusa a senha ou o PIN', async () => {
    mockExcluirConta.mockRejectedValue(
      new ErroDaApi(400, 'O PIN deve ter exatamente 4 dígitos', {
        error: 'Revogacao invalida',
        message: 'O PIN deve ter exatamente 4 dígitos',
        issues: [
          { path: 'pin', code: 'invalid_format', message: 'O PIN deve ter exatamente 4 dígitos' },
        ],
      }),
    );
    render(<ExcluirConta voltar={jest.fn()} />);
    preencher();
    fireEvent.press(botao());

    expect(await screen.findByText('O PIN deve ter exatamente 4 dígitos')).toBeTruthy();
    expect(screen.getByLabelText(/^Seu PIN/)).toHaveStyle({ borderColor: CORES.erro });
  });

  it('nao remove nada quando a recusa vem sem campo', async () => {
    mockExcluirConta.mockRejectedValue(
      new ErroDaApi(401, 'Senha ou PIN inválidos', { message: 'Senha ou PIN inválidos' }),
    );
    render(<ExcluirConta voltar={jest.fn()} />);
    preencher();
    fireEvent.press(botao());

    expect(await screen.findByText('Senha ou PIN inválidos')).toBeTruthy();
    expect(screen.queryByText('Dados removidos')).toBeNull();
    expect(mockSair).not.toHaveBeenCalled();
  });
});
