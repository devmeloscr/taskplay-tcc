import React, { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useSessao } from '../auth/sessao';
import type { Perfil } from '../api/cliente';
import { ALVO_MINIMO, CORES, ESPACO, TIPO } from './tema';
import { Botao, Erro } from './componentes';
import { TecladoDePin } from './TecladoDePin';

export function SeletorDePerfis() {
  const { listarPerfis, selecionarPerfil } = useSessao();
  const [pedindoPin, setPedindoPin] = useState<Perfil | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [entrando, setEntrando] = useState<string | null>(null);

  const { data: perfis, isLoading, isError, refetch } = useQuery({
    queryKey: ['perfis'],
    queryFn: listarPerfis,
  });

  async function entrar(perfil: Perfil, pin?: string) {
    setErro(null);
    setEntrando(perfil.id);
    try {
      await selecionarPerfil(perfil.id, pin);
      setPedindoPin(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível entrar');
    } finally {
      setEntrando(null);
    }
  }

  if (isLoading) {
    return (
      <View style={estilos.centralizado}>
        <ActivityIndicator size="large" color={CORES.primaria} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={estilos.centralizado}>
        <Text style={estilos.aviso}>Não conseguimos falar com o TaskPlay agora.</Text>
        <Botao titulo="Tentar de novo" aoTocar={() => refetch()} />
      </View>
    );
  }

  if (pedindoPin) {
    return (
      <TecladoDePin
        nome={pedindoPin.name}
        erro={erro}
        ocupado={entrando === pedindoPin.id}
        aoConfirmar={(pin) => entrar(pedindoPin, pin)}
        aoCancelar={() => {
          setPedindoPin(null);
          setErro(null);
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>Quem está usando?</Text>
      <Erro mensagem={erro} />

      <View style={estilos.grade}>
        {perfis?.map((perfil) => (
          <TouchableOpacity
            key={perfil.id}
            accessibilityRole="button"
            accessibilityLabel={`Entrar como ${perfil.name}`}
            accessibilityHint={
              perfil.requiresPin ? 'Vai pedir o PIN' : 'Entra direto, sem senha'
            }
            style={estilos.cartao}
            onPress={() => (perfil.requiresPin ? setPedindoPin(perfil) : entrar(perfil))}
          >
            <View
              style={[
                estilos.avatar,
                {
                  backgroundColor:
                    perfil.role === 'PARENT' ? CORES.responsavel : CORES.filho,
                },
              ]}
            >
              {entrando === perfil.id ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={estilos.inicial}>{perfil.name.charAt(0).toUpperCase()}</Text>
              )}
            </View>
            <Text style={estilos.nome} numberOfLines={1}>
              {perfil.name}
            </Text>
            {perfil.requiresPin && <Text style={estilos.cadeado}>PIN</Text>}
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  conteudo: { padding: ESPACO.g, paddingTop: ESPACO.gg * 2 },
  centralizado: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: ESPACO.g },
  titulo: {
    fontSize: TIPO.titulo,
    fontWeight: '700',
    color: CORES.texto,
    marginBottom: ESPACO.gg,
    textAlign: 'center',
  },
  aviso: {
    fontSize: TIPO.corpo,
    color: CORES.textoSuave,
    textAlign: 'center',
    marginBottom: ESPACO.g,
  },
  grade: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: ESPACO.g },
  cartao: { alignItems: 'center', width: 120, paddingVertical: ESPACO.m },
  // Alvo bem acima do minimo das plataformas: aos 6 anos a precisao de toque e
  // menor, e errar o alvo vira frustracao.
  avatar: {
    width: ALVO_MINIMO * 1.6,
    height: ALVO_MINIMO * 1.6,
    borderRadius: ALVO_MINIMO,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: ESPACO.p,
  },
  inicial: { fontSize: 40, fontWeight: '700', color: '#FFF' },
  nome: { fontSize: TIPO.corpo, fontWeight: '600', color: CORES.texto },
  cadeado: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginTop: 2 },
});
