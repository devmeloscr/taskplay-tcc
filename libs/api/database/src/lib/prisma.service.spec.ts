import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  const original = process.env['DATABASE_URL'];
  afterEach(() => { process.env['DATABASE_URL'] = original; });

  it('recusa ser instanciado sem DATABASE_URL', () => {
    // Falhar na inicializacao, com mensagem explicita, e preferivel a subir uma
    // API que so vai quebrar quando um usuario fizer a primeira requisicao.
    delete process.env['DATABASE_URL'];
    expect(() => new PrismaService()).toThrow(/DATABASE_URL/);
  });

  it('instancia normalmente quando DATABASE_URL esta presente', () => {
    process.env['DATABASE_URL'] = 'postgresql://u:p@localhost:5433/db?schema=public';
    // Nao abre conexao: o Prisma so conecta em $connect(), chamado no
    // onModuleInit. Aqui se verifica apenas a construcao do adapter.
    expect(() => new PrismaService()).not.toThrow();
  });
});
