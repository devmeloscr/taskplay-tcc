import { File, UploadType } from 'expo-file-system';
import { uuid } from 'expo-modules-core';
import type { RegisterRequest, TaskScoring, TcleDocument } from '@taskplay/shared-types';

const BASE = process.env['EXPO_PUBLIC_API_URL'] ?? 'http://localhost:3000/api';

const LIMITE_DA_RESPOSTA_CRUA = 300;

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
    readonly corpo?: unknown,
    readonly detalhe?: {
      respostaCrua?: string;
      requestId?: string;
      caminho?: string;
      metodo?: string;
      comArquivo?: boolean;
    },
  ) {
    super(mensagem);
    this.name = 'ErroDaApi';
  }
}

export class ErroDeTransporte extends Error {
  constructor(
    readonly causa: unknown,
    /** Onde a falha aconteceu, para o registro nao precisar adivinhar. */
    readonly contexto: {
      metodo: string;
      caminho: string;
      comArquivo: boolean;
      requestId?: string;
    },
  ) {
    super(causa instanceof Error ? causa.message : String(causa));
    this.name = 'ErroDeTransporte';
    this.cause = causa;
  }
}

export interface Opcoes {
  metodo?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  corpo?: unknown;
  accessToken?: string | null;
  arquivo?: { campo: string; uri: string; tipo: string };
}

/** O que os dois transportes devolvem, para o tratamento da resposta ser um so. */
interface RespostaCrua {
  status: number;
  texto: string;
}

export async function chamar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  const requestId = uuid.v4();
  const cabecalhos: Record<string, string> = {
    accept: 'application/json',
    'x-request-id': requestId,
  };
  if (opcoes.accessToken) {
    cabecalhos['authorization'] = `Bearer ${opcoes.accessToken}`;
  }

  let resposta: RespostaCrua;
  try {
    resposta = opcoes.arquivo
      ? await enviarComArquivo(caminho, opcoes, opcoes.arquivo, cabecalhos)
      : await enviarJson(caminho, opcoes, cabecalhos);
  } catch (causa) {
    throw new ErroDeTransporte(causa, {
      metodo: opcoes.metodo ?? 'GET',
      caminho,
      comArquivo: opcoes.arquivo !== undefined,
      requestId,
    });
  }

  const { status, texto } = resposta;

  if (status === 204) {
    return undefined as T;
  }

  let dados: unknown;
  try {
    dados = texto ? JSON.parse(texto) : undefined;
  } catch {
    throw new ErroDaApi(status, `Resposta ilegível do servidor (HTTP ${status})`, undefined, {
      respostaCrua: texto.slice(0, LIMITE_DA_RESPOSTA_CRUA),
      requestId,
      caminho,
      metodo: opcoes.metodo ?? 'GET',
    });
  }

  if (status < 200 || status >= 300) {
    throw new ErroDaApi(status, mensagemDoErro(status, dados), dados, {
      requestId,
      caminho,
      metodo: opcoes.metodo ?? 'GET',
      comArquivo: opcoes.arquivo !== undefined,
    });
  }

  return dados as T;
}

async function enviarJson(
  caminho: string,
  opcoes: Opcoes,
  cabecalhos: Record<string, string>,
): Promise<RespostaCrua> {
  let body: string | undefined;
  if (opcoes.corpo !== undefined) {
    cabecalhos['content-type'] = 'application/json';
    body = JSON.stringify(opcoes.corpo);
  }

  const resposta = await fetch(`${BASE}${caminho}`, {
    method: opcoes.metodo ?? 'GET',
    headers: cabecalhos,
    body,
  });

  return { status: resposta.status, texto: await resposta.text() };
}

