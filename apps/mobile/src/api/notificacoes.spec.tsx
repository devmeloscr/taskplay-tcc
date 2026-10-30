import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { useAberturaPorNotificacao, useRegistroDePush } from './notificacoes';

const mockObterToken = jest.fn();
const mockPrepararCanal = jest.fn().mockResolvedValue(undefined);
const mockRegistrarToken = jest.fn().mockResolvedValue(undefined);
const mockUltimaResposta = jest.fn().mockResolvedValue(null);
const mockRemover = jest.fn();
let ouvinte: ((resposta: unknown) => void) | null = null;

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: () => mockUltimaResposta(),
  addNotificationResponseReceivedListener: (fn: (resposta: unknown) => void) => {
    ouvinte = fn;
    return { remove: mockRemover };
  },
}));

jest.mock('./push', () => ({
  obterTokenDePush: () => mockObterToken(),
  prepararCanalDoAndroid: () => mockPrepararCanal(),
}));

jest.mock('./cliente', () => ({
  apiNotificacoes: { registrarToken: (...args: unknown[]) => mockRegistrarToken(...args) },
}));

let mockSessao: {
  accessToken: string | null;
  perfilAtivo: { id: string; nome: string; papel: 'PARENT' | 'CHILD' } | null;
};
jest.mock('../auth/sessao', () => ({ useSessao: () => mockSessao }));

function Registro() {
  useRegistroDePush();
  return <Text>tela</Text>;
}

function Abertura({ irParaTarefa }: { irParaTarefa: (id: string) => void }) {
  useAberturaPorNotificacao(irParaTarefa);
  return <Text>tela</Text>;
}

/** Uma resposta de toque, como o Expo a entrega. */
function resposta(identifier: string, data: Record<string, unknown>) {
  return { notification: { request: { identifier, content: { data } } } };
}

describe('registro do token de push', () => {
  beforeEach(() => {
    [mockObterToken, mockRegistrarToken, mockPrepararCanal].forEach((m) => m.mockClear());
    mockObterToken.mockResolvedValue('ExponentPushToken[abc123]');
    mockSessao = {
      accessToken: 'token-de-acesso',
      perfilAtivo: { id: 'pedro', nome: 'Pedro', papel: 'CHILD' },
    };
  });

  it('registra o token com o access token, sem mandar o aparelho no corpo', async () => {
    // O aparelho vem do `did` gravado no token. Ninguem cadastra push num
    // aparelho que nao esta usando, e nao ha campo por onde pedir isso.
    render(<Registro />);
    await waitFor(() =>
      expect(mockRegistrarToken).toHaveBeenCalledWith(
        'token-de-acesso',
        'ExponentPushToken[abc123]',
      ),
    );
  });

  it('nao registra antes de haver perfil ativo', () => {
    // A rota exige access token, e ele so existe depois da selecao do perfil.
    mockSessao = { accessToken: null, perfilAtivo: null };
    render(<Registro />);
    expect(mockObterToken).not.toHaveBeenCalled();
  });

  it('nao manda nada quando nao ha token: emulador e navegador nao tem push', async () => {
    mockObterToken.mockResolvedValue(null);
    render(<Registro />);
    await waitFor(() => expect(mockObterToken).toHaveBeenCalled());
    expect(mockRegistrarToken).not.toHaveBeenCalled();
  });

  it('falha em silencio quando a permissao e negada', async () => {
    mockObterToken.mockRejectedValue(new Error('permissao negada'));
    const tela = render(<Registro />);
    await waitFor(() => expect(mockObterToken).toHaveBeenCalled());
    expect(tela.getByText('tela')).toBeTruthy();
  });
});

describe('abertura pela notificacao', () => {
  beforeEach(() => {
    ouvinte = null;
    mockUltimaResposta.mockReset().mockResolvedValue(null);
    mockSessao = {
      accessToken: 'token-de-acesso',
      perfilAtivo: { id: 'pedro', nome: 'Pedro', papel: 'CHILD' },
    };
  });

  it('abre a tarefa quando o aplicativo estava FECHADO', async () => {
    // O caso mais comum: a cobranca chega quando ninguem esta com o aplicativo
    // aberto. Sem consultar a ultima resposta, o toque cairia na lista.
    mockUltimaResposta.mockResolvedValue(resposta('n1', { taskId: 't-42' }));
    const irParaTarefa = jest.fn();
    render(<Abertura irParaTarefa={irParaTarefa} />);
    await waitFor(() => expect(irParaTarefa).toHaveBeenCalledWith('t-42'));
  });

  it('abre a tarefa quando o toque chega com o aplicativo em segundo plano', async () => {
    const irParaTarefa = jest.fn();
    render(<Abertura irParaTarefa={irParaTarefa} />);
    await waitFor(() => expect(ouvinte).not.toBeNull());

    ouvinte?.(resposta('n2', { taskId: 't-7' }));
    expect(irParaTarefa).toHaveBeenCalledWith('t-7');
  });

  it('nao abre duas vezes o mesmo toque', async () => {
    // O `getLast` devolve a ultima resposta mesmo depois de o ouvinte ja te-la
    // entregue: sem a marca, a tarefa seria empilhada duas vezes.
    mockUltimaResposta.mockResolvedValue(resposta('n3', { taskId: 't-9' }));
    const irParaTarefa = jest.fn();
    render(<Abertura irParaTarefa={irParaTarefa} />);
    await waitFor(() => expect(irParaTarefa).toHaveBeenCalledTimes(1));

    ouvinte?.(resposta('n3', { taskId: 't-9' }));
    expect(irParaTarefa).toHaveBeenCalledTimes(1);
  });

  it('ignora uma notificacao sem taskId', async () => {
    // Nem toda notificacao tem tarefa: o aviso de compra entregue nao tem para
    // onde levar, e navegar para lugar nenhum seria pior que nao navegar.
    mockUltimaResposta.mockResolvedValue(resposta('n4', { type: 'STORE_PURCHASE' }));
    const irParaTarefa = jest.fn();
    render(<Abertura irParaTarefa={irParaTarefa} />);
    await waitFor(() => expect(mockUltimaResposta).toHaveBeenCalled());
    expect(irParaTarefa).not.toHaveBeenCalled();
  });

  it('nao escuta enquanto nao ha perfil ativo', () => {
    // Sem perfil nao ha tela de tarefa montada para receber a navegacao.
    mockSessao = { accessToken: null, perfilAtivo: null };
    render(<Abertura irParaTarefa={jest.fn()} />);
    expect(ouvinte).toBeNull();
  });
});
