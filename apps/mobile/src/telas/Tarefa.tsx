import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { apiTarefas } from '../api/cliente';
import {
  useCancelarTarefa,
  useConcluirTarefa,
  useTarefa,
  useVerificarTarefa,
} from '../api/consultas';
import {
  escolherDaGaleria,
  GALERIA_LIBERADA,
  PermissaoNegada,
  tirarFoto,
  type FotoEscolhida,
} from '../api/foto';
import { useSessao } from '../auth/sessao';
import {
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  Falha,
  FotoAmpliavel,
  Selo,
  textoDaFalha,
} from './componentes';
import { ESTADO_DA_TAREFA, grupoDe } from './estados';
import { pontos, pontosDaEntrega, prazoEmPalavras } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

export function Tarefa({
  id,
  voltar,
  irParaCompensacao,
  irParaEdicao,
}: {
  id: string;
  voltar: () => void;
  irParaCompensacao: (tarefaVencidaId: string) => void;
  irParaEdicao: (tarefaId: string) => void;
}) {
  const { perfilAtivo } = useSessao();
  const consulta = useTarefa(id);
  useRebuscarNaViradaDaFaixa(consulta.data?.scoring.ifCompletedNow?.validUntil, consulta.refetch);

  if (consulta.isPending) return <Carregando rotulo="Carregando a tarefa" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }

  const tarefa = consulta.data;
  const estado = ESTADO_DA_TAREFA[tarefa.status];
  const ehResponsavel = perfilAtivo?.papel === 'PARENT';
  const ehMinha = tarefa.assigneeId === perfilAtivo?.id;
  const grupo = grupoDe(tarefa.status);

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>{tarefa.title}</Text>
      <View style={estilos.selos}>
        <Selo texto={estado.texto} cor={estado.cor} />
        {tarefa.verification === 'IMAGE' ? <Selo texto="Com foto" cor={CORES.textoSuave} /> : null}
        {tarefa.compensationForId ? (
          // A compensacao (objetivo e) e dita na tela: sem isso a crianca recebe
          // uma tarefa nova sem saber que ela substitui a que venceu.
          <Selo texto="Compensa uma tarefa vencida" cor={CORES.atencao} />
        ) : null}
      </View>

      <Cartao>
        {ehResponsavel && ehMinha ? null : <Pontuacao tarefa={tarefa} />}
        <Linha rotulo="Prazo" valor={prazoEmPalavras(tarefa.dueAt)} />
        {ehMinha ? null : <Linha rotulo="Para" valor={tarefa.assignee.name} />}
      </Cartao>

      {tarefa.description ? (
        <Cartao>
          <Text style={estilos.rotulo}>O que fazer</Text>
          <Text style={estilos.descricao}>{tarefa.description}</Text>
        </Cartao>
      ) : null}

      {tarefa.evidences.length > 0 ? (
        <Evidencias tarefa={tarefa} podeVerFoto={ehResponsavel || ehMinha} />
      ) : null}

      {!ehResponsavel && ehMinha && grupo === 'fazer' ? (
        <Concluir tarefa={tarefa} aoConcluir={voltar} />
      ) : null}

      {ehResponsavel && ehMinha && grupo === 'fazer' ? (
        <MarcarComoFeita tarefa={tarefa} aoConcluir={voltar} />
      ) : null}

      {ehResponsavel && tarefa.status === 'SUBMITTED' ? (
        <Verificar tarefa={tarefa} aoDecidir={voltar} />
      ) : null}

      {ehResponsavel && tarefa.status === 'EXPIRED' ? (
        <Compensar tarefa={tarefa} aoCriar={() => irParaCompensacao(tarefa.id)} />
      ) : null}

      {ehResponsavel && (tarefa.status === 'PENDING' || tarefa.status === 'REJECTED') ? (
        <View style={estilos.acaoSolta}>
          <Botao
            titulo="Editar tarefa"
            variante="secundaria"
            aoTocar={() => irParaEdicao(tarefa.id)}
          />
        </View>
      ) : null}

      {ehResponsavel && grupo !== 'encerradas' ? (
        <Cancelar tarefa={tarefa} aoCancelar={voltar} />
      ) : null}

      <View style={estilos.voltar}>
        <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
      </View>
    </ScrollView>
  );
}

