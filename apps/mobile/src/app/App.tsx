import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErroDaApi } from '../api/cliente';
import { ProvedorDeSessao } from '../auth/sessao';
import { RegistroDeFalhas } from '../telemetria/RegistroDeFalhas';
import { ProvedorDeTelemetria } from '../telemetria/useTelemetria';
import { Rotas } from '../navegacao/rotas';

const cliente = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (tentativa, erro) => {
        const status = erro instanceof ErroDaApi ? erro.status : 0;
        if (status >= 400 && status < 500) return false;
        return tentativa < 3;
      },
      retryDelay: (tentativa) => Math.min(1000 * 2 ** tentativa, 8000),
      // Trinta segundos de frescor: evita refazer a mesma consulta a cada troca
      // de tela sem deixar o dado envelhecer a ponto de confundir.
      staleTime: 30_000,
    },
  },
});

export const App = () => (
  <QueryClientProvider client={cliente}>
    <SafeAreaProvider>
      <ProvedorDeSessao>
        {/* Dentro da sessao, e nao fora: o evento so tem a quem ser atribuido
            depois que ha perfil ativo, e e a sessao que sabe qual e. */}
        <ProvedorDeTelemetria>
          {/* Dentro do provedor porque usa a fila dele, e dentro do
              QueryClientProvider porque assina os caches. */}
          <RegistroDeFalhas />
          <StatusBar barStyle="dark-content" />
          <Rotas />
        </ProvedorDeTelemetria>
      </ProvedorDeSessao>
    </SafeAreaProvider>
  </QueryClientProvider>
);

export default App;
