import React from 'react';
import { RefreshControl } from 'react-native';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { ErroDeTransporte, type Tarefa } from '../api/cliente';
import { Tarefas } from './Tarefas';
import { pontuacaoComoNoServidor } from './pontuacao-de-teste';

let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };
const mockConsulta = jest.fn();

jest.mock('../auth/sessao', () => ({ useSessao: () => ({ perfilAtivo: mockPerfil }) }));
jest.mock('../api/consultas', () => ({ useTarefas: () => mockConsulta() }));

function tarefa(parcial: Partial<Tarefa>): Tarefa {
  const base: Omit<Tarefa, 'scoring'> = {
    id: 't1',
    title: 'Arrumar a cama',
    description: null,
    points: 20,
    dueAt: new Date('2026-08-28T20:00:00').toISOString(),
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

function comTarefas(lista: Tarefa[], resto: Record<string, unknown> = {}) {
  mockConsulta.mockReturnValue({
    data: lista,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn().mockResolvedValue(undefined),
    ...resto,
  });
}

describe('Tarefas', () => {
  beforeEach(() => {
    mockConsulta.mockReset();
    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
  });

  it('junta pendente, a refazer e vencida no mesmo grupo "a fazer"', () => {
    comTarefas([
      tarefa({ id: 'a', title: 'Pendente', status: 'PENDING' }),
      tarefa({ id: 'b', title: 'Devolvida pelo responsavel', status: 'REJECTED' }),
      tarefa({ id: 'c', title: 'Passou do prazo', status: 'EXPIRED' }),
      tarefa({ id: 'd', title: 'Ja foi enviada', status: 'SUBMITTED' }),
    ]);
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);

    expect(screen.getByLabelText('A fazer (3)')).toBeTruthy();
    expect(screen.getByText('Pendente')).toBeTruthy();
    expect(screen.getByText('Devolvida pelo responsavel')).toBeTruthy();
    expect(screen.getByText('Passou do prazo')).toBeTruthy();
    expect(screen.queryByText('Ja foi enviada')).toBeNull();
  });

  it('nao chama a tarefa vencida de perdida', () => {
    comTarefas([tarefa({ status: 'EXPIRED' })]);
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);

    expect(screen.getByText('Venceu, ainda dá')).toBeTruthy();
    expect(screen.queryByText(/perdida/i)).toBeNull();
  });

  it('mostra no cartao o que a tarefa rendeu, e nao o valor de face', () => {
    // A lista de encerradas anunciava "20 pontos" numa tarefa que creditou 15:
    // quem so olha a lista nunca ve o desconto acontecer.
    comTarefas([
      tarefa({
        status: 'APPROVED',
        points: 20,
        dueAt: new Date('2026-08-28T18:00:00').toISOString(),
        completedAt: new Date('2026-08-29T10:00:00').toISOString(),
      }),
    ]);
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Encerradas (1)'));

    expect(screen.getByText('15 pontos')).toBeTruthy();
    expect(screen.getByText('em vez de 20')).toBeTruthy();
    expect(screen.queryByText('20 pontos')).toBeNull();
  });

  it('diz o desconto tambem para quem ouve a linha', () => {
    // O rotulo unico do cartao e o que um leitor de tela le: se o corte so
    // aparecer no texto pequeno ao lado, ele nao existe para quem nao ve.
    comTarefas([
      tarefa({
        status: 'APPROVED',
        points: 20,
        dueAt: new Date('2026-08-28T18:00:00').toISOString(),
        completedAt: new Date('2026-08-29T10:00:00').toISOString(),
      }),
    ]);
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);
    fireEvent.press(screen.getByLabelText('Encerradas (1)'));

    expect(
      screen.getByLabelText(/15 pontos, em vez de 20, por causa do atraso/),
    ).toBeTruthy();
  });

  it('nao mexe no cartao da tarefa sem atraso', () => {
    comTarefas([tarefa({ status: 'PENDING', points: 20 })]);
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);

    expect(screen.getByText('20 pontos')).toBeTruthy();
    expect(screen.queryByText(/em vez de/)).toBeNull();
  });

  it('nao oferece criar tarefa a um filho', () => {
    comTarefas([]);
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);
    expect(screen.queryByRole('button', { name: 'Criar tarefa' })).toBeNull();
  });

  it('mostra de quem e a tarefa so para o responsavel', () => {
    comTarefas([tarefa({})]);
    const { unmount } = render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);
    // O filho ve so as proprias tarefas - o nome dele em cada linha seria
    // repeticao inutil.
    expect(screen.queryByText('Pedro')).toBeNull();
    unmount();

    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);
    expect(screen.getByText('Pedro')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Criar tarefa' })).toBeTruthy();
  });

  it('nao gira o indicador num refetch que ninguem pediu', async () => {
    comTarefas([tarefa({})], { isRefetching: true });
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);
    const controle = screen.UNSAFE_getByType(RefreshControl);

    expect(controle.props.refreshing).toBe(false);

    await act(async () => {
      controle.props.onRefresh();
    });
    // E depois do gesto ele desliga sozinho, mesmo que a consulta continue
    // marcada como buscando: quem espera aqui e o toque, nao o cache.
    expect(mockConsulta().refetch).toHaveBeenCalled();
    expect(screen.UNSAFE_getByType(RefreshControl).props.refreshing).toBe(false);
  });

  it('traduz a falha de rede em vez de mostrar o texto cru', () => {
    mockConsulta.mockReturnValue({
      isPending: false,
      isError: true,
      error: new ErroDeTransporte(new TypeError('Network request failed'), {
        metodo: 'GET',
        caminho: '/tasks',
        comArquivo: false,
      }),
      refetch: jest.fn(),
    });
    render(<Tarefas irParaTarefa={jest.fn()} irParaNova={jest.fn()} />);

    expect(screen.getByText(/Sem conexão com o TaskPlay/)).toBeTruthy();
    expect(screen.queryByText('Network request failed')).toBeNull();
    // Sempre com caminho de volta: sem o botao, a unica saida seria fechar o
    // aplicativo.
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});
