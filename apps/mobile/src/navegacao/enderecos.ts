import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';
import type { PilhaDoAplicativo } from './rotas';

export const enderecos: LinkingOptions<PilhaDoAplicativo> = {
  prefixes: [Linking.createURL('/')],
  config: {
    screens: {
      abas: {
        screens: {
          tarefas: 'tarefas',
          carteira: 'pontos',
          loja: 'loja',
          perfil: 'perfil',
        },
      },
      tarefa: 'tarefa/:id',
      novaTarefa: 'nova-tarefa',
      novoMembro: 'novo-filho',
      filhos: 'filhos',
      editarFilho: 'filho/:id',
      historicoDaFamilia: 'historico-da-familia',
    },
  },
};
