import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { registerForm } from '@taskplay/shared-types';
import { useTermo } from '../api/consultas';
import { useSessao } from '../auth/sessao';
import { Botao, Campo, Carregando, Erro, Falha } from './componentes';
import { useErrosDoFormulario } from './formulario';
import { TextoDoTermo } from './Termo';
import { CORES, ESPACO, TIPO } from './tema';

const CAMPOS = ['familyName', 'name', 'email', 'password', 'pin'] as const;

const CAMPOS_E_ACEITE = [...CAMPOS, 'acceptedTcleVersion'] as const;

export function Cadastro({
  irParaEntrar,
  irParaConvite,
}: {
  irParaEntrar: () => void;
  /** O filho com celular proprio entra pelo codigo, e nao por conta. */
  irParaConvite: () => void;
}) {
  const { cadastrar } = useSessao();
  const [etapa, setEtapa] = useState<'formulario' | 'termo'>('formulario');
  const [familia, setFamilia] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [pin, setPin] = useState('');
  const erros = useErrosDoFormulario(CAMPOS_E_ACEITE);
  const [ocupado, setOcupado] = useState(false);
  // Buscado so na etapa do termo: quem ainda preenche o formulario nao precisa
  // dele, e buscar ao abrir a etapa e o que garante a versao mais recente.
  const termo = useTermo(etapa === 'termo');

  const dados = {
    familyName: familia,
    name: nome,
    email,
    password: senha,
    pin,
  };

  function continuar() {
    const conferido = registerForm.safeParse(dados);
    if (!conferido.success) {
      erros.marcar(conferido.error.issues);
      return;
    }
    erros.limpar();
    setEtapa('termo');
  }

  async function concordarECriar(versao: string) {
    erros.limpar();
    setOcupado(true);
    try {
      await cadastrar({ ...dados, acceptedTcleVersion: versao });
    } catch (e) {
      const { porCampo } = erros.registrar(e);
      if (porCampo['acceptedTcleVersion']) {
        void termo.refetch();
      } else if (Object.keys(porCampo).length > 0) {
        setEtapa('formulario');
      }
    } finally {
      setOcupado(false);
    }
  }

  if (etapa === 'termo') {
    const voltarAoFormulario = (
      <Botao
        titulo="Voltar ao formulário"
        variante="secundaria"
        aoTocar={() => setEtapa('formulario')}
        desabilitado={ocupado}
      />
    );
    // Sem o texto nao ha o que aceitar, e o botao de aceite nem aparece: um
    // "Li e concordo" sobre uma tela vazia registraria um aceite sem leitura.
    if (termo.isPending) return <Carregando rotulo="Carregando o termo" />;
    if (termo.isError) {
      return (
        <View style={estilos.container}>
          <Falha erro={termo.error} aoTentarDeNovo={() => termo.refetch()} />
          <View style={estilos.rodape}>{voltarAoFormulario}</View>
        </View>
      );
    }

    return (
      <ScrollView contentContainerStyle={estilos.conteudo}>
        <Text accessibilityRole="header" style={estilos.titulo}>
          {termo.data.title}
        </Text>
        <Text style={estilos.apoio}>
          Última etapa. A família só é criada depois que você concordar com este termo.
        </Text>

        <TextoDoTermo termo={termo.data} />

        <View style={estilos.separador} />
        <Erro mensagem={erros.porCampo['acceptedTcleVersion'] ?? erros.geral} />
        <Botao
          titulo="Li e concordo"
          aoTocar={() => concordarECriar(termo.data.version)}
          // Enquanto a versao nova chega, aceitar seria aceitar a antiga.
          carregando={ocupado || termo.isFetching}
        />
        <View style={estilos.separador} />
        {voltarAoFormulario}
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={estilos.container}
    >
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Criar a família no TaskPlay</Text>
        <Text style={estilos.apoio}>
          Você cadastra os filhos depois, aqui mesmo. Eles não precisam de e-mail nem senha.
        </Text>

        <Campo
          rotulo="Nome da família"
          value={familia}
          onChangeText={erros.aoEditar('familyName', setFamilia)}
          erro={erros.porCampo['familyName']}
        />
        <Campo
          rotulo="Seu nome"
          value={nome}
          onChangeText={erros.aoEditar('name', setNome)}
          erro={erros.porCampo['name']}
        />
        <Campo
          rotulo="Seu e-mail"
          value={email}
          onChangeText={erros.aoEditar('email', setEmail)}
          erro={erros.porCampo['email']}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <Campo
          rotulo="Senha (ao menos 8 caracteres)"
          value={senha}
          onChangeText={erros.aoEditar('password', setSenha)}
          erro={erros.porCampo['password']}
          secureTextEntry
        />
        <Campo
          rotulo="PIN de 4 dígitos"
          value={pin}
          onChangeText={erros.aoEditar('pin', setPin)}
          erro={erros.porCampo['pin']}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
        />
        <Text style={estilos.apoio}>
          O PIN protege o seu perfil quando alguém quiser voltar dele no aparelho compartilhado.
        </Text>

        <Erro mensagem={erros.geral} />
        <Botao titulo="Continuar" aoTocar={continuar} />
        <View style={estilos.separador} />
        <Botao titulo="Já tenho conta" variante="secundaria" aoTocar={irParaEntrar} />
        <View style={estilos.separador} />
        <Botao titulo="Tenho um código de convite" variante="secundaria" aoTocar={irParaConvite} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  conteudo: { padding: ESPACO.g, paddingTop: ESPACO.gg * 2 },
  titulo: {
    fontSize: TIPO.titulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.p,
  },
  apoio: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginBottom: ESPACO.g,
  },
  separador: { height: ESPACO.m },
  rodape: { padding: ESPACO.g },
});
