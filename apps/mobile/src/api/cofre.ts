import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export interface Cofre {
  ler(chave: string): Promise<string | null>;
  gravar(chave: string, valor: string): Promise<void>;
  apagar(chave: string): Promise<void>;
}

/** Keychain/Keystore. O cofre de verdade, usado em iOS e Android. */
export const cofreDoSistema: Cofre = {
  ler: (chave) => SecureStore.getItemAsync(chave),
  gravar: (chave, valor) => SecureStore.setItemAsync(chave, valor),
  apagar: (chave) => SecureStore.deleteItemAsync(chave),
};

export const cofreDoNavegador: Cofre = {
  ler: async (chave) => exigirDesenvolvimento().getItem(chave),
  gravar: async (chave, valor) => exigirDesenvolvimento().setItem(chave, valor),
  apagar: async (chave) => exigirDesenvolvimento().removeItem(chave),
};

function exigirDesenvolvimento(): Storage {
  if (!__DEV__) {
    throw new Error(
      'O alvo web guarda tokens em localStorage e só vale para desenvolvimento. ' +
        'O estudo roda em iOS/Android, onde o cofre é o Keychain/Keystore.',
    );
  }
  return globalThis.localStorage;
}

export const cofre: Cofre = Platform.OS === 'web' ? cofreDoNavegador : cofreDoSistema;
