import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Tarefa } from '../api/cliente';
import { UsarCarta } from './UsarCarta';
import { pontuacaoComoNoServidor } from './pontuacao-de-teste';

let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };
let mockListaDeTarefas: Tarefa[];
let mockListaDeMembros: { id: string; name: string; role: 'PARENT' | 'CHILD' }[];
const mockUsar = jest.fn();

jest.mock('../auth/sessao', () => ({ useSessao: () => ({ perfilAtivo: mockPerfil }) }));
jest.mock('../api/consultas', () => {
  const mockPronta = (dados: unknown) => ({
    data: dados,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
  return {
    useTarefas: () => mockPronta(mockListaDeTarefas),
    useMembros: () => mockPronta(mockListaDeMembros),
    useUsarCarta: () => ({ mutate: mockUsar, isPending: false, isError: false }),
  };
});

function tarefa(parcial: Partial<Tarefa> = {}): Tarefa {
  const base: Omit<Tarefa, 'scoring'> = {
    id: 't1',
    title: 'Lavar a louca',
    description: null,
    points: 20,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'PENDING',
    verification: 'MANUAL',
    assigneeId: 'pedro',
    assignee: { id: 'pedro', name: 'Pedro' },
    completedAt: null,
    reviewedAt: null,
    compensationForId: null,
    evidences: [],
    ...parcial,
  };
  return { ...base, scoring: parcial.scoring ?? pontuacaoComoNoServidor(base) };
}

describe('UsarCarta', () => {
  beforeEach(() => {
    mockUsar.mockReset();
    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
    mockListaDeTarefas = [tarefa()];
    mockListaDeMembros = [
      { id: 'ana', name: 'Ana', role: 'PARENT' },
      { id: 'pedro', name: 'Pedro', role: 'CHILD' },
      { id: 'joao', name: 'Joao', role: 'CHILD' },
    ];
  });

  it('so oferece tarefa propria e ainda nao concluida', () => {
    // Repassar uma tarefa ja feita transferiria o credito de um trabalho que a
    // outra pessoa nao fez; e tarefa de outro membro nunca foi repassavel.
    mockListaDeTarefas = [
      tarefa({ id: 'a', title: 'Minha pendente' }),
      tarefa({ id: 'b', title: 'Minha ja enviada', status: 'SUBMITTED' }),
      tarefa({ id: 'c', title: 'Do irmao', assigneeId: 'joao' }),
    ];
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);

    expect(screen.getByLabelText(/Minha pendente/)).toBeTruthy();
    expect(screen.queryByLabelText(/Minha ja enviada/)).toBeNull();
    expect(screen.queryByLabelText(/Do irmao/)).toBeNull();
  });

  it('nao oferece repassar para si mesmo', () => {
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);
    expect(screen.queryByLabelText('Pedro')).toBeNull();
    expect(screen.getByLabelText('Joao')).toBeTruthy();
  });

  it('oferece o responsavel entre os destinatarios', () => {
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);
    expect(screen.getByLabelText('Ana')).toBeTruthy();
    expect(screen.getByLabelText('Joao')).toBeTruthy();
  });

  it('deixa o filho unico repassar para o responsavel', () => {
    mockListaDeMembros = [
      { id: 'ana', name: 'Ana', role: 'PARENT' },
      { id: 'pedro', name: 'Pedro', role: 'CHILD' },
    ];
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);

    expect(screen.queryByText('Ninguém para receber')).toBeNull();
    expect(screen.getByLabelText('Ana')).toBeTruthy();
  });

  it('guarda a carta quando nao ha mais ninguem na casa', () => {
    mockListaDeMembros = [{ id: 'pedro', name: 'Pedro', role: 'CHILD' }];
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);

    expect(screen.getByText('Ninguém para receber')).toBeTruthy();
    expect(mockUsar).not.toHaveBeenCalled();
  });

  it('guarda a carta quando nao ha tarefa repassavel, em vez de consumi-la', () => {
    // A carta e uma decisao de estrategia: ela continua guardada ate existir
    // uma tarefa que valha a pena repassar.
    mockListaDeTarefas = [tarefa({ status: 'APPROVED' })];
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);

    expect(screen.getByText('Nenhuma tarefa para repassar')).toBeTruthy();
    expect(mockUsar).not.toHaveBeenCalled();
  });

  it('exige tarefa e destinatario antes de gastar a carta', () => {
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);
    fireEvent.press(screen.getByRole('button', { name: 'Repassar a tarefa' }));

    expect(mockUsar).not.toHaveBeenCalled();
    expect(screen.getByText('Escolha a tarefa e para quem ela vai.')).toBeTruthy();
  });

  it('manda a compra, a tarefa e o destinatario', () => {
    render(<UsarCarta compraId="c1" voltar={jest.fn()} />);
    fireEvent.press(screen.getByLabelText(/Lavar a louca/));
    fireEvent.press(screen.getByLabelText('Joao'));
    fireEvent.press(screen.getByRole('button', { name: 'Repassar a tarefa' }));

    expect(mockUsar).toHaveBeenCalledWith(
      { purchaseId: 'c1', taskId: 't1', toUserId: 'joao' },
      expect.anything(),
    );
  });
});
