import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { Compra, ItemDaLoja } from '../api/cliente';
import {
  useCancelarCompra,
  useComprar,
  useCompras,
  useDesativarItem,
  useEntregarCompra,
  useItensDaLoja,
  useMinhaCarteira,
} from '../api/consultas';
import { useSessao } from '../auth/sessao';
import {
  Botao,
  Cartao,
  Carregando,
  Erro,
  Escolha,
  Falha,
  Selo,
  Vazio,
  textoDaFalha,
  usePuxarParaAtualizar,
} from './componentes';
import { ESTADO_DA_COMPRA } from './estados';
import { momentoEmPalavras, pontos } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

export function Loja({ irParaNovoItem, irParaCarta }: { irParaNovoItem: () => void; irParaCarta: (compraId: string) => void }) {
  const { perfilAtivo } = useSessao();
  const ehResponsavel = perfilAtivo?.papel === 'PARENT';
  const [aba, setAba] = useState<'catalogo' | 'compras'>('catalogo');

  return (
    <View style={estilos.container}>
      <View style={estilos.cabecalho}>
        <Text style={estilos.titulo}>Loja</Text>
        {ehResponsavel ? null : <Saldo />}
        <Escolha
          rotulo="Mostrar"
          valor={aba}
          aoEscolher={setAba}
          opcoes={[
            { valor: 'catalogo', texto: 'Catálogo' },
            { valor: 'compras', texto: ehResponsavel ? 'Pedidos' : 'Minhas compras' },
          ]}
        />
      </View>
      {aba === 'catalogo' ? (
        <Catalogo ehResponsavel={ehResponsavel} irParaNovoItem={irParaNovoItem} />
      ) : (
        <Compras ehResponsavel={ehResponsavel} irParaCarta={irParaCarta} />
      )}
    </View>
  );
}

/** Saldo do filho, no topo da loja. O responsavel nao gasta pontos. */
function Saldo() {
  const carteira = useMinhaCarteira();
  if (!carteira.data) return null;
  return (
    <Text style={estilos.saldo} accessibilityLabel={`Você tem ${pontos(carteira.data.balance)}`}>
      Você tem {pontos(carteira.data.balance)}
    </Text>
  );
}

