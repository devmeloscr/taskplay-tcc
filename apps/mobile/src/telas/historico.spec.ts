import type { EntradaDoHistorico } from '../api/cliente';
import { linhaDoHistorico, momentoExato } from './historico';

function entrada(overrides: Partial<EntradaDoHistorico> = {}): EntradaDoHistorico {
  return {
    id: 'linha-1',
    action: 'MEMBER_RENAMED',
    actorId: 'ator',
    actorName: 'Ana',
    targetId: 'alvo',
    targetName: 'Pedrinho',
    field: 'name',
    beforeValue: 'Pedrinho',
    afterValue: 'Pedro',
    createdAt: '2026-09-12T14:30:00.000Z',
    ...overrides,
  };
}

describe('linhaDoHistorico', () => {
  it('diz quem fez, o que fez, em quem, e de que para o que', () => {
    const linha = linhaDoHistorico(entrada());

    expect(linha.titulo).toBe('Ana mudou o nome de Pedrinho');
    expect(linha.mudanca).toBe('De Pedrinho para Pedro');
  });

  // A data sai na ordem em que se escreve data por aqui, e a conversao e
  // textual: passar por `new Date` recuaria um dia a oeste de Greenwich.
  it('mostra a data de nascimento em DD/MM/AAAA', () => {
    const linha = linhaDoHistorico(
      entrada({
        action: 'MEMBER_BIRTH_DATE_CHANGED',
        field: 'birthDate',
        beforeValue: '2016-04-01',
        afterValue: '2016-04-02',
      }),
    );

    expect(linha.mudanca).toBe('De 01/04/2016 para 02/04/2016');
  });

  it('escreve a ausencia de valor por extenso', () => {
    const linha = linhaDoHistorico(
      entrada({
        action: 'MEMBER_BIRTH_DATE_CHANGED',
        field: 'birthDate',
        beforeValue: '2016-04-01',
        afterValue: null,
      }),
    );

    expect(linha.mudanca).toBe('De 01/04/2016 para em branco');
  });

  // O valor do PIN nunca foi gravado, entao nao ha "de que para o que": os tres
  // verbos sao tudo o que distingue as tres acoes.
  it.each([
    ['MEMBER_PIN_SET', 'Ana criou um PIN para Pedrinho'],
    ['MEMBER_PIN_CHANGED', 'Ana trocou o PIN de Pedrinho'],
    ['MEMBER_PIN_REMOVED', 'Ana tirou o PIN de Pedrinho'],
  ] as const)('distingue as tres acoes de PIN sem mostrar valor: %s', (action, esperado) => {
    const linha = linhaDoHistorico(
      entrada({ action, field: 'pin', beforeValue: null, afterValue: null }),
    );

    expect(linha.titulo).toBe(esperado);
    expect(linha.mudanca).toBeNull();
  });

  // "Removeu da familia", e nao "excluiu": a saida e reversivel, e as tarefas e
  // os pontos continuam la.
  it.each([
    ['MEMBER_DEACTIVATED', 'Ana removeu Pedrinho da família'],
    ['MEMBER_REACTIVATED', 'Ana devolveu Pedrinho à família'],
  ] as const)('descreve a saida e a volta sem falar em exclusao: %s', (action, esperado) => {
    const linha = linhaDoHistorico(entrada({ action, field: null, beforeValue: null, afterValue: null }));

    expect(linha.titulo).toBe(esperado);
    expect(linha.mudanca).toBeNull();
  });

  // O nome nao veio de lugar nenhum: "de em branco para Pedro" inventaria um
  // estado que o perfil nunca teve.
  it('nao inventa valor anterior no cadastro', () => {
    const linha = linhaDoHistorico(
      entrada({ action: 'MEMBER_CREATED', beforeValue: null, afterValue: 'Pedro' }),
    );

    expect(linha.titulo).toBe('Ana cadastrou Pedrinho');
    expect(linha.mudanca).toBeNull();
  });
});

describe('momentoExato', () => {
  // Data e hora, e nao "há 3 dias": quem abre o historico esta resolvendo um
  // desacordo sobre o que aconteceu, e tempo relativo nao resolve.
  it('da data e hora, e nao tempo relativo', () => {
    const momento = new Date('2026-09-12T14:30:00.000Z');
    const esperado = `12/09/2026 às ${momento.getHours()}h30`;

    expect(momentoExato(momento.toISOString())).toBe(esperado);
  });
});