async function enviarComArquivo(
  caminho: string,
  opcoes: Opcoes,
  arquivo: NonNullable<Opcoes['arquivo']>,
  cabecalhos: Record<string, string>,
): Promise<RespostaCrua> {
  const resultado = await new File(arquivo.uri).upload(`${BASE}${caminho}`, {
    // GET e DELETE nao carregam arquivo; o `upload` nativo tambem nao os aceita.
    httpMethod: opcoes.metodo === 'PUT' || opcoes.metodo === 'PATCH' ? opcoes.metodo : 'POST',
    uploadType: UploadType.MULTIPART,
    fieldName: arquivo.campo,
    mimeType: arquivo.tipo,
    parameters: (opcoes.corpo ?? {}) as Record<string, string>,
    headers: cabecalhos,
  });

  return { status: resultado.status, texto: resultado.body };
}

interface CorpoDeErro {
  message?: string;
  issues?: { path?: string; code?: string; message?: string }[];
}

function mensagemDoErro(status: number, dados: unknown): string {
  const corpo = dados as CorpoDeErro | undefined;
  const frases = (corpo?.issues ?? [])
    .map((i) => i.message)
    .filter((m): m is string => typeof m === 'string' && m.length > 0);
  if (frases.length > 0) {
    return [...new Set(frases)].join('\n');
  }
  return corpo?.message ?? `Erro ${status}`;
}

export function separarErros(
  erro: unknown,
  campos: readonly string[],
): { porCampo: Record<string, string>; geral: string | null } {
  const corpo = erro instanceof ErroDaApi ? (erro.corpo as CorpoDeErro | undefined) : undefined;
  const porCampo: Record<string, string> = {};
  const sobras: string[] = [];

  for (const issue of corpo?.issues ?? []) {
    if (typeof issue?.message !== 'string' || issue.message.length === 0) continue;
    if (typeof issue.path === 'string' && campos.includes(issue.path)) {
      porCampo[issue.path] ??= issue.message;
    } else {
      sobras.push(issue.message);
    }
  }

  if (sobras.length > 0) {
    return { porCampo, geral: [...new Set(sobras)].join('\n') };
  }
  // Sem `issues` sobrando, so ha texto geral se nenhum campo ficou marcado -
  // caso da falha de rede, ou de uma recusa que nao aponta campo nenhum.
  const geral = Object.keys(porCampo).length > 0 ? null : textoDaFalha(erro);
  return { porCampo, geral };
}

export function textoDaFalha(erro: unknown): string {
  if (erro instanceof ErroDaApi) {
    if (temFrase(erro.corpo)) return erro.message;

    // Sem frase no corpo, o `chamar` produziu "Erro 401" - o status cru. E aqui
    // que a interface precisa dizer alguma coisa.
    if (erro.status === 401) return 'A sessão expirou. Escolha o perfil de novo para continuar.';
    if (erro.status >= 500) return 'O servidor não respondeu agora. Tente de novo em instantes.';
    return 'Não foi possível completar a operação. Tente de novo.';
  }
  if (erro instanceof ErroDeTransporte) {
    return 'Sem conexão com o TaskPlay. Verifique a internet e tente de novo.';
  }
  return 'Algo deu errado no aplicativo. Tente de novo.';
}

/** A resposta trouxe texto proprio, ou so o status? */
function temFrase(corpo: unknown): boolean {
  const dados = corpo as CorpoDeErro | undefined;
  if (typeof dados?.message === 'string' && dados.message.length > 0) return true;
  return (dados?.issues ?? []).some((i) => typeof i?.message === 'string' && i.message.length > 0);
}

export interface ParDeTokens {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  scope: 'full' | 'telemetry';
}

export interface Perfil {
  id: string;
  name: string;
  role: 'PARENT' | 'CHILD';
  requiresPin: boolean;
}

export interface DadosDoAparelho {
  label: string;
  platform: 'ios' | 'android';
  model?: string;
}

