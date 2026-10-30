import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ALVO_MINIMO, CORES, ESPACO, TIPO } from './tema';

export const ALTURA_DA_MENSAGEM = 3 * 18;

export function TecladoDePin({
  nome,
  erro,
  ocupado,
  aoConfirmar,
  aoCancelar,
}: {
  nome: string;
  erro: string | null;
  ocupado: boolean;
  aoConfirmar: (pin: string) => void;
  aoCancelar: () => void;
}) {
  const [digitos, setDigitos] = useState('');

  function tocar(digito: string) {
    if (ocupado || digitos.length >= 4) return;
    const proximo = digitos + digito;
    setDigitos(proximo);
    if (proximo.length === 4) {
      // Envia sozinho ao completar: um botao "confirmar" depois do quarto digito
      // e um toque a mais sem decisao nenhuma.
      aoConfirmar(proximo);
      setDigitos('');
    }
  }

  return (
    <View style={estilos.container}>
      <Text style={estilos.titulo}>PIN de {nome}</Text>
      <View style={estilos.pontos}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[estilos.ponto, i < digitos.length && estilos.pontoCheio]} />
        ))}
      </View>

      <View testID="espaco-da-mensagem" style={estilos.espacoDaMensagem}>
        {erro ? (
          <Text accessibilityRole="alert" style={estilos.mensagem}>
            {erro}
          </Text>
        ) : null}
      </View>

      <View style={estilos.teclado}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <Tecla key={d} rotulo={d} aoTocar={() => tocar(d)} />
        ))}
        <View style={estilos.tecla} />
        <Tecla rotulo="0" aoTocar={() => tocar('0')} />
        <Tecla
          rotulo="⌫"
          etiqueta="Apagar"
          aoTocar={() => setDigitos((d) => d.slice(0, -1))}
        />
      </View>

      <TouchableOpacity
        onPress={aoCancelar}
        accessibilityRole="button"
        accessibilityLabel="Voltar para a escolha de perfil"
        style={estilos.voltar}
      >
        <Text style={estilos.voltarTexto}>Voltar</Text>
      </TouchableOpacity>
    </View>
  );
}

function Tecla({
  rotulo,
  etiqueta,
  aoTocar,
}: {
  rotulo: string;
  etiqueta?: string;
  aoTocar: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={etiqueta ?? rotulo}
      style={estilos.tecla}
    >
      <Text style={estilos.teclaTexto}>{rotulo}</Text>
    </TouchableOpacity>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACO.g },
  titulo: { fontSize: TIPO.subtitulo, fontWeight: '600', color: CORES.texto, marginBottom: ESPACO.g },
  pontos: { flexDirection: 'row', gap: ESPACO.m, marginBottom: ESPACO.m },
  espacoDaMensagem: {
    height: ALTURA_DA_MENSAGEM,
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  mensagem: {
    color: CORES.erro,
    fontSize: TIPO.apoio,
    lineHeight: 18,
    textAlign: 'center',
  },
  ponto: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: CORES.borda,
  },
  pontoCheio: { backgroundColor: CORES.primaria, borderColor: CORES.primaria },
  teclado: { width: 3 * (ALVO_MINIMO + ESPACO.m), flexDirection: 'row', flexWrap: 'wrap' },
  tecla: {
    width: ALVO_MINIMO + ESPACO.m,
    height: ALVO_MINIMO + ESPACO.p,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teclaTexto: { fontSize: 28, color: CORES.texto },
  voltar: { marginTop: ESPACO.g, minHeight: ALVO_MINIMO, justifyContent: 'center' },
  voltarTexto: { fontSize: TIPO.corpo, color: CORES.primaria },
});
