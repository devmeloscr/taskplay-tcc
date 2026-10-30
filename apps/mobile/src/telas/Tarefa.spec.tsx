import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context';
import { tirarFoto } from '../api/foto';
import type { Tarefa as TarefaDaApi } from '../api/cliente';
import { Tarefa } from './Tarefa';
import { pontuacaoComoNoServidor } from './pontuacao-de-teste';

let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };
let mockGaleriaLiberada = true;
const mockTarefa = jest.fn();
const mockConcluir = jest.fn();
const mockVerificar = jest.fn();
const mockCancelar = jest.fn();

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ perfilAtivo: mockPerfil, accessToken: 'token' }),
}));

jest.mock('../api/consultas', () => ({
  useTarefa: () => mockTarefa(),
  useConcluirTarefa: () => ({ mutate: mockConcluir, isPending: false, isError: false }),
  useVerificarTarefa: () => ({ mutate: mockVerificar, isPending: false, isError: false }),
  useCancelarTarefa: () => ({ mutate: mockCancelar, isPending: false, isError: false }),
}));

jest.mock('../api/foto', () => ({
  tirarFoto: jest.fn(),
  escolherDaGaleria: jest.fn(),
  PermissaoNegada: class extends Error {},
  // Getter, e nao valor: a chave e lida no momento em que a tela renderiza, e e
  // isso que deixa um teste alterna-la sem reimportar a tela.
  get GALERIA_LIBERADA() {
    return mockGaleriaLiberada;
  },
}));

function tarefa(parcial: Partial<TarefaDaApi> = {}): TarefaDaApi {
  const base: Omit<TarefaDaApi, 'scoring'> = {
    id: 't1',
    title: 'Lavar a louca',
    description: null,
    points: 20,
    dueAt: new Date(Date.now() + 3_600_000).toISOString(),
    status: 'PENDING',
    verification: 'MANUAL',
    assigneeId: 'pedro',
    assignee: { id: 'pedro', name: 'Pedro' },
    completedAt: null,
    reviewedAt: null,
    compensationForId: null,
    evidences: [],
    ...parcial,
  };
  return { ...base, scoring: parcial.scoring ?? pontuacaoComoNoServidor(base) };
}

const mockIrParaCompensacao = jest.fn();
const mockIrParaEdicao = jest.fn();

const MEDIDAS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function mostrar(parcial: Partial<TarefaDaApi> = {}) {
  mockTarefa.mockReturnValue({
    data: tarefa(parcial),
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  });
  return render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <Tarefa
        id="t1"
        voltar={jest.fn()}
        irParaCompensacao={mockIrParaCompensacao}
        irParaEdicao={mockIrParaEdicao}
      />
    </SafeAreaProvider>,
  );
}

