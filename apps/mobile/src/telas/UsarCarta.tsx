import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useMembros, useTarefas, useUsarCarta } from '../api/consultas';
import { useSessao } from '../auth/sessao';
import { Botao, Carregando, Erro, Escolha, Falha, Vazio, textoDaFalha } from './componentes';
import { prazoEmPalavras, pontos } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

export function UsarCarta({ compraId, voltar }: { compraId: string; voltar: () => void }) {
  const { perfilAtivo } = useSessao();
  const tarefas = useTarefas();
  const membros = useMembros();
  const usar = useUsarCarta();

  const [tarefa, setTarefa] = useState<string | null>(null);
  const [paraQuem, setParaQuem] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  if (tarefas.isPending || membros.isPending) return <Carregando rotulo="Carregando" />;
  if (tarefas.isError) return <Falha erro={tarefas.error} aoTentarDeNovo={() => tarefas.refetch()} />;
  if (membros.isError) return <Falha erro={membros.error} aoTentarDeNovo={() => membros.refetch()} />;

  const repassaveis = tarefas.data.filter(
    (t) => t.assigneeId === perfilAtivo?.id && (t.status === 'PENDING' || t.status === 'REJECTED'),
  );
  const destinatarios = membros.data.filter((m) => m.id !== perfilAtivo?.id);

  if (repassaveis.length === 0 || destinatarios.length === 0) {
    return (
      <View style={estilos.containerVazio}>
        <Text style={estilos.titulo}>Usar a carta</Text>
        <Vazio
          titulo={repassaveis.length === 0 ? 'Nenhuma tarefa para repassar' : 'Ninguém para receber'}
          apoio={
            repassaveis.length === 0
              ? 'Só dá para repassar uma tarefa sua que ainda não foi concluída. A carta continua guardada até lá.'
              : 'A tarefa passa para outra pessoa da família, e não há mais ninguém cadastrado. A carta continua guardada.'
          }
        />
        <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
      </View>
    );
  }

  function enviar() {
    if (!tarefa || !paraQuem) {
      setErroLocal('Escolha a tarefa e para quem ela vai.');
      return;
    }
    setErroLocal(null);
    usar.mutate(
      { purchaseId: compraId, taskId: tarefa, toUserId: paraQuem },
      { onSuccess: voltar },
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>Usar a carta</Text>
      <Text style={estilos.apoio}>
        A tarefa escolhida passa para outra pessoa da família, com o mesmo prazo e os mesmos
        pontos. A carta é usada uma vez só.
      </Text>

      <Escolha
        rotulo="Qual tarefa"
        valor={tarefa}
        aoEscolher={setTarefa}
        opcoes={repassaveis.map((t) => ({
          valor: t.id,
          texto: `${t.title} · ${pontos(t.points)} · ${prazoEmPalavras(t.dueAt)}`,
        }))}
      />

      <Escolha
        rotulo="Para quem"
        valor={paraQuem}
        aoEscolher={setParaQuem}
        opcoes={destinatarios.map((m) => ({ valor: m.id, texto: m.name }))}
      />

      <Erro mensagem={erroLocal ?? (usar.isError ? textoDaFalha(usar.error) : null)} />
      <Botao titulo="Repassar a tarefa" aoTocar={enviar} carregando={usar.isPending} />
      <View style={estilos.separador} />
      <Botao titulo="Guardar a carta" variante="secundaria" aoTocar={voltar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  // O aviso ocupa o meio da tela e empurra o "Voltar" para o pe: sem `flex`, o
  // bloco centralizado nao teria altura para crescer.
  containerVazio: { flex: 1, padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.corpo, color: CORES.textoSuave, marginBottom: ESPACO.g },
  separador: { height: ESPACO.p },
});
