import { chaveEhDaFamilia, montarChave, prefixoDaFamilia } from './chave';

const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OUTRA = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const TAREFA = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';

describe('chave da evidencia', () => {
  it('agrupa por familia, permitindo apagar tudo de uma vez', () => {
    // A revogacao do TCLE precisa remover as fotos com uma operacao de prefixo,
    // como o ON DELETE CASCADE faz no banco.
    const chave = montarChave(FAMILIA, TAREFA, 'image/jpeg');
    expect(chave.startsWith(prefixoDaFamilia(FAMILIA))).toBe(true);
    expect(chave).toContain(`/tarefas/${TAREFA}/`);
  });

  it('usa nome imprevisivel', () => {
    // Nome previsivel permitiria adivinhar chaves de outras familias.
    const a = montarChave(FAMILIA, TAREFA, 'image/jpeg');
    const b = montarChave(FAMILIA, TAREFA, 'image/jpeg');
    expect(a).not.toEqual(b);
  });

  it.each([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
  ])('deriva a extensao de %s, e nao do nome enviado', (tipo, extensao) => {
    // Nome de arquivo e entrada do usuario e nao deve compor caminho nenhum.
    expect(montarChave(FAMILIA, TAREFA, tipo).endsWith(`.${extensao}`)).toBe(true);
  });

  it('recusa tipo fora da lista', () => {
    expect(() => montarChave(FAMILIA, TAREFA, 'application/pdf')).toThrow(/não suportado/);
    expect(() => montarChave(FAMILIA, TAREFA, 'image/svg+xml')).toThrow(/não suportado/);
  });

  it('reconhece chave de outra familia', () => {
    // Sem esta verificacao, conhecer a chave de outra familia bastaria para ler
    // a foto, contornando o RNF01 por um caminho que nao passa pelo banco.
    const chave = montarChave(FAMILIA, TAREFA, 'image/png');
    expect(chaveEhDaFamilia(chave, FAMILIA)).toBe(true);
    expect(chaveEhDaFamilia(chave, OUTRA)).toBe(false);
  });

  it('nao se deixa enganar por prefixo parecido', () => {
    // 'familias/<uuid>' e prefixo de 'familias/<uuid>x...' se a barra final for
    // esquecida; o prefixo termina em barra justamente por isso.
    expect(chaveEhDaFamilia(`familias/${FAMILIA}extra/tarefas/x/y.jpg`, FAMILIA)).toBe(false);
  });
});