export const api = {
  // O tipo vem do contrato: quando o cadastro passou a exigir o aceite do
  // TCLE, o aplicativo deixou de compilar ate enviar o aceite.
  cadastrar: (corpo: RegisterRequest) =>
    chamar<ParDeTokens>('/auth/register', { metodo: 'POST', corpo }),

  termo: () => chamar<TcleDocument>('/tcle'),

  entrar: (corpo: { email: string; password: string; device: DadosDoAparelho }) =>
    chamar<ParDeTokens>('/auth/login', { metodo: 'POST', corpo }),

  vincular: (corpo: { code: string; device: DadosDoAparelho }) =>
    chamar<ParDeTokens>('/auth/enroll', { metodo: 'POST', corpo }),

  perfis: (refreshToken: string) =>
    chamar<Perfil[]>('/auth/profiles', { metodo: 'POST', corpo: { refreshToken } }),

  selecionarPerfil: (corpo: {
    refreshToken: string;
    userId: string;
    pin?: string;
    scope?: 'full' | 'telemetry';
  }) => chamar<ParDeTokens>('/auth/sessions', { metodo: 'POST', corpo }),

  enviarTelemetria: (accessToken: string, events: readonly unknown[]) =>
    chamar<{ accepted: number }>('/telemetry/events', {
      metodo: 'POST',
      corpo: { events },
      accessToken,
    }),

  renovar: (refreshToken: string) =>
    chamar<ParDeTokens>('/auth/refresh', { metodo: 'POST', corpo: { refreshToken } }),

  /** Revoga no servidor a sessao daquele refresh token. */
  sair: (refreshToken: string) =>
    chamar<void>('/auth/logout', { metodo: 'POST', corpo: { refreshToken } }),

  excluirConta: (
    accessToken: string,
    corpo: { password: string; pin: string; confirmacao: 'REMOVER TUDO' },
  ) =>
    chamar<{ fotosRemovidas: number; membros: number; tarefas: number }>('/family', {
      metodo: 'DELETE',
      corpo,
      accessToken,
    }),

  eu: (accessToken: string) =>
    chamar<{ id: string; name: string; role: 'PARENT' | 'CHILD'; familyId: string }>('/family/me', {
      accessToken,
    }),
};

export type StatusDaTarefa =
  | 'PENDING'
  | 'SUBMITTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'CANCELLED';

export interface Evidencia {
  id: string;
  imageKey: string | null;
  note: string | null;
  createdAt: string;
}

export interface TarefaBase {
  id: string;
  title: string;
  description: string | null;
  points: number;
  dueAt: string;
  status: StatusDaTarefa;
  verification: 'MANUAL' | 'IMAGE';
  assigneeId: string;
  completedAt: string | null;
  reviewedAt: string | null;
  compensationForId: string | null;
}

export interface Tarefa extends TarefaBase {
  assignee: { id: string; name: string };
  evidences: Evidencia[];
  scoring: TaskScoring;
}

export interface Membro {
  id: string;
  name: string;
  role: 'PARENT' | 'CHILD';
}

export interface MembroGerenciado {
  id: string;
  name: string;
  role: 'PARENT' | 'CHILD';
  /** AAAA-MM-DD, como no contrato. A tela converte para DD/MM/AAAA. */
  birthDate: string | null;
  hasPin: boolean;
  deactivatedAt: string | null;
}

export type MotivoDoLancamento =
  | 'TASK_COMPLETED'
  | 'LATE_PENALTY'
  | 'STORE_PURCHASE'
  | 'MANUAL_ADJUSTMENT';

export interface Lancamento {
  id: string;
  delta: number;
  balanceAfter: number;
  reason: MotivoDoLancamento;
  note: string | null;
  taskId: string | null;
  purchaseId: string | null;
  createdAt: string;
}

export interface Extrato {
  balance: number;
  lifetimeEarned: number;
  transactions: Lancamento[];
}

export interface ItemDaLoja {
  id: string;
  name: string;
  description: string | null;
  kind: 'REWARD' | 'TRANSFER_LETTER';
  costPoints: number;
  stock: number | null;
  active: boolean;
}

