import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Aviso } from '../api/cliente';
import { Avisos } from './Avisos';

let mockLista: Aviso[] = [];
const mockMarcarLido = jest.fn();
const mockMarcarTodos = jest.fn();

jest.mock('../api/consultas', () => ({
  useAvisos: () => ({
    data: mockLista,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useMarcarAvisoLido: () => ({ mutate: mockMarcarLido, isPending: false, isError: false }),
  useMarcarTodosLidos: () => ({ mutate: mockMarcarTodos, isPending: false, isError: false }),
}));

function aviso(parcial: Partial<Aviso> = {}): Aviso {
  return {
    id: 'a1',
    type: 'TASK_TRANSFERRED',
    title: 'Beatriz Andrade repassou uma tarefa para você',
    body: '"Tirar o lixo do banheiro": quando terminar, é só marcar como feita.',
    taskId: 't1',
    sentAt: new Date().toISOString(),
    readAt: null,
    createdAt: new Date().toISOString(),
    ...parcial,
  };
}

describe('Avisos', () => {
  const irParaTarefa = jest.fn();

  beforeEach(() => {
    [mockMarcarLido, mockMarcarTodos, irParaTarefa].forEach((m) => m.mockReset());
    mockLista = [aviso()];
  });

  it('diz o que aparece ali quando ainda nao ha aviso', () => {
    mockLista = [];
    render(<Avisos irParaTarefa={irParaTarefa} />);
    expect(screen.getByText('Nenhum aviso ainda')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Marcar todos como lidos' })).toBeNull();
  });

  it('marca o aviso novo com texto, e nao so com cor', () => {
    render(<Avisos irParaTarefa={irParaTarefa} />);
    expect(screen.getByText('Novo')).toBeTruthy();
    expect(screen.getByText('Beatriz Andrade repassou uma tarefa para você')).toBeTruthy();
  });

  it('ao tocar, marca como lido e abre a tarefa', () => {
    render(<Avisos irParaTarefa={irParaTarefa} />);
    fireEvent.press(screen.getByRole('button', { name: /repassou uma tarefa/ }));
    expect(mockMarcarLido).toHaveBeenCalledWith('a1');
    expect(irParaTarefa).toHaveBeenCalledWith('t1');
  });

  it('nao marca de novo o aviso ja lido', () => {
    mockLista = [aviso({ readAt: new Date().toISOString() })];
    render(<Avisos irParaTarefa={irParaTarefa} />);
    expect(screen.queryByText('Novo')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: /repassou uma tarefa/ }));
    expect(mockMarcarLido).not.toHaveBeenCalled();
    expect(irParaTarefa).toHaveBeenCalledWith('t1');
  });

  it('nao tenta abrir tarefa quando o aviso nao aponta para uma', () => {
    mockLista = [aviso({ taskId: null, title: 'Seu pedido foi entregue', body: 'Aproveite.' })];
    render(<Avisos irParaTarefa={irParaTarefa} />);
    fireEvent.press(screen.getByRole('button', { name: /Seu pedido foi entregue/ }));
    expect(irParaTarefa).not.toHaveBeenCalled();
  });

  it('oferece marcar todos como lidos so quando ha nao lido', () => {
    render(<Avisos irParaTarefa={irParaTarefa} />);
    fireEvent.press(screen.getByRole('button', { name: 'Marcar todos como lidos' }));
    expect(mockMarcarTodos).toHaveBeenCalled();
  });
});
