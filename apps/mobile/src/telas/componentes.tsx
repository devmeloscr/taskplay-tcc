import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
  type ImageStyle,
  type StyleProp,
  type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { textoDaFalha } from '../api/cliente';
import { ALVO_MINIMO, CORES, ESPACO, TIPO } from './tema';

// Reexportado daqui porque e o modulo que as telas ja importam para desenhar
// erro. A frase mora em `cliente.ts`, junto do `ErroDaApi` que ela interpreta.
export { textoDaFalha };

export function Botao({
  titulo,
  aoTocar,
  carregando,
  desabilitado,
  variante = 'primaria',
}: {
  titulo: string;
  aoTocar: () => void;
  carregando?: boolean;
  /** Trava o botao sem girar indicador: a acao ainda nao pode ser tomada. */
  desabilitado?: boolean;
  variante?: 'primaria' | 'secundaria';
}) {
  const secundario = variante === 'secundaria';
  const inativo = carregando || desabilitado;
  return (
    <TouchableOpacity
      onPress={aoTocar}
      disabled={inativo}
      accessibilityRole="button"
      accessibilityLabel={titulo}
      accessibilityState={{ disabled: Boolean(inativo) }}
      style={[estilos.botao, secundario && estilos.botaoSecundario, inativo && estilos.inativo]}
    >
      {carregando ? (
        <ActivityIndicator color={secundario ? CORES.primaria : CORES.primariaTexto} />
      ) : (
        <Text style={[estilos.botaoTexto, secundario && estilos.botaoTextoSecundario]}>
          {titulo}
        </Text>
      )}
    </TouchableOpacity>
  );
}

export function Campo({
  rotulo,
  erro,
  ...props
}: TextInputProps & { rotulo: string; erro?: string | null }) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        accessibilityLabel={erro ? `${rotulo}. ${erro}` : rotulo}
        placeholderTextColor={CORES.textoSuave}
        style={[estilos.entrada, erro ? estilos.entradaInvalida : null]}
        {...props}
      />
      {erro ? (
        <Text accessibilityRole="alert" style={estilos.erroDoCampo}>
          {erro}
        </Text>
      ) : null}
    </View>
  );
}

/** Mensagem de erro. Nunca repete o que a pessoa digitou. */
export function Erro({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <Text accessibilityRole="alert" style={estilos.erro}>
      {mensagem}
    </Text>
  );
}

/** Bloco de conteudo sobre o fundo da tela. */
export function Cartao({
  children,
  aoTocar,
  rotulo,
}: {
  children: React.ReactNode;
  aoTocar?: () => void;
  /** Obrigatorio quando ha toque: o leitor de tela precisa anunciar o que abre. */
  rotulo?: string;
}) {
  if (!aoTocar) return <View style={estilos.cartao}>{children}</View>;
  return (
    <TouchableOpacity
      onPress={aoTocar}
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      style={estilos.cartao}
    >
      {children}
    </TouchableOpacity>
  );
}

export function Selo({ texto, cor }: { texto: string; cor: string }) {
  return (
    <View style={[estilos.selo, { borderColor: cor }]}>
      <Text style={[estilos.seloTexto, { color: cor }]}>{texto}</Text>
    </View>
  );
}

/** Espera. Existe para a tela nunca ficar em branco sem explicacao. */
export function Carregando({ rotulo = 'Carregando' }: { rotulo?: string }) {
  return (
    <View style={estilos.centralizado}>
      <ActivityIndicator size="large" color={CORES.primaria} accessibilityLabel={rotulo} />
    </View>
  );
}

export function usePuxarParaAtualizar(atualizar: () => Promise<unknown>) {
  const [puxando, setPuxando] = React.useState(false);
  // Uma referencia porque a funcao chega recriada a cada render das telas; sem
  // ela, ou o `useCallback` se refaz sempre ou o gesto chama a versao antiga.
  const ultima = React.useRef(atualizar);
  ultima.current = atualizar;
  const aoPuxar = React.useCallback(() => {
    setPuxando(true);
    void ultima.current().finally(() => setPuxando(false));
  }, []);
  return { refreshing: puxando, onRefresh: aoPuxar };
}

