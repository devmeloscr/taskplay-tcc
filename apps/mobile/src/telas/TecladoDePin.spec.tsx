import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';
import { ALTURA_DA_MENSAGEM, TecladoDePin } from './TecladoDePin';

function montar(erro: string | null) {
  const aoConfirmar = jest.fn();
  render(
    <TecladoDePin
      nome="Ana"
      erro={erro}
      ocupado={false}
      aoConfirmar={aoConfirmar}
      aoCancelar={jest.fn()}
    />,
  );
  return { aoConfirmar };
}

function alturaDoEspacoDaMensagem() {
  const espaco = screen.getByTestId('espaco-da-mensagem');
  const estilo = Array.isArray(espaco.props.style)
    ? Object.assign({}, ...espaco.props.style)
    : espaco.props.style;
  return estilo.height;
}

describe('TecladoDePin', () => {
  it('reserva a altura da mensagem antes de haver erro', () => {
    // Sem a reserva o espaco valeria zero aqui e passaria a valer a altura da
    // frase depois - que e exatamente o deslocamento a evitar.
    montar(null);
    expect(alturaDoEspacoDaMensagem()).toBe(ALTURA_DA_MENSAGEM);
  });

  it('mantem a mesma altura quando o erro aparece', () => {
    montar('PIN inválido');
    expect(alturaDoEspacoDaMensagem()).toBe(ALTURA_DA_MENSAGEM);
    expect(screen.getByText('PIN inválido')).toBeTruthy();
  });

  it('monta a mensagem so quando ha erro, para o leitor de tela anuncia-la', () => {
    // O espaco e permanente; a frase nao. Deixa-la sempre montada e apenas
    // vazia trocaria um defeito visual por um defeito de acessibilidade.
    montar(null);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('envia sozinho ao completar quatro digitos', () => {
    const { aoConfirmar } = montar(null);
    for (const digito of ['1', '2', '3', '4']) {
      fireEvent.press(screen.getByLabelText(digito));
    }
    expect(aoConfirmar).toHaveBeenCalledWith('1234');
  });
});
