import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Carteira } from './Carteira';

let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };
let mockListaDeMembros: {
  id: string;
  name: string;
  role: 'PARENT' | 'CHILD';
}[];
const mockAjustar = jest.fn();
const mockIrParaNovoMembro = jest.fn();

// Prefixo `mock` exigido pelo Jest: a fabrica de `jest.mock` e icada para o
// topo do arquivo e so alcanca variaveis assim prefixadas.
const mockExtrato = {
  balance: 45,
  lifetimeEarned: 120,
  transactions: [
    {
      id: 'l1',
      delta: 20,
      balanceAfter: 45,
      reason: 'TASK_COMPLETED' as const,
      note: null,
      taskId: 't1',
      purchaseId: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'l2',
      delta: -10,
      balanceAfter: 25,
      reason: 'LATE_PENALTY' as const,
      note: null,
      taskId: 't2',
      purchaseId: null,
      createdAt: new Date().toISOString(),
    },
  ],
};

const mockPronta = (dados: unknown) => ({
  data: dados,
  isPending: false,
  isError: false,
  isRefetching: false,
  refetch: jest.fn(),
});

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ perfilAtivo: mockPerfil }),
}));
jest.mock('../api/consultas', () => ({
  useMinhaCarteira: () => mockPronta(mockExtrato),
  useCarteiraDeMembro: () => mockPronta(mockExtrato),
  useMembros: () => mockPronta(mockListaDeMembros),
  useAjustarSaldo: () => ({
    mutate: mockAjustar,
    isPending: false,
    isError: false,
  }),
}));

describe('Carteira', () => {
  beforeEach(() => {
    mockAjustar.mockReset();
    mockIrParaNovoMembro.mockReset();
    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
    mockListaDeMembros = [
      { id: 'ana', name: 'Ana', role: 'PARENT' },
      { id: 'pedro', name: 'Pedro', role: 'CHILD' },
    ];
  });

  const montar = () => render(<Carteira irParaNovoMembro={mockIrParaNovoMembro} />);

  it('explica o saldo com o historico, e nao so com o numero', () => {
    // Uma crianca que ve o saldo cair sem linha correspondente conclui que o
    // aplicativo erra - e a partir dai nao confia em mais nada que ele diz.
    montar();

    expect(screen.getByText('45 pontos')).toBeTruthy();
    expect(screen.getByText('Tarefa aprovada')).toBeTruthy();
    expect(screen.getByText('Tarefa venceu sem ser feita')).toBeTruthy();
  });

  it('mostra o sinal do lancamento, e nao so a cor', () => {
    montar();
    expect(screen.getByText('+20 pontos')).toBeTruthy();
    expect(screen.getByText('-10 pontos')).toBeTruthy();
  });

  it('separa o acumulado do saldo', () => {
    // `lifetimeEarned` so cresce: e ele que mede participacao. O saldo puniria
    // justamente quem mais participou, porque gastou na loja.
    montar();
    expect(screen.getByText('Já ganhou 120 pontos desde o começo')).toBeTruthy();
  });

  it('nao oferece ajuste manual a um filho', () => {
    montar();
    expect(screen.queryByRole('button', { name: 'Ajustar pontos' })).toBeNull();
  });

  it('recusa o ajuste sem motivo escrito', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    montar();

    fireEvent.press(screen.getByRole('button', { name: 'Ajustar pontos' }));
    fireEvent.press(screen.getByRole('button', { name: 'Aplicar ajuste' }));

    expect(mockAjustar).not.toHaveBeenCalled();
    expect(screen.getByText(/Escreva o motivo do ajuste/)).toBeTruthy();
  });

  it('leva ao cadastro quando ainda nao ha ninguem na familia', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mockListaDeMembros = [{ id: 'ana', name: 'Ana', role: 'PARENT' }];
    montar();

    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar filho' }));
    expect(mockIrParaNovoMembro).toHaveBeenCalledTimes(1);
  });

  it('manda o ajuste negativo quando o responsavel escolhe tirar', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    montar();

    fireEvent.press(screen.getByRole('button', { name: 'Ajustar pontos' }));
    fireEvent.press(screen.getByLabelText('Tirar'));
    fireEvent.changeText(screen.getByLabelText('Motivo (fica no histórico)'), 'combinado desfeito');
    fireEvent.press(screen.getByRole('button', { name: 'Aplicar ajuste' }));

    expect(mockAjustar).toHaveBeenCalledWith(
      { userId: 'pedro', delta: -10, note: 'combinado desfeito' },
      expect.anything(),
    );
  });
});