export function Falha({ erro, aoTentarDeNovo }: { erro: unknown; aoTentarDeNovo?: () => void }) {
  return (
    <View style={estilos.centralizado}>
      <Text accessibilityRole="alert" style={estilos.falhaTexto}>
        {textoDaFalha(erro)}
      </Text>
      {aoTentarDeNovo ? (
        <View style={estilos.falhaAcao}>
          <Botao titulo="Tentar de novo" variante="secundaria" aoTocar={aoTentarDeNovo} />
        </View>
      ) : null}
    </View>
  );
}

export function Vazio({
  titulo,
  apoio,
  acao,
}: {
  titulo: string;
  apoio?: string;
  acao?: { titulo: string; aoTocar: () => void };
}) {
  return (
    <View style={estilos.centralizado}>
      <Text style={estilos.vazioTitulo}>{titulo}</Text>
      {apoio ? <Text style={estilos.vazioApoio}>{apoio}</Text> : null}
      {acao ? (
        <View style={estilos.vazioAcao}>
          <Botao titulo={acao.titulo} aoTocar={acao.aoTocar} />
        </View>
      ) : null}
    </View>
  );
}

export function Escolha<T extends string>({
  rotulo,
  opcoes,
  valor,
  aoEscolher,
  erro,
}: {
  rotulo: string;
  opcoes: readonly { valor: T; texto: string }[];
  valor: T | null;
  aoEscolher: (valor: T) => void;
  erro?: string | null;
}) {
  return (
    <View style={estilos.campo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <View style={estilos.escolhas}>
        {opcoes.map((opcao) => {
          const ativa = opcao.valor === valor;
          return (
            <TouchableOpacity
              key={opcao.valor}
              onPress={() => aoEscolher(opcao.valor)}
              accessibilityRole="radio"
              accessibilityState={{ selected: ativa }}
              accessibilityLabel={opcao.texto}
              style={[
                estilos.escolha,
                ativa && estilos.escolhaAtiva,
                erro ? estilos.escolhaInvalida : null,
              ]}
            >
              <Text style={[estilos.escolhaTexto, ativa && estilos.escolhaTextoAtivo]}>
                {opcao.texto}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {erro ? (
        <Text accessibilityRole="alert" style={estilos.erroDoCampo}>
          {erro}
        </Text>
      ) : null}
    </View>
  );
}

export function FotoAmpliavel({
  source,
  rotulo,
  estilo,
}: {
  source: ImageSourcePropType;
  /** O que o leitor de tela anuncia. Descreve a foto, nao a acao. */
  rotulo: string;
  estilo?: StyleProp<ImageStyle>;
}) {
  const [aberta, setAberta] = useState(false);
  const bordas = useSafeAreaInsets();
  const fechar = () => setAberta(false);

  return (
    <>
      <TouchableOpacity
        onPress={() => setAberta(true)}
        accessibilityRole="imagebutton"
        accessibilityHint="Abre a foto em tela cheia"
      >
        <Image
          accessibilityLabel={rotulo}
          source={source}
          style={[estilos.miniatura, estilo]}
          resizeMode="cover"
        />
      </TouchableOpacity>

      <Modal
        visible={aberta}
        transparent
        animationType="fade"
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}
        onRequestClose={fechar}
      >
        <View style={estilos.visor}>
          <TouchableOpacity
            style={estilos.visorToque}
            activeOpacity={1}
            accessibilityRole="button"
            accessibilityLabel="Fechar a foto"
            onPress={fechar}
          >
            <Image
              accessibilityLabel={`${rotulo}, em tela cheia`}
              source={source}
              style={estilos.fotoInteira}
              resizeMode="contain"
            />
          </TouchableOpacity>
          <View style={[estilos.visorRodape, { paddingBottom: bordas.bottom + ESPACO.m }]}>
            <TouchableOpacity
              style={estilos.fecharVisor}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
              onPress={fechar}
            >
              <Text style={estilos.fecharVisorTexto}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  botao: {
    minHeight: ALVO_MINIMO,
    borderRadius: 14,
    backgroundColor: CORES.primaria,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: ESPACO.g,
  },
  botaoSecundario: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: CORES.borda,
  },
  inativo: { opacity: 0.6 },
  botaoTexto: {
    color: CORES.primariaTexto,
    fontSize: TIPO.corpo,
    fontWeight: '600',
  },
  botaoTextoSecundario: { color: CORES.primaria },
  campo: { marginBottom: ESPACO.m },
  rotulo: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginBottom: ESPACO.p,
  },
  entrada: {
    minHeight: ALVO_MINIMO,
    borderWidth: 2,
    borderColor: CORES.borda,
    borderRadius: 14,
    paddingHorizontal: ESPACO.m,
    fontSize: TIPO.corpo,
    color: CORES.texto,
    backgroundColor: CORES.superficie,
  },
  entradaInvalida: { borderColor: CORES.erro },
  erroDoCampo: {
    color: CORES.erro,
    fontSize: TIPO.apoio,
    marginTop: ESPACO.p,
  },
  erro: {
    color: CORES.erro,
    fontSize: TIPO.apoio,
    marginBottom: ESPACO.m,
  },
  cartao: {
    backgroundColor: CORES.superficie,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CORES.borda,
    padding: ESPACO.m,
    marginBottom: ESPACO.m,
  },
  selo: {
    borderWidth: 2,
    borderRadius: 999,
    paddingHorizontal: ESPACO.p + 2,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  seloTexto: { fontSize: TIPO.apoio - 1, fontWeight: '700' },
  centralizado: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    alignItems: 'center',
    justifyContent: 'center',
    padding: ESPACO.g,
  },
  falhaTexto: { color: CORES.erro, fontSize: TIPO.corpo, textAlign: 'center' },
  falhaAcao: { marginTop: ESPACO.m, alignSelf: 'stretch' },
  vazioTitulo: {
    fontSize: TIPO.subtitulo,
    fontWeight: '600',
    color: CORES.texto,
    textAlign: 'center',
  },
  vazioApoio: {
    fontSize: TIPO.corpo,
    color: CORES.textoSuave,
    textAlign: 'center',
    marginTop: ESPACO.p,
  },
  vazioAcao: { marginTop: ESPACO.g, alignSelf: 'stretch' },
  miniatura: {
    width: '100%',
    height: 220,
    borderRadius: 14,
    backgroundColor: CORES.borda,
  },
  visor: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.92)' },
  visorToque: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fotoInteira: { width: '100%', height: '100%' },
  visorRodape: { paddingHorizontal: ESPACO.m, paddingTop: ESPACO.m },
  fecharVisor: {
    minHeight: ALVO_MINIMO,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  fecharVisorTexto: { color: CORES.primariaTexto, fontSize: TIPO.corpo, fontWeight: '600' },
  escolhas: { flexDirection: 'row', flexWrap: 'wrap', gap: ESPACO.p },
  escolha: {
    minHeight: ALVO_MINIMO,
    justifyContent: 'center',
    paddingHorizontal: ESPACO.m,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: CORES.borda,
    backgroundColor: CORES.superficie,
  },
  escolhaAtiva: {
    borderColor: CORES.primaria,
    backgroundColor: CORES.primaria,
  },
  escolhaInvalida: { borderColor: CORES.erro },
  escolhaTexto: { fontSize: TIPO.corpo, fontWeight: '600', color: CORES.texto },
  escolhaTextoAtivo: { color: CORES.primariaTexto },
});
