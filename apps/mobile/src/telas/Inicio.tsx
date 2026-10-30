import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSessao } from '../auth/sessao';
import { Botao } from './componentes';
import { CORES, ESPACO, TIPO } from './tema';

export function Inicio({
  irParaExclusao,
  irParaFilhos,
  irParaTermo,
}: {
  irParaExclusao: () => void;
  irParaFilhos: () => void;
  irParaTermo: () => void;
}) {
  const { perfilAtivo, trocarDePerfil, sair } = useSessao();
  const [saindo, setSaindo] = useState(false);
  const ehResponsavel = perfilAtivo?.papel === 'PARENT';

  async function sairDoAparelho() {
    setSaindo(true);
    try {
      await sair();
    } finally {
      // A tela some junto com a sessao; o `finally` cobre a falha, em que ela
      // continua montada.
      setSaindo(false);
    }
  }

  return (
    <View style={estilos.container}>
      <Text style={estilos.ola}>Olá, {perfilAtivo?.nome}</Text>
      <Text style={estilos.papel}>{ehResponsavel ? 'Responsável' : 'Filho'}</Text>
      <View style={estilos.acoes}>
        {ehResponsavel ? (
          <>
            {/* Primeiro, e em botao primario: sem filho cadastrado nao ha a quem
                atribuir tarefa, e o aplicativo inteiro fica parado. */}
            <Botao titulo="Gerenciar filhos" aoTocar={irParaFilhos} />
            <View style={estilos.separador} />
          </>
        ) : null}
        <Botao titulo="Trocar de perfil" variante="secundaria" aoTocar={trocarDePerfil} />
        {ehResponsavel ? (
          <>
            <View style={estilos.separador} />
            <Botao
              titulo="Sair deste aparelho"
              variante="secundaria"
              aoTocar={sairDoAparelho}
              carregando={saindo}
            />
            <View style={estilos.separador} />
            {/* O termo promete que pode ser relido a qualquer momento, e fica
                logo antes da saida do estudo: e nele que a saida esta descrita. */}
            <Botao titulo="Termo de consentimento" variante="secundaria" aoTocar={irParaTermo} />
            <View style={estilos.separador} />
            <Botao titulo="Excluir a conta" variante="secundaria" aoTocar={irParaExclusao} />
          </>
        ) : (
          // A frase existe para o botao unico nao parecer falta: ela diz o que
          // acontece ao tocar, e a quem pedir o que nao esta aqui.
          <Text style={estilos.apoio}>
            Trocar de perfil leva de volta à tela de escolha. Para sair deste aparelho, peça ao
            responsável.
          </Text>
        )}
      </View>
    </View>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACO.g },
  ola: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto },
  papel: { fontSize: TIPO.corpo, color: CORES.textoSuave, marginBottom: ESPACO.g },
  apoio: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    textAlign: 'center',
    marginTop: ESPACO.m,
  },
  acoes: { alignSelf: 'stretch' },
  separador: { height: ESPACO.m },
});
