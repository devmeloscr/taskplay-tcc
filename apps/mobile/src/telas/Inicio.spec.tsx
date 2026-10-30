import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Inicio } from './Inicio';

const mockSair = jest.fn();
const mockTrocarDePerfil = jest.fn();
let mockPerfilAtivo: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({
    perfilAtivo: mockPerfilAtivo,
    sair: mockSair,
    trocarDePerfil: mockTrocarDePerfil,
  }),
}));

describe('Inicio', () => {
  beforeEach(() => {
    mockSair.mockReset().mockResolvedValue(undefined);
    mockTrocarDePerfil.mockReset();
    mockPerfilAtivo = { id: 'p1', nome: 'Ana', papel: 'PARENT' };
  });

  it('oferece a exclusao da conta ao responsavel', () => {
    render(<Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Excluir a conta' })).toBeTruthy();
  });

  it('deixa o responsavel reler o termo de consentimento', () => {
    // O proprio termo promete a releitura; sem este caminho, a unica chance de
    // le-lo seria a do cadastro.
    const irParaTermo = jest.fn();
    render(
      <Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={irParaTermo} />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Termo de consentimento' }));
    expect(irParaTermo).toHaveBeenCalled();
  });

  it('oferece a gestao dos filhos ao responsavel, e nao ao filho', () => {
    const irParaFilhos = jest.fn();
    render(
      <Inicio irParaExclusao={jest.fn()} irParaFilhos={irParaFilhos} irParaTermo={jest.fn()} />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Gerenciar filhos' }));
    expect(irParaFilhos).toHaveBeenCalled();

    mockPerfilAtivo = { id: 'p2', nome: 'Pedro', papel: 'CHILD' };
    screen.rerender(
      <Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Gerenciar filhos' })).toBeNull();
  });

  it('nao oferece a exclusao a um filho', () => {
    mockPerfilAtivo = { id: 'p2', nome: 'Pedro', papel: 'CHILD' };
    render(<Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Excluir a conta' })).toBeNull();
  });

  it('nao deixa um filho sair do aparelho', () => {
    mockPerfilAtivo = { id: 'p2', nome: 'Pedro', papel: 'CHILD' };
    render(<Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Sair deste aparelho' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Trocar de perfil' })).toBeTruthy();
  });

  it('diz ao filho a quem pedir o que a tela nao oferece', () => {
    // Botao unico sem explicacao parece defeito ou punicao. A frase diz o que o
    // toque faz e onde mora a saida que nao esta aqui.
    mockPerfilAtivo = { id: 'p2', nome: 'Pedro', papel: 'CHILD' };
    render(<Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />);

    expect(screen.getByText(/peça ao responsável/i)).toBeTruthy();
  });

  it('leva o filho de volta a tela de escolha, sem tocar na sessao do aparelho', () => {
    mockPerfilAtivo = { id: 'p2', nome: 'Pedro', papel: 'CHILD' };
    render(<Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Trocar de perfil' }));

    expect(mockTrocarDePerfil).toHaveBeenCalled();
    expect(mockSair).not.toHaveBeenCalled();
  });

  it('separa trocar de perfil de sair do aparelho', async () => {
    render(<Inicio irParaExclusao={jest.fn()} irParaFilhos={jest.fn()} irParaTermo={jest.fn()} />);

    fireEvent.press(screen.getByRole('button', { name: 'Trocar de perfil' }));
    expect(mockTrocarDePerfil).toHaveBeenCalled();
    expect(mockSair).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Sair deste aparelho' }));
    await waitFor(() => expect(mockSair).toHaveBeenCalled());
  });
});
