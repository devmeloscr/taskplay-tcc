import React from 'react';
import { Text } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react-native';
import { useTarefas } from './consultas';

const mockListar = jest.fn();
let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };

jest.mock('./cliente', () => {
  const real = jest.requireActual('./cliente');
  return { ...real, apiTarefas: { listar: (...args: unknown[]) => mockListar(...args) } };
});

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ perfilAtivo: mockPerfil, accessToken: 'token-de-teste' }),
}));

const cliente = new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
});

function Sonda() {
  const { data, isPending } = useTarefas();
  if (isPending) return <Text>carregando</Text>;
  return (
    <>
      {(data ?? []).map((tarefa) => (
        <Text key={tarefa.id}>{tarefa.title}</Text>
      ))}
    </>
  );
}

function montar() {
  return render(
    <QueryClientProvider client={cliente}>
      <Sonda />
    </QueryClientProvider>,
  );
}

describe('chave de cache por perfil', () => {
  beforeEach(() => {
    mockListar.mockReset();
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'CHILD' };
  });

  // Limpo entre os testes, e nao entre as montagens: cada teste faz as duas
  // montagens que interessam sobre o MESMO cache, que e a condicao de producao.
  afterEach(() => cliente.clear());

  it('nao entrega a tarefa de um perfil na tela do outro', async () => {
    mockListar.mockResolvedValue([{ id: 't1', title: 'Arrumar a cama da Ana' }]);
    const primeira = montar();
    expect(await screen.findByText('Arrumar a cama da Ana')).toBeTruthy();
    primeira.unmount();

    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
    mockListar.mockReturnValue(new Promise(() => undefined));
    montar();

    expect(screen.getByText('carregando')).toBeTruthy();
    expect(screen.queryByText('Arrumar a cama da Ana')).toBeNull();
  });

  it('reaproveita o cache do MESMO perfil, sem nova requisicao', async () => {
    // A contrapartida: prefixar por perfil nao pode custar uma requisicao a
    // cada montagem, senao trocar de aba viraria espera.
    mockListar.mockResolvedValue([{ id: 't9', title: 'Lavar a louca' }]);
    const primeira = montar();
    expect(await screen.findByText('Lavar a louca')).toBeTruthy();
    primeira.unmount();

    montar();
    expect(screen.getByText('Lavar a louca')).toBeTruthy();
    await waitFor(() => expect(mockListar).toHaveBeenCalledTimes(1));
  });
});
