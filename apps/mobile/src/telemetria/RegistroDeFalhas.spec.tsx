import React from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { ErroDaApi } from '../api/cliente';
import { RegistroDeFalhas } from './RegistroDeFalhas';

const mockRegistrar = jest.fn();

jest.mock('./useTelemetria', () => ({
  useTelemetria: () => ({ registrar: mockRegistrar }),
}));

function Consulta({ erro }: { erro: unknown }) {
  const { isError } = useQuery({
    queryKey: ['qualquer'],
    queryFn: () => Promise.reject(erro),
    retry: false,
  });
  return <Text>{isError ? 'falhou' : 'carregando'}</Text>;
}

function montar(erro: unknown) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <RegistroDeFalhas />
      <Consulta erro={erro} />
    </QueryClientProvider>,
  );
}

describe('RegistroDeFalhas', () => {
  beforeEach(() => mockRegistrar.mockReset());

  it('registra a falha de uma consulta sem a tela precisar pedir', async () => {
    montar(
      new ErroDaApi(500, 'Erro 500', undefined, {
        caminho: '/tasks',
        metodo: 'GET',
        requestId: '3f1a6f6c-2b9d-4c0e-9a4e-1a2b3c4d5e6f',
      }),
    );

    await screen.findByText('falhou');
    await waitFor(() =>
      expect(mockRegistrar).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'app.failed', origin: 'api', status: 500 }),
      ),
    );
  });

  it('nao registra o 401 que a renovacao resolve sozinha', async () => {
    montar(new ErroDaApi(401, 'Token inválido ou expirado'));

    await screen.findByText('falhou');
    expect(mockRegistrar).not.toHaveBeenCalled();
  });
});
