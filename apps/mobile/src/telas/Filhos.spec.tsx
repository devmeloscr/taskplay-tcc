import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Filhos } from './Filhos';

const mockRemover = jest.fn();
const mockRestaurar = jest.fn();
const mockIrParaConvite = jest.fn();
let mockLista: { data?: unknown[]; isPending: boolean; isError: boolean };

jest.mock('../api/consultas', () => ({
  useMembrosGerenciados: () => mockLista,
  useRemoverMembro: () => ({ mutate: mockRemover, isPending: false, isError: false }),
  useRestaurarMembro: () => ({ mutate: mockRestaurar, isPending: false, isError: false }),
}));

const RESPONSAVEL = {
  id: 'r1',
  name: 'Ana',
  role: 'PARENT' as const,
  birthDate: null,
  hasPin: true,
  deactivatedAt: null,
};

const FILHO = {
  id: 'f1',
  name: 'Pedro',
  role: 'CHILD' as const,
  birthDate: '2016-04-02',
  hasPin: false,
  deactivatedAt: null,
};

function montar(membros: unknown[] = [RESPONSAVEL, FILHO]) {
  mockLista = { data: membros, isPending: false, isError: false };
  return render(
    <Filhos
      irParaNovoMembro={jest.fn()}
      irParaEdicao={jest.fn()}
      irParaHistorico={jest.fn()}
      irParaConvite={mockIrParaConvite}
    />,
  );
}

describe('Filhos', () => {
  beforeEach(() => {
    mockRemover.mockReset();
    mockRestaurar.mockReset();
    mockIrParaConvite.mockReset();
  });

  // O codigo de convite e o unico caminho para o celular proprio de um filho,
  // e o botao vive na linha dele porque o codigo e gerado para UM perfil.
  it('leva ao convite do filho tocado', () => {
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Vincular celular próprio' }));

    expect(mockIrParaConvite).toHaveBeenCalledWith('f1');
  });

  // O servidor recusa gerar codigo para quem saiu da familia; oferecer o botao
  // seria prometer uma acao que so termina em recusa.
  it('não oferece o convite a quem saiu da família', () => {
    montar([RESPONSAVEL, { ...FILHO, deactivatedAt: '2026-09-01T12:00:00.000Z' }]);

    expect(screen.queryByRole('button', { name: 'Vincular celular próprio' })).toBeNull();
  });

  // Nenhuma acao da tela se aplica ao responsavel, e o servidor recusa todas
  // elas. Uma linha que so existisse para recusar toque seria promessa falsa.
  it('não lista o responsável entre os perfis geríveis', () => {
    montar();

    expect(screen.getByText('Pedro')).toBeTruthy();
    expect(screen.queryByText('Ana')).toBeNull();
  });

  it('pede confirmação antes de remover, dizendo o que fica e o que sai', () => {
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Remover da família' }));

    expect(mockRemover).not.toHaveBeenCalled();
    expect(screen.getByText(/as tarefas e os pontos continuam guardados/i)).toBeTruthy();

    fireEvent.press(screen.getByRole('button', { name: 'Remover Pedro' }));
    expect(mockRemover.mock.calls[0][0]).toBe('f1');
  });

  it('desiste da remoção ao cancelar', () => {
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Remover da família' }));
    fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }));

    expect(mockRemover).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Editar' })).toBeTruthy();
  });

  // Esconder quem saiu faria da remocao uma porta de mao unica: quem tocou no
  // botao errado nao teria caminho de volta dentro do aplicativo.
  it('mostra quem saiu da família, com o caminho de volta', () => {
    montar([{ ...FILHO, deactivatedAt: '2026-09-01T12:00:00.000Z' }]);

    expect(screen.getByText('Fora da família')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Devolver à família' }));
    expect(mockRestaurar.mock.calls[0][0]).toBe('f1');
  });

  it('não oferece remover quem já saiu', () => {
    montar([{ ...FILHO, deactivatedAt: '2026-09-01T12:00:00.000Z' }]);

    expect(screen.queryByRole('button', { name: 'Remover da família' })).toBeNull();
  });

  it('leva ao cadastro quando ainda não há filho nenhum', () => {
    const irParaNovoMembro = jest.fn();
    mockLista = { data: [RESPONSAVEL], isPending: false, isError: false };
    render(
      <Filhos
        irParaNovoMembro={irParaNovoMembro}
        irParaEdicao={jest.fn()}
        irParaConvite={jest.fn()}
        irParaHistorico={jest.fn()}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar filho' }));
    expect(irParaNovoMembro).toHaveBeenCalled();
  });

  it('diz se o filho tem PIN, sem oferecer o valor', () => {
    montar([RESPONSAVEL, { ...FILHO, hasPin: true }]);
    expect(screen.getByText(/Com PIN/)).toBeTruthy();
  });
});