export interface Compra {
  id: string;
  itemId: string;
  buyerId: string;
  costPoints: number;
  status: 'PENDING' | 'FULFILLED' | 'CANCELLED';
  createdAt: string;
  fulfilledAt: string | null;
  item: { id: string; name: string; kind: 'REWARD' | 'TRANSFER_LETTER' };
  buyer: { id: string; name: string };
}

export const apiFamilia = {
  membros: (t: string) => chamar<Membro[]>('/family/members', { accessToken: t }),

  criarMembro: (t: string, corpo: { name: string; birthDate?: string }) =>
    chamar<{ id: string; name: string; role: 'PARENT' | 'CHILD'; birthDate: string | null }>(
      '/family/members',
      { metodo: 'POST', corpo, accessToken: t },
    ),

  /** A familia como o responsavel a administra, com quem ja saiu do nucleo. */
  gerenciados: (t: string) =>
    chamar<MembroGerenciado[]>('/family/members/managed', { accessToken: t }),

  atualizarMembro: (
    t: string,
    id: string,
    corpo: { name?: string; birthDate?: string | null; pin?: string | null },
  ) => chamar<MembroGerenciado>(`/family/members/${id}`, { metodo: 'PATCH', corpo, accessToken: t }),

  /** Tira o filho do nucleo. Reversivel por `restaurarMembro`. */
  removerMembro: (t: string, id: string) =>
    chamar<MembroGerenciado>(`/family/members/${id}`, { metodo: 'DELETE', accessToken: t }),

  restaurarMembro: (t: string, id: string) =>
    chamar<MembroGerenciado>(`/family/members/${id}/restoration`, {
      metodo: 'POST',
      accessToken: t,
    }),

  gerarConvite: (t: string, id: string) =>
    chamar<{ code: string; expiresAt: string }>(`/family/members/${id}/enrollment`, {
      metodo: 'POST',
      accessToken: t,
    }),

  /** Historico de administracao da familia. So o responsavel alcanca. */
  historico: (t: string) => chamar<EntradaDoHistorico[]>('/family/audit', { accessToken: t }),
};

export interface EntradaDoHistorico {
  id: string;
  action:
    | 'MEMBER_CREATED'
    | 'MEMBER_RENAMED'
    | 'MEMBER_BIRTH_DATE_CHANGED'
    | 'MEMBER_PIN_SET'
    | 'MEMBER_PIN_CHANGED'
    | 'MEMBER_PIN_REMOVED'
    | 'MEMBER_DEACTIVATED'
    | 'MEMBER_REACTIVATED';
  actorId: string | null;
  actorName: string;
  targetId: string | null;
  targetName: string;
  field: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  createdAt: string;
}

export const apiTarefas = {
  listar: (t: string, status?: StatusDaTarefa) =>
    chamar<Tarefa[]>(`/tasks${status ? `?status=${status}` : ''}`, { accessToken: t }),

  obter: (t: string, id: string) => chamar<Tarefa>(`/tasks/${id}`, { accessToken: t }),

  criar: (
    t: string,
    corpo: {
      title: string;
      description?: string;
      assigneeId: string;
      points: number;
      dueAt: string;
      verification: 'MANUAL' | 'IMAGE';
      compensationForId?: string;
    },
  ) => chamar<TarefaBase>('/tasks', { metodo: 'POST', corpo, accessToken: t }),

  atualizar: (
    t: string,
    id: string,
    corpo: {
      title?: string;
      description?: string | null;
      assigneeId?: string;
      points?: number;
      dueAt?: string;
      verification?: 'MANUAL' | 'IMAGE';
    },
  ) => chamar<TarefaBase>(`/tasks/${id}`, { metodo: 'PATCH', corpo, accessToken: t }),

  concluir: (
    t: string,
    id: string,
    dados: { note?: string; foto?: { uri: string; tipo: string } },
  ) =>
    chamar<TarefaBase>(`/tasks/${id}/completion`, {
      metodo: 'POST',
      accessToken: t,
      corpo: dados.note ? { note: dados.note } : {},
      arquivo: dados.foto
        ? { campo: 'image', uri: dados.foto.uri, tipo: dados.foto.tipo }
        : undefined,
    }),

  verificar: (
    t: string,
    id: string,
    corpo: { decision: 'APPROVED' | 'REJECTED'; comment?: string },
  ) => chamar<TarefaBase>(`/tasks/${id}/review`, { metodo: 'POST', corpo, accessToken: t }),

  cancelar: (t: string, id: string) =>
    chamar<TarefaBase>(`/tasks/${id}/cancellation`, { metodo: 'POST', accessToken: t }),

  urlDaEvidencia: (evidenciaId: string) => `${BASE}/tasks/evidences/${evidenciaId}/image`,
};

