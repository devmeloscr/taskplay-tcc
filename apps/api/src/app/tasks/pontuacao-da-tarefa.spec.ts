import { TaskStatus } from '@taskplay/api-database';
import { pontuacaoDaTarefa } from './pontuacao-da-tarefa';

const PRAZO = new Date('2026-08-28T18:00:00.000Z');

function tarefa(status: TaskStatus, envio: string | null, points = 20) {
  return {
    points,
    dueAt: PRAZO,
    status,
    completedAt: envio ? new Date(envio) : null,
  };
}

describe('pontuacaoDaTarefa', () => {
  describe('entrega ja feita', () => {
    it('devolve o valor creditado, e nao o de face, na aprovada com atraso', () => {
      // O caso que motivou o campo: a tela dizia "20 pontos" ao lado do selo
      // "Aprovada", e o extrato tinha registrado 15. Uma das duas mentia.
      const { delivered, ifCompletedNow } = pontuacaoDaTarefa(
        tarefa(TaskStatus.APPROVED, '2026-08-29T10:00:00.000Z'),
      );

      expect(delivered).toEqual({
        points: 15,
        fullPoints: 20,
        band: 'ate_24h',
        bandLabel: 'Até 24h de atraso',
        credited: true,
      });
      // Nao ha previsao: a tarefa nao pode mais ser entregue.
      expect(ifCompletedNow).toBeNull();
    });

    it('ja conta o atraso enquanto a tarefa espera a conferencia', () => {
      const { delivered } = pontuacaoDaTarefa(
        tarefa(TaskStatus.SUBMITTED, '2026-08-30T10:00:00.000Z'),
      );

      expect(delivered).toMatchObject({ points: 10, credited: false });
      expect(delivered?.bandLabel).toBe('Até 72h de atraso');
    });

    it('nao inventa desconto quando a entrega foi no prazo', () => {
      const { delivered } = pontuacaoDaTarefa(
        tarefa(TaskStatus.APPROVED, '2026-08-28T17:00:00.000Z'),
      );

      expect(delivered).toMatchObject({ points: 20, fullPoints: 20, band: 'no_prazo' });
    });

    it('respeita o piso de 1 ponto', () => {
      // Entregar atrasado tem de continuar valendo mais do que nao entregar.
      const { delivered } = pontuacaoDaTarefa(
        tarefa(TaskStatus.APPROVED, '2026-09-30T10:00:00.000Z', 2),
      );

      expect(delivered).toMatchObject({ points: 1, bandLabel: 'Mais de 72h de atraso' });
    });
  });

  describe('previsao dos estados entregaveis', () => {
    it('diz quanto rende agora, e quando esse valor muda', () => {
      const antesDoPrazo = new Date('2026-08-28T17:00:00.000Z');

      const { ifCompletedNow, delivered } = pontuacaoDaTarefa(
        tarefa(TaskStatus.PENDING, null),
        antesDoPrazo,
      );

      expect(ifCompletedNow).toEqual({
        points: 20,
        fullPoints: 20,
        band: 'no_prazo',
        bandLabel: 'No prazo',
        // O degrau seguinte e o proprio prazo: e nele que a tela precisa
        // perguntar de novo.
        validUntil: PRAZO.toISOString(),
      });
      expect(delivered).toBeNull();
    });

    it('acompanha o degrau em que a tarefa vencida esta', () => {
      const trintaHorasDepois = new Date('2026-08-30T00:00:00.000Z');

      const { ifCompletedNow } = pontuacaoDaTarefa(
        tarefa(TaskStatus.EXPIRED, null),
        trintaHorasDepois,
      );

      expect(ifCompletedNow).toMatchObject({ points: 10, band: 'ate_72h' });
      expect(ifCompletedNow?.validUntil).toBe(new Date('2026-08-31T18:00:00.000Z').toISOString());
    });

    it('para de prometer virada na ultima faixa', () => {
      // Passadas as 72h o valor nao muda mais, e agendar uma rebusca seria
      // pedir ao aplicativo que acordasse para receber o mesmo numero.
      const muitoDepois = new Date('2026-09-30T10:00:00.000Z');

      const { ifCompletedNow } = pontuacaoDaTarefa(tarefa(TaskStatus.EXPIRED, null), muitoDepois);

      expect(ifCompletedNow).toMatchObject({ points: 5, validUntil: null });
    });

    it('usa a proxima entrega, e nao a devolvida, na tarefa recusada', () => {
      const agora = new Date('2026-08-28T17:00:00.000Z');

      const { delivered, ifCompletedNow } = pontuacaoDaTarefa(
        tarefa(TaskStatus.REJECTED, '2026-08-27T10:00:00.000Z'),
        agora,
      );

      expect(delivered).toBeNull();
      expect(ifCompletedNow).toMatchObject({ points: 20, band: 'no_prazo' });
    });
  });

  it('nao pontua tarefa cancelada, nem como previsao', () => {
    // Nao rendeu e nao rende. Mandar valor de face aqui faria a tela anunciar
    // pontos que ninguem vai receber.
    expect(pontuacaoDaTarefa(tarefa(TaskStatus.CANCELLED, null))).toEqual({
      delivered: null,
      ifCompletedNow: null,
    });
  });
});
