import React from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useHistoricoDaFamilia } from '../api/consultas';
import { Botao, Cartao, Carregando, Falha, Vazio, usePuxarParaAtualizar } from './componentes';
import { linhaDoHistorico } from './historico';
import { CORES, ESPACO, TIPO } from './tema';

export function HistoricoDaFamilia({ voltar }: { voltar: () => void }) {
  const consulta = useHistoricoDaFamilia();
  const atualizar = usePuxarParaAtualizar(() => consulta.refetch());

  if (consulta.isPending) return <Carregando rotulo="Carregando o histórico" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }

  if (consulta.data.length === 0) {
    return (
      <Vazio
        titulo="Nada por aqui ainda"
        apoio="Cadastros, mudanças de nome, PIN e saídas da família aparecem nesta lista."
        acao={{ titulo: 'Voltar', aoTocar: voltar }}
      />
    );
  }

  return (
    <FlatList
      data={consulta.data}
      keyExtractor={(entrada) => entrada.id}
      contentContainerStyle={estilos.lista}
      refreshControl={<RefreshControl {...atualizar} />}
      ListHeaderComponent={
        <View>
          <Text style={estilos.titulo}>Histórico da família</Text>
          <Text style={estilos.apoio}>
            Tudo o que foi feito com os perfis, do mais recente para o mais antigo.
          </Text>
        </View>
      }
      renderItem={({ item }) => {
        const linha = linhaDoHistorico(item);
        return (
          <Cartao>
            <Text style={estilos.acao}>{linha.titulo}</Text>
            {linha.mudanca ? <Text style={estilos.mudanca}>{linha.mudanca}</Text> : null}
            <Text style={estilos.quando}>{linha.quando}</Text>
          </Cartao>
        );
      }}
      ListFooterComponent={
        <View style={estilos.rodape}>
          <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
        </View>
      }
    />
  );
}

const estilos = StyleSheet.create({
  lista: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.m, lineHeight: 20 },
  acao: { fontSize: TIPO.corpo, fontWeight: '600', color: CORES.texto, lineHeight: 22 },
  mudanca: { fontSize: TIPO.apoio, color: CORES.texto, marginTop: ESPACO.p, lineHeight: 20 },
  quando: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: ESPACO.p },
  rodape: { marginTop: ESPACO.m },
});