function Catalogo({
  ehResponsavel,
  irParaNovoItem,
}: {
  ehResponsavel: boolean;
  irParaNovoItem: () => void;
}) {
  const itens = useItensDaLoja();
  const carteira = useMinhaCarteira();
  const comprar = useComprar();
  const [tentando, setTentando] = useState<string | null>(null);
  const puxar = usePuxarParaAtualizar(() => itens.refetch());

  if (itens.isPending) return <Carregando rotulo="Carregando a loja" />;
  if (itens.isError) return <Falha erro={itens.error} aoTentarDeNovo={() => itens.refetch()} />;

  const saldo = carteira.data?.balance ?? 0;

  return (
    <>
      <FlatList
        data={itens.data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={estilos.lista}
        refreshControl={<RefreshControl {...puxar} />}
        ListEmptyComponent={
          <Vazio
            titulo="Loja vazia"
            apoio={
              ehResponsavel
                ? 'Cadastre a primeira recompensa para a família poder trocar os pontos.'
                : 'Peça ao responsável para cadastrar as recompensas.'
            }
          />
        }
        ListFooterComponent={
          comprar.isError ? <Erro mensagem={textoDaFalha(comprar.error)} /> : null
        }
        renderItem={({ item }) => (
          <LinhaDoItem
            item={item}
            saldo={saldo}
            ehResponsavel={ehResponsavel}
            comprando={comprar.isPending && tentando === item.id}
            aoComprar={() => {
              setTentando(item.id);
              comprar.mutate(item.id);
            }}
          />
        )}
      />
      {ehResponsavel ? (
        <View style={estilos.rodape}>
          <Botao titulo="Cadastrar recompensa" aoTocar={irParaNovoItem} />
        </View>
      ) : null}
    </>
  );
}

function LinhaDoItem({
  item,
  saldo,
  ehResponsavel,
  comprando,
  aoComprar,
}: {
  item: ItemDaLoja;
  saldo: number;
  ehResponsavel: boolean;
  comprando: boolean;
  aoComprar: () => void;
}) {
  const falta = item.costPoints - saldo;
  const semEstoque = item.stock !== null && item.stock <= 0;
  const podeComprar = !ehResponsavel && falta <= 0 && !semEstoque;

  return (
    <Cartao>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.nome}>{item.name}</Text>
        <Text style={estilos.custo}>{pontos(item.costPoints)}</Text>
      </View>
      {item.description ? <Text style={estilos.apoio}>{item.description}</Text> : null}
      <View style={estilos.selos}>
        {item.kind === 'TRANSFER_LETTER' ? (
          <Selo texto="Passa uma tarefa para outra pessoa" cor={CORES.filho} />
        ) : null}
        {item.stock !== null ? (
          <Selo
            texto={semEstoque ? 'Acabou' : `Restam ${item.stock}`}
            cor={semEstoque ? CORES.textoSuave : CORES.atencao}
          />
        ) : null}
      </View>

      {ehResponsavel ? (
        <RetirarDaLoja item={item} />
      ) : podeComprar ? (
        <Botao titulo="Trocar meus pontos" aoTocar={aoComprar} carregando={comprando} />
      ) : (
        <Botao
          // O motivo vai no titulo do botao, e nao numa frase solta ao lado:
          // desabilitado sem explicacao parece defeito do aplicativo.
          titulo={semEstoque ? 'Acabou por enquanto' : `Faltam ${pontos(falta)}`}
          variante="secundaria"
          desabilitado
          aoTocar={() => undefined}
        />
      )}
    </Cartao>
  );
}

function RetirarDaLoja({ item }: { item: ItemDaLoja }) {
  const [confirmando, setConfirmando] = useState(false);
  const remover = useDesativarItem();

  if (item.kind === 'TRANSFER_LETTER') return null;

  if (!confirmando) {
    return (
      <Botao titulo="Tirar da loja" variante="secundaria" aoTocar={() => setConfirmando(true)} />
    );
  }

  return (
    <>
      <Text style={estilos.confirmacao}>Tirar "{item.name}" da loja?</Text>
      <Text style={estilos.apoio}>
        A recompensa sai do catálogo e ninguém mais pode trocá-la. As compras que já aconteceram
        continuam no histórico, com os pontos que custaram.
      </Text>
      <Erro mensagem={remover.isError ? textoDaFalha(remover.error) : null} />
      <View style={estilos.separador} />
      <Botao
        titulo="Sim, tirar da loja"
        aoTocar={() => remover.mutate(item.id)}
        carregando={remover.isPending}
      />
      <View style={estilos.separador} />
      <Botao titulo="Manter na loja" variante="secundaria" aoTocar={() => setConfirmando(false)} />
    </>
  );
}

