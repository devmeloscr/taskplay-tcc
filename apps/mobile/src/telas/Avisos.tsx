import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useAvisos, useMarcarAvisoLido, useMarcarTodosLidos } from '../api/consultas';
import type { Aviso } from '../api/cliente';
import {
  Botao,
  Carregando,
  Cartao,
  Erro,
  Falha,
  Selo,
  textoDaFalha,
  usePuxarParaAtualizar,
  Vazio,
} from './componentes';
import { momentoEmPalavras } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

export function Avisos({ irParaTarefa }: { irParaTarefa: (id: string) => void }) {
  const consulta = useAvisos();
  const marcarLido = useMarcarAvisoLido();
  const marcarTodos = useMarcarTodosLidos();
  const atualizar = usePuxarParaAtualizar(() => consulta.refetch());

  if (consulta.isPending) return <Carregando rotulo="Carregando os avisos" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }

  const naoLidos = consulta.data.filter((aviso) => aviso.readAt === null).length;

  function abrir(aviso: Aviso) {
    if (aviso.readAt === null) marcarLido.mutate(aviso.id);
    if (aviso.taskId) irParaTarefa(aviso.taskId);
  }

  return (
    <FlatList
      data={consulta.data}
      keyExtractor={(aviso) => aviso.id}
      contentContainerStyle={consulta.data.length === 0 ? estilos.listaVazia : estilos.lista}
      refreshControl={<RefreshControl {...atualizar} />}
      ListHeaderComponent={
        <View>
          <Text style={estilos.titulo}>Avisos</Text>
          {naoLidos > 0 ? (
            <View style={estilos.acao}>
              <Botao
                titulo="Marcar todos como lidos"
                variante="secundaria"
                aoTocar={() => marcarTodos.mutate()}
                carregando={marcarTodos.isPending}
              />
            </View>
          ) : null}
          <Erro
            mensagem={
              marcarTodos.isError
                ? textoDaFalha(marcarTodos.error)
                : marcarLido.isError
                  ? textoDaFalha(marcarLido.error)
                  : null
            }
          />
        </View>
      }
      ListEmptyComponent={
        <Vazio
          titulo="Nenhum aviso ainda"
          apoio="Tarefas novas, entregas conferidas e repasses de tarefa aparecem aqui."
        />
      }
      renderItem={({ item }) => {
        const novo = item.readAt === null;
        return (
          <Cartao
            aoTocar={() => abrir(item)}
            rotulo={`${novo ? 'Novo. ' : ''}${item.title}. ${item.body}`}
          >
            {novo ? (
              <View style={estilos.selo}>
                <Selo texto="Novo" cor={CORES.primaria} />
              </View>
            ) : null}
            <Text style={[estilos.tituloDoAviso, novo && estilos.tituloNovo]}>{item.title}</Text>
            <Text style={estilos.corpo}>{item.body}</Text>
            <Text style={estilos.quando}>{momentoEmPalavras(item.createdAt)}</Text>
          </Cartao>
        );
      }}
    />
  );
}

const estilos = StyleSheet.create({
  lista: { padding: ESPACO.m },
  listaVazia: { padding: ESPACO.m, flexGrow: 1 },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.m },
  acao: { marginBottom: ESPACO.m },
  selo: { flexDirection: 'row', marginBottom: ESPACO.p },
  tituloDoAviso: { fontSize: TIPO.corpo, fontWeight: '500', color: CORES.texto, lineHeight: 22 },
  tituloNovo: { fontWeight: '700' },
  corpo: { fontSize: TIPO.apoio, color: CORES.texto, marginTop: ESPACO.p, lineHeight: 20 },
  quando: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: ESPACO.p },
});
