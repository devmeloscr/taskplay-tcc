import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { EditarFilho } from './EditarFilho';

const mockAtualizar = jest.fn();
let mockMembros: { data?: unknown[]; isPending: boolean; isError: boolean };

jest.mock('../api/consultas', () => ({
  useMembrosGerenciados: () => mockMembros,
  useAtualizarMembro: () => ({ mutate: mockAtualizar, isPending: false, isError: false }),
}));

const FILHO = {
  id: 'f1',
  name: 'Pedrinho',
  role: 'CHILD' as const,
  birthDate: '2016-04-02',
  hasPin: false,
  deactivatedAt: null,
};

function montar(membro: Partial<typeof FILHO> = {}) {
  mockMembros = { data: [{ ...FILHO, ...membro }], isPending: false, isError: false };
  return render(<EditarFilho id="f1" voltar={jest.fn()} />);
}

/** O corpo enviado a API na ultima chamada. */
function corpoEnviado() {
  return mockAtualizar.mock.calls[0][0];
}

describe('EditarFilho', () => {
  beforeEach(() => {
    mockAtualizar.mockReset();
  });

  it('não envia campo nenhum quando nada foi mexido', () => {
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(mockAtualizar).not.toHaveBeenCalled();
  });

  it('envia só o campo alterado', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Pedro');
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    expect(corpoEnviado()).toEqual({ id: 'f1', name: 'Pedro' });
  });

  it('abre a data no formato de quem digita, sem escorregar de fuso', () => {
    montar();
    expect(screen.getByLabelText(/Data de nascimento/).props.value).toBe('02/04/2016');

    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
    expect(mockAtualizar).not.toHaveBeenCalled();
  });

  it('apaga a data de nascimento com o campo em branco', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText(/Data de nascimento/), '');
    fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

    // `null`, e nao `undefined`: `undefined` mantem o que esta gravado, e a
    // data digitada errada nunca sairia do perfil.
    expect(corpoEnviado()).toEqual({ id: 'f1', birthDate: null });
  });

  describe('PIN', () => {
    // A garantia que sustenta o historico: salvar o nome nao pode registrar uma
    // troca de PIN que ninguem pediu.
    it('não manda PIN quando o responsável não mexeu nele', () => {
      montar({ hasPin: true });
      fireEvent.changeText(screen.getByLabelText('Nome'), 'Pedro');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(corpoEnviado()).not.toHaveProperty('pin');
    });

    it('define o PIN digitado', () => {
      montar();
      fireEvent.changeText(screen.getByLabelText(/PIN/), '1234');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(corpoEnviado()).toEqual({ id: 'f1', pin: '1234' });
    });

    it('recusa o PIN incompleto antes da rede', () => {
      montar();
      fireEvent.changeText(screen.getByLabelText(/PIN/), '12');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));

      expect(mockAtualizar).not.toHaveBeenCalled();
      expect(screen.getByText('O PIN deve ter exatamente 4 dígitos')).toBeTruthy();
    });

    it('tira o PIN com null, e diz antes o que vai acontecer', () => {
      montar({ hasPin: true });
      fireEvent.press(screen.getByRole('button', { name: 'Tirar o PIN' }));

      // O estado escolhido fica dito na tela: quem toca e sai para outro campo
      // precisa ver o que acontece ao salvar.
      expect(screen.getByText(/o PIN de Pedrinho será removido/i)).toBeTruthy();

      fireEvent.press(screen.getByRole('button', { name: 'Salvar' }));
      expect(corpoEnviado()).toEqual({ id: 'f1', pin: null });
    });

    it('não mostra o PIN atual, porque o sistema não o tem', () => {
      montar({ hasPin: true });
      expect(screen.getByLabelText(/^Novo PIN/).props.value).toBe('');
    });
  });

  it('avisa quando o perfil sumiu da família em outro aparelho', () => {
    mockMembros = { data: [], isPending: false, isError: false };
    render(<EditarFilho id="f1" voltar={jest.fn()} />);

    expect(screen.getByText('Perfil não encontrado')).toBeTruthy();
  });
});
