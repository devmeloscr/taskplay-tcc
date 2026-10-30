import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

export interface Deposito {
  ler(chave: string): Promise<string | null>;
  gravar(chave: string, valor: string): Promise<void>;
  apagar(chave: string): Promise<void>;
}

/** Subpasta propria, para a fila nao se misturar com cache de imagem. */
const PASTA = 'taskplay';

function arquivo(chave: string): File {
  const pasta = new Directory(Paths.document, PASTA);
  // `idempotent` porque a pasta sobrevive entre execucoes: criar a segunda vez
  // seria erro, e conferir antes so acrescentaria uma corrida.
  if (!pasta.exists) pasta.create({ idempotent: true, intermediates: true });
  return new File(pasta, `${chave}.json`);
}

export const depositoDoSistema: Deposito = {
  ler: async (chave) => {
    const alvo = arquivo(chave);
    return alvo.exists ? alvo.text() : null;
  },
  gravar: async (chave, valor) => {
    const alvo = arquivo(chave);
    if (!alvo.exists) alvo.create();
    alvo.write(valor);
  },
  apagar: async (chave) => {
    const alvo = arquivo(chave);
    if (alvo.exists) alvo.delete();
  },
};

/** Substituto de desenvolvimento para o navegador. */
export const depositoDoNavegador: Deposito = {
  ler: async (chave) => globalThis.localStorage?.getItem(chave) ?? null,
  gravar: async (chave, valor) => globalThis.localStorage?.setItem(chave, valor),
  apagar: async (chave) => globalThis.localStorage?.removeItem(chave),
};

export const deposito: Deposito =
  Platform.OS === 'web' ? depositoDoNavegador : depositoDoSistema;
