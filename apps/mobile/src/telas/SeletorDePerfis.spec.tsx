import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SeletorDePerfis } from './SeletorDePerfis';
import type { Perfil } from '../api/cliente';

const mockListarPerfis = jest.fn();
const mockSelecionarPerfil = jest.fn();

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({
    listarPerfis: mockListarPerfis,
    selecionarPerfil: mockSelecionarPerfil,
  }),
}));

const PAI: Perfil = { id: 'p1', name: 'Ana', role: 'PARENT', requiresPin: true };
const FILHO: Perfil = { id: 'p2', name: 'Pedro', role: 'CHILD', requiresPin: false };
const FILHA_COM_PIN: Perfil = { id: 'p3', name: 'Julia', role: 'CHILD', requiresPin: true };

const cliente = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
});

afterEach(() => {
  cliente.clear();
});

function montar() {
  return render(
    <QueryClientProvider client={cliente}>
      <SeletorDePerfis />
    </QueryClientProvider>,
  );
}

describe('SeletorDePerfis', () => {
  beforeEach(() => {
    mockListarPerfis.mockReset().mockResolvedValue([PAI, FILHO, FILHA_COM_PIN]);
    mockSelecionarPerfil.mockReset().mockResolvedValue(undefined);
  });

  it('nao mostra formulario de login num aparelho conhecido', async () => {
    montar();
    await waitFor(() => expect(screen.getByText('Quem está usando?')).toBeTruthy());
    expect(screen.queryByLabelText('E-mail')).toBeNull();
    expect(screen.queryByLabelText('Senha')).toBeNull();
  });

  it('entra num toque quando o filho nao tem PIN', async () => {
    // Atrito assimetrico: o adversario aqui e o irmao, nao a internet, e atrito
    // neste ponto custa dado de pesquisa.
    montar();
    await waitFor(() => screen.getByLabelText('Entrar como Pedro'));

    fireEvent.press(screen.getByLabelText('Entrar como Pedro'));

    await waitFor(() => expect(mockSelecionarPerfil).toHaveBeenCalledWith('p2', undefined));
  });

  it('pede o PIN antes de entrar no perfil do responsavel', async () => {
    montar();
    await waitFor(() => screen.getByLabelText('Entrar como Ana'));

    fireEvent.press(screen.getByLabelText('Entrar como Ana'));

    await waitFor(() => expect(screen.getByText('PIN de Ana')).toBeTruthy());
    // Nada foi enviado ainda: a tela apenas coleta.
    expect(mockSelecionarPerfil).not.toHaveBeenCalled();
  });

  it('envia o PIN ao servidor, sem conferi-lo na tela', async () => {
    // Um `if` aqui seria contornavel por quem tem o aparelho na mao - que e
    // exatamente o adversario previsto. Quem decide e o servidor.
    montar();
    await waitFor(() => screen.getByLabelText('Entrar como Ana'));
    fireEvent.press(screen.getByLabelText('Entrar como Ana'));
    await waitFor(() => screen.getByText('PIN de Ana'));

    for (const digito of ['4', '8', '2', '1']) {
      fireEvent.press(screen.getByLabelText(digito));
    }

    await waitFor(() => expect(mockSelecionarPerfil).toHaveBeenCalledWith('p1', '4821'));
  });

  it('pede PIN de filho quando o responsavel definiu um', async () => {
    montar();
    await waitFor(() => screen.getByLabelText('Entrar como Julia'));

    fireEvent.press(screen.getByLabelText('Entrar como Julia'));

    await waitFor(() => expect(screen.getByText('PIN de Julia')).toBeTruthy());
  });

  it('avisa quem exige PIN antes do toque', async () => {
    // A dica evita o toque que leva a uma tela inesperada. E dica de interface,
    // e nao controle: o servidor exige o PIN de novo.
    montar();
    await waitFor(() => screen.getByLabelText('Entrar como Pedro'));

    expect(screen.getByLabelText('Entrar como Pedro').props.accessibilityHint).toContain(
      'Entra direto',
    );
    expect(screen.getByLabelText('Entrar como Ana').props.accessibilityHint).toContain('PIN');
  });

  it('mostra o erro do servidor sem repetir o PIN digitado', async () => {
    mockSelecionarPerfil.mockRejectedValue(new Error('PIN inválido'));
    montar();
    await waitFor(() => screen.getByLabelText('Entrar como Ana'));
    fireEvent.press(screen.getByLabelText('Entrar como Ana'));
    await waitFor(() => screen.getByText('PIN de Ana'));

    for (const digito of ['0', '0', '0', '0']) {
      fireEvent.press(screen.getByLabelText(digito));
    }

    await waitFor(() => expect(screen.getByText('PIN inválido')).toBeTruthy());
    expect(screen.queryByText('0000')).toBeNull();
  });

  it('oferece nova tentativa quando a rede falha', async () => {
    // Tela vazia por falha de rede e o que faz uma crianca de 6 anos desistir.
    mockListarPerfis.mockRejectedValue(new Error('sem rede'));
    montar();

    await waitFor(() =>
      expect(screen.getByText('Não conseguimos falar com o TaskPlay agora.')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Tentar de novo')).toBeTruthy();
  });
});
