import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Extrato, Lancamento, MotivoDoLancamento } from '../api/cliente';
import {
  useAjustarSaldo,
  useCarteiraDeMembro,
  useMembros,
  useMinhaCarteira,
} from '../api/consultas';
import { useSessao } from '../auth/sessao';
import {
  Botao,
  Campo,
  Cartao,
  Carregando,
  Erro,
  Escolha,
  Falha,
  Vazio,
  textoDaFalha,
  usePuxarParaAtualizar,
} from './componentes';
import { momentoEmPalavras, notaEmPalavras, pontos, pontosComSinal } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

export function Carteira({ irParaNovoMembro }: { irParaNovoMembro: () => void }) {
  const { perfilAtivo } = useSessao();
  return perfilAtivo?.papel === 'PARENT' ? (
    <CarteiraDaFamilia irParaNovoMembro={irParaNovoMembro} />
  ) : (
    <MinhaCarteira />
  );
}

function MinhaCarteira() {
  const consulta = useMinhaCarteira();
  if (consulta.isPending) return <Carregando rotulo="Carregando seus pontos" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }
  return (
    <ExtratoDaCarteira
      titulo="Meus pontos"
      extrato={consulta.data}
      aoAtualizar={() => consulta.refetch()}
    />
  );
}

function CarteiraDaFamilia({ irParaNovoMembro }: { irParaNovoMembro: () => void }) {
  const { perfilAtivo } = useSessao();
  const membros = useMembros();
  const [escolhido, setEscolhido] = useState<string | null>(null);

  if (membros.isPending) return <Carregando rotulo="Carregando a família" />;
  if (membros.isError) {
    return <Falha erro={membros.error} aoTentarDeNovo={() => membros.refetch()} />;
  }

  const candidatos = membros.data.filter((membro) => membro.id !== perfilAtivo?.id);
  if (candidatos.length === 0) {
    return (
      <Vazio
        titulo="Ninguém na família ainda"
        apoio="Cadastre um filho para acompanhar a carteira dele."
        acao={{ titulo: 'Cadastrar filho', aoTocar: irParaNovoMembro }}
      />
    );
  }

  const alvo = escolhido ?? candidatos[0].id;
  const nome = candidatos.find((membro) => membro.id === alvo)?.name ?? '';

  return (
    <View style={estilos.container}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Carteiras</Text>
        <Escolha
          rotulo="De quem"
          valor={alvo}
          aoEscolher={setEscolhido}
          opcoes={candidatos.map((membro) => ({
            valor: membro.id,
            texto: membro.name,
          }))}
        />
      </View>
      <ExtratoDeMembro membroId={alvo} nome={nome} />
    </View>
  );
}

function ExtratoDeMembro({ membroId, nome }: { membroId: string; nome: string }) {
  const consulta = useCarteiraDeMembro(membroId);
  if (consulta.isPending) return <Carregando rotulo={`Carregando os pontos de ${nome}`} />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }
  return (
    <ExtratoDaCarteira
      extrato={consulta.data}
      aoAtualizar={() => consulta.refetch()}
      ajuste={{ membroId, nome }}
    />
  );
}

function ExtratoDaCarteira({
  titulo,
  extrato,
  aoAtualizar,
  ajuste,
}: {
  titulo?: string;
  extrato: Extrato;
  aoAtualizar: () => Promise<unknown>;
  ajuste?: { membroId: string; nome: string };
}) {
  const puxar = usePuxarParaAtualizar(aoAtualizar);
  return (
    <FlatList
      data={extrato.transactions}
      keyExtractor={(lancamento) => lancamento.id}
      contentContainerStyle={estilos.lista}
      refreshControl={<RefreshControl {...puxar} />}
      ListHeaderComponent={
        <View>
          {titulo ? <Text style={estilos.titulo}>{titulo}</Text> : null}
          <Cartao>
            <Text style={estilos.saldoRotulo}>Saldo</Text>
            <Text style={estilos.saldo}>{pontos(extrato.balance)}</Text>
            <Text style={estilos.acumulado}>
              Já ganhou {pontos(extrato.lifetimeEarned)} desde o começo
            </Text>
          </Cartao>
          {ajuste ? <AjusteManual membroId={ajuste.membroId} nome={ajuste.nome} /> : null}
          <Text style={estilos.secao}>Histórico</Text>
        </View>
      }
      ListEmptyComponent={
        <Vazio
          titulo="Nenhum ponto ainda"
          apoio="Cada tarefa aprovada, penalidade e compra aparece aqui."
        />
      }
      renderItem={({ item }) => <LinhaDoExtrato lancamento={item} />}
    />
  );
}

