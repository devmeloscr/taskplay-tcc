import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useTarefas } from '../api/consultas';
import type { Tarefa } from '../api/cliente';
import { useSessao } from '../auth/sessao';
import {
  Botao,
  Cartao,
  Carregando,
  Escolha,
  Falha,
  Selo,
  Vazio,
  usePuxarParaAtualizar,
} from './componentes';
import { ESTADO_DA_TAREFA, grupoDe, type Grupo } from './estados';
import { prazoEmPalavras, pontos, pontosDaEntrega } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

export function Tarefas({
  irParaTarefa,
  irParaNova,
}: {
  irParaTarefa: (id: string) => void;
  irParaNova: () => void;
}) {
  const { perfilAtivo } = useSessao();
  const ehResponsavel = perfilAtivo?.papel === 'PARENT';
  const [grupo, setGrupo] = useState<Grupo>('fazer');
  const consulta = useTarefas();

  const porGrupo = useMemo(() => {
    const vazio: Record<Grupo, Tarefa[]> = { fazer: [], conferir: [], encerradas: [] };
    for (const tarefa of consulta.data ?? []) {
      vazio[grupoDe(tarefa.status)].push(tarefa);
    }
    return vazio;
  }, [consulta.data]);

  const puxar = usePuxarParaAtualizar(() => consulta.refetch());

  if (consulta.isPending) return <Carregando rotulo="Carregando as tarefas" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }

  const lista = porGrupo[grupo];

  return (
    <View style={estilos.container}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Tarefas</Text>
        <Escolha
          rotulo="Mostrar"
          valor={grupo}
          aoEscolher={setGrupo}
          opcoes={[
            // O numero entra no rotulo porque a pergunta que se faz ao abrir e
            // "quanto falta", e nao "quais grupos existem".
            { valor: 'fazer', texto: `A fazer (${porGrupo.fazer.length})` },
            {
              valor: 'conferir',
              texto: ehResponsavel
                ? `Conferir (${porGrupo.conferir.length})`
                : `Enviadas (${porGrupo.conferir.length})`,
            },
            { valor: 'encerradas', texto: `Encerradas (${porGrupo.encerradas.length})` },
          ]}
        />
      </View>

      <FlatList
        data={lista}
        keyExtractor={(tarefa) => tarefa.id}
        contentContainerStyle={estilos.lista}
        refreshControl={<RefreshControl {...puxar} />}
        ListEmptyComponent={<VazioDoGrupo grupo={grupo} ehResponsavel={ehResponsavel} />}
        renderItem={({ item }) => (
          <LinhaDaTarefa
            tarefa={item}
            mostrarResponsavelPor={ehResponsavel}
            aoTocar={() => irParaTarefa(item.id)}
          />
        )}
      />

      {ehResponsavel ? (
        <View style={estilos.rodape}>
          <Botao titulo="Criar tarefa" aoTocar={irParaNova} />
        </View>
      ) : null}
    </View>
  );
}

function LinhaDaTarefa({
  tarefa,
  mostrarResponsavelPor,
  aoTocar,
}: {
  tarefa: Tarefa;
  mostrarResponsavelPor: boolean;
  aoTocar: () => void;
}) {
  const estado = ESTADO_DA_TAREFA[tarefa.status];
  const prazo = prazoEmPalavras(tarefa.dueAt);
  // Depois de uma entrega atrasada, `points` deixa de ser o que a crianca
  // recebeu: o cartao mostra o valor que o razao registrou, e nao o de face.
  const entrega = pontosDaEntrega(tarefa);
  const pontosEmPalavras = entrega.reduzido
    ? `${pontos(entrega.valor)}, em vez de ${entrega.cheios}, por causa do atraso`
    : pontos(entrega.valor);
  return (
    <Cartao
      aoTocar={aoTocar}
      // Um rotulo so, com tudo que o cartao mostra: quem usa leitor de tela
      // ouve a linha inteira de uma vez, em vez de quatro fragmentos soltos.
      rotulo={`${tarefa.title}. ${pontosEmPalavras}. ${prazo}. ${estado.texto}${
        mostrarResponsavelPor ? `. De ${tarefa.assignee.name}` : ''
      }`}
    >
      <View style={estilos.linhaTopo}>
        <Text style={estilos.tituloDaTarefa} numberOfLines={2}>
          {tarefa.title}
        </Text>
        <View style={estilos.colunaPontos}>
          <Text style={estilos.pontos}>{pontos(entrega.valor)}</Text>
          {entrega.reduzido ? (
            <Text style={estilos.pontosCortados}>em vez de {entrega.cheios}</Text>
          ) : null}
        </View>
      </View>
      {mostrarResponsavelPor ? <Text style={estilos.apoio}>{tarefa.assignee.name}</Text> : null}
      <Text style={estilos.apoio}>{prazo}</Text>
      <View style={estilos.linhaSelo}>
        <Selo texto={estado.texto} cor={estado.cor} />
        {tarefa.verification === 'IMAGE' ? <Selo texto="Com foto" cor={CORES.textoSuave} /> : null}
      </View>
    </Cartao>
  );
}

/** O vazio muda com o grupo: em cada um, "nada aqui" significa outra coisa. */
function VazioDoGrupo({ grupo, ehResponsavel }: { grupo: Grupo; ehResponsavel: boolean }) {
  if (grupo === 'fazer') {
    return (
      <Vazio
        titulo="Nada a fazer agora"
        apoio={
          ehResponsavel
            ? 'Toque em "Criar tarefa" para combinar a próxima.'
            : 'Quando o responsável criar uma tarefa, ela aparece aqui.'
        }
      />
    );
  }
  if (grupo === 'conferir') {
    return (
      <Vazio
        titulo={ehResponsavel ? 'Nada para conferir' : 'Nada enviado'}
        apoio={
          ehResponsavel
            ? 'As tarefas que a família concluir aparecem aqui esperando sua conferência.'
            : 'As tarefas que você concluir ficam aqui até o responsável conferir.'
        }
      />
    );
  }
  return <Vazio titulo="Nada encerrado ainda" apoio="Tarefas aprovadas e canceladas ficam aqui." />;
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  cabecalho: { paddingHorizontal: ESPACO.m, paddingTop: ESPACO.m },
  titulo: {
    fontSize: TIPO.titulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.m,
  },
  lista: { paddingHorizontal: ESPACO.m, paddingBottom: ESPACO.m, flexGrow: 1 },
  linhaTopo: { flexDirection: 'row', alignItems: 'flex-start', gap: ESPACO.p },
  tituloDaTarefa: { flex: 1, fontSize: TIPO.subtitulo, fontWeight: '600', color: CORES.texto },
  colunaPontos: { alignItems: 'flex-end' },
  pontos: { fontSize: TIPO.corpo, fontWeight: '700', color: CORES.primaria },
  pontosCortados: { fontSize: TIPO.apoio, color: CORES.atencao, marginTop: 2 },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: 2 },
  linhaSelo: { flexDirection: 'row', gap: ESPACO.p, marginTop: ESPACO.p },
  rodape: {
    padding: ESPACO.m,
    borderTopWidth: 1,
    borderTopColor: CORES.borda,
    backgroundColor: CORES.superficie,
  },
});
