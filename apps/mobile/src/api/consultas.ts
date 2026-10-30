import { useCallback, useEffect } from 'react';
import { useQueryClient, useMutation, useQuery, type QueryKey } from '@tanstack/react-query';
import { useSessao } from '../auth/sessao';
import type { TcleDocument } from '@taskplay/shared-types';
import {
  api,
  apiCarteira,
  apiFamilia,
  apiLoja,
  apiNotificacoes,
  apiTarefas,
  ErroDaApi,
  type Aviso,
  type Compra,
  type EntradaDoHistorico,
  type Extrato,
  type ItemDaLoja,
  type Membro,
  type MembroGerenciado,
  type StatusDaTarefa,
  type Tarefa,
} from './cliente';

function useChave() {
  const { perfilAtivo } = useSessao();
  return (...partes: readonly unknown[]): QueryKey => ['perfil', perfilAtivo?.id, ...partes];
}

function useToken(): string {
  const { accessToken } = useSessao();
  if (!accessToken) throw new ErroDaApi(401, 'Sessão expirada; escolha o perfil de novo');
  return accessToken;
}

export function useTermo(ativo = true) {
  return useQuery<TcleDocument>({
    queryKey: ['tcle'],
    queryFn: api.termo,
    enabled: ativo,
    staleTime: 0,
  });
}

export function useTarefas(status?: StatusDaTarefa) {
  const token = useToken();
  const chave = useChave();
  return useQuery<Tarefa[]>({
    queryKey: chave('tarefas', status ?? 'todas'),
    queryFn: () => apiTarefas.listar(token, status),
  });
}

export function useTarefa(id: string | null) {
  const token = useToken();
  const chave = useChave();
  return useQuery<Tarefa>({
    queryKey: chave('tarefa', id),
    enabled: id !== null,
    queryFn: () => apiTarefas.obter(token, id as string),
  });
}

export function useMembros() {
  const token = useToken();
  const chave = useChave();
  return useQuery<Membro[]>({
    queryKey: chave('membros'),
    staleTime: 5 * 60_000,
    queryFn: () => apiFamilia.membros(token),
  });
}

export function useCriarMembro() {
  const token = useToken();
  const invalidar = useInvalidarFamilia();
  return useMutation({
    mutationFn: (dados: Parameters<typeof apiFamilia.criarMembro>[1]) =>
      apiFamilia.criarMembro(token, dados),
    onSuccess: invalidar,
  });
}

export function useMembrosGerenciados() {
  const token = useToken();
  const chave = useChave();
  return useQuery<MembroGerenciado[]>({
    queryKey: chave('membros', 'gerenciados'),
    queryFn: () => apiFamilia.gerenciados(token),
  });
}

/** Historico de administracao da familia. So o responsavel alcanca a rota. */
export function useHistoricoDaFamilia() {
  const token = useToken();
  const chave = useChave();
  return useQuery<EntradaDoHistorico[]>({
    queryKey: chave('historico'),
    queryFn: () => apiFamilia.historico(token),
  });
}

export function useAvisos() {
  const token = useToken();
  const chave = useChave();
  return useQuery<Aviso[]>({
    queryKey: chave('avisos'),
    queryFn: () => apiNotificacoes.listar(token),
  });
}

export function useRecarregarAvisos() {
  const cliente = useQueryClient();
  const { perfilAtivo } = useSessao();
  const perfilId = perfilAtivo?.id;
  return useCallback(
    () => cliente.invalidateQueries({ queryKey: ['perfil', perfilId, 'avisos'] }),
    [cliente, perfilId],
  );
}

export function useMarcarAvisoLido() {
  const token = useToken();
  const recarregar = useRecarregarAvisos();
  return useMutation({
    mutationFn: (id: string) => apiNotificacoes.marcarLido(token, id),
    onSuccess: recarregar,
  });
}

export function useMarcarTodosLidos() {
  const token = useToken();
  const recarregar = useRecarregarAvisos();
  return useMutation({
    mutationFn: () => apiNotificacoes.marcarTodosLidos(token),
    onSuccess: recarregar,
  });
}

function useInvalidarFamilia() {
  const cliente = useQueryClient();
  const chave = useChave();
  return () => {
    cliente.invalidateQueries({ queryKey: chave('membros') });
    cliente.invalidateQueries({ queryKey: chave('historico') });
  };
}

export function useAtualizarMembro() {
  const token = useToken();
  const invalidar = useInvalidarFamilia();
  return useMutation({
    mutationFn: ({ id, ...corpo }: { id: string } & Parameters<typeof apiFamilia.atualizarMembro>[2]) =>
      apiFamilia.atualizarMembro(token, id, corpo),
    onSuccess: invalidar,
  });
}

export function useRemoverMembro() {
  const token = useToken();
  const invalidar = useInvalidarFamilia();
  return useMutation({
    mutationFn: (id: string) => apiFamilia.removerMembro(token, id),
    onSuccess: invalidar,
  });
}

export function useRestaurarMembro() {
  const token = useToken();
  const invalidar = useInvalidarFamilia();
  return useMutation({
    mutationFn: (id: string) => apiFamilia.restaurarMembro(token, id),
    onSuccess: invalidar,
  });
}

