import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { api, ErroDaApi, type DadosDoAparelho, type ParDeTokens, type Perfil } from '../api/cliente';
import type { RegisterRequest } from '@taskplay/shared-types';
import {
  esquecerPerfil,
  esquecerTudo,
  guardarToken,
  qualquerToken,
  todosOsPerfisComToken,
  todosOsTokens,
  tokenDoPerfil,
} from '../api/armazenamento';
import { esquecerFila } from '../telemetria/fila';

/** Momento em que o access token e renovado antes de expirar, em segundos. */
const MARGEM_DE_RENOVACAO = 60;

interface Ator {
  id: string;
  nome: string;
  papel: 'PARENT' | 'CHILD';
}

interface Sessao {
  carregando: boolean;
  aparelhoConhecido: boolean;
  perfilAtivo: Ator | null;
  accessToken: string | null;

  /** `acceptedTcleVersion` so existe depois do toque em "Li e concordo". */
  cadastrar: (dados: Omit<RegisterRequest, 'device'>) => Promise<void>;
  entrar: (dados: { email: string; password: string }) => Promise<void>;
  vincular: (codigo: string) => Promise<void>;
  excluirConta: (dados: { password: string; pin: string }) => Promise<{
    fotosRemovidas: number;
    membros: number;
    tarefas: number;
  }>;
  listarPerfis: () => Promise<Perfil[]>;
  selecionarPerfil: (perfilId: string, pin?: string) => Promise<void>;
  /** Volta ao seletor sem esquecer o aparelho. */
  trocarDePerfil: () => void;
  sair: () => Promise<void>;
}

const Contexto = createContext<Sessao | null>(null);

