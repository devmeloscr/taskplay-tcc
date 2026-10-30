import React from 'react';
import { AppState, Text } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ProvedorDeSessao, useSessao } from './sessao';
import { ErroDaApi } from '../api/cliente';
import { esquecerTudo, guardarToken, qualquerToken, tokenDoPerfil } from '../api/armazenamento';

// Dublê do Keychain/Keystore, como no teste do armazenamento: o que se verifica
// aqui e a regra da saida, nao a integracao com a plataforma.
jest.mock('expo-secure-store', () => {
  const cofre: Record<string, string> = {};
  return {
    getItemAsync: jest.fn(async (chave: string) => cofre[chave] ?? null),
    setItemAsync: jest.fn(async (chave: string, valor: string) => {
      cofre[chave] = valor;
    }),
    deleteItemAsync: jest.fn(async (chave: string) => {
      delete cofre[chave];
    }),
  };
});

const mockSair = jest.fn();
const mockRenovar = jest.fn();
const mockSelecionar = jest.fn();
const mockEu = jest.fn();
const mockPerfis = jest.fn();

jest.mock('../api/cliente', () => ({
  ...jest.requireActual('../api/cliente'),
  api: {
    sair: (token: string) => mockSair(token),
    renovar: (token: string) => mockRenovar(token),
    selecionarPerfil: (corpo: unknown) => mockSelecionar(corpo),
    eu: (token: string) => mockEu(token),
    perfis: (token: string) => mockPerfis(token),
  },
}));

const ouvintesDeEstado: ((estado: string) => void)[] = [];
jest.spyOn(AppState, 'addEventListener').mockImplementation((_evento, ouvinte) => {
  ouvintesDeEstado.push(ouvinte as (estado: string) => void);
  return { remove: () => undefined } as ReturnType<typeof AppState.addEventListener>;
});

function voltarAoPrimeiroPlano() {
  act(() => {
    ouvintesDeEstado.forEach((ouvinte) => ouvinte('active'));
  });
}

function Sonda() {
  const { sair, aparelhoConhecido, carregando } = useSessao();
  if (carregando) return <Text>carregando</Text>;
  return (
    <>
      <Text accessibilityRole="button" onPress={sair}>
        sair
      </Text>
      <Text>{aparelhoConhecido ? 'conhecido' : 'desconhecido'}</Text>
    </>
  );
}

async function montar() {
  render(
    <ProvedorDeSessao>
      <Sonda />
    </ProvedorDeSessao>,
  );
  await screen.findByText('conhecido');
}

describe('sair do aparelho', () => {
  beforeEach(async () => {
    mockSair.mockReset();
    mockSair.mockResolvedValue(undefined);
    await guardarToken('perfil-pai', 'token-do-pai');
    await guardarToken('perfil-filho', 'token-do-filho');
  });

  it('revoga no servidor a sessao de todos os perfis, e nao so a do ativo', async () => {
    await montar();
    fireEvent.press(screen.getByText('sair'));

    await waitFor(() => expect(mockSair).toHaveBeenCalledTimes(2));
    expect(mockSair.mock.calls.flat()).toEqual(
      expect.arrayContaining(['token-do-pai', 'token-do-filho']),
    );
  });

  it('esquece o cofre depois de revogar', async () => {
    await montar();
    fireEvent.press(screen.getByText('sair'));

    await screen.findByText('desconhecido');
    expect(await qualquerToken()).toBeNull();
  });

  it('sai localmente mesmo se a revogacao falhar', async () => {
    mockSair.mockRejectedValue(new TypeError('Failed to fetch'));
    await montar();
    fireEvent.press(screen.getByText('sair'));

    await screen.findByText('desconhecido');
    expect(await qualquerToken()).toBeNull();
  });
});