const LIMITE_DE_AGENDAMENTO = 6 * 60 * 60 * 1000;

function useRebuscarNaViradaDaFaixa(
  validUntil: string | null | undefined,
  rebuscar: () => void,
) {
  useEffect(() => {
    if (!validUntil) return;
    const espera = new Date(validUntil).getTime() - Date.now();
    if (espera > LIMITE_DE_AGENDAMENTO) return;
    const id = setTimeout(rebuscar, Math.max(espera, 0) + 1000);
    return () => clearTimeout(id);
  }, [validUntil, rebuscar]);
}

function Pontuacao({ tarefa }: { tarefa: import('../api/cliente').Tarefa }) {
  const entrega = pontosDaEntrega(tarefa);

  if (!entrega.reduzido) return <Linha rotulo="Vale" valor={pontos(tarefa.points)} />;

  return (
    <>
      <Linha
        rotulo={entrega.creditado ? 'Rendeu' : 'Vai render'}
        valor={`${entrega.valor} de ${entrega.cheios} pontos`}
      />
      <Text style={estilos.desconto}>
        {entrega.faixa}: A tarefa valia {pontos(entrega.cheios)} e{' '}
        {entrega.creditado
          ? `rendeu ${entrega.valor}`
          : `rende ${entrega.valor}, se o responsável aprovar`}
        .
      </Text>
    </>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <View style={estilos.linha}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <Text style={estilos.valor}>{valor}</Text>
    </View>
  );
}

function Evidencias({
  tarefa,
  podeVerFoto,
}: {
  tarefa: import('../api/cliente').Tarefa;
  podeVerFoto: boolean;
}) {
  const { accessToken } = useSessao();
  return (
    <Cartao>
      <Text style={estilos.rotulo}>Enviado</Text>
      {tarefa.evidences.map((evidencia) => (
        <View key={evidencia.id} style={estilos.evidencia}>
          {evidencia.note ? <Text style={estilos.descricao}>{evidencia.note}</Text> : null}
          {evidencia.imageKey && podeVerFoto && accessToken ? (
            <FotoAmpliavel
              rotulo={`Foto enviada em ${tarefa.title}`}
              source={[
                {
                  uri: apiTarefas.urlDaEvidencia(evidencia.id),
                  headers: { authorization: `Bearer ${accessToken}` },
                },
              ]}
              estilo={estilos.foto}
            />
          ) : null}
        </View>
      ))}
    </Cartao>
  );
}

