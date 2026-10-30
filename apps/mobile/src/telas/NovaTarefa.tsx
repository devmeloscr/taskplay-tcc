import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Membro, Tarefa } from '../api/cliente';
import { useAtualizarTarefa, useCriarTarefa, useMembros, useTarefa } from '../api/consultas';
import { useSessao } from '../auth/sessao';
import { useErrosDoFormulario } from './formulario';
import { Botao, Campo, Carregando, Erro, Escolha, Falha, textoDaFalha } from './componentes';
import { prazoEmPalavras } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

const PONTOS = [5, 10, 20, 50, 100] as const;

/** Hora em que as opcoes de dia caem: o fim da rotina domestica. */
const HORA_DO_PRAZO = 20;

/** Folga de "Agora": o tempo de largar o que se esta fazendo e ir fazer. */
const MINUTOS_DE_AGORA = 60;

interface OpcaoDePrazo {
  valor: string;
  texto: string;
  /** Resolve a palavra escolhida no instante do envio, e nao no da montagem. */
  resolver: (agora: Date) => Date;
}

function daquiAMinutos(minutos: number) {
  return (agora: Date) => new Date(agora.getTime() + minutos * 60_000);
}

function noFimDoDia(emDias: number) {
  return (agora: Date) => {
    const prazo = new Date(agora);
    prazo.setDate(prazo.getDate() + emDias);
    prazo.setHours(HORA_DO_PRAZO, 0, 0, 0);
    return prazo;
  };
}

function prazosDisponiveis(agora: Date, prazoAtual?: string): OpcaoDePrazo[] {
  const opcoes: OpcaoDePrazo[] = [
    {
      valor: 'agora',
      texto: 'Agora',
      resolver: daquiAMinutos(MINUTOS_DE_AGORA),
    },
    { valor: 'hoje', texto: 'Hoje à noite', resolver: noFimDoDia(0) },
    { valor: 'amanha', texto: 'Amanhã', resolver: noFimDoDia(1) },
    { valor: 'tres', texto: 'Em 3 dias', resolver: noFimDoDia(3) },
    { valor: 'sete', texto: 'Em 7 dias', resolver: noFimDoDia(7) },
  ];
  const disponiveis =
    agora.getHours() >= HORA_DO_PRAZO
      ? opcoes.filter((opcao) => opcao.valor !== 'hoje')
      : opcoes;

  if (!prazoAtual) return disponiveis;
  return [
    {
      valor: 'manter',
      texto: `Manter: ${prazoEmPalavras(prazoAtual, agora)}`,
      resolver: () => new Date(prazoAtual),
    },
    ...disponiveis,
  ];
}

function pontosDisponiveis(atual?: number): number[] {
  const escala: number[] = [...PONTOS];
  if (atual === undefined || escala.includes(atual)) return escala;
  return [...escala, atual].sort((a, b) => a - b);
}

const CAMPOS = ['title', 'assigneeId', 'points', 'dueAt', 'verification'] as const;

export function NovaTarefa({
  voltar,
  irParaNovoMembro,
  compensarId,
  editarId,
}: {
  voltar: () => void;
  irParaNovoMembro: () => void;
  /** Id da tarefa vencida que esta tarefa vem compensar, quando ha uma. */
  compensarId?: string;
  /** Id da tarefa que se esta corrigindo, quando o formulario abre para editar. */
  editarId?: string;
}) {
  const { perfilAtivo } = useSessao();
  const membros = useMembros();
  // Sem compensacao e sem edicao nao ha o que carregar: `null` desliga a
  // consulta em vez de mandar uma requisicao com id vazio.
  const referencia = compensarId ?? editarId ?? null;
  const base = useTarefa(referencia);

  if (membros.isPending) return <Carregando rotulo="Carregando a família" />;
  if (referencia && base.isPending) {
    return <Carregando rotulo={editarId ? 'Carregando a tarefa' : 'Carregando a tarefa vencida'} />;
  }
  if (membros.isError) {
    return <Falha erro={membros.error} aoTentarDeNovo={() => membros.refetch()} />;
  }
  if (referencia && base.isError) {
    return <Falha erro={base.error} aoTentarDeNovo={() => base.refetch()} />;
  }

  const candidatos = membros.data.filter((membro) => membro.id !== perfilAtivo?.id);

  return (
    <Formulario
      voltar={voltar}
      irParaNovoMembro={irParaNovoMembro}
      candidatos={candidatos}
      compensada={compensarId ? base.data : undefined}
      editada={editarId ? base.data : undefined}
    />
  );
}

