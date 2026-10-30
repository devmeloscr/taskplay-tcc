import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { NovaTarefa } from './NovaTarefa';

let mockPerfil: { id: string; nome: string; papel: 'PARENT' | 'CHILD' };
let mockListaDeMembros: {
  id: string;
  name: string;
  role: 'PARENT' | 'CHILD';
}[];
let mockTarefaOriginal: unknown = undefined;
const mockCriar = jest.fn();
const mockAtualizar = jest.fn();

jest.mock('../auth/sessao', () => ({
  useSessao: () => ({ perfilAtivo: mockPerfil }),
}));
jest.mock('../api/consultas', () => ({
  useMembros: () => ({
    data: mockListaDeMembros,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useTarefa: () => ({
    data: mockTarefaOriginal,
    isPending: false,
    isError: false,
    refetch: jest.fn(),
  }),
  useCriarTarefa: () => ({
    mutate: mockCriar,
    isPending: false,
    isError: false,
  }),
  useAtualizarTarefa: () => ({
    mutate: mockAtualizar,
    isPending: false,
    isError: false,
  }),
}));

function montar(props: { compensarId?: string; editarId?: string } = {}) {
  return render(
    <NovaTarefa
      voltar={jest.fn()}
      irParaNovoMembro={jest.fn()}
      compensarId={props.compensarId}
      editarId={props.editarId}
    />,
  );
}

/** A tarefa que se esta editando, como `useTarefa` a devolveria. */
function tarefaExistente(parcial: Record<string, unknown> = {}) {
  return {
    id: 'tarefa-1',
    title: 'Lavar a louca',
    description: 'Só os pratos',
    points: 50,
    dueAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    status: 'PENDING',
    verification: 'IMAGE',
    assigneeId: 'pedro',
    assignee: { id: 'pedro', name: 'Pedro' },
    ...parcial,
  };
}

describe('NovaTarefa', () => {
  beforeEach(() => {
    mockCriar.mockReset();
    mockAtualizar.mockReset();
    mockTarefaOriginal = undefined;
    mockPerfil = { id: 'ana', nome: 'Ana', papel: 'PARENT' };
    mockListaDeMembros = [
      { id: 'ana', name: 'Ana', role: 'PARENT' },
      { id: 'pedro', name: 'Pedro', role: 'CHILD' },
    ];
  });

  it('recusa antes da rede quando falta titulo ou destinatario', () => {
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Criar tarefa' }));

    expect(mockCriar).not.toHaveBeenCalled();
    expect(screen.getByText('Escreva o que precisa ser feito')).toBeTruthy();
    expect(screen.getByText('Escolha para quem é a tarefa')).toBeTruthy();
  });

  it('nao deixa o responsavel atribuir a si mesmo', () => {
    // A tarefa que ele criaria para si nao passa por verificacao - ele e quem
    // verifica - e distorceria a medida de tarefas concluidas.
    montar();
    expect(screen.queryByLabelText('Ana')).toBeNull();
    expect(screen.getByLabelText('Pedro')).toBeTruthy();
  });

  it('oferece o cadastro quando ainda nao ha ninguem para receber a tarefa', () => {
    // Dizer o que falta sem oferecer o caminho era um beco sem saida: o
    // responsavel lia "cadastre um filho" e nao havia onde.
    mockListaDeMembros = [{ id: 'ana', name: 'Ana', role: 'PARENT' }];
    montar();
    expect(screen.getByText(/Cadastre um filho antes de criar a primeira/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cadastrar filho' })).toBeTruthy();
  });

  it('manda o prazo resolvido em ISO, e nao a palavra escolhida', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('O que precisa ser feito'), 'Lavar a louca');
    fireEvent.press(screen.getByLabelText('Pedro'));
    fireEvent.press(screen.getByLabelText('50'));
    fireEvent.press(screen.getByRole('button', { name: 'Criar tarefa' }));

    expect(mockCriar).toHaveBeenCalledTimes(1);
    const enviado = mockCriar.mock.calls[0][0];
    expect(enviado).toMatchObject({
      title: 'Lavar a louca',
      assigneeId: 'pedro',
      points: 50,
      verification: 'MANUAL',
    });
    // "Amanha" e o padrao, e resolve para as 20h - o fim da rotina domestica.
    const prazo = new Date(enviado.dueAt);
    expect(prazo.getHours()).toBe(20);
    expect(prazo.getTime()).toBeGreaterThan(Date.now());
  });

  it('oferece "Agora" como primeiro prazo, com folga para a tarefa nao nascer vencida', () => {
    montar();
    fireEvent.changeText(screen.getByLabelText('O que precisa ser feito'), 'Lavar a louca');
    fireEvent.press(screen.getByLabelText('Pedro'));
    fireEvent.press(screen.getByLabelText('Agora'));
    fireEvent.press(screen.getByRole('button', { name: 'Criar tarefa' }));

    const prazo = new Date(mockCriar.mock.calls[0][0].dueAt).getTime();
    expect(prazo).toBeGreaterThan(Date.now());
    expect(prazo).toBeLessThanOrEqual(Date.now() + 60 * 60_000);
  });

  it('apaga a marca do campo assim que a pessoa corrige', () => {
    // Manter a borda vermelha enquanto se digita a correcao e o formulario
    // insistindo num veredito que ele nao refez.
    montar();
    fireEvent.press(screen.getByRole('button', { name: 'Criar tarefa' }));
    expect(screen.getByText('Escreva o que precisa ser feito')).toBeTruthy();

    fireEvent.changeText(screen.getByLabelText(/^O que precisa ser feito/), 'Lavar a louca');
    expect(screen.queryByText('Escreva o que precisa ser feito')).toBeNull();
  });

  describe('compensacao de tarefa vencida', () => {
    beforeEach(() => {
      mockTarefaOriginal = {
        id: 'venceu',
        title: 'Lavar a louca',
        assigneeId: 'pedro',
        assignee: { id: 'pedro', name: 'Pedro' },
      };
    });

    it('nao deixa escolher o destinatario: ele vem da tarefa vencida', () => {
      montar({ compensarId: 'venceu' });
      expect(screen.queryByRole('radio', { name: 'Pedro' })).toBeNull();
      expect(screen.getByText('Pedro')).toBeTruthy();
    });

    it('diz qual tarefa esta sendo compensada', () => {
      montar({ compensarId: 'venceu' });
      expect(screen.getByText(/Compensa "Lavar a louca"/)).toBeTruthy();
    });

    it('manda compensationForId e o destinatario da original', () => {
      montar({ compensarId: 'venceu' });
      fireEvent.changeText(screen.getByLabelText('O que precisa ser feito'), 'Varrer a sala');
      fireEvent.press(screen.getByRole('button', { name: 'Criar compensação' }));

      expect(mockCriar).toHaveBeenCalledTimes(1);
      expect(mockCriar.mock.calls[0][0]).toMatchObject({
        title: 'Varrer a sala',
        assigneeId: 'pedro',
        compensationForId: 'venceu',
      });
    });
  });

  describe('edicao de tarefa existente', () => {
    it('abre com o que a tarefa ja tem', () => {
      // O formulario e o mesmo da criacao; o que muda e de onde vem o estado
      // inicial. Um campo em branco aqui obrigaria a redigitar o que ja existe.
      mockTarefaOriginal = tarefaExistente();
      montar({ editarId: 'tarefa-1' });

      expect(screen.getByLabelText('O que precisa ser feito').props.value).toBe('Lavar a louca');
      expect(screen.getByLabelText('Detalhes (opcional)').props.value).toBe('Só os pratos');
      expect(screen.getByLabelText('Pedro').props.accessibilityState.selected).toBe(true);
      expect(screen.getByLabelText('50').props.accessibilityState.selected).toBe(true);
      expect(screen.getByLabelText('Com foto').props.accessibilityState.selected).toBe(true);
    });

    it('oferece manter o prazo, e mante-lo nao move a tarefa', () => {
      const original = tarefaExistente();
      mockTarefaOriginal = original;
      montar({ editarId: 'tarefa-1' });

      expect(screen.getByText(/^Manter:/)).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Salvar alterações' }));

      expect(mockAtualizar).toHaveBeenCalledTimes(1);
      expect(mockAtualizar.mock.calls[0][0]).toMatchObject({
        id: 'tarefa-1',
        title: 'Lavar a louca',
        assigneeId: 'pedro',
        points: 50,
        dueAt: original.dueAt,
        verification: 'IMAGE',
      });
      expect(mockCriar).not.toHaveBeenCalled();
    });

    it('manda o detalhe apagado como nulo, e nao como ausencia', () => {
      // `undefined` seria lido como "nao mexer" pelo contrato, e o texto que a
      // pessoa acabou de apagar voltaria na proxima abertura.
      mockTarefaOriginal = tarefaExistente();
      montar({ editarId: 'tarefa-1' });

      fireEvent.changeText(screen.getByLabelText('Detalhes (opcional)'), '   ');
      fireEvent.press(screen.getByRole('button', { name: 'Salvar alterações' }));

      expect(mockAtualizar.mock.calls[0][0].description).toBeNull();
    });

    it('mostra o valor que foge da escala fixa', () => {
      // A API aceita de 0 a 1000 e o seed cria tarefas de 30 pontos. Sem este
      // degrau, a pergunta "quanto vale" abriria sem nenhuma resposta marcada.
      mockTarefaOriginal = tarefaExistente({ points: 30 });
      montar({ editarId: 'tarefa-1' });

      expect(screen.getByLabelText('30').props.accessibilityState.selected).toBe(true);
    });

    it('nao deixa trocar o destinatario de tarefa que voltou para refazer', () => {
      // Ha evidencia anexada, e ela e daquela crianca. O servidor recusa com
      // 409; a tela nao oferece.
      mockTarefaOriginal = tarefaExistente({ status: 'REJECTED' });
      montar({ editarId: 'tarefa-1' });

      expect(screen.queryByRole('radio', { name: 'Pedro' })).toBeNull();
      expect(screen.getByText(/já entregou esta tarefa uma vez/)).toBeTruthy();
    });

    it('deixa passar a tarefa para outro filho enquanto ninguem entregou', () => {
      mockListaDeMembros = [
        { id: 'ana', name: 'Ana', role: 'PARENT' },
        { id: 'pedro', name: 'Pedro', role: 'CHILD' },
        { id: 'bia', name: 'Bia', role: 'CHILD' },
      ];
      mockTarefaOriginal = tarefaExistente();
      montar({ editarId: 'tarefa-1' });

      fireEvent.press(screen.getByLabelText('Bia'));
      fireEvent.press(screen.getByRole('button', { name: 'Salvar alterações' }));

      expect(mockAtualizar.mock.calls[0][0]).toMatchObject({
        id: 'tarefa-1',
        assigneeId: 'bia',
      });
    });
  });
});
