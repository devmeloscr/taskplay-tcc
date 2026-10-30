import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSessao } from '../auth/sessao';
import { Botao, Campo, Erro } from './componentes';
import { useErrosDoFormulario } from './formulario';
import { CORES, ESPACO, TIPO } from './tema';

/** Campos desta tela, com o nome que eles tem em `loginRequest`. */
const CAMPOS = ['email', 'password'] as const;

export function Entrar({
  irParaCadastro,
  irParaConvite,
}: {
  irParaCadastro: () => void;
  /** O filho com celular proprio entra pelo codigo, e nao por conta. */
  irParaConvite: () => void;
}) {
  const { entrar } = useSessao();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const erros = useErrosDoFormulario(CAMPOS);
  const [ocupado, setOcupado] = useState(false);

  async function enviar() {
    erros.limpar();
    setOcupado(true);
    try {
      await entrar({ email, password: senha });
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
        <Text style={estilos.titulo}>Entrar</Text>
        <Text style={estilos.apoio}>
          Só o responsável entra com e-mail e senha, e só uma vez por aparelho.
        </Text>

        <Campo
          rotulo="E-mail"
          value={email}
          onChangeText={erros.aoEditar('email', setEmail)}
          erro={erros.porCampo['email']}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Campo
          rotulo="Senha"
          value={senha}
          onChangeText={erros.aoEditar('password', setSenha)}
          erro={erros.porCampo['password']}
          secureTextEntry
        />

        <Erro mensagem={erros.geral} />
        <Botao titulo="Entrar" aoTocar={enviar} carregando={ocupado} />
        <View style={estilos.separador} />
        <Botao titulo="Criar uma família" variante="secundaria" aoTocar={irParaCadastro} />
        <View style={estilos.separador} />
        <Botao titulo="Tenho um código de convite" variante="secundaria" aoTocar={irParaConvite} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  conteudo: { padding: ESPACO.g, paddingTop: ESPACO.gg * 2 },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.g },
  separador: { height: ESPACO.m },
});
