import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { enrollRequest } from '@taskplay/shared-types';
import { useSessao } from '../auth/sessao';
import { Botao, Campo, Erro } from './componentes';
import { useErrosDoFormulario } from './formulario';
import { CORES, ESPACO, TIPO } from './tema';

/** O unico campo, com o nome que ele tem em `enrollRequest`. */
const CAMPOS = ['code'] as const;

export function normalizarCodigo(digitado: string): string {
  return digitado
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

export function Vincular({ voltar }: { voltar: () => void }) {
  const { vincular } = useSessao();
  const [codigo, setCodigo] = useState('');
  const erros = useErrosDoFormulario(CAMPOS);
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    erros.limpar();
    const conferido = enrollRequest.shape.code.safeParse(codigo);
    if (!conferido.success) {
      erros.marcar(conferido.error.issues.map((issue) => ({ ...issue, path: ['code'] })));
      return;
    }

    setOcupado(true);
    try {
      await vincular(codigo);
    } catch (e) {
      erros.registrar(e);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={estilos.container}
    >
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Código de convite</Text>
        <Text style={estilos.apoio}>
          Peça ao responsável para abrir Filhos no celular dele e tocar em &quot;Vincular celular
          próprio&quot; no seu nome. Digite aqui o código de 6 letras e números que aparecer.
        </Text>

        <Campo
          rotulo="Código"
          value={codigo}
          onChangeText={erros.aoEditar('code', (v) => setCodigo(normalizarCodigo(v)))}
          erro={erros.porCampo['code']}
          placeholder="Ex.: K7MB2Q"
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={6}
        />

        <Erro mensagem={erros.geral} />
        <Botao titulo="Entrar com o código" aoTocar={enviar} carregando={ocupado} />
        <View style={estilos.separador} />
        <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  conteudo: { padding: ESPACO.g, paddingTop: ESPACO.gg * 2 },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginBottom: ESPACO.g,
    lineHeight: 20,
  },
  separador: { height: ESPACO.m },
});
