import {
  dataDeNascimentoParaIso,
  mascaraDeDataDeNascimento,
  momentoEmPalavras,
  notaEmPalavras,
  pontos,
  pontosComSinal,
  pontosDaEntrega,
  prazoEmPalavras,
} from './formatos';

describe('prazoEmPalavras', () => {
  const agora = new Date('2026-08-28T14:00:00');

  it('diz a hora quando vence hoje', () => {
    expect(prazoEmPalavras(new Date('2026-08-28T20:00:00').toISOString(), agora)).toBe('Hoje às 20h');
  });

  it('avisa que ja venceu hoje, sem esconder que ainda da', () => {
    expect(prazoEmPalavras(new Date('2026-08-28T09:30:00').toISOString(), agora)).toBe(
      'Venceu hoje às 9h30',
    );
  });

  it('usa "amanhã" e "ontem" em vez de data', () => {
    expect(prazoEmPalavras(new Date('2026-08-29T20:00:00').toISOString(), agora)).toBe(
      'Amanhã às 20h',
    );
    expect(prazoEmPalavras(new Date('2026-08-27T20:00:00').toISOString(), agora)).toBe(
      'Venceu ontem às 20h',
    );
  });

  it('conta em dias de calendario, e nao em blocos de 24 horas', () => {
    const manha = new Date('2026-08-28T08:00:00');
    expect(prazoEmPalavras(new Date('2026-08-27T23:00:00').toISOString(), manha)).toBe(
      'Venceu ontem às 23h',
    );
  });

  it('cai para a data completa alem de uma semana', () => {
    expect(prazoEmPalavras(new Date('2026-09-20T20:00:00').toISOString(), agora)).toBe(
      '20/09/2026 às 20h',
    );
  });
});

describe('momentoEmPalavras', () => {
  const agora = new Date('2026-08-28T14:00:00');

  it('usa hoje e ontem', () => {
    expect(momentoEmPalavras(new Date('2026-08-28T09:00:00').toISOString(), agora)).toBe(
      'Hoje às 9h',
    );
    expect(momentoEmPalavras(new Date('2026-08-27T09:00:00').toISOString(), agora)).toBe(
      'Ontem às 9h',
    );
  });
});

describe('pontos', () => {
  it('concorda o singular com o plural', () => {
    expect(pontos(1)).toBe('1 ponto');
    expect(pontos(20)).toBe('20 pontos');
  });

  it('mostra o sinal tambem no credito', () => {
    // O sinal explicito e o que distingue credito de debito sem depender da
    // cor - e a cor sozinha nao comunica a quem nao a percebe.
    expect(pontosComSinal(20)).toBe('+20 pontos');
    expect(pontosComSinal(-20)).toBe('-20 pontos');
    expect(pontosComSinal(-1)).toBe('-1 ponto');
  });
});

describe('dataDeNascimentoParaIso', () => {
  // 31/08/2026 e o inicio previsto do teste de campo. Fixar "hoje" e o que
  // impede estes testes de mudarem de resultado com a passagem do tempo.
  const HOJE = new Date(2026, 7, 31);

  it('converte DD/MM/AAAA no AAAA-MM-DD do contrato', () => {
    expect(dataDeNascimentoParaIso('02/04/2016', HOJE)).toEqual({ iso: '2016-04-02' });
  });

  it('recusa uma data que nao existe no calendario', () => {
    // `new Date(2016, 1, 31)` rola silenciosamente para 02/03. Comparar o dia
    // de volta e o que pega a diferenca.
    expect(dataDeNascimentoParaIso('31/02/2016', HOJE)).toEqual({
      erro: 'Essa data não existe no calendário',
    });
  });

  it('recusa formato fora de DD/MM/AAAA', () => {
    for (const digitado of ['2016-04-02', '2/4/2016', '02/04/16', 'ontem', '']) {
      expect(dataDeNascimentoParaIso(digitado, HOJE)).toEqual({
        erro: 'Escreva a data assim: 31/12/2016',
      });
    }
  });

  it('aceita a data sem as barras', () => {
    expect(dataDeNascimentoParaIso('02042016', HOJE)).toEqual({ iso: '2016-04-02' });
  });

  it('recusa idade fora da faixa do estudo', () => {
    expect(dataDeNascimentoParaIso('02/04/2106', HOJE)).toEqual({
      erro: 'O estudo acompanha de 6 a 16 anos',
    });
    expect(dataDeNascimentoParaIso('02/04/1990', HOJE)).toEqual({
      erro: 'O estudo acompanha de 6 a 16 anos',
    });
  });

  it('aceita os dois extremos da faixa', () => {
    // Seis anos completos hoje, e dezesseis completos hoje: o aniversario do
    // proprio dia ja conta.
    expect(dataDeNascimentoParaIso('31/08/2020', HOJE)).toEqual({ iso: '2020-08-31' });
    expect(dataDeNascimentoParaIso('31/08/2010', HOJE)).toEqual({ iso: '2010-08-31' });
  });

  it('nao conta o ano quando o aniversario ainda nao chegou', () => {
    // Faz 6 anos em 01/09; em 31/08 ainda tem 5, e fica fora da faixa.
    expect(dataDeNascimentoParaIso('01/09/2020', HOJE)).toEqual({
      erro: 'O estudo acompanha de 6 a 16 anos',
    });
  });
});