function Formulario({
  voltar,
  irParaNovoMembro,
  candidatos,
  compensada,
  editada,
}: {
  voltar: () => void;
  irParaNovoMembro: () => void;
  candidatos: Membro[];
  /** A tarefa vencida que esta sendo compensada. */
  compensada?: Tarefa;
  /** A tarefa que esta sendo corrigida. */
  editada?: Tarefa;
}) {
  const criar = useCriarTarefa();
  const atualizar = useAtualizarTarefa();
  const erros = useErrosDoFormulario(CAMPOS);

  const [titulo, setTitulo] = useState(editada?.title ?? '');
  const [descricao, setDescricao] = useState(editada?.description ?? '');
  const [paraQuem, setParaQuem] = useState<string | null>(editada?.assigneeId ?? null);
  const [valor, setValor] = useState<string>(String(editada?.points ?? 10));
  const [prazo, setPrazo] = useState<string>(editada ? 'manter' : 'amanha');
  const [comFoto, setComFoto] = useState<string>(editada?.verification ?? 'MANUAL');
  const [faltando, setFaltando] = useState<Record<string, string>>({});

  const opcoesDePrazo = useMemo(
    () => prazosDisponiveis(new Date(), editada?.dueAt),
    [editada?.dueAt],
  );
  const opcoesDePontos = useMemo(() => pontosDisponiveis(editada?.points), [editada?.points]);

  const fixo = compensada ?? (editada && editada.status !== 'PENDING' ? editada : undefined);
  const destinatario = fixo ? fixo.assigneeId : paraQuem;

  const modo = editada
    ? { tela: 'Editar tarefa', acao: 'Salvar alterações' }
    : compensada
      ? { tela: 'Tarefa de compensação', acao: 'Criar compensação' }
      : { tela: 'Nova tarefa', acao: 'Criar tarefa' };

  const envio = editada ? atualizar : criar;

  function enviar() {
    const pendencias: Record<string, string> = {};
    if (titulo.trim().length === 0) pendencias['title'] = 'Escreva o que precisa ser feito';
    if (!destinatario) pendencias['assigneeId'] = 'Escolha para quem é a tarefa';
    if (Object.keys(pendencias).length > 0) {
      setFaltando(pendencias);
      return;
    }

    setFaltando({});
    erros.limpar();
    const opcao = opcoesDePrazo.find((o) => o.valor === prazo) ?? opcoesDePrazo[0];
    const comum = {
      title: titulo.trim(),
      assigneeId: destinatario as string,
      points: Number(valor),
      dueAt: opcao.resolver(new Date()).toISOString(),
      verification: comFoto === 'IMAGE' ? ('IMAGE' as const) : ('MANUAL' as const),
    };

    if (editada) {
      atualizar.mutate(
        {
          id: editada.id,
          ...comum,
          // `null`, e nao `undefined`: apagar os detalhes tem de chegar ao
          // servidor como decisao, senao o campo esvaziado volta preenchido.
          description: descricao.trim() || null,
        },
        { onSuccess: voltar, onError: erros.registrar },
      );
      return;
    }

    criar.mutate(
      {
        ...comum,
        description: descricao.trim() || undefined,
        compensationForId: compensada?.id,
      },
      { onSuccess: voltar, onError: erros.registrar },
    );
  }

  const erroDe = (campo: string) => faltando[campo] ?? erros.porCampo[campo] ?? null;

  if (!fixo && candidatos.length === 0) {
    return (
      <View style={estilos.container}>
        <Text style={estilos.titulo}>{modo.tela}</Text>
        <Text style={estilos.apoio}>
          Ainda não há ninguém na família para receber a tarefa. Cadastre um filho antes de criar a
          primeira.
        </Text>
        <Botao titulo="Cadastrar filho" aoTocar={irParaNovoMembro} />
        <View style={estilos.separador} />
        <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>{modo.tela}</Text>

      {compensada ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            Compensa "{compensada.title}", que venceu. Os pontos desta tarefa são novos, e não
            devolvem os da anterior.
          </Text>
        </View>
      ) : null}

      {editada && fixo ? (
        <View style={estilos.aviso}>
          <Text style={estilos.avisoTexto}>
            {fixo.assignee.name} já entregou esta tarefa uma vez. Dá para mudar o texto, os pontos e
            o prazo, mas não para quem ela é.
          </Text>
        </View>
      ) : null}

      <Campo
        rotulo="O que precisa ser feito"
        value={titulo}
        onChangeText={erros.aoEditar('title', (v) => {
          setTitulo(v);
          setFaltando(({ title: _, ...resto }) => resto);
        })}
        placeholder="Ex.: arrumar a cama"
        erro={erroDe('title')}
      />

      <Campo
        rotulo="Detalhes (opcional)"
        value={descricao}
        onChangeText={setDescricao}
        placeholder="Ex.: guardar o travesseiro no armário"
        multiline
      />

      {fixo ? (
        // Linha de leitura, e nao seletor travado: um campo desabilitado convida
        // a tentar mexer e parece defeito do aplicativo.
        <View style={estilos.campoFixo}>
          <Text style={estilos.rotuloFixo}>Para quem</Text>
          <Text style={estilos.valorFixo}>{fixo.assignee.name}</Text>
        </View>
      ) : (
        <Escolha
          rotulo="Para quem"
          valor={paraQuem}
          aoEscolher={(id) => {
            setParaQuem(id);
            setFaltando(({ assigneeId: _, ...resto }) => resto);
          }}
          opcoes={candidatos.map((membro) => ({
            valor: membro.id,
            texto: membro.name,
          }))}
          erro={erroDe('assigneeId')}
        />
      )}

      <Escolha
        rotulo="Quanto vale"
        valor={valor}
        aoEscolher={setValor}
        opcoes={opcoesDePontos.map((p) => ({ valor: String(p), texto: `${p}` }))}
        erro={erroDe('points')}
      />

      <Escolha
        rotulo="Até quando"
        valor={prazo}
        aoEscolher={setPrazo}
        opcoes={opcoesDePrazo.map((o) => ({ valor: o.valor, texto: o.texto }))}
        erro={erroDe('dueAt')}
      />

      <Escolha
        rotulo="Como conferir"
        valor={comFoto}
        aoEscolher={setComFoto}
        opcoes={[
          { valor: 'MANUAL', texto: 'Eu confiro' },
          { valor: 'IMAGE', texto: 'Com foto' },
        ]}
        erro={erroDe('verification')}
      />

      <Erro mensagem={erros.geral ?? (envio.isError ? textoDaFalha(envio.error) : null)} />
      <Botao titulo={modo.acao} aoTocar={enviar} carregando={envio.isPending} />
      <View style={estilos.separador} />
      <Botao titulo="Cancelar" variante="secundaria" aoTocar={voltar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  titulo: {
    fontSize: TIPO.titulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.m,
  },
  apoio: {
    fontSize: TIPO.corpo,
    color: CORES.textoSuave,
    marginBottom: ESPACO.g,
  },
  aviso: {
    borderLeftWidth: 4,
    borderLeftColor: CORES.atencao,
    paddingLeft: ESPACO.m,
    marginBottom: ESPACO.m,
  },
  avisoTexto: {
    fontSize: TIPO.apoio,
    color: CORES.texto,
    lineHeight: 20,
  },
  campoFixo: { marginBottom: ESPACO.m },
  rotuloFixo: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginBottom: ESPACO.p,
  },
  valorFixo: { fontSize: TIPO.corpo, fontWeight: '600', color: CORES.texto },
  separador: { height: ESPACO.p },
});