function Concluir({
  tarefa,
  aoConcluir,
}: {
  tarefa: import('../api/cliente').Tarefa;
  aoConcluir: () => void;
}) {
  const [nota, setNota] = useState('');
  const [foto, setFoto] = useState<FotoEscolhida | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const concluir = useConcluirTarefa(tarefa.id);

  const previsao = tarefa.scoring.ifCompletedNow;
  const exigeFoto = tarefa.verification === 'IMAGE';

  async function pegarFoto(origem: () => Promise<FotoEscolhida | null>) {
    setErroLocal(null);
    try {
      const escolhida = await origem();
      if (escolhida) setFoto(escolhida);
    } catch (erro) {
      // Permissao negada tem frase propria; o resto cai no texto padrao.
      setErroLocal(erro instanceof PermissaoNegada ? erro.message : textoDaFalha(erro));
    }
  }

  function enviar() {
    if (exigeFoto && !foto) {
      setErroLocal('Esta tarefa pede uma foto do resultado.');
      return;
    }
    setErroLocal(null);
    concluir.mutate(
      { note: nota.trim() || undefined, foto: foto ?? undefined },
      { onSuccess: aoConcluir },
    );
  }

  return (
    <Cartao>
      <Text style={estilos.rotulo}>Terminei esta tarefa</Text>

      {previsao === null ? null : previsao.band === 'no_prazo' ? (
        <Text style={estilos.previsaoBoa}>
          Entregando agora, você ganha {pontos(previsao.points)}.
        </Text>
      ) : (
        <Text style={estilos.previsaoAtrasada}>
          O prazo passou. Entregando agora, ainda ganha {previsao.points} de {previsao.fullPoints}{' '}
          pontos.
        </Text>
      )}

      <Campo
        rotulo="Quer contar alguma coisa? (opcional)"
        value={nota}
        onChangeText={setNota}
        placeholder="Ex.: guardei tudo no armário de cima"
        multiline
      />

      <Text style={estilos.rotulo}>
        {exigeFoto ? 'Foto do resultado (obrigatória)' : 'Foto (opcional)'}
      </Text>
      {foto ? (
        <FotoAmpliavel
          rotulo="Foto escolhida"
          source={{ uri: foto.uri }}
          estilo={estilos.foto}
        />
      ) : null}
      <View style={estilos.acoesLado}>
        <View style={estilos.acaoMeia}>
          <Botao titulo="Tirar foto" variante="secundaria" aoTocar={() => pegarFoto(tirarFoto)} />
        </View>
        {GALERIA_LIBERADA ? (
          <View style={estilos.acaoMeia}>
            <Botao
              titulo="Da galeria"
              variante="secundaria"
              aoTocar={() => pegarFoto(escolherDaGaleria)}
            />
          </View>
        ) : null}
      </View>

      <Erro mensagem={erroLocal ?? (concluir.isError ? textoDaFalha(concluir.error) : null)} />
      <Botao titulo="Concluir tarefa" aoTocar={enviar} carregando={concluir.isPending} />
    </Cartao>
  );
}

function MarcarComoFeita({
  tarefa,
  aoConcluir,
}: {
  tarefa: import('../api/cliente').Tarefa;
  aoConcluir: () => void;
}) {
  const concluir = useConcluirTarefa(tarefa.id);

  return (
    <Cartao>
      <Text style={estilos.rotulo}>Esta tarefa foi repassada para você</Text>
      <Text style={estilos.explicacao}>
        Quando terminar, marque como feita. Ela é encerrada na hora, sem foto e sem pontos.
      </Text>
      <Erro mensagem={concluir.isError ? textoDaFalha(concluir.error) : null} />
      <Botao
        titulo="Marcar como feita"
        aoTocar={() => concluir.mutate({}, { onSuccess: aoConcluir })}
        carregando={concluir.isPending}
      />
    </Cartao>
  );
}

function Verificar({
  tarefa,
  aoDecidir,
}: {
  tarefa: import('../api/cliente').Tarefa;
  aoDecidir: () => void;
}) {
  const [comentario, setComentario] = useState('');
  const verificar = useVerificarTarefa(tarefa.id);

  function decidir(decision: 'APPROVED' | 'REJECTED') {
    verificar.mutate(
      { decision, comment: comentario.trim() || undefined },
      { onSuccess: aoDecidir },
    );
  }

  return (
    <Cartao>
      <Text style={estilos.rotulo}>Conferir</Text>
      <Text style={estilos.apoio}>
        Aprovar credita os pontos. Pedir para refazer devolve a tarefa, sem tirar pontos.
      </Text>
      <Campo
        rotulo="Comentário (opcional)"
        value={comentario}
        onChangeText={setComentario}
        placeholder="Ex.: faltou passar pano embaixo da mesa"
        multiline
      />
      <Erro mensagem={verificar.isError ? textoDaFalha(verificar.error) : null} />
      <Botao
        titulo="Aprovar"
        aoTocar={() => decidir('APPROVED')}
        carregando={verificar.isPending}
      />
      <View style={estilos.separador} />
      <Botao
        titulo="Pedir para refazer"
        variante="secundaria"
        aoTocar={() => decidir('REJECTED')}
        desabilitado={verificar.isPending}
      />
    </Cartao>
  );
}

