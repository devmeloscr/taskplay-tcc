import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ErroDaApi } from '../api/cliente';
import { normalizarCodigo, Vincular } from './Vincular';

const mockVincular = jest.fn();

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ vincular: mockVincular }),
}));

describe('normalizarCodigo', () => {
  // O teclado do celular comeca em minuscula, e o codigo e ditado em voz alta:
  // recusar "k7mb 2q" por caixa ou espaco seria recusar um codigo certo.
  it('converte para maiúsculas e descarta o que não é letra ou número', () => {
    expect(normalizarCodigo('k7mb 2q')).toBe('K7MB2Q');
    expect(normalizarCodigo('K7-MB-2Q')).toBe('K7MB2Q');
  });

  it('para em 6 caracteres', () => {
    expect(normalizarCodigo('K7MB2QX')).toBe('K7MB2Q');
  });
});

describe('Vincular', () => {
  beforeEach(() => mockVincular.mockReset());

  it('envia o código normalizado', async () => {
    mockVincular.mockResolvedValue(undefined);
    render(<Vincular voltar={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Código'), 'k7mb2q');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar com o código' }));

    await waitFor(() => expect(mockVincular).toHaveBeenCalledWith('K7MB2Q'));
  });

  // O contrato exige 6 caracteres; conferir antes poupa uma ida ao servidor, que
  // alem de recusar gastaria uma das 10 tentativas por minuto do aparelho.
  it('recusa um código incompleto sem chamar o servidor', () => {
    render(<Vincular voltar={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Código'), 'K7M');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar com o código' }));

    expect(mockVincular).not.toHaveBeenCalled();
    expect(screen.getByText(/6 caracteres/)).toBeTruthy();
  });

  // Codigo errado, vencido ou ja usado voltam com a mesma frase, e a tela a
  // mostra como veio: distinguir os tres nao muda o que fazer.
  it('mostra a recusa do servidor', async () => {
    mockVincular.mockRejectedValue(
      new ErroDaApi(401, 'Código inválido ou expirado', { message: 'Código inválido ou expirado' }),
    );
    render(<Vincular voltar={jest.fn()} />);

    fireEvent.changeText(screen.getByLabelText('Código'), 'K7MB2Q');
    fireEvent.press(screen.getByRole('button', { name: 'Entrar com o código' }));

    expect(await screen.findByText('Código inválido ou expirado')).toBeTruthy();
  });
});