const MOTIVOS: Record<MotivoDoLancamento, string> = {
  TASK_COMPLETED: 'Tarefa aprovada',
  LATE_PENALTY: 'Tarefa venceu sem ser feita',
  STORE_PURCHASE: 'Compra na loja',
  MANUAL_ADJUSTMENT: 'Ajuste do responsável',
};

function LinhaDoExtrato({ lancamento }: { lancamento: Lancamento }) {
  const credito = lancamento.delta > 0;
  return (
    <Cartao>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.motivo}>{MOTIVOS[lancamento.reason]}</Text>
        <Text style={[estilos.delta, { color: credito ? CORES.sucesso : CORES.erro }]}>
          {pontosComSinal(lancamento.delta)}
        </Text>
      </View>
      {lancamento.note ? (
        <Text style={estilos.nota}>{notaEmPalavras(lancamento.note)}</Text>
      ) : null}
      <Text style={estilos.apoio}>
        {momentoEmPalavras(lancamento.createdAt)} · ficou com {pontos(lancamento.balanceAfter)}
      </Text>
    </Cartao>
  );
}

function AjusteManual({ membroId, nome }: { membroId: string; nome: string }) {
  const [aberto, setAberto] = useState(false);
  const [valor, setValor] = useState('10');
  const [sinal, setSinal] = useState<'mais' | 'menos'>('mais');
  const [nota, setNota] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);
  const ajustar = useAjustarSaldo();

  if (!aberto) {
    return (
      <View style={estilos.acaoSolta}>
        <Botao titulo="Ajustar pontos" variante="secundaria" aoTocar={() => setAberto(true)} />
      </View>
    );
  }

  function enviar() {
    const quantidade = Number(valor);
    if (!Number.isInteger(quantidade) || quantidade <= 0) {
      setErroLocal('Informe um número inteiro de pontos, maior que zero.');
      return;
    }
    if (nota.trim().length === 0) {
      setErroLocal('Escreva o motivo do ajuste. Ele fica no histórico.');
      return;
    }
    setErroLocal(null);
    ajustar.mutate(
      {
        userId: membroId,
        delta: sinal === 'mais' ? quantidade : -quantidade,
        note: nota.trim(),
      },
      {
        onSuccess: () => {
          setAberto(false);
          setNota('');
        },
      },
    );
  }

  return (
    <Cartao>
      <Text style={estilos.secao}>Ajustar os pontos de {nome}</Text>
      <Escolha
        rotulo="Somar ou tirar"
        valor={sinal}
        aoEscolher={setSinal}
        opcoes={[
          { valor: 'mais', texto: 'Somar' },
          { valor: 'menos', texto: 'Tirar' },
        ]}
      />
      <Campo
        rotulo="Quantos pontos"
        value={valor}
        onChangeText={setValor}
        keyboardType="number-pad"
      />
      <Campo
        rotulo="Motivo (fica no histórico)"
        value={nota}
        onChangeText={setNota}
        placeholder="Ex.: ajudou a carregar as compras"
      />
      <Erro mensagem={erroLocal ?? (ajustar.isError ? textoDaFalha(ajustar.error) : null)} />
      <Botao titulo="Aplicar ajuste" aoTocar={enviar} carregando={ajustar.isPending} />
      <View style={estilos.separador} />
      <Botao titulo="Cancelar" variante="secundaria" aoTocar={() => setAberto(false)} />
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  cabecalho: { paddingHorizontal: ESPACO.m, paddingTop: ESPACO.m },
  lista: { padding: ESPACO.m, flexGrow: 1 },
  titulo: {
    fontSize: TIPO.titulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.m,
  },
  saldoRotulo: { fontSize: TIPO.apoio, color: CORES.textoSuave },
  saldo: { fontSize: 40, fontWeight: '700', color: CORES.primaria },
  acumulado: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginTop: ESPACO.p,
  },
  secao: {
    fontSize: TIPO.subtitulo,
    fontWeight: '600',
    color: CORES.texto,
    marginBottom: ESPACO.m,
  },
  linhaTopo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: ESPACO.p,
  },
  motivo: {
    flex: 1,
    fontSize: TIPO.corpo,
    fontWeight: '600',
    color: CORES.texto,
  },
  delta: { fontSize: TIPO.corpo, fontWeight: '700' },
  nota: { fontSize: TIPO.apoio, color: CORES.texto, marginTop: 4 },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: 4 },
  acaoSolta: { marginBottom: ESPACO.m },
  separador: { height: ESPACO.p },
});
