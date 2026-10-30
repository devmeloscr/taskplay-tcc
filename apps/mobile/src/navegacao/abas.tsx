import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAvisos, useRecarregarAvisos } from '../api/consultas';
import { useAoReceberPush } from '../api/notificacoes';
import { Avisos } from '../telas/Avisos';
import { Carteira } from '../telas/Carteira';
import { Inicio } from '../telas/Inicio';
import { Loja } from '../telas/Loja';
import { Tarefas } from '../telas/Tarefas';
import { ALVO_MINIMO, CORES, TIPO } from '../telas/tema';
import type { PilhaDoAplicativo } from './rotas';

const Abas = createBottomTabNavigator();

export function AbasDoAplicativo() {
  const pilha = useNavigation<NavigationProp<PilhaDoAplicativo>>();
  const bordas = useSafeAreaInsets();
  const avisos = useAvisos();
  useAoReceberPush(useRecarregarAvisos());
  const naoLidos = avisos.data?.filter((aviso) => aviso.readAt === null).length ?? 0;

  return (
    <Abas.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: CORES.primaria,
        tabBarInactiveTintColor: CORES.textoSuave,
        tabBarLabelStyle: { fontSize: TIPO.apoio - 2, fontWeight: '600' },
        tabBarStyle: {
          height: ALVO_MINIMO + 26 + bordas.bottom,
          paddingTop: 6,
          paddingBottom: 10 + bordas.bottom,
        },
        tabBarItemStyle: { minHeight: ALVO_MINIMO },
      }}
    >
      <Abas.Screen
        name="tarefas"
        options={{
          title: 'Tarefas',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkbox-outline" color={color} size={size} />
          ),
        }}
      >
        {() => (
          <Tarefas
            irParaTarefa={(id) => pilha.navigate('tarefa', { id })}
            irParaNova={() => pilha.navigate('novaTarefa')}
          />
        )}
      </Abas.Screen>

      <Abas.Screen
        name="carteira"
        options={{
          title: 'Pontos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" color={color} size={size} />
          ),
        }}
      >
        {() => <Carteira irParaNovoMembro={() => pilha.navigate('novoMembro')} />}
      </Abas.Screen>

      <Abas.Screen
        name="loja"
        options={{
          title: 'Loja',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="gift-outline" color={color} size={size} />
          ),
        }}
      >
        {() => (
          <Loja
            irParaNovoItem={() => pilha.navigate('novoItem')}
            irParaCarta={(compraId) => pilha.navigate('usarCarta', { compraId })}
          />
        )}
      </Abas.Screen>

      <Abas.Screen
        name="avisos"
        options={{
          title: 'Avisos',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
          ),
          tabBarBadge: naoLidos > 0 ? naoLidos : undefined,
          tabBarAccessibilityLabel: naoLidos > 0 ? `Avisos, ${naoLidos} não lidos` : 'Avisos',
        }}
      >
        {() => <Avisos irParaTarefa={(id) => pilha.navigate('tarefa', { id })} />}
      </Abas.Screen>

      <Abas.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      >
        {() => (
          <Inicio
            irParaExclusao={() => pilha.navigate('excluir')}
            irParaTermo={() => pilha.navigate('termo')}
            irParaFilhos={() => pilha.navigate('filhos')}
          />
        )}
      </Abas.Screen>
    </Abas.Navigator>
  );
}
