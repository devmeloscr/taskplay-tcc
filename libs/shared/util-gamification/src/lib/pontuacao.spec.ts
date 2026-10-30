import {
  FAIXAS_DE_ATRASO,
  fimDaFaixaAtual,
  minutosDeAtraso,
  penalidadePorVencimento,
  pontosPorConclusao,
  pontosSeConcluirAgora,
  rotuloDaFaixa,
} from './pontuacao';

const prazo = new Date('2026-09-01T18:00:00.000Z');
const maisTarde = (minutos: number) => new Date(prazo.getTime() + minutos * 60_000);

describe('pontuacao por conclusao', () => {
  it('credita os pontos cheios no prazo', () => {
    const r = pontosPorConclusao(20, prazo, maisTarde(-30));
    expect(r).toMatchObject({ pontos: 20, faixa: 'no_prazo', onTime: true, minutosDeAtraso: 0 });
  });

  it('trata a entrega no instante do prazo como no prazo', () => {
    // A fronteira e inclusiva de proposito: perder 25% dos pontos por um
    // segundo de diferenca seria arbitrariedade percebida como injustica.
    expect(pontosPorConclusao(20, prazo, prazo).onTime).toBe(true);
  });

  it.each([
    ['1 minuto de atraso', 1, 15, 'ate_24h'],
    ['23h59 de atraso', 24 * 60 - 1, 15, 'ate_24h'],
    ['exatamente 24h', 24 * 60, 15, 'ate_24h'],
    ['24h01', 24 * 60 + 1, 10, 'ate_72h'],
    ['exatamente 72h', 72 * 60, 10, 'ate_72h'],
    ['72h01', 72 * 60 + 1, 5, 'acima_de_72h'],
    ['uma semana', 7 * 24 * 60, 5, 'acima_de_72h'],
  ])('%s: tarefa de 20 pontos vale %i pontos', (_nome, atraso, esperado, faixa) => {
    const r = pontosPorConclusao(20, prazo, maisTarde(atraso as number));
    expect(r.pontos).toBe(esperado);
    expect(r.faixa).toBe(faixa);
    expect(r.onTime).toBe(false);
    expect(r.minutosDeAtraso).toBe(atraso);
  });

  it('arredonda para o mais proximo, e nao para baixo', () => {
    // 5 * 0,5 = 2,5. Creditar 2 seria severidade vinda do arredondamento, e
    // nao de decisao de projeto.
    expect(pontosPorConclusao(5, prazo, maisTarde(48 * 60)).pontos).toBe(3);
  });

  it('nunca zera o credito de uma tarefa concluida', () => {
    // Entregar atrasado tem de continuar valendo mais do que nao entregar,
    // senao a penalidade remove justamente o incentivo a terminar.
    expect(pontosPorConclusao(1, prazo, maisTarde(30 * 24 * 60)).pontos).toBe(1);
    expect(pontosPorConclusao(2, prazo, maisTarde(30 * 24 * 60)).pontos).toBe(1);
  });

  it('a penalidade nunca aumenta com o tempo alem da ultima faixa', () => {
    const umaSemana = pontosPorConclusao(20, prazo, maisTarde(7 * 24 * 60)).pontos;
    const umAno = pontosPorConclusao(20, prazo, maisTarde(365 * 24 * 60)).pontos;
    expect(umAno).toBe(umaSemana);
  });

  it('as faixas sao monotonicas: mais atraso nunca vale mais pontos', () => {
    let anterior = Number.POSITIVE_INFINITY;
    for (const minutos of [0, 60, 12 * 60, 25 * 60, 48 * 60, 73 * 60, 200 * 60]) {
      const atual = pontosPorConclusao(100, prazo, maisTarde(minutos)).pontos;
      expect(atual).toBeLessThanOrEqual(anterior);
      anterior = atual;
    }
  });
});

describe('previsao para a interface', () => {
  it('devolve o mesmo que o servidor calculara na aprovacao', () => {
    // A previsao e o credito saem da mesma funcao: a tela promete um numero, e
    // a aprovacao tem de honrar exatamente aquele numero.
    const agora = maisTarde(10 * 60);
    expect(pontosSeConcluirAgora(20, prazo, agora)).toEqual(
      pontosPorConclusao(20, prazo, agora),
    );
  });
});

