import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCriarItem } from '../api/consultas';
import { Botao, Campo, Erro, Escolha, textoDaFalha } from './componentes';
import { useErrosDoFormulario } from './formulario';
import { CORES, ESPACO, TIPO } from './tema';

const CUSTOS = [20, 50, 100, 200, 500] as const;

const CAMPOS = ['name', 'costPoints', 'stock'] as const;

export function NovoItem({ voltar }: { voltar: () => void }) {
  const criar = useCriarItem();
  const erros = useErrosDoFormulario(CAMPOS);

  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [custo, setCusto] = useState('50');
  const [limitado, setLimitado] = useState<'nao' | 'sim'>('nao');
  const [quantidade, setQuantidade] = useState('1');
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  function enviar() {
    if (nome.trim().length === 0) {
      setErroLocal('Dê um nome à recompensa.');
      return;
    }
    const estoque = Number(quantidade);
    if (limitado === 'sim' && (!Number.isInteger(estoque) || estoque < 0)) {
      setErroLocal('A quantidade precisa ser um número inteiro.');
      return;
    }
    setErroLocal(null);
    erros.limpar();
    criar.mutate(
      {
        name: nome.trim(),
        description: descricao.trim() || undefined,
        costPoints: Number(custo),
        stock: limitado === 'sim' ? estoque : undefined,
      },
      { onSuccess: voltar, onError: erros.registrar },
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>Nova recompensa</Text>

      <Campo
        rotulo="O que a família pode trocar"
        value={nome}
        onChangeText={erros.aoEditar('name', setNome)}
        placeholder="Ex.: escolher o filme da sexta"
        erro={erros.porCampo['name']}
      />

      <Campo
        rotulo="Detalhes (opcional)"
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Ex.: vale para um filme, até às 22h"
        multiline
      />

      <Escolha
        rotulo="Quanto custa"
        valor={custo}
        aoEscolher={setCusto}
        opcoes={CUSTOS.map((c) => ({ valor: String(c), texto: `${c}` }))}
        erro={erros.porCampo['costPoints']}
      />

      <Escolha
        rotulo="Tem quantidade limitada?"
        valor={limitado}
        aoEscolher={setLimitado}
        opcoes={[
          { valor: 'nao', texto: 'Sem limite' },
          { valor: 'sim', texto: 'Limitada' },
        ]}
      />

      {limitado === 'sim' ? (
        <Campo
          rotulo="Quantas unidades"
          value={quantidade}
          onChangeText={setQuantidade}
          keyboardType="number-pad"
          erro={erros.porCampo['stock']}
        />
      ) : null}

      <Erro mensagem={erroLocal ?? erros.geral ?? (criar.isError ? textoDaFalha(criar.error) : null)} />
      <Botao titulo="Cadastrar" aoTocar={enviar} carregando={criar.isPending} />
      <View style={estilos.separador} />
      <Botao titulo="Cancelar" variante="secundaria" aoTocar={voltar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.m },
  separador: { height: ESPACO.p },
});
