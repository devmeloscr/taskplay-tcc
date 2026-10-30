import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAtualizarMembro, useMembrosGerenciados } from '../api/consultas';
import { useErrosDoFormulario } from './formulario';
import { Botao, Campo, Carregando, Erro, Falha, Vazio, textoDaFalha } from './componentes';
import { dataDeNascimentoParaIso, mascaraDeDataDeNascimento } from './formatos';
import { CORES, ESPACO, TIPO } from './tema';

/** Os `path` que a API devolve e esta tela sabe apontar. */
const CAMPOS = ['name', 'birthDate', 'pin'] as const;

export function EditarFilho({ id, voltar }: { id: string; voltar: () => void }) {
  const consulta = useMembrosGerenciados();
  const membro = consulta.data?.find((candidato) => candidato.id === id);

  if (consulta.isPending) return <Carregando rotulo="Carregando o perfil" />;
  if (consulta.isError) {
    return <Falha erro={consulta.error} aoTentarDeNovo={() => consulta.refetch()} />;
  }
  if (!membro) {
    return (
      <Vazio
        titulo="Perfil não encontrado"
        apoio="Ele pode ter sido removido da família em outro aparelho."
        acao={{ titulo: 'Voltar', aoTocar: voltar }}
      />
    );
  }

  return <Formulario membro={membro} voltar={voltar} />;
}

function Formulario({
  membro,
  voltar,
}: {
  membro: { id: string; name: string; birthDate: string | null; hasPin: boolean };
  voltar: () => void;
}) {
  const atualizar = useAtualizarMembro();
  const erros = useErrosDoFormulario(CAMPOS);

  const [nome, setNome] = useState(membro.name);
  const [nascimento, setNascimento] = useState(paraCampo(membro.birthDate));
  const [novoPin, setNovoPin] = useState('');
  const [tirarPin, setTirarPin] = useState(false);
  const [faltando, setFaltando] = useState<Record<string, string>>({});
  const [salvo, setSalvo] = useState(false);

  function enviar() {
    const pendencias: Record<string, string> = {};
    const corpo: { name?: string; birthDate?: string | null; pin?: string | null } = {};

    if (nome.trim().length === 0) pendencias['name'] = 'Informe o nome do filho';
    else if (nome.trim() !== membro.name) corpo.name = nome.trim();

    // O campo vazio apaga a data, e por isso `null` e um resultado possivel e
    // nao uma falha: e o unico caminho para tirar uma data digitada errada.
    const dataAtual = paraCampo(membro.birthDate);
    if (nascimento.trim() !== dataAtual) {
      if (nascimento.trim().length === 0) {
        corpo.birthDate = null;
      } else {
        const convertida = dataDeNascimentoParaIso(nascimento);
        if ('erro' in convertida) pendencias['birthDate'] = convertida.erro;
        else corpo.birthDate = convertida.iso;
      }
    }

    if (tirarPin) corpo.pin = null;
    else if (novoPin.length > 0) {
      if (novoPin.length !== 4) pendencias['pin'] = 'O PIN deve ter exatamente 4 dígitos';
      else corpo.pin = novoPin;
    }

    if (Object.keys(pendencias).length > 0) {
      setFaltando(pendencias);
      return;
    }

    if (Object.keys(corpo).length === 0) {
      setFaltando({});
      setSalvo(true);
      return;
    }

    setFaltando({});
    erros.limpar();
    atualizar.mutate(
      { id: membro.id, ...corpo },
      {
        onSuccess: () => {
          setSalvo(true);
          setNovoPin('');
          setTirarPin(false);
        },
        onError: erros.registrar,
      },
    );
  }

  const erroDe = (campo: string) => faltando[campo] ?? erros.porCampo[campo] ?? null;

  return (
    <ScrollView contentContainerStyle={estilos.container}>
      <Text style={estilos.titulo}>Editar {membro.name}</Text>
      <Text style={estilos.apoio}>
        O que você mudar aqui fica registrado no histórico da família, com o valor anterior e o
        novo.
      </Text>

      {salvo ? (
        <Text accessibilityRole="alert" style={estilos.confirmacao}>
          Alterações salvas.
        </Text>
      ) : null}

      <Campo
        rotulo="Nome"
        value={nome}
        onChangeText={erros.aoEditar('name', (v) => {
          setNome(v);
          setSalvo(false);
          setFaltando(({ name: _, ...resto }) => resto);
        })}
        placeholder="Ex.: Pedro"
        erro={erroDe('name')}
      />

      <Campo
        rotulo="Data de nascimento (opcional)"
        value={nascimento}
        onChangeText={erros.aoEditar('birthDate', (v) => {
          setNascimento(mascaraDeDataDeNascimento(v));
          setSalvo(false);
          setFaltando(({ birthDate: _, ...resto }) => resto);
        })}
        placeholder="31/12/2016"
        keyboardType="number-pad"
        maxLength={10}
        erro={erroDe('birthDate')}
      />
      <Text style={estilos.nota}>
        Apague o campo para tirar a data. Ela serve só para separar os resultados da pesquisa por
        idade.
      </Text>

      <Text style={estilos.secao}>PIN de acesso ao perfil</Text>
      <Text style={estilos.nota}>
        {membro.hasPin
          ? `${membro.name} precisa digitar um PIN para entrar no próprio perfil. O PIN atual não pode ser mostrado: o aplicativo não o guarda.`
          : `${membro.name} entra tocando no próprio nome, sem PIN. Definir um protege o perfil dos irmãos neste aparelho.`}
      </Text>

      {tirarPin ? (
        <View style={estilos.escolhido}>
          <Text style={estilos.escolhidoTexto}>
            Ao salvar, o PIN de {membro.name} será removido.
          </Text>
          <Botao titulo="Manter o PIN" variante="secundaria" aoTocar={() => setTirarPin(false)} />
        </View>
      ) : (
        <>
          <Campo
            rotulo={membro.hasPin ? 'Novo PIN (deixe em branco para manter)' : 'PIN (opcional)'}
            value={novoPin}
            onChangeText={erros.aoEditar('pin', (v) => {
              setNovoPin(v.replace(/\D/g, '').slice(0, 4));
              setSalvo(false);
              setFaltando(({ pin: _, ...resto }) => resto);
            })}
            placeholder="4 dígitos"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            erro={erroDe('pin')}
          />
          {membro.hasPin ? (
            <Botao titulo="Tirar o PIN" variante="secundaria" aoTocar={() => setTirarPin(true)} />
          ) : null}
        </>
      )}

      <View style={estilos.separador} />
      <Erro mensagem={erros.geral ?? (atualizar.isError ? textoDaFalha(atualizar.error) : null)} />
      <Botao titulo="Salvar" aoTocar={enviar} carregando={atualizar.isPending} />
      <View style={estilos.separador} />
      <Botao titulo="Voltar" variante="secundaria" aoTocar={voltar} />
    </ScrollView>
  );
}