describe('fim da faixa atual', () => {
  it('aponta o proprio prazo enquanto a tarefa esta no prazo', () => {
    expect(fimDaFaixaAtual(prazo, maisTarde(-60))).toEqual(prazo);
  });

  it('aponta o fim da faixa em que o atraso esta', () => {
    expect(fimDaFaixaAtual(prazo, maisTarde(60))).toEqual(maisTarde(24 * 60));
    expect(fimDaFaixaAtual(prazo, maisTarde(30 * 60))).toEqual(maisTarde(72 * 60));
  });

  it('devolve nulo na ultima faixa, onde o valor nao muda mais', () => {
    expect(fimDaFaixaAtual(prazo, maisTarde(100 * 60))).toBeNull();
  });

  it('marca o instante em que a previsao realmente muda', () => {
    // A propriedade que importa para quem exibe: no instante devolvido, o valor
    // ainda e o mesmo; um minuto depois, ja e o da faixa seguinte.
    const virada = fimDaFaixaAtual(prazo, maisTarde(60));
    if (!virada) throw new Error('esperava uma virada');

    const antes = pontosSeConcluirAgora(20, prazo, virada);
    const depois = pontosSeConcluirAgora(20, prazo, new Date(virada.getTime() + 60_000));
    expect(antes.pontos).toBe(15);
    expect(depois.pontos).toBe(10);
  });
});

describe('penalidade por vencimento', () => {
  it('debita metade dos pontos da tarefa', () => {
    expect(penalidadePorVencimento(20, 100)).toMatchObject({
      debito: 10,
      debitoPretendido: 10,
      limitadoPeloSaldo: false,
    });
  });

  it('para no saldo disponivel', () => {
    expect(penalidadePorVencimento(20, 4)).toMatchObject({
      debito: 4,
      debitoPretendido: 10,
      limitadoPeloSaldo: true,
    });
  });

  it('nao debita nada de quem esta zerado', () => {
    expect(penalidadePorVencimento(20, 0).debito).toBe(0);
  });

  it('nunca produz debito negativo', () => {
    // Um debito negativo seria um credito por ter atrasado.
    expect(penalidadePorVencimento(0, 50).debito).toBe(0);
    expect(penalidadePorVencimento(20, -5).debito).toBe(0);
  });
});

describe('faixas', () => {
  it('cobrem todo o eixo do tempo sem lacuna', () => {
    // A ultima faixa e aberta; se alguem lhe der um limite, existira um atraso
    // sem faixa correspondente e o calculo cairia num caso nao previsto.
    const ultima = FAIXAS_DE_ATRASO[FAIXAS_DE_ATRASO.length - 1];
    expect(ultima.maxMinutosAtraso).toBeNull();
    for (const faixa of FAIXAS_DE_ATRASO.slice(0, -1)) {
      expect(faixa.maxMinutosAtraso).not.toBeNull();
    }
  });

  it('tem fatores decrescentes entre 0 e 1', () => {
    const fatores = FAIXAS_DE_ATRASO.map((f) => f.fator);
    expect(fatores).toEqual([...fatores].sort((a, b) => b - a));
    for (const fator of fatores) {
      expect(fator).toBeGreaterThan(0);
      expect(fator).toBeLessThanOrEqual(1);
    }
  });
});

describe('rotulos das faixas', () => {
  it('nomeia toda faixa sem repetir nome nem vazar o identificador', () => {
    // O rotulo e o que a crianca le no historico. Uma faixa sem nome proprio
    // apareceria na tela como `ate_24h`, que foi exatamente o defeito corrigido.
    const rotulos = FAIXAS_DE_ATRASO.map((faixa) => rotuloDaFaixa(faixa.id));
    expect(new Set(rotulos).size).toBe(FAIXAS_DE_ATRASO.length);
    for (const rotulo of rotulos) {
      expect(rotulo).not.toMatch(/_/);
      expect(rotulo.length).toBeGreaterThan(0);
    }
  });

  it('diz "no prazo" so para a faixa sem atraso', () => {
    expect(rotuloDaFaixa('no_prazo')).toBe('No prazo');
    expect(rotuloDaFaixa('ate_24h')).toBe('Até 24h de atraso');
    expect(rotuloDaFaixa('ate_72h')).toBe('Até 72h de atraso');
    expect(rotuloDaFaixa('acima_de_72h')).toBe('Mais de 72h de atraso');
  });
});