export function useGerarConvite() {
  const token = useToken();
  return useMutation({
    mutationFn: (id: string) => apiFamilia.gerarConvite(token, id),
  });
}

function useInvalidar() {
  const cliente = useQueryClient();
  const chave = useChave();
  return () => {
    cliente.invalidateQueries({ queryKey: chave('tarefas') });
    cliente.invalidateQueries({ queryKey: chave('tarefa') });
    cliente.invalidateQueries({ queryKey: chave('carteira') });
    cliente.invalidateQueries({ queryKey: chave('compras') });
    cliente.invalidateQueries({ queryKey: chave('avisos') });
  };
}

export function useCriarTarefa() {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: Parameters<typeof apiTarefas.criar>[1]) => apiTarefas.criar(token, dados),
    onSuccess: invalidar,
  });
}

export function useAtualizarTarefa() {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: ({ id, ...corpo }: { id: string } & Parameters<typeof apiTarefas.atualizar>[2]) =>
      apiTarefas.atualizar(token, id, corpo),
    onSuccess: invalidar,
  });
}

export function useConcluirTarefa(id: string) {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: Parameters<typeof apiTarefas.concluir>[2]) =>
      apiTarefas.concluir(token, id, dados),
    onSuccess: invalidar,
  });
}

export function useVerificarTarefa(id: string) {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: { decision: 'APPROVED' | 'REJECTED'; comment?: string }) =>
      apiTarefas.verificar(token, id, dados),
    onSuccess: invalidar,
  });
}

export function useCancelarTarefa(id: string) {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: () => apiTarefas.cancelar(token, id),
    onSuccess: invalidar,
  });
}

export function useMinhaCarteira() {
  const token = useToken();
  const chave = useChave();
  return useQuery<Extrato>({
    queryKey: chave('carteira', 'minha'),
    queryFn: () => apiCarteira.minha(token),
  });
}

export function useCarteiraDeMembro(membroId: string | null) {
  const token = useToken();
  const chave = useChave();
  return useQuery<Extrato>({
    queryKey: chave('carteira', 'membro', membroId),
    // Sem membro escolhido nao ha o que consultar. `enabled` evita a requisicao
    // em vez de mandar uma com id vazio e tratar o 400 depois.
    enabled: membroId !== null,
    queryFn: () => apiCarteira.deMembro(token, membroId as string),
  });
}

export function useAjustarSaldo() {
  const token = useToken();
  const cliente = useQueryClient();
  const chave = useChave();
  return useMutation({
    mutationFn: (dados: { userId: string; delta: number; note: string }) =>
      apiCarteira.ajustar(token, dados),
    onSuccess: (_resultado, dados) => {
      cliente.invalidateQueries({ queryKey: chave('carteira', 'membro', dados.userId) });
    },
  });
}

export function useItensDaLoja() {
  const token = useToken();
  const chave = useChave();
  return useQuery<ItemDaLoja[]>({
    queryKey: chave('itens'),
    queryFn: () => apiLoja.itens(token),
  });
}

export function useCompras() {
  const token = useToken();
  const chave = useChave();
  return useQuery<Compra[]>({
    queryKey: chave('compras'),
    queryFn: () => apiLoja.compras(token),
  });
}

export function useComprar() {
  const token = useToken();
  const invalidar = useInvalidar();
  const cliente = useQueryClient();
  const chave = useChave();
  return useMutation({
    mutationFn: (itemId: string) => apiLoja.comprar(token, itemId),
    onSuccess: () => {
      invalidar();
      // O estoque do item cai junto: sem isto o catalogo continuaria anunciando
      // a unidade que acabou de sair.
      cliente.invalidateQueries({ queryKey: chave('itens') });
    },
  });
}

export function useCriarItem() {
  const token = useToken();
  const cliente = useQueryClient();
  const chave = useChave();
  return useMutation({
    mutationFn: (dados: Parameters<typeof apiLoja.criarItem>[1]) => apiLoja.criarItem(token, dados),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chave('itens') }),
  });
}

export function useDesativarItem() {
  const token = useToken();
  const cliente = useQueryClient();
  const chave = useChave();
  return useMutation({
    mutationFn: (itemId: string) => apiLoja.desativarItem(token, itemId),
    onSuccess: () => cliente.invalidateQueries({ queryKey: chave('itens') }),
  });
}

export function useEntregarCompra() {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (compraId: string) => apiLoja.entregar(token, compraId),
    onSuccess: invalidar,
  });
}

export function useCancelarCompra() {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (compraId: string) => apiLoja.cancelarCompra(token, compraId),
    onSuccess: invalidar,
  });
}

export function useUsarCarta() {
  const token = useToken();
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: (dados: { purchaseId: string; taskId: string; toUserId: string }) =>
      apiLoja.usarCarta(token, dados),
    onSuccess: invalidar,
  });
}

export function useLimparCacheAoSair(aparelhoConhecido: boolean) {
  const cliente = useQueryClient();
  useEffect(() => {
    if (!aparelhoConhecido) cliente.clear();
  }, [aparelhoConhecido, cliente]);
}