describe('a nota do lancamento', () => {
  it('traduz a nota antiga, que gravava o identificador da faixa', () => {
    expect(notaEmPalavras('Atraso: faixa ate_24h')).toBe('Até 24h de atraso');
    expect(notaEmPalavras('Atraso: faixa acima_de_72h')).toBe('Mais de 72h de atraso');
  });

  it('nao mexe em nota escrita por gente', () => {
    // O motivo de um ajuste manual e texto livre do responsavel; reescrever
    // qualquer parte dele seria falsificar o razao.
    expect(notaEmPalavras('Combinado fora do app: ajudou na mudanca')).toBe(
      'Combinado fora do app: ajudou na mudanca',
    );
    expect(notaEmPalavras('Até 24h de atraso')).toBe('Até 24h de atraso');
  });

  it('deixa passar uma faixa que nao existe, em vez de inventar nome', () => {
    expect(notaEmPalavras('Atraso: faixa ate_9000h')).toBe('Atraso: faixa ate_9000h');
  });
});

describe('pontosDaEntrega', () => {
  const entregue = (points: number, fullPoints: number, credited: boolean) => ({
    points,
    fullPoints,
    band: 'ate_24h' as const,
    bandLabel: 'Até 24h de atraso',
    credited,
  });

  it('mostra o valor creditado, e nao o de face, na tarefa aprovada com atraso', () => {
    // O caso que motivou a funcao: a tela dizia "20 pontos" ao lado do selo
    // "Aprovada", e o extrato tinha registrado 15. Uma das duas telas mentia.
    const entrega = pontosDaEntrega({
      points: 20,
      scoring: { delivered: entregue(15, 20, true), ifCompletedNow: null },
    });

    expect(entrega).toEqual({
      valor: 15,
      cheios: 20,
      reduzido: true,
      faixa: 'Até 24h de atraso',
      creditado: true,
    });
  });

  it('nao inventa desconto quando o servidor mandou o valor cheio', () => {
    const entrega = pontosDaEntrega({
      points: 20,
      scoring: {
        delivered: { ...entregue(20, 20, true), band: 'no_prazo', bandLabel: 'No prazo' },
        ifCompletedNow: null,
      },
    });

    expect(entrega.valor).toBe(20);
    expect(entrega.reduzido).toBe(false);
  });

  it('separa o que ja foi creditado do que ainda depende da aprovacao', () => {
    // Enquanto espera conferencia a faixa ja esta decidida, mas nada entrou no
    // razao: dizer "rendeu" anunciaria pontos que ninguem lancou.
    const entrega = pontosDaEntrega({
      points: 20,
      scoring: { delivered: entregue(15, 20, false), ifCompletedNow: null },
    });

    expect(entrega.valor).toBe(15);
    expect(entrega.creditado).toBe(false);
  });

  it('mostra o valor de face quando a entrega ainda nao aconteceu', () => {
    const entrega = pontosDaEntrega({
      points: 20,
      scoring: {
        delivered: null,
        ifCompletedNow: {
          points: 5,
          fullPoints: 20,
          band: 'acima_de_72h',
          bandLabel: 'Mais de 72h de atraso',
          validUntil: null,
        },
      },
    });

    expect(entrega).toEqual({
      valor: 20,
      cheios: 20,
      reduzido: false,
      faixa: 'No prazo',
      creditado: false,
    });
  });

  it('nao anuncia credito na tarefa cancelada, que nao tem pontuacao nenhuma', () => {
    const entrega = pontosDaEntrega({
      points: 20,
      scoring: { delivered: null, ifCompletedNow: null },
    });

    expect(entrega.valor).toBe(20);
    expect(entrega.creditado).toBe(false);
  });
});

describe('mascaraDeDataDeNascimento', () => {
  it('poe as barras conforme os digitos entram', () => {
    expect(mascaraDeDataDeNascimento('3')).toBe('3');
    expect(mascaraDeDataDeNascimento('31')).toBe('31');
    expect(mascaraDeDataDeNascimento('311')).toBe('31/1');
    expect(mascaraDeDataDeNascimento('3112')).toBe('31/12');
    expect(mascaraDeDataDeNascimento('31122016')).toBe('31/12/2016');
  });

  it('nao deixa barra sobrando no fim, para o apagar nao travar', () => {
    // Apagar o "1" de "31/1" entrega "31/" a mascara. Devolver "31/" faria o
    // proximo toque apagar so a barra de novo, e o segundo digito nunca sairia.
    expect(mascaraDeDataDeNascimento('31/')).toBe('31');
    expect(mascaraDeDataDeNascimento('31/12/')).toBe('31/12');
  });

  it('ignora o que nao e digito, inclusive numa data colada', () => {
    expect(mascaraDeDataDeNascimento('31/12/2016')).toBe('31/12/2016');
    expect(mascaraDeDataDeNascimento('31-12-2016')).toBe('31/12/2016');
    expect(mascaraDeDataDeNascimento('abc')).toBe('');
  });

  it('para no oitavo digito', () => {
    expect(mascaraDeDataDeNascimento('311220161')).toBe('31/12/2016');
  });

  it('entrega a mascara pronta para a conversao', () => {
    // As duas funcoes se encontram na tela: o que a mascara produz e o que a
    // conversao recebe, e nenhum estado intermediario pode escapar disso.
    const HOJE = new Date(2026, 7, 31);
    expect(dataDeNascimentoParaIso(mascaraDeDataDeNascimento('02042016'), HOJE)).toEqual({
      iso: '2016-04-02',
    });
  });
});