function Compensar({
  tarefa,
  aoCriar,
}: {
  tarefa: import('../api/cliente').Tarefa;
  aoCriar: () => void;
}) {
  return (
    <Cartao>
      <Text style={estilos.rotulo}>Dar uma chance de recuperar</Text>
      <Text style={estilos.apoio}>
        Cria uma tarefa nova para {tarefa.assignee.name}, ligada a esta. Os pontos são novos: a
        compensação não devolve os que o atraso custou.
      </Text>
      <Botao titulo="Criar tarefa de compensação" variante="secundaria" aoTocar={aoCriar} />
    </Cartao>
  );
}

/** Cancelamento: encerra sem pontos e sem penalidade. */
function Cancelar({
  tarefa,
  aoCancelar,
}: {
  tarefa: import('../api/cliente').Tarefa;
  aoCancelar: () => void;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const cancelar = useCancelarTarefa(tarefa.id);

  if (!confirmando) {
    return (
      <View style={estilos.acaoSolta}>
        <Botao
          titulo="Cancelar tarefa"
          variante="secundaria"
          aoTocar={() => setConfirmando(true)}
        />
      </View>
    );
  }

  return (
    <Cartao>
      <Text style={estilos.rotulo}>Cancelar "{tarefa.title}"?</Text>
      <Text style={estilos.apoio}>
        A tarefa é encerrada sem pontos e sem penalidade, e não pode ser reaberta.
      </Text>
      <Erro mensagem={cancelar.isError ? textoDaFalha(cancelar.error) : null} />
      <Botao
        titulo="Sim, cancelar"
        aoTocar={() => cancelar.mutate(undefined, { onSuccess: aoCancelar })}
        carregando={cancelar.isPending}
      />
      <View style={estilos.separador} />
      <Botao titulo="Manter a tarefa" variante="secundaria" aoTocar={() => setConfirmando(false)} />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: ESPACO.p, marginVertical: ESPACO.m },
  linha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    gap: ESPACO.m,
  },
  rotulo: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.p },
  valor: {
    fontSize: TIPO.corpo,
    color: CORES.texto,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  descricao: { fontSize: TIPO.corpo, color: CORES.texto, lineHeight: 22 },
  // A mesma letra da descricao, com o respiro que os textos antes de botao tem
  // no resto da tela (`previsaoBoa`, `apoio`).
  explicacao: { fontSize: TIPO.corpo, color: CORES.texto, lineHeight: 22, marginBottom: ESPACO.m },
  desconto: { fontSize: TIPO.apoio, color: CORES.atencao, marginTop: 2, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.m },
  evidencia: { marginBottom: ESPACO.m },
  // So a margem: tamanho, canto e fundo da miniatura vivem em `FotoAmpliavel`,
  // que e quem tambem desenha a versao em tela cheia.
  foto: { marginBottom: ESPACO.m },
  previsaoBoa: {
    fontSize: TIPO.corpo,
    color: CORES.sucesso,
    fontWeight: '600',
    marginBottom: ESPACO.m,
  },
  previsaoAtrasada: {
    fontSize: TIPO.corpo,
    color: CORES.atencao,
    fontWeight: '600',
    marginBottom: ESPACO.m,
  },
  acoesLado: { flexDirection: 'row', gap: ESPACO.p, marginBottom: ESPACO.m },
  acaoMeia: { flex: 1 },
  acaoSolta: { marginBottom: ESPACO.m },
  separador: { height: ESPACO.p },
  voltar: { marginTop: ESPACO.p },
});
