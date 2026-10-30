import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import type { MembroGerenciado } from '../api/cliente';
import {
  useMembrosGerenciados,
  useRemoverMembro,
  useRestaurarMembro,
} from '../api/consultas';
import {
  Botao,
  Cartao,
  Carregando,
  Erro,
  Falha,
  Selo,
  Vazio,
  textoDaFalha,
  usePuxarParaAtualizar,
} from './componentes';
import { idadeEm } from './formatos';
import { momentoExato } from './historico';
import { CORES, ESPACO, TIPO } from './tema';

export function Filhos({
  irParaNovoMembro,
  irParaEdicao,
  irParaHistorico,
  irParaConvite,
}: {
  irParaNovoMembro: () => void;
  irParaEdicao: (id: string) => void;
  irParaHistorico: () => void;
  irParaConvite: (id: string) => void;
}) {
  const consulta = useMembrosGerenciados();
  const atualizar = usePuxarParaAtualizar(() => consulta.refetch());

  if (consulta.isPending) return <Carregando rotulo="Carregando a família" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }

  const filhos = consulta.data.filter((membro) => membro.role === 'CHILD');

  if (filhos.length === 0) {
    return (
      <Vazio
        titulo="Nenhum filho cadastrado"
        apoio="Cadastre um filho para poder atribuir tarefas e acompanhar os pontos dele."
        acao={{ titulo: 'Cadastrar filho', aoTocar: irParaNovoMembro }}
      />
    );
  }

  return (
    <FlatList
      data={filhos}
      keyExtractor={(membro) => membro.id}
      contentContainerStyle={estilos.lista}
      refreshControl={<RefreshControl {...atualizar} />}
      ListHeaderComponent={
        <View>
          <Text style={estilos.titulo}>Filhos</Text>
          <Text style={estilos.apoio}>
            Toda alteração feita aqui fica registrada no histórico, com quem fez, o que mudou e
            quando.
          </Text>
        </View>
      }
      renderItem={({ item }) => (
        <LinhaDoFilho
          membro={item}
          irParaEdicao={() => irParaEdicao(item.id)}
          irParaConvite={() => irParaConvite(item.id)}
        />
      )}
      ListFooterComponent={
        <View style={estilos.rodape}>
          <Botao titulo="Cadastrar filho" aoTocar={irParaNovoMembro} />
          <View style={estilos.separador} />
          <Botao titulo="Ver histórico da família" variante="secundaria" aoTocar={irParaHistorico} />
        </View>
      }
    />
  );
}

function LinhaDoFilho({
  membro,
  irParaEdicao,
  irParaConvite,
}: {
  membro: MembroGerenciado;
  irParaEdicao: () => void;
  irParaConvite: () => void;
}) {
  const remover = useRemoverMembro();
  const restaurar = useRestaurarMembro();
  const [confirmando, setConfirmando] = useState(false);

  const removido = membro.deactivatedAt !== null;
  const idade = membro.birthDate ? idadeEm(new Date(`${membro.birthDate}T12:00:00`), new Date()) : null;

  return (
    <Cartao>
      <View style={estilos.cabecalho}>
        <Text style={estilos.nome}>{membro.name}</Text>
        {removido ? <Selo texto="Fora da família" cor={CORES.textoSuave} /> : null}
      </View>

      <Text style={estilos.detalhe}>
        {idade !== null ? `${idade} anos` : 'Sem data de nascimento'} ·{' '}
        {membro.hasPin ? 'Com PIN' : 'Sem PIN'}
      </Text>

      {removido && membro.deactivatedAt ? (
        <Text style={estilos.detalhe}>Saiu em {momentoExato(membro.deactivatedAt)}</Text>
      ) : null}

      <View style={estilos.acoes}>
        {removido ? (
          <>
            <Botao
              titulo="Devolver à família"
              aoTocar={() => restaurar.mutate(membro.id)}
              carregando={restaurar.isPending}
            />
            <Erro mensagem={restaurar.isError ? textoDaFalha(restaurar.error) : null} />
          </>
        ) : confirmando ? (
          <>
            <Text style={estilos.aviso}>
              {membro.name} sai da lista da família e as sessões dele são encerradas. As tarefas e
              os pontos continuam guardados, e dá para trazer de volta depois.
            </Text>
            <Botao
              titulo={`Remover ${membro.name}`}
              aoTocar={() => remover.mutate(membro.id, { onSuccess: () => setConfirmando(false) })}
              carregando={remover.isPending}
            />
            <View style={estilos.separador} />
            <Botao titulo="Cancelar" variante="secundaria" aoTocar={() => setConfirmando(false)} />
            <Erro mensagem={remover.isError ? textoDaFalha(remover.error) : null} />
          </>
        ) : (
          <>
            <Botao titulo="Editar" aoTocar={irParaEdicao} />
            <View style={estilos.separador} />
            <Botao
              titulo="Vincular celular próprio"
              variante="secundaria"
              aoTocar={irParaConvite}
            />
            <View style={estilos.separador} />
            <Botao
              titulo="Remover da família"
              variante="secundaria"
              aoTocar={() => setConfirmando(true)}
            />
          </>
        )}
      </View>
    </Cartao>
  );
}

const estilos = StyleSheet.create({
  lista: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.m, lineHeight: 20 },
  cabecalho: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nome: { fontSize: TIPO.subtitulo, fontWeight: '700', color: CORES.texto, flexShrink: 1 },
  detalhe: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: ESPACO.p },
  aviso: { fontSize: TIPO.apoio, color: CORES.texto, lineHeight: 20, marginBottom: ESPACO.m },
  acoes: { marginTop: ESPACO.m },
  separador: { height: ESPACO.p },
  rodape: { marginTop: ESPACO.m },
});
