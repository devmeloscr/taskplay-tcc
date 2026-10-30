import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSessao } from '../auth/sessao';
import { Botao, Campo, Erro } from './componentes';
import { useErrosDoFormulario } from './formulario';
import { CORES, ESPACO, TIPO } from './tema';

/** Campos desta tela, com o nome que eles tem em `revokeConsentRequest`. */
const CAMPOS = ['password', 'pin', 'confirmacao'] as const;

/** O texto que o responsavel precisa digitar por extenso. */
const CONFIRMACAO = 'REMOVER TUDO';

export function ExcluirConta({ voltar }: { voltar: () => void }) {
  const { excluirConta, sair } = useSessao();
  const [senha, setSenha] = useState('');
  const [pin, setPin] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const erros = useErrosDoFormulario(CAMPOS);
  const [ocupado, setOcupado] = useState(false);
  const [removido, setRemovido] = useState<{
    fotosRemovidas: number;
    membros: number;
    tarefas: number;
  } | null>(null);

  async function remover() {
    erros.limpar();
    setOcupado(true);
    try {
      setRemovido(await excluirConta({ password: senha, pin }));
    } catch (e) {
      erros.registrar(e);
    } finally {
      setOcupado(false);
    }
  }

  if (removido) {
    return (
      <View style={estilos.centralizado}>
        <Text style={estilos.titulo}>Dados removidos</Text>
        <Text style={estilos.apoioCentral}>
          Sairam {removido.membros} {removido.membros === 1 ? 'perfil' : 'perfis'},{' '}
          {removido.tarefas} {removido.tarefas === 1 ? 'tarefa' : 'tarefas'} e{' '}
          {removido.fotosRemovidas} {removido.fotosRemovidas === 1 ? 'foto' : 'fotos'}. Nada disso
          fica guardado.
        </Text>
        <Botao titulo="Concluir" aoTocar={sair} />
      </View>
    );
  }

  const podeRemover = confirmacao === CONFIRMACAO && senha.length > 0 && pin.length === 4;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={estilos.container}
    >
      <ScrollView contentContainerStyle={estilos.conteudo} keyboardShouldPersistTaps="handled">
        <Text style={estilos.titulo}>Excluir a conta da família</Text>
        <Text style={estilos.aviso}>
          Esta ação não tem como ser desfeita. São removidos os perfis de todos os membros, as
          tarefas, as fotos enviadas, os pontos e o histórico da família inteira.
        </Text>
        <Text style={estilos.apoio}>
          Você pode sair do estudo a qualquer momento, e é isso que este botão faz. Se só quiser
          desconectar este aparelho, volte e use &quot;Sair deste aparelho&quot;.
        </Text>

        <Campo
          rotulo="Sua senha"
          value={senha}
          onChangeText={erros.aoEditar('password', setSenha)}
          erro={erros.porCampo['password']}
          secureTextEntry
        />
        <Campo
          rotulo="Seu PIN de 4 dígitos"
          value={pin}
          onChangeText={erros.aoEditar('pin', setPin)}
          erro={erros.porCampo['pin']}
          keyboardType="number-pad"
          maxLength={4}
          secureTextEntry
        />
        <Campo
          rotulo={`Digite ${CONFIRMACAO} para confirmar`}
          value={confirmacao}
          onChangeText={erros.aoEditar('confirmacao', setConfirmacao)}
          erro={erros.porCampo['confirmacao']}
          autoCapitalize="characters"
          autoCorrect={false}
        />

        <Erro mensagem={erros.geral} />
        <Botao
          titulo="Remover tudo"
          aoTocar={remover}
          carregando={ocupado}
          desabilitado={!podeRemover}
        />
        <View style={estilos.separador} />
        <Botao titulo="Cancelar" variante="secundaria" aoTocar={voltar} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  conteudo: { padding: ESPACO.g, paddingTop: ESPACO.gg * 2 },
  centralizado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACO.g },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.m },
  aviso: {
    fontSize: TIPO.corpo,
    color: CORES.erro,
    fontWeight: '600',
    marginBottom: ESPACO.m,
  },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.g },
  apoioCentral: {
    fontSize: TIPO.corpo,
    color: CORES.textoSuave,
    marginBottom: ESPACO.gg,
    textAlign: 'center',
  },
  separador: { height: ESPACO.m },
});