/** Descreve o aparelho para a API. Sao dados de aparelho, nao de pessoa. */
function descreverAparelho(): DadosDoAparelho {
  return {
    label: Platform.select({ ios: 'iPhone', android: 'Android', default: 'Aparelho' }) as string,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

export function ProvedorDeSessao({ children }: { children: React.ReactNode }) {
  const [carregando, setCarregando] = useState(true);
  const [aparelhoConhecido, setAparelhoConhecido] = useState(false);
  const [perfilAtivo, setPerfilAtivo] = useState<Ator | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [expiraEm, setExpiraEm] = useState<number | null>(null);

  // Na abertura, descobre se o aparelho ja e conhecido. E o que decide entre
  // mostrar o seletor de perfis ou a tela de cadastro.
  useEffect(() => {
    qualquerToken()
      .then((token) => setAparelhoConhecido(token !== null))
      .finally(() => setCarregando(false));
  }, []);

  const aplicarPar = useCallback(async (perfilId: string, par: ParDeTokens) => {
    if (par.refreshToken) {
      await guardarToken(perfilId, par.refreshToken);
    }
    setAccessToken(par.accessToken);
    // O prazo vem do servidor em toda resposta de token. Registrar o instante
    // aqui, e em nenhum outro lugar, mantem uma so fonte para ele.
    setExpiraEm(Date.now() + par.expiresIn * 1000);
    setAparelhoConhecido(true);
  }, []);

  const carregarAtor = useCallback(async (token: string) => {
    const eu = await api.eu(token);
    setPerfilAtivo({ id: eu.id, nome: eu.name, papel: eu.role });
  }, []);

  const cadastrar = useCallback<Sessao['cadastrar']>(
    async (dados) => {
      const par = await api.cadastrar({ ...dados, device: descreverAparelho() });
      const eu = await api.eu(par.accessToken);
      await aplicarPar(eu.id, par);
      setPerfilAtivo({ id: eu.id, nome: eu.name, papel: eu.role });
    },
    [aplicarPar],
  );

  const entrar = useCallback<Sessao['entrar']>(
    async (dados) => {
      const par = await api.entrar({ ...dados, device: descreverAparelho() });
      const eu = await api.eu(par.accessToken);
      await aplicarPar(eu.id, par);
      setPerfilAtivo({ id: eu.id, nome: eu.name, papel: eu.role });
    },
    [aplicarPar],
  );

  const vincular = useCallback<Sessao['vincular']>(
    async (codigo) => {
      const par = await api.vincular({ code: codigo, device: descreverAparelho() });
      const eu = await api.eu(par.accessToken);
      await aplicarPar(eu.id, par);
      setPerfilAtivo({ id: eu.id, nome: eu.name, papel: eu.role });
    },
    [aplicarPar],
  );

  const listarPerfis = useCallback<Sessao['listarPerfis']>(async () => {
    for (const perfilId of await todosOsPerfisComToken()) {
      const token = await tokenDoPerfil(perfilId);
      if (!token) continue;
      try {
        return await api.perfis(token);
      } catch (erro) {
        if (!(erro instanceof ErroDaApi && erro.status === 401)) throw erro;
        await esquecerFila(perfilId).catch(() => undefined);
        await esquecerPerfil(perfilId);
      }
    }
    setAparelhoConhecido(false);
    throw new ErroDaApi(401, 'Aparelho não reconhecido');
  }, []);

  const selecionarPerfil = useCallback<Sessao['selecionarPerfil']>(
    async (perfilId, pin) => {
      const token = (await tokenDoPerfil(perfilId)) ?? (await qualquerToken());
      if (!token) throw new ErroDaApi(401, 'Aparelho não reconhecido');

      const par = await api.selecionarPerfil({ refreshToken: token, userId: perfilId, pin });
      await aplicarPar(perfilId, par);
      await carregarAtor(par.accessToken);
    },
    [aplicarPar, carregarAtor],
  );

  const trocarDePerfil = useCallback(() => {
    // Esquece apenas o access token: o aparelho continua conhecido, e voltar a
    // um perfil nao exige senha de novo - so o PIN, quando o servidor o exigir.
    setAccessToken(null);
    setExpiraEm(null);
    setPerfilAtivo(null);
  }, []);

  const sair = useCallback(async () => {
    const perfis = await todosOsPerfisComToken();
    await Promise.all(perfis.map((perfilId) => esquecerFila(perfilId).catch(() => undefined)));

    const tokens = await todosOsTokens();
    await Promise.all(
      tokens.map((token) =>
        api.sair(token).catch(() => {
          // Falha de rede ou sessao ja revogada. Nao ha o que fazer aqui, e nao
          // pode impedir a saida local.
        }),
      ),
    );
    await esquecerTudo();
    setAccessToken(null);
    setExpiraEm(null);
    setPerfilAtivo(null);
    setAparelhoConhecido(false);
  }, []);

  const excluirConta = useCallback<Sessao['excluirConta']>(
    async (dados) => {
      if (!accessToken) throw new ErroDaApi(401, 'Sessão expirada; entre de novo para continuar');

      const resultado = await api.excluirConta(accessToken, {
        ...dados,
        confirmacao: 'REMOVER TUDO',
      });

      const perfis = await todosOsPerfisComToken();
      await Promise.all(perfis.map((perfilId) => esquecerFila(perfilId).catch(() => undefined)));
      await esquecerTudo();
      return resultado;
    },
    [accessToken],
  );

  const renovar = useCallback(async () => {
    if (!perfilAtivo) return;
    try {
      const token = await tokenDoPerfil(perfilAtivo.id);
      if (!token) return;
      const par = await api.renovar(token);
      await aplicarPar(perfilAtivo.id, par);
    } catch (erro) {
      if (erro instanceof ErroDaApi && erro.status >= 400 && erro.status < 500) {
        trocarDePerfil();
      }
    }
  }, [perfilAtivo, aplicarPar, trocarDePerfil]);

  useEffect(() => {
    if (!perfilAtivo || !accessToken || expiraEm === null) return;

    const renovarSePerto = () => {
      if (Date.now() >= expiraEm - MARGEM_DE_RENOVACAO * 1000) void renovar();
    };

    const id = setTimeout(
      renovarSePerto,
      Math.max(0, expiraEm - MARGEM_DE_RENOVACAO * 1000 - Date.now()),
    );

    const inscricao = AppState.addEventListener('change', (estado) => {
      if (estado === 'active') renovarSePerto();
    });

    return () => {
      clearTimeout(id);
      inscricao.remove();
    };
  }, [perfilAtivo, accessToken, expiraEm, renovar]);

  const valor = useMemo<Sessao>(
    () => ({
      carregando,
      aparelhoConhecido,
      perfilAtivo,
      accessToken,
      cadastrar,
      entrar,
      vincular,
      listarPerfis,
      selecionarPerfil,
      trocarDePerfil,
      sair,
      excluirConta,
    }),
    [
      carregando,
      aparelhoConhecido,
      perfilAtivo,
      accessToken,
      cadastrar,
      entrar,
      vincular,
      listarPerfis,
      selecionarPerfil,
      trocarDePerfil,
      sair,
      excluirConta,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSessao(): Sessao {
  const sessao = useContext(Contexto);
  if (!sessao) throw new Error('useSessao fora do ProvedorDeSessao');
  return sessao;
}