describe('renovacao do access token', () => {
  function Perfil() {
    const { selecionarPerfil, perfilAtivo, carregando } = useSessao();
    if (carregando) return <Text>carregando</Text>;
    return (
      <>
        <Text accessibilityRole="button" onPress={() => void selecionarPerfil('perfil-filho')}>
          entrar
        </Text>
        <Text>{perfilAtivo ? `ativo:${perfilAtivo.nome}` : 'sem perfil'}</Text>
      </>
    );
  }

  /** Entra num perfil com um token de 15 minutos, como o servidor emite. */
  async function entrar() {
    mockSelecionar.mockResolvedValue({
      accessToken: 'velho',
      refreshToken: 'refresh-novo',
      expiresIn: 900,
      scope: 'full',
    });
    // O id do perfil e o do usuario sao o mesmo: e o `userId` que a selecao
    // manda e o `sub` que volta no token.
    mockEu.mockResolvedValue({ id: 'perfil-filho', name: 'Pedro', role: 'CHILD', familyId: 'f1' });

    render(
      <ProvedorDeSessao>
        <Perfil />
      </ProvedorDeSessao>,
    );
    await screen.findByText('sem perfil');
    fireEvent.press(screen.getByText('entrar'));
    await screen.findByText('ativo:Pedro');
  }

  /** O aparelho passou 20 minutos com o aplicativo suspenso. */
  function passaramVinteMinutos() {
    const agora = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(agora + 20 * 60 * 1000);
  }

  beforeEach(async () => {
    [mockRenovar, mockSelecionar, mockEu].forEach((m) => m.mockReset());
    await guardarToken('perfil-filho', 'refresh-do-filho');
  });

  afterEach(() => {
    jest.spyOn(Date, 'now').mockRestore();
  });

  it('renova quando o aplicativo volta ao primeiro plano com o token vencido', async () => {
    mockRenovar.mockResolvedValue({
      accessToken: 'novo',
      refreshToken: 'refresh-mais-novo',
      expiresIn: 900,
      scope: 'full',
    });
    await entrar();

    passaramVinteMinutos();
    voltarAoPrimeiroPlano();

    // `refresh-novo` e o token que a selecao rotacionou: e ele que esta no cofre
    // quando a renovacao acontece, e nao o que o teste guardou antes.
    await waitFor(() => expect(mockRenovar).toHaveBeenCalledWith('refresh-novo'));
    expect(screen.getByText('ativo:Pedro')).toBeTruthy();
  });

  it('nao renova quando o token ainda esta longe de vencer', async () => {
    // Voltar ao primeiro plano nao e motivo para gastar uma rotacao: o refresh
    // token roda a cada renovacao, e trocar de aba nao pode custar uma.
    await entrar();

    voltarAoPrimeiroPlano();

    expect(mockRenovar).not.toHaveBeenCalled();
  });

  it('nao derruba o perfil quando a renovacao falha por rede', async () => {
    mockRenovar.mockRejectedValue(new TypeError('Network request failed'));
    await entrar();

    passaramVinteMinutos();
    voltarAoPrimeiroPlano();

    await waitFor(() => expect(mockRenovar).toHaveBeenCalled());
    expect(screen.getByText('ativo:Pedro')).toBeTruthy();
  });

  it('volta ao seletor quando o servidor recusa a renovacao', async () => {
    // Sessao revogada ou refresh token expirado de vez: insistir so adiaria a
    // mesma conclusao, e a pessoa ficaria vendo erro sem entender o motivo.
    mockRenovar.mockRejectedValue(new ErroDaApi(401, 'Token inválido ou expirado'));
    await entrar();

    passaramVinteMinutos();
    voltarAoPrimeiroPlano();

    await screen.findByText('sem perfil');
  });
});

describe('perfis com sessao morta', () => {
  const recusado = () => new ErroDaApi(401, 'Sessão inválida');

  function Seletor() {
    const { listarPerfis, aparelhoConhecido, carregando } = useSessao();
    const [resultado, setResultado] = React.useState('');
    if (carregando) return <Text>carregando</Text>;
    return (
      <>
        <Text
          accessibilityRole="button"
          onPress={() =>
            listarPerfis().then(
              (perfis) => setResultado(perfis.map((p) => p.name).join(',')),
              (erro: ErroDaApi) => setResultado(`erro ${erro.status}`),
            )
          }
        >
          listar
        </Text>
        <Text>{aparelhoConhecido ? 'conhecido' : 'desconhecido'}</Text>
        <Text>{resultado}</Text>
      </>
    );
  }

  async function listar() {
    render(
      <ProvedorDeSessao>
        <Seletor />
      </ProvedorDeSessao>,
    );
    await screen.findByText('conhecido');
    fireEvent.press(screen.getByText('listar'));
  }

  beforeEach(async () => {
    mockPerfis.mockReset();
    await esquecerTudo();
  });

  it('com todos os tokens recusados, esquece o aparelho e manda ao login', async () => {
    await guardarToken('perfil-pai', 'token-morto');
    mockPerfis.mockRejectedValue(recusado());
    await listar();

    await screen.findByText('desconhecido');
    expect(await qualquerToken()).toBeNull();
  });

  it('um token recusado nao derruba o aparelho se outro perfil ainda vale', async () => {
    await guardarToken('perfil-filho', 'token-morto');
    await guardarToken('perfil-pai', 'token-vivo');
    mockPerfis.mockImplementation(async (token: string) => {
      if (token === 'token-morto') throw recusado();
      return [{ id: 'perfil-pai', name: 'Pai' }];
    });
    await listar();

    await screen.findByText('Pai');
    expect(screen.getByText('conhecido')).toBeTruthy();
    expect(await tokenDoPerfil('perfil-filho')).toBeNull();
    expect(await tokenDoPerfil('perfil-pai')).toBe('token-vivo');
  });

  it('falha de rede nao esquece nada', async () => {
    // Sem sinal em casa, perder a sessao transformaria um problema passageiro
    // em pedir a senha de novo.
    await guardarToken('perfil-pai', 'token-vivo');
    mockPerfis.mockRejectedValue(new ErroDaApi(0, 'Sem conexão'));
    await listar();

    await screen.findByText('erro 0');
    expect(screen.getByText('conhecido')).toBeTruthy();
    expect(await tokenDoPerfil('perfil-pai')).toBe('token-vivo');
  });
});
