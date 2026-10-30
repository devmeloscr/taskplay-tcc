import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCriarMembro } from '../api/consultas';
import { useErrosDoFormulario } from './formulario';
import { Botao, Campo, Erro, textoDaFalha } from './componentes';
import { dataDeNascimentoParaIso, mascaraDeDataDeNascimento } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

/** Os `path` que a API devolve e esta tela sabe apontar. */
const CAMPOS = ['name', 'birthDate'] as const;

export function NovoMembro({ voltar }: { voltar: () => void }) {
  const criar = useCriarMembro();
  const erros = useErrosDoFormulario(CAMPOS);

  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [faltando, setFaltando] = useState<Record<string, string>>({});
  const [cadastrado, setCadastrado] = useState<string | null>(null);

  function enviar() {
    // Recusa antes da rede, como no formulario de tarefa: gastar a requisicao
    // para ouvir de volta que o nome esta vazio e a espera que nao se repete.
    const pendencias: Record<string, string> = {};
    if (nome.trim().length === 0) pendencias['name'] = 'Informe o nome do filho';

    let birthDate: string | undefined;
    if (nascimento.trim().length > 0) {
      const convertida = dataDeNascimentoParaIso(nascimento);
      if ('erro' in convertida) pendencias['birthDate'] = convertida.erro;
      else birthDate = convertida.iso;
    }

    if (Object.keys(pendencias).length > 0) {
      setFaltando(pendencias);
      return;
    }

    setFaltando({});
    erros.limpar();
    criar.mutate(
      { name: nome.trim(), birthDate },
      {
        onSuccess: (membro) => {
          setCadastrado(membro.name);
          setNome('');
          setNascimento('');
        },
        onError: erros.registrar,
      },
    );
  }

  const erroDe = (campo: string) => faltando[campo] ?? erros.porCampo[campo] ?? null;

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>Cadastrar filho</Text>
      <Text style={estilos.apoio}>
        O filho entra tocando no próprio nome, sem e-mail e sem senha. Nada além do que está aqui é
        guardado sobre ele.
      </Text>

      {cadastrado ? (
        <Text accessibilityRole="alert" style={estilos.confirmacao}>
          {cadastrado} já aparece no seletor de perfis. Pode cadastrar outro ou voltar.
        </Text>
      ) : null}

      <Campo
        rotulo="Nome"
        value={nome}
        onChangeText={erros.aoEditar('name', (v) => {
          setNome(v);
          setCadastrado(null);
          setFaltando(({ name: _, ...resto }) => resto);
        })}
        placeholder="Ex.: Pedro"
        erro={erroDe('name')}
      />

      <Campo
        rotulo="Data de nascimento (opcional)"
        value={nascimento}
        onChangeText={erros.aoEditar('birthDate', (v) => {
          setNascimento(mascaraDeDataDeNascimento(v));
          setFaltando(({ birthDate: _, ...resto }) => resto);
        })}
        placeholder="31/12/2016"
        keyboardType="number-pad"
        maxLength={10}
        erro={erroDe('birthDate')}
      />
      <Text style={estilos.nota}>
        Serve só para separar os resultados da pesquisa por idade. Pode deixar em branco.
      </Text>

      <Erro mensagem={erros.geral ?? (criar.isError ? textoDaFalha(criar.error) : null)} />
      <Botao titulo="Cadastrar" aoTocar={enviar} carregando={criar.isPending} />
      <View style={estilos.separador} />
      <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.g, lineHeight: 20 },
  confirmacao: {
    fontSize: TIPO.corpo,
    color: CORES.sucesso,
    fontWeight: '600',
    marginBottom: ESPACO.m,
  },
  nota: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginTop: -ESPACO.p,
    marginBottom: ESPACO.m,
    lineHeight: 20,
  },
  separador: { height: ESPACO.p },
});
