import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { Compra, ItemDaLoja } from '../api/cliente';
import { Loja } from './Loja';

let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };
let mockItens: ItemDaLoja[];
let mockCompras: Compra[];
let mockSaldo: number;
const mockComprar = jest.fn();
const mockEntregar = jest.fn();
const mockCancelar = jest.fn();
const mockDesativar = jest.fn();

jest.mock('../auth/sessao', () => ({ useSessao: () => ({ perfilAtivo: mockPerfil }) }));
jest.mock('../api/consultas', () => {
  const mockPronta = (dados: unknown) => ({
    data: dados,
    isPending: false,
    isError: false,
    isRefetching: false,
    refetch: jest.fn(),
  });
  return {
    useItensDaLoja: () => mockPronta(mockItens),
    useCompras: () => mockPronta(mockCompras),
    useMinhaCarteira: () => mockPronta({ balance: mockSaldo, lifetimeEarned: 0, transactions: [] }),
    useComprar: () => ({ mutate: mockComprar, isPending: false, isError: false }),
    useEntregarCompra: () => ({ mutate: mockEntregar, isPending: false, isError: false }),
    useCancelarCompra: () => ({ mutate: mockCancelar, isPending: false, isError: false }),
    useDesativarItem: () => ({ mutate: mockDesativar, isPending: false, isError: false }),
  };
});

function item(parcial: Partial<ItemDaLoja> = {}): ItemDaLoja {
  return {
    id: 'i1',
    name: 'Escolher o filme',
    description: null,
    kind: 'REWARD',
    costPoints: 50,
    stock: null,
    active: true,
    ...parcial,
  };
}

function compra(parcial: Partial<Compra> = {}): Compra {
  return {
    id: 'c1',
    itemId: 'i1',
    buyerId: 'pedro',
    costPoints: 50,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    fulfilledAt: null,
    item: { id: 'i1', name: 'Escolher o filme', kind: 'REWARD' },
    buyer: { id: 'pedro', name: 'Pedro' },
    ...parcial,
  };
}

function abrir(aba: 'Catalogo' | 'Minhas compras' | 'Pedidos' = 'Catalogo') {
  render(<Loja irParaNovoItem={jest.fn()} irParaCarta={jest.fn()} />);
  if (aba !== 'Catalogo') fireEvent.press(screen.getByLabelText(aba));
}

describe('Loja', () => {
  beforeEach(() => {
    [mockComprar, mockEntregar, mockCancelar, mockDesativar].forEach((m) => m.mockReset());
    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
    mockItens = [item()];
    mockCompras = [];
    mockSaldo = 100;
  });

  it('mostra o item caro em vez de esconde-lo, dizendo quanto falta', () => {
    // O item inalcancavel e o que da motivo para a proxima tarefa. Esconde-lo
    // removeria o objetivo e deixaria so o catalogo do que ja da para comprar.
    mockSaldo = 20;
    abrir();

    expect(screen.getByText('Escolher o filme')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Faltam 30 pontos' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Trocar meus pontos' })).toBeNull();
  });

  it('libera a compra quando o saldo alcanca', () => {
    abrir();
    fireEvent.press(screen.getByRole('button', { name: 'Trocar meus pontos' }));
    expect(mockComprar).toHaveBeenCalledWith('i1');
  });

  it('nao deixa comprar o que acabou, e diz que acabou', () => {
    mockItens = [item({ stock: 0 })];
    abrir();

    expect(screen.getByRole('button', { name: 'Acabou por enquanto' })).toBeTruthy();
    expect(mockComprar).not.toHaveBeenCalled();
  });

  it('nao mostra o saldo nem oferece compra ao responsavel', () => {
    // O responsavel nao gasta pontos: a loja, para ele, e catalogo e pedidos.
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    abrir();

    expect(screen.queryByText(/Voce tem/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trocar meus pontos' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Cadastrar recompensa' })).toBeTruthy();
  });

  it('so retira a recompensa da loja depois da confirmacao', () => {
    // Nao ha rota que devolva o item ao catalogo: um toque errado custa
    // recadastrar a recompensa, e por isso a confirmacao e em dois toques.
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    abrir();

    fireEvent.press(screen.getByRole('button', { name: 'Tirar da loja' }));
    expect(mockDesativar).not.toHaveBeenCalled();
    expect(screen.getByText('Tirar "Escolher o filme" da loja?')).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Sim, tirar da loja' }));
    expect(mockDesativar).toHaveBeenCalledWith('i1');
  });

  it('desiste da retirada sem chamar o servidor', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    abrir();

    fireEvent.press(screen.getByRole('button', { name: 'Tirar da loja' }));
    fireEvent.press(screen.getByRole('button', { name: 'Manter na loja' }));

    expect(mockDesativar).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Tirar da loja' })).toBeTruthy();
  });

  it('nao diz que a recompensa retirada some do historico', () => {
    // O servidor desativa em vez de apagar, porque a compra ja registrada
    // aponta para o item. A frase precisa descrever isso, e nao exclusao.
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    abrir();
    fireEvent.press(screen.getByRole('button', { name: 'Tirar da loja' }));

    expect(screen.getByText(/continuam no histórico/)).toBeTruthy();
    expect(screen.queryByText(/excluir|apagad/i)).toBeNull();
  });

  it('nao oferece tirar da loja a Carta de Transferência', () => {
    // Item de sistema: o servidor recusa retira-la, e mostrar o caminho para
    // negar depois do toque e pior que nao mostra-lo.
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mockItens = [item({ id: 'i2', name: 'Carta de Transferência', kind: 'TRANSFER_LETTER' })];
    abrir();

    expect(screen.getByText('Carta de Transferência')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tirar da loja' })).toBeNull();
  });

  it('nao oferece ao filho tirar recompensa da loja', () => {
    abrir();
    expect(screen.queryByRole('button', { name: 'Tirar da loja' })).toBeNull();
  });

  it('nao oferece "marcar como entregue" numa Carta de Transferência', () => {
    // A carta se conclui pelo uso, e nao por entrega manual: marca-la como
    // entregue a consumiria sem repassar tarefa nenhuma, e o servidor recusa.
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mockCompras = [
      compra({ item: { id: 'i2', name: 'Carta de Transferência', kind: 'TRANSFER_LETTER' } }),
    ];
    abrir('Pedidos');

    expect(screen.queryByRole('button', { name: 'Marcar como entregue' })).toBeNull();
    // Cancelar com estorno continua valendo: a carta comprada e devolvivel.
    expect(screen.getByRole('button', { name: 'Cancelar e devolver os pontos' })).toBeTruthy();
  });

  it('oferece ao filho usar a carta que ele comprou', () => {
    mockCompras = [
      compra({ item: { id: 'i2', name: 'Carta de Transferência', kind: 'TRANSFER_LETTER' } }),
    ];
    abrir('Minhas compras');
    expect(screen.getByRole('button', { name: 'Usar a carta' })).toBeTruthy();
  });

  it('nao oferece usar uma carta ja usada', () => {
    mockCompras = [
      compra({
        status: 'FULFILLED',
        item: { id: 'i2', name: 'Carta de Transferência', kind: 'TRANSFER_LETTER' },
      }),
    ];
    abrir('Minhas compras');

    expect(screen.queryByRole('button', { name: 'Usar a carta' })).toBeNull();
    expect(screen.getByText('Entregue')).toBeTruthy();
  });
});