function paraCampo(iso: string | null): string {
  if (!iso) return '';
  const partes = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return partes ? `${partes[3]}/${partes[2]}/${partes[1]}` : '';
}

const estilos = StyleSheet.create({
  container: { padding: ESPACO.m },
  titulo: { fontSize: TIPO.titulo, fontWeight: '700', color: CORES.texto, marginBottom: ESPACO.p },
  apoio: { fontSize: TIPO.apoio, color: CORES.textoSuave, marginBottom: ESPACO.g, lineHeight: 20 },
  secao: {
    fontSize: TIPO.subtitulo,
    fontWeight: '700',
    color: CORES.texto,
    marginTop: ESPACO.m,
    marginBottom: ESPACO.p,
  },
  confirmacao: {
    fontSize: TIPO.corpo,
    color: CORES.sucesso,
    fontWeight: '600',
    marginBottom: ESPACO.m,
  },
  nota: {
    fontSize: TIPO.apoio,
    color: CORES.textoSuave,
    marginTop: -ESPACO.p,
    marginBottom: ESPACO.m,
    lineHeight: 20,
  },
  escolhido: { marginBottom: ESPACO.m },
  escolhidoTexto: { fontSize: TIPO.corpo, color: CORES.texto, marginBottom: ESPACO.p, lineHeight: 22 },
  separador: { height: ESPACO.p },
});