export const apiNotificacoes = {
  registrarToken: (t: string, pushToken: string) =>
    chamar<void>('/notifications/push-token', {
      metodo: 'PUT',
      corpo: { pushToken },
      accessToken: t,
    }),

  /** Desliga o push deste aparelho. E um direito, e nao efeito de revogar. */
  removerToken: (t: string) =>
    chamar<void>('/notifications/push-token', { metodo: 'DELETE', accessToken: t }),

  listar: (t: string) => chamar<Aviso[]>('/notifications', { accessToken: t }),

  marcarLido: (t: string, id: string) =>
    chamar<void>(`/notifications/${id}/read`, { metodo: 'POST', accessToken: t }),

  marcarTodosLidos: (t: string) =>
    chamar<{ marcadas: number }>('/notifications/read-all', { metodo: 'POST', accessToken: t }),
};

/** Um aviso da lista, como a API o devolve. */
export interface Aviso {
  id: string;
  type:
    | 'TASK_ASSIGNED'
    | 'TASK_DUE_SOON'
    | 'TASK_OVERDUE'
    | 'TASK_APPROVED'
    | 'TASK_REJECTED'
    | 'TASK_TRANSFERRED'
    | 'POINTS_CHANGED'
    | 'PURCHASE_FULFILLED'
    | 'STORE_WITHOUT_REWARDS';
  title: string;
  body: string;
  taskId: string | null;
  sentAt: string | null;
  readAt: string | null;
  createdAt: string;
}

export const apiCarteira = {
  minha: (t: string) => chamar<Extrato>('/wallet', { accessToken: t }),
  deMembro: (t: string, id: string) => chamar<Extrato>(`/wallet/members/${id}`, { accessToken: t }),
  ajustar: (t: string, corpo: { userId: string; delta: number; note: string }) =>
    chamar<{ delta: number; balanceAfter: number }>('/wallet/adjustments', {
      metodo: 'POST',
      corpo,
      accessToken: t,
    }),
};

export const apiLoja = {
  itens: (t: string) => chamar<ItemDaLoja[]>('/store/items', { accessToken: t }),
  criarItem: (
    t: string,
    corpo: { name: string; description?: string; costPoints: number; stock?: number },
  ) => chamar<ItemDaLoja>('/store/items', { metodo: 'POST', corpo, accessToken: t }),
  desativarItem: (t: string, id: string) =>
    chamar<ItemDaLoja>(`/store/items/${id}`, { metodo: 'DELETE', accessToken: t }),

  compras: (t: string) => chamar<Compra[]>('/store/purchases', { accessToken: t }),
  comprar: (t: string, itemId: string) =>
    chamar<Compra>(`/store/items/${itemId}/purchase`, { metodo: 'POST', accessToken: t }),
  entregar: (t: string, compraId: string) =>
    chamar<Compra>(`/store/purchases/${compraId}/fulfillment`, { metodo: 'POST', accessToken: t }),
  cancelarCompra: (t: string, compraId: string) =>
    chamar<Compra>(`/store/purchases/${compraId}/cancellation`, { metodo: 'POST', accessToken: t }),

  usarCarta: (t: string, corpo: { purchaseId: string; taskId: string; toUserId: string }) =>
    chamar<{ id: string }>('/store/transfer-letter', { metodo: 'POST', corpo, accessToken: t }),
};
