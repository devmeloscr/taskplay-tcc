import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TcleDocument } from '@taskplay/shared-types';
import { useTermo } from '../api/consultas';
import { Botao, Carregando, Falha } from './componentes';
import { CORES, ESPACO, TIPO } from './tema';

/** `2026-09-25` vira `25/09/2026`, o formato que a familia le. */
function dataDaVersao(versao: string) {
  const [ano, mes, dia] = versao.split('-');
  return `${dia}/${mes}/${ano}`;
}

export function TextoDoTermo({ termo }: { termo: TcleDocument }) {
  const [completo, setCompleto] = useState(false);

  return (
    <View>
      <Text style={estilos.versao}>Versão de {dataDaVersao(termo.version)}</Text>

      <View style={estilos.resumo}>
        <Text style={estilos.tituloDoResumo}>Em resumo</Text>
        {termo.summary.map((item) => (
          <View key={item} style={estilos.item}>
            <Text style={estilos.marcador}>•</Text>
            <Text style={estilos.corpo}>{item}</Text>
          </View>
        ))}
      </View>

      {completo
        ? termo.sections.map((secao) => (
            <View key={secao.title} style={estilos.secao}>
              <Text accessibilityRole="header" style={estilos.tituloDaSecao}>
                {secao.title}
              </Text>
              {secao.paragraphs.map((paragrafo) => (
                <Text key={paragrafo} style={[estilos.corpo, estilos.paragrafo]}>
                  {paragrafo}
                </Text>
              ))}
            </View>
          ))
        : null}

      <Botao
        titulo={completo ? 'Ler menos' : 'Ler mais'}
        variante="secundaria"
        aoTocar={() => setCompleto((aberto) => !aberto)}
      />
    </View>
  );
}

export function Termo({ voltar }: { voltar: () => void }) {
  const termo = useTermo();

  if (termo.isPending) return <Carregando rotulo="Carregando o termo" />;
  if (termo.isError) return <Falha erro={termo.error} aoTentarDeNovo={() => termo.refetch()} />;

  return (
    <ScrollView contentContainerStyle={estilos.tela}>
      <Text accessibilityRole="header" style={estilos.titulo}>
        {termo.data.title}
      </Text>
      <TextoDoTermo termo={termo.data} />
      <View style={estilos.separador} />
      <Botao titulo="Voltar" aoTocar={voltar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  tela: { padding: ESPACO.g },
  titulo: {
    fontSize: TIPO.titulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.p,
  },
  versao: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginBottom: ESPACO.m,
  },
  resumo: {
    backgroundColor: CORES.superficie,
    borderColor: CORES.borda,
    borderWidth: 1,
    borderRadius: 12,
    padding: ESPACO.m,
    marginBottom: ESPACO.m,
  },
  tituloDoResumo: {
    fontSize: TIPO.corpo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.p,
  },
  item: { flexDirection: 'row', marginBottom: ESPACO.p },
  marcador: { fontSize: TIPO.corpo, color: CORES.texto, width: ESPACO.m },
  corpo: { flex: 1, fontSize: TIPO.corpo, color: CORES.texto, lineHeight: 22 },
  secao: { marginBottom: ESPACO.m },
  tituloDaSecao: {
    fontSize: TIPO.subtitulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.p,
  },
  paragrafo: { marginBottom: ESPACO.p },
  separador: { height: ESPACO.m },
});
