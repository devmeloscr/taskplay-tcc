import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NovoMembro } from './NovoMembro';

const mockCriar = jest.fn();

jest.mock('../api/consultas', () => ({
  useCriarMembro: () => ({ mutate: mockCriar, isPending: false, isError: false }),
}));

function montar() {
  return render(<NovoMembro voltar={jest.fn()} />);
}

/** Faz a mutacao responder como sucesso, com o membro que a API devolveria. */
function respondeCom(nome: string) {
  mockCriar.mockImplementation((_dados, opcoes) =>
    opcoes.onSuccess({ id: 'novo', name: nome, role: 'CHILD', birthDate: null }),
  );
}

describe('NovoMembro', () => {
  beforeEach(() => {
    mockCriar.mockReset();
  });

  it('nao pede e-mail nem senha do filho', () => {
    montar();
    expect(screen.queryByLabelText(/E-mail/)).toBeNull();
    expect(screen.queryByLabelText(/Senha/)).toBeNull();
    expect(screen.queryByLabelText(/PIN/)).toBeNull();
  });

  it('recusa o nome vazio antes da rede', () => {
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar' }));
    expect(mockCriar).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o nome do filho')).toBeTruthy();
  });

  it('cadastra so com o nome: a data de nascimento e opcional', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('Nome'), '  Pedro  ');
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(mockCriar).toHaveBeenCalledTimes(1);
    // Sem `birthDate` no corpo, e nao com string vazia: o contrato o quer
    // ausente, e `''` seria recusado pelo formato ISO.
    expect(mockCriar.mock.calls[0][0]).toEqual({ name: 'Pedro', birthDate: undefined });
  });

  it('converte a data digitada em DD/MM/AAAA para o ISO do contrato', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Pedro');
    fireEvent.changeText(screen.getByLabelText(/Data de nascimento/), '02/04/2016');
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(mockCriar.mock.calls[0][0]).toEqual({ name: 'Pedro', birthDate: '2016-04-02' });
  });

  it('poe as barras sozinha, porque o teclado numerico nao tem a tecla "/"', () => {
    montar();
    const campo = screen.getByLabelText(/Data de nascimento/);
    fireEvent.changeText(campo, '02042016');
    expect(campo.props.value).toBe('02/04/2016');
  });

  it('aceita a data digitada so com digitos', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Pedro');
    fireEvent.changeText(screen.getByLabelText(/Data de nascimento/), '02042016');
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(mockCriar.mock.calls[0][0]).toEqual({ name: 'Pedro', birthDate: '2016-04-02' });
  });

  it('recusa uma data impossivel sem gastar requisicao', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Pedro');
    fireEvent.changeText(screen.getByLabelText(/Data de nascimento/), '31/02/2016');
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(mockCriar).not.toHaveBeenCalled();
    expect(screen.getByText('Essa data não existe no calendário')).toBeTruthy();
  });

  it('continua no formulario depois de cadastrar, nomeando quem entrou', () => {
    respondeCom('Pedro');
    montar();
    fireEvent.changeText(screen.getByLabelText('Nome'), 'Pedro');
    fireEvent.press(screen.getByRole('button', { name: 'Cadastrar' }));

    expect(screen.getByText(/Pedro já aparece no seletor de perfis/)).toBeTruthy();
    expect(screen.getByLabelText('Nome').props.value).toBe('');
  });
});
