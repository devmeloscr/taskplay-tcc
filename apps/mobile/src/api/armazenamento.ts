import { cofre } from './cofre';

const CHAVE_PERFIS = 'taskplay.perfis';

/** Refresh tokens guardados, indexados pelo id do perfil. */
type TokensPorPerfil = Record<string, string>;

async function ler(): Promise<TokensPorPerfil> {
  const bruto = await cofre.ler(CHAVE_PERFIS);
  if (!bruto) return {};
  try {
    return JSON.parse(bruto) as TokensPorPerfil;
  } catch {
    // Conteudo corrompido significa que ninguem consegue entrar. Melhor voltar
    // ao login do que travar o aplicativo num estado irrecuperavel.
    return {};
  }
}

async function gravar(tokens: TokensPorPerfil): Promise<void> {
  await cofre.gravar(CHAVE_PERFIS, JSON.stringify(tokens));
}

export async function guardarToken(perfilId: string, refreshToken: string): Promise<void> {
  const tokens = await ler();
  tokens[perfilId] = refreshToken;
  await gravar(tokens);
}

export async function tokenDoPerfil(perfilId: string): Promise<string | null> {
  return (await ler())[perfilId] ?? null;
}

export async function qualquerToken(): Promise<string | null> {
  const tokens = Object.values(await ler());
  return tokens[0] ?? null;
}

export async function todosOsTokens(): Promise<string[]> {
  return Object.values(await ler());
}

export async function todosOsPerfisComToken(): Promise<string[]> {
  return Object.keys(await ler());
}

export async function esquecerPerfil(perfilId: string): Promise<void> {
  const tokens = await ler();
  delete tokens[perfilId];
  await gravar(tokens);
}

/** Esquece o aparelho inteiro. Usado ao sair de vez. */
export async function esquecerTudo(): Promise<void> {
  await cofre.apagar(CHAVE_PERFIS);
}
