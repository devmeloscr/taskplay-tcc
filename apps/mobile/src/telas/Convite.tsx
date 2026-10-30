import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGerarConvite, useMembrosGerenciados } from '../api/consultas';
import { Botao, Carregando, Erro, Falha, Vazio, textoDaFalha } from './componentes';
import { CORES, ESPACO, TIPO } from './tema';

export function Convite({ id, voltar }: { id: string; voltar: () => void }) {
  const consulta = useMembrosGerenciados();
  const membro = consulta.data?.find((candidato) => candidato.id === id);

  if (consulta.isPending) return <Carregando rotulo="Carregando o perfil" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }
  if (!membro || membro.deactivatedAt !== null) {
    // O servidor recusaria o codigo de um perfil fora da familia; dizer isso
    // antes do toque poupa o responsavel de descobrir pela recusa.
    return (
      <Vazio
        titulo="Perfil não encontrado"
        apoio="Ele pode ter sido removido da família em outro aparelho."
        acao={{ titulo: 'Voltar', aoTocar: voltar }}
      />
    );
  }

  return <Gerador id={membro.id} nome={membro.name} voltar={voltar} />;
}

function Gerador({ id, nome, voltar }: { id: string; nome: string; voltar: () => void }) {
  const gerar = useGerarConvite();
  const venceEm = gerar.data ? new Date(gerar.data.expiresAt).getTime() : null;
  // Guarda QUAL prazo venceu, e nao um booleano: ao gerar outro codigo, um
  // `vencido = true` herdado do anterior esconderia o novo ate o efeito rodar.
  const [prazoVencido, setPrazoVencido] = useState<number | null>(null);

  // Um temporizador so, armado para o instante do vencimento. O prazo vem do
  // servidor, e nao de uma conta local de quinze minutos: e ele quem recusa.
  useEffect(() => {
    if (venceEm === null) return;
    const espera = setTimeout(() => setPrazoVencido(venceEm), Math.max(0, venceEm - Date.now()));
    return () => clearTimeout(espera);
  }, [venceEm]);

  const vencido = venceEm !== null && prazoVencido === venceEm;
  const codigo = gerar.data && !vencido ? gerar.data.code : null;

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>Celular próprio de {nome}</Text>
      <Text style={estilos.apoio}>
        No celular de {nome}, abra o TaskPlay e toque em &quot;Tenho um código de convite&quot;.
        Depois do código, aquele celular abre sempre no perfil de {nome}, sem mostrar os outros
        perfis da família.
      </Text>

      {codigo ? (
        <View style={estilos.cartao}>
          <Text
            style={estilos.codigo}
            accessibilityLabel={`Código ${codigo.split('').join(' ')}`}
            selectable
          >
            {codigo}
          </Text>
          <Text style={estilos.prazo}>
            Vale uma vez só, até {horaDe(gerar.data!.expiresAt)}.
          </Text>
        </View>
      ) : gerar.data ? (
        <Text accessibilityRole="alert" style={estilos.aviso}>
          O código venceu. Gere outro quando {nome} estiver com o celular em mãos.
        </Text>
      ) : null}

      <Erro mensagem={gerar.isError ? textoDaFalha(gerar.error) : null} />
      <Botao
        titulo={gerar.data ? 'Gerar outro código' : 'Gerar código'}
        variante={codigo ? 'secundaria' : 'primaria'}
        aoTocar={() => gerar.mutate(id)}
        carregando={gerar.isPending}
      />
      <View style={estilos.separador} />
      <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
    </ScrollView>
  );
}

/** Hora e minuto do vencimento, no fuso do aparelho. */
function horaDe(iso: string): string {
  const data = new Date(iso);
  const hh = String(data.getHours()).padStart(2, '0');
  const mm = String(data.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.g, lineHeight: 20 },
  cartao: {
    backgroundColor: CORES.superficie,
    borderColor: CORES.borda,
    borderWidth: 1,
    borderRadius: 12,
    padding: ESPACO.g,
    alignItems: 'center',
    marginBottom: ESPACO.g,
  },
  codigo: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 8,
    color: CORES.texto,
    fontVariant: ['tabular-nums'],
  },
  prazo: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: ESPACO.p },
  aviso: { fontSize: TIPO.corpo, color: CORES.atencao, marginBottom: ESPACO.m, lineHeight: 22 },
  separador: { height: ESPACO.p },
});
