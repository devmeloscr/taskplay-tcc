import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer, type NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLimparCacheAoSair } from '../api/consultas';
import { useAberturaPorNotificacao, useRegistroDePush } from '../api/notificacoes';
import { useSessao } from '../auth/sessao';
import { Cadastro } from '../telas/Cadastro';
import { Convite } from '../telas/Convite';
import { Entrar } from '../telas/Entrar';
import { EditarFilho } from '../telas/EditarFilho';
import { ExcluirConta } from '../telas/ExcluirConta';
import { Filhos } from '../telas/Filhos';
import { HistoricoDaFamilia } from '../telas/HistoricoDaFamilia';
import { NovaTarefa } from '../telas/NovaTarefa';
import { NovoItem } from '../telas/NovoItem';
import { NovoMembro } from '../telas/NovoMembro';
import { SeletorDePerfis } from '../telas/SeletorDePerfis';
import { Tarefa } from '../telas/Tarefa';
import { Termo } from '../telas/Termo';
import { UsarCarta } from '../telas/UsarCarta';
import { Vincular } from '../telas/Vincular';
import { CORES } from '../telas/tema';
import { AbasDoAplicativo } from './abas';
import { enderecos } from './enderecos';

export type PilhaDoAplicativo = {
  abas: undefined;
  tarefa: { id: string };
  novaTarefa: { compensarId?: string; editarId?: string } | undefined;
  novoItem: undefined;
  novoMembro: undefined;
  filhos: undefined;
  editarFilho: { id: string };
  convite: { id: string };
  historicoDaFamilia: undefined;
  usarCarta: { compraId: string };
  excluir: undefined;
  /** Releitura do TCLE aceito no cadastro. */
  termo: undefined;
};

const Pilha = createNativeStackNavigator<PilhaDoAplicativo>();
const PilhaDeEntrada = createNativeStackNavigator();