describe('Tarefa', () => {
  beforeEach(() => {
    [
      mockTarefa,
      mockConcluir,
      mockVerificar,
      mockCancelar,
      mockIrParaCompensacao,
      mockIrParaEdicao,
      tirarFoto as jest.Mock,
    ].forEach((m) => m.mockReset());
    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
    mockGaleriaLiberada = true;
  });

  it('oferece a galeria so quando a chave esta ligada', () => {
    mostrar({ verification: 'IMAGE' });
    expect(screen.getByRole('button', { name: 'Da galeria' })).toBeTruthy();

    mockGaleriaLiberada = false;
    mostrar({ verification: 'IMAGE' });
    expect(screen.queryByRole('button', { name: 'Da galeria' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Tirar foto' }).length).toBeGreaterThan(0);
  });

  it('mostra os pontos que a tarefa ainda vale ANTES de o filho concluir', () => {
    mostrar({
      status: 'EXPIRED',
      points: 20,
      dueAt: new Date(Date.now() - 3_600_000).toISOString(),
    });
    expect(screen.getByText(/ainda ganha 15 de 20 pontos/)).toBeTruthy();
  });

  it('anuncia os pontos cheios quando ainda esta no prazo', () => {
    mostrar({ points: 20 });
    expect(screen.getByText('Entregando agora, você ganha 20 pontos.')).toBeTruthy();
  });

  it('mostra o que a tarefa RENDEU, e nao o que valia, quando a entrega atrasou', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mostrar({
      status: 'APPROVED',
      points: 20,
      dueAt: new Date('2026-08-28T18:00:00').toISOString(),
      completedAt: new Date('2026-08-29T10:00:00').toISOString(),
    });

    expect(screen.getByText('Rendeu')).toBeTruthy();
    expect(screen.getByText('15 de 20 pontos')).toBeTruthy();
    expect(screen.queryByText('Vale')).toBeNull();
  });

  it('nomeia a faixa que cortou os pontos', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mostrar({
      status: 'APPROVED',
      points: 20,
      dueAt: new Date('2026-08-28T18:00:00').toISOString(),
      completedAt: new Date('2026-08-30T10:00:00').toISOString(),
    });

    expect(screen.getByText(/Até 72h de atraso: A tarefa valia 20 pontos e rendeu 10/)).toBeTruthy();
  });

  it('diz que o corte ainda depende da aprovacao enquanto espera conferencia', () => {
    // A faixa ja esta decidida pelo envio, mas o credito nao aconteceu: dizer
    // "rendeu" aqui anunciaria pontos que ninguem lancou no razao.
    mostrar({
      status: 'SUBMITTED',
      points: 20,
      dueAt: new Date('2026-08-28T18:00:00').toISOString(),
      completedAt: new Date('2026-08-29T10:00:00').toISOString(),
    });

    expect(screen.getByText('Vai render')).toBeTruthy();
    expect(screen.getByText(/rende 15, se o responsável aprovar/)).toBeTruthy();
  });

  it('mantem "Vale" e o valor cheio na tarefa que ainda nao foi entregue', () => {
    mostrar({ status: 'PENDING', points: 20 });

    expect(screen.getByText('Vale')).toBeTruthy();
    expect(screen.getByText('20 pontos')).toBeTruthy();
  });

  it('recusa a conclusao sem foto quando a tarefa exige foto', () => {
    // O servidor aceita a conclusao sem imagem; recusar aqui evita gastar a
    // requisicao e a espera para descobrir que faltou o principal.
    mostrar({ verification: 'IMAGE' });
    fireEvent.press(screen.getByRole('button', { name: 'Concluir tarefa' }));

    expect(mockConcluir).not.toHaveBeenCalled();
    expect(screen.getByText('Esta tarefa pede uma foto do resultado.')).toBeTruthy();
  });

  it('nao oferece conferir nem cancelar a um filho', () => {
    mostrar({ status: 'SUBMITTED' });
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancelar tarefa' })).toBeNull();
  });

  it('nao oferece concluir a tarefa de outro membro', () => {
    // O servidor recusa ("Esta tarefa é de outro membro"); a tela nao oferece o
    // que seria negado.
    mockPerfil = { id: 'joao', nome: 'Joao', papel: 'CHILD' };
    mostrar({ assigneeId: 'pedro' });
    expect(screen.queryByRole('button', { name: 'Concluir tarefa' })).toBeNull();
  });

  describe('tarefa repassada ao responsavel pela carta', () => {
    beforeEach(() => {
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    });

    it('oferece "Marcar como feita", sem foto, em vez da entrega do filho', () => {
      mostrar({ assigneeId: 'ana', verification: 'IMAGE' });
      expect(screen.getByRole('button', { name: 'Marcar como feita' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Concluir tarefa' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'Tirar foto' })).toBeNull();
    });

    it('conclui sem nota e sem foto', () => {
      mostrar({ assigneeId: 'ana' });
      fireEvent.press(screen.getByRole('button', { name: 'Marcar como feita' }));
      expect(mockConcluir).toHaveBeenCalledWith({}, expect.anything());
    });

    it('nao mostra quanto a tarefa vale, porque o responsavel nao ganha pontos', () => {
      mostrar({ assigneeId: 'ana' });
      expect(screen.queryByText('Vale')).toBeNull();
    });

    it('continua mostrando o valor da tarefa de um filho', () => {
      mostrar({ assigneeId: 'pedro' });
      expect(screen.getByText('Vale')).toBeTruthy();
    });

    it('nao oferece marcar como feita a tarefa de um filho', () => {
      mostrar({ assigneeId: 'pedro' });
      expect(screen.queryByRole('button', { name: 'Marcar como feita' })).toBeNull();
    });
  });

  it('omite "Para" na tela de quem e o destinatario, e mantem para os outros', () => {
    // Dizer "Para: Pedro" ao proprio Pedro nao informa nada; para quem ve
    // varias tarefas da casa, a linha e o que separa uma da outra.
    mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
    mostrar({ assigneeId: 'pedro', assignee: { id: 'pedro', name: 'Pedro' } });
    expect(screen.queryByText('Para')).toBeNull();

    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mostrar({ assigneeId: 'pedro', assignee: { id: 'pedro', name: 'Pedro' } });
    expect(screen.getByText('Para')).toBeTruthy();
    expect(screen.getByText('Pedro')).toBeTruthy();
  });

  it('chama a recusa de "pedir para refazer", porque a tarefa volta', () => {
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mostrar({ status: 'SUBMITTED' });

    fireEvent.press(screen.getByRole('button', { name: 'Pedir para refazer' }));
    expect(mockVerificar).toHaveBeenCalledWith(
      { decision: 'REJECTED', comment: undefined },
      expect.anything(),
    );
  });

  it('exige dois toques para cancelar, e o primeiro nao cancela nada', () => {
    // Cancelar e terminal: a tarefa nao reabre.
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mostrar({ status: 'PENDING' });

    fireEvent.press(screen.getByRole('button', { name: 'Cancelar tarefa' }));
    expect(mockCancelar).not.toHaveBeenCalled();

    fireEvent.press(screen.getByRole('button', { name: 'Sim, cancelar' }));
    expect(mockCancelar).toHaveBeenCalled();
  });

  describe('edicao da tarefa', () => {
    it('so oferece a edicao ao responsavel', () => {
      // Editar exige `PARENT` no servidor; oferecer o botao ao filho seria a
      // tela prometendo o que a regra nega.
      mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
      mostrar({ status: 'PENDING' });
      expect(screen.queryByRole('button', { name: 'Editar tarefa' })).toBeNull();

      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'PENDING' });
      expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeTruthy();
    });

    it.each(['SUBMITTED', 'APPROVED', 'CANCELLED', 'EXPIRED'] as const)(
      'nao oferece a edicao em %s',
      (status) => {
        mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
        mostrar({ status });
        expect(screen.queryByRole('button', { name: 'Editar tarefa' })).toBeNull();
      },
    );

    it('oferece a edicao da tarefa que voltou para refazer', () => {
      // `REJECTED` nao e estado final - a tarefa volta para a crianca, e
      // corrigir o texto do que se pediu e justamente o que ajuda.
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'REJECTED' });
      expect(screen.getByRole('button', { name: 'Editar tarefa' })).toBeTruthy();
    });

    it('leva o id da tarefa para o formulario', () => {
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'PENDING' });
      fireEvent.press(screen.getByRole('button', { name: 'Editar tarefa' }));
      expect(mockIrParaEdicao).toHaveBeenCalledWith('t1');
    });
  });

  describe('compensacao de tarefa vencida (objetivo e)', () => {
    it('so oferece a compensacao ao responsavel, e so em tarefa vencida', () => {
      // `EXPIRED` e a unica origem que o servidor aceita: qualquer outra volta
      // com 409. A tela nao oferece o que voltaria recusado.
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'EXPIRED' });
      expect(screen.getByRole('button', { name: 'Criar tarefa de compensação' })).toBeTruthy();

      mostrar({ status: 'PENDING' });
      expect(screen.queryByRole('button', { name: 'Criar tarefa de compensação' })).toBeNull();
    });

    it('nao oferece a compensacao ao filho', () => {
      mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
      mostrar({ status: 'EXPIRED' });
      expect(screen.queryByRole('button', { name: 'Criar tarefa de compensação' })).toBeNull();
    });

    it('diz que a compensacao nao devolve os pontos perdidos', () => {
      // A penalidade so e construtiva enquanto for previsivel. Deixar isso
      // implicito faria o responsavel prometer o que o sistema nao cumpre.
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'EXPIRED' });
      expect(screen.getByText(/não devolve os que o atraso custou/)).toBeTruthy();
    });

    it('leva o id da tarefa vencida para o formulario', () => {
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'EXPIRED' });
      fireEvent.press(screen.getByRole('button', { name: 'Criar tarefa de compensação' }));
      expect(mockIrParaCompensacao).toHaveBeenCalledWith('t1');
    });
  });

  describe('foto da evidencia', () => {
    const evidencia = {
      id: 'e1',
      imageKey: 'familias/f1/tarefas/t1/foto.jpg',
      note: null,
      createdAt: new Date().toISOString(),
    };

    it('manda o token num array de source, e nao num objeto', () => {
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'SUBMITTED', verification: 'IMAGE', evidences: [evidencia] });

      const foto = screen.getByLabelText('Foto enviada em Lavar a louca');
      expect(foto.props.source).toEqual([
        expect.objectContaining({ headers: { authorization: 'Bearer token' } }),
      ]);
    });

    it('abre a foto da evidencia em tela cheia, sem cortar, para o responsavel', () => {
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'SUBMITTED', verification: 'IMAGE', evidences: [evidencia] });

      const miniatura = screen.getByLabelText('Foto enviada em Lavar a louca');
      expect(miniatura.props.resizeMode).toBe('cover');
      expect(screen.queryByLabelText('Foto enviada em Lavar a louca, em tela cheia')).toBeNull();

      fireEvent.press(miniatura);

      const inteira = screen.getByLabelText('Foto enviada em Lavar a louca, em tela cheia');
      expect(inteira.props.resizeMode).toBe('contain');
      // A mesma `source` da miniatura, e nao uma remontada: e ela que carrega o
      // token no formato que o Android le.
      expect(inteira.props.source).toEqual(miniatura.props.source);
    });

    it('abre a mesma tela cheia para o filho dono da tarefa', () => {
      mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
      mostrar({ status: 'SUBMITTED', verification: 'IMAGE', evidences: [evidencia] });

      fireEvent.press(screen.getByLabelText('Foto enviada em Lavar a louca'));

      expect(
        screen.getByLabelText('Foto enviada em Lavar a louca, em tela cheia').props.resizeMode,
      ).toBe('contain');
    });

    it('fecha a tela cheia pelo botao', () => {
      mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
      mostrar({ status: 'SUBMITTED', verification: 'IMAGE', evidences: [evidencia] });

      fireEvent.press(screen.getByLabelText('Foto enviada em Lavar a louca'));
      fireEvent.press(screen.getByRole('button', { name: 'Fechar' }));

      expect(screen.queryByLabelText('Foto enviada em Lavar a louca, em tela cheia')).toBeNull();
    });

    it('amplia tambem a previa da foto que o filho acabou de tirar', async () => {
      // Conferir antes de enviar e do filho: a foto sai da camera pequena no
      // cartao, e e ampliada que ele ve se o resultado aparece mesmo nela.
      mockPerfil = { id: 'pedro', nome: 'Pedro', papel: 'CHILD' };
      (tirarFoto as jest.Mock).mockResolvedValue({ uri: 'file:///foto.jpg', tipo: 'image/jpeg' });
      mostrar({ verification: 'IMAGE' });

      fireEvent.press(screen.getAllByRole('button', { name: 'Tirar foto' })[0]);
      fireEvent.press(await screen.findByLabelText('Foto escolhida'));

      expect(screen.getByLabelText('Foto escolhida, em tela cheia').props.resizeMode).toBe(
        'contain',
      );
    });
  });
});
