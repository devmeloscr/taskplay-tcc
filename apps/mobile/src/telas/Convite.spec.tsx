import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Convite } from './Convite';

const mockGerar = jest.fn();
let mockGeracao: {
  data?: { code: string; expiresAt: string };
  isPending: boolean;
  isError: boolean;
  error: unknown;
};
let mockLista: { data?: unknown[]; isPending: boolean; isError: boolean };

jest.mock('../api/consultas', () => ({
  useMembrosGerenciados: () => mockLista,
  useGerarConvite: () => ({ ...mockGeracao, mutate: mockGerar }),
}));

const FILHO = {
  id: 'f1',
  name: 'Pedro',
  role: 'CHILD' as const,
  birthDate: '2012-04-02',
  hasPin: false,
  deactivatedAt: null,
};

function montar(membros: unknown[] = [FILHO]) {
  mockLista = { data: membros, isPending: false, isError: false };
  return render(<Convite id="f1" voltar={jest.fn()} />);
}

describe('Convite', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockGerar.mockReset();
    mockGeracao = { isPending: false, isError: false, error: null };
  });

  afterEach(() => jest.useRealTimers());

  // Cada codigo gerado e uma credencial viva por 15 minutos. Abrir a tela nao
  // pode ser o que a cria.
  it('não gera código ao abrir, só no toque', () => {
    montar();
    expect(mockGerar).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Gerar código' }));
    expect(mockGerar).toHaveBeenCalledWith('f1');
  });

  it('mostra o código gerado', () => {
    mockGeracao.data = {
      code: 'K7MB2Q',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    montar();

    expect(screen.getByText('K7MB2Q')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Gerar outro código' })).toBeTruthy();
  });

  // Um codigo vencido na tela seria digitado e recusado sem que ninguem
  // soubesse que o problema foi o relogio.
  it('tira o código da tela quando ele vence', () => {
    mockGeracao.data = {
      code: 'K7MB2Q',
      expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
    };
    montar();

    act(() => {
      jest.advanceTimersByTime(15 * 60_000);
    });

    expect(screen.queryByText('K7MB2Q')).toBeNull();
    expect(screen.getByText(/O código venceu/)).toBeTruthy();
  });

  it('não oferece código para quem saiu da família', () => {
    montar([{ ...FILHO, deactivatedAt: '2026-09-01T12:00:00.000Z' }]);

    expect(screen.getByText('Perfil não encontrado')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Gerar código' })).toBeNull();
  });
});