export function Rotas() {
  const { carregando, aparelhoConhecido, perfilAtivo } = useSessao();
  // Tres portas para um aparelho desconhecido: criar a familia, entrar como
  // responsavel, ou vincular o celular proprio de um filho pelo codigo.
  const [entrada, setEntrada] = useState<'cadastro' | 'entrar' | 'vincular'>('cadastro');
  const navegador = useRef<NavigationContainerRef<PilhaDoAplicativo>>(null);
  const bordas = useSafeAreaInsets();
  const fundoComRecorte = useMemo(
    () => [estilos.fundo, { paddingBottom: bordas.bottom }],
    [bordas.bottom],
  );

  useRegistroDePush();
  useAberturaPorNotificacao(
    useCallback((id: string) => {
      navegador.current?.navigate('tarefa', { id });
    }, []),
  );

  useLimparCacheAoSair(aparelhoConhecido);

  if (carregando) {
    return (
      <View style={estilos.centralizado}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  return (
    <NavigationContainer ref={navegador} linking={perfilAtivo ? enderecos : undefined}>
      <SafeAreaView style={estilos.area} edges={['top', 'left', 'right']}>
        {!aparelhoConhecido ? (
          <PilhaDeEntrada.Navigator
            screenOptions={{ headerShown: false, contentStyle: fundoComRecorte }}
          >
            {entrada === 'entrar' ? (
              <PilhaDeEntrada.Screen name="entrar">
                {() => (
                  <Entrar
                    irParaCadastro={() => setEntrada('cadastro')}
                    irParaConvite={() => setEntrada('vincular')}
                  />
                )}
              </PilhaDeEntrada.Screen>
            ) : entrada === 'vincular' ? (
              <PilhaDeEntrada.Screen name="vincular">
                {() => <Vincular voltar={() => setEntrada('cadastro')} />}
              </PilhaDeEntrada.Screen>
            ) : (
              <PilhaDeEntrada.Screen name="cadastro">
                {() => (
                  <Cadastro
                    irParaEntrar={() => setEntrada('entrar')}
                    irParaConvite={() => setEntrada('vincular')}
                  />
                )}
              </PilhaDeEntrada.Screen>
            )}
          </PilhaDeEntrada.Navigator>
        ) : !perfilAtivo ? (
          <PilhaDeEntrada.Navigator
            screenOptions={{ headerShown: false, contentStyle: fundoComRecorte }}
          >
            <PilhaDeEntrada.Screen name="seletor" component={SeletorDePerfis} />
          </PilhaDeEntrada.Navigator>
        ) : (
          <Pilha.Navigator screenOptions={{ headerShown: false, contentStyle: fundoComRecorte }}>
            <Pilha.Screen
              name="abas"
              component={AbasDoAplicativo}
              options={{ contentStyle: estilos.fundo }}
            />

            <Pilha.Screen name="tarefa">
              {({ navigation, route }) => (
                <Tarefa
                  id={route.params.id}
                  voltar={() => navigation.goBack()}
                  // `replace`: depois de criar a compensacao o "voltar" devolve a
                  // lista, e nao a tarefa vencida que originou tudo.
                  irParaCompensacao={(compensarId) =>
                    navigation.replace('novaTarefa', { compensarId })
                  }
                  irParaEdicao={(editarId) => navigation.navigate('novaTarefa', { editarId })}
                />
              )}
            </Pilha.Screen>

            <Pilha.Screen name="novaTarefa">
              {({ navigation, route }) => (
                <NovaTarefa
                  compensarId={route.params?.compensarId}
                  editarId={route.params?.editarId}
                  voltar={() => navigation.goBack()}
                  irParaNovoMembro={() => navigation.replace('novoMembro')}
                />
              )}
            </Pilha.Screen>

            <Pilha.Screen name="novoItem">
              {({ navigation }) => <NovoItem voltar={() => navigation.goBack()} />}
            </Pilha.Screen>

            <Pilha.Screen name="novoMembro">
              {({ navigation }) => <NovoMembro voltar={() => navigation.goBack()} />}
            </Pilha.Screen>

            <Pilha.Screen name="filhos">
              {({ navigation }) => (
                <Filhos
                  irParaNovoMembro={() => navigation.navigate('novoMembro')}
                  irParaEdicao={(id) => navigation.navigate('editarFilho', { id })}
                  irParaHistorico={() => navigation.navigate('historicoDaFamilia')}
                  irParaConvite={(id) => navigation.navigate('convite', { id })}
                />
              )}
            </Pilha.Screen>

            <Pilha.Screen name="editarFilho">
              {({ navigation, route }) => (
                <EditarFilho id={route.params.id} voltar={() => navigation.goBack()} />
              )}
            </Pilha.Screen>

            <Pilha.Screen name="convite">
              {({ navigation, route }) => (
                <Convite id={route.params.id} voltar={() => navigation.goBack()} />
              )}
            </Pilha.Screen>

            <Pilha.Screen name="historicoDaFamilia">
              {({ navigation }) => <HistoricoDaFamilia voltar={() => navigation.goBack()} />}
            </Pilha.Screen>

            <Pilha.Screen name="usarCarta">
              {({ navigation, route }) => (
                <UsarCarta compraId={route.params.compraId} voltar={() => navigation.goBack()} />
              )}
            </Pilha.Screen>

            <Pilha.Screen name="excluir">
              {({ navigation }) => <ExcluirConta voltar={() => navigation.goBack()} />}
            </Pilha.Screen>

            <Pilha.Screen name="termo">
              {({ navigation }) => <Termo voltar={() => navigation.goBack()} />}
            </Pilha.Screen>
          </Pilha.Navigator>
        )}
      </SafeAreaView>
    </NavigationContainer>
  );
}

const estilos = StyleSheet.create({
  centralizado: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CORES.fundo,
  },
  fundo: { backgroundColor: CORES.fundo },
  area: { flex: 1, backgroundColor: CORES.fundo },
});