function Compras({
  ehResponsavel,
  irParaCarta,
}: {
  ehResponsavel: boolean;
  irParaCarta: (compraId: string) => void;
}) {
  const compras = useCompras();
  const entregar = useEntregarCompra();
  const cancelar = useCancelarCompra();
  const puxar = usePuxarParaAtualizar(() => compras.refetch());

  if (compras.isPending) return <Carregando rotulo="Carregando as compras" />;
  if (compras.isError) {
    return <Falha erro={compras.error} aoTentarDeNovo={() => compras.refetch()} />;
  }

  return (
    <FlatList
      data={compras.data}
      keyExtractor={(compra) => compra.id}
      contentContainerStyle={estilos.lista}
      refreshControl={<RefreshControl {...puxar} />}
      ListEmptyComponent={
        <Vazio
          titulo="Nenhuma compra ainda"
          apoio={
            ehResponsavel
              ? 'Quando a família trocar pontos por recompensas, os pedidos aparecem aqui.'
              : 'Troque seus pontos no catálogo e a recompensa aparece aqui.'
          }
        />
      }
      ListFooterComponent={
        <Erro
          mensagem={
            entregar.isError
              ? textoDaFalha(entregar.error)
              : cancelar.isError
                ? textoDaFalha(cancelar.error)
                : null
          }
        />
      }
      renderItem={({ item }) => (
        <LinhaDaCompra
          compra={item}
          ehResponsavel={ehResponsavel}
          ocupado={entregar.isPending || cancelar.isPending}
          aoEntregar={() => entregar.mutate(item.id)}
          aoCancelar={() => cancelar.mutate(item.id)}
          aoUsarCarta={() => irParaCarta(item.id)}
        />
      )}
    />
  );
}

function LinhaDaCompra({
  compra,
  ehResponsavel,
  ocupado,
  aoEntregar,
  aoCancelar,
  aoUsarCarta,
}: {
  compra: Compra;
  ehResponsavel: boolean;
  ocupado: boolean;
  aoEntregar: () => void;
  aoCancelar: () => void;
  aoUsarCarta: () => void;
}) {
  const estado = ESTADO_DA_COMPRA[compra.status];
  const ehCarta = compra.item.kind === 'TRANSFER_LETTER';
  const pendente = compra.status === 'PENDING';

  return (
    <Cartao>
      <View style={estilos.linhaTopo}>
        <Text style={estilos.nome}>{compra.item.name}</Text>
        <Text style={estilos.custo}>{pontos(compra.costPoints)}</Text>
      </View>
      {ehResponsavel ? <Text style={estilos.apoio}>{compra.buyer.name}</Text> : null}
      <Text style={estilos.apoio}>{momentoEmPalavras(compra.createdAt)}</Text>
      <View style={estilos.selos}>
        <Selo texto={estado.texto} cor={estado.cor} />
      </View>

      {pendente && ehCarta && !ehResponsavel ? (
        <Botao titulo="Usar a carta" aoTocar={aoUsarCarta} />
      ) : null}

      {pendente && ehResponsavel ? (
        <>
          {ehCarta ? null : (
            <>
              <Botao titulo="Marcar como entregue" aoTocar={aoEntregar} desabilitado={ocupado} />
              <View style={estilos.separador} />
            </>
          )}
          <Botao
            titulo="Cancelar e devolver os pontos"
            variante="secundaria"
            aoTocar={aoCancelar}
            desabilitado={ocupado}
          />
        </>
      ) : null}
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  container: { flex: 1 },
  cabecalho: { paddingHorizontal: ESPACO.m, paddingTop: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto },
  saldo: {
    fontSize: TIPO.subtitulo,
    fontWeight: '700',
    color: CORES.primaria,
    marginTop: ESPACO.p,
    marginBottom: ESPACO.m,
  },
  lista: { padding: ESPACO.m, flexGrow: 1 },
  linhaTopo: { flexDirection: 'row', justifyContent: 'space-between', gap: ESPACO.p },
  nome: { flex: 1, fontSize: TIPO.subtitulo, fontWeight: '600', color: CORES.texto },
  custo: { fontSize: TIPO.corpo, fontWeight: '700', color: CORES.primaria },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: 4 },
  confirmacao: { fontSize: TIPO.corpo, fontWeight: '600', color: CORES.texto, marginTop: ESPACO.p },
  selos: { flexDirection: 'row', flexWrap: 'wrap', gap: ESPACO.p, marginVertical: ESPACO.p },
  separador: { height: ESPACO.p },
  rodape: {
    padding: ESPACO.m,
    borderTopWidth: 1,
    borderTopColor: CORES.borda,
    backgroundColor: CORES.superficie,
  },
});
