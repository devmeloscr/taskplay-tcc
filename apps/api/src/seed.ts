import { PrismaService, UserRole } from '@taskplay/api-database';
import { hashSecret } from './app/auth/crypto';
import { CARTA_DE_TRANSFERENCIA } from './app/tasks/catalogo-de-sistema';

const FAMILIA = '11111111-1111-4111-8111-111111111111';
const RESPONSAVEL = '22222222-2222-4222-8222-222222222222';
const FILHO_MAIS_VELHO = '33333333-3333-4333-8333-333333333333';
const FILHA_MAIS_NOVA = '44444444-4444-4444-8444-444444444444';
const RECOMPENSA = '55555555-5555-4555-8555-555555555555';
const CARTA = '66666666-6666-4666-8666-666666666666';

const SENHA = 'taskplay-dev';
const PIN_RESPONSAVEL = '1234';
const PIN_FILHO = '4321';

/** Prazo em horas a partir de agora, para as tarefas nao nascerem vencidas. */
function daquiA(horas: number): Date {
  return new Date(Date.now() + horas * 60 * 60 * 1000);
}

async function semear(prisma: PrismaService): Promise<void> {
  const [passwordHash, pinResponsavel, pinFilho] = await Promise.all([
    hashSecret(SENHA),
    hashSecret(PIN_RESPONSAVEL),
    hashSecret(PIN_FILHO),
  ]);

  await prisma.family.upsert({
    where: { id: FAMILIA },
    update: { name: 'Família Andrade' },
    create: { id: FAMILIA, name: 'Família Andrade' },
  });

  // `wallet: { create: {} }` so aparece no `create`: a carteira ja existe nas
  // execucoes seguintes, e recria-la apagaria o saldo acumulado no uso.
  await prisma.user.upsert({
    where: { id: RESPONSAVEL },
    update: { name: 'Helena Andrade' },
    create: {
      id: RESPONSAVEL,
      familyId: FAMILIA,
      name: 'Helena Andrade',
      role: UserRole.PARENT,
      email: 'helena@exemplo.com.br',
      passwordHash,
      pinHash: pinResponsavel,
      wallet: { create: {} },
    },
  });

  await prisma.user.upsert({
    where: { id: FILHO_MAIS_VELHO },
    update: { name: 'Rafael Andrade' },
    create: {
      id: FILHO_MAIS_VELHO,
      familyId: FAMILIA,
      name: 'Rafael Andrade',
      role: UserRole.CHILD,
      // Doze anos: dentro da faixa de 6 a 16 do escopo, e com PIN proprio, que
      // e opcional no modelo e fica a criterio de quem administra a familia.
      birthDate: new Date('2014-03-19'),
      pinHash: pinFilho,
      wallet: { create: {} },
    },
  });

  await prisma.user.upsert({
    where: { id: FILHA_MAIS_NOVA },
    update: { name: 'Beatriz Andrade' },
    create: {
      id: FILHA_MAIS_NOVA,
      familyId: FAMILIA,
      name: 'Beatriz Andrade',
      role: UserRole.CHILD,
      // Oito anos e sem PIN: e o caso que o seletor de perfis precisa saber
      // tratar, e o que justifica o PIN ser opcional para o filho.
      birthDate: new Date('2018-07-02'),
      wallet: { create: {} },
    },
  });

  await prisma.storeItem.upsert({
    where: { id: CARTA },
    update: { ...CARTA_DE_TRANSFERENCIA },
    create: {
      id: CARTA,
      familyId: FAMILIA,
      createdById: RESPONSAVEL,
      ...CARTA_DE_TRANSFERENCIA,
    },
  });

  // Uma recompensa comum ao lado da Carta: sem ela a loja mostraria so o item
  // de sistema, e a tela que distingue os dois tipos nao teria o que distinguir.
  await prisma.storeItem.upsert({
    where: { id: RECOMPENSA },
    update: {},
    create: {
      id: RECOMPENSA,
      familyId: FAMILIA,
      createdById: RESPONSAVEL,
      name: 'Escolher o filme da sexta',
      costPoints: 40,
    },
  });

  const tarefas = [
    {
      id: '77777777-7777-4777-8777-777777777777',
      title: 'Arrumar a cama',
      assigneeId: FILHA_MAIS_NOVA,
      points: 20,
      dueAt: daquiA(6),
    },
    {
      id: '88888888-8888-4888-8888-888888888888',
      title: 'Lavar a louça do jantar',
      assigneeId: FILHO_MAIS_VELHO,
      points: 50,
      dueAt: daquiA(28),
    },
    {
      id: '99999999-9999-4999-8999-999999999999',
      title: 'Guardar as roupas limpas',
      assigneeId: FILHO_MAIS_VELHO,
      points: 30,
      dueAt: daquiA(52),
    },
  ];

  for (const tarefa of tarefas) {
    await prisma.task.upsert({
      where: { id: tarefa.id },
      // O prazo e reescrito a cada execucao: e o que faz o seed devolver um
      // banco utilizavel mesmo dias depois de ter sido semeado.
      update: { dueAt: tarefa.dueAt },
      create: {
        ...tarefa,
        familyId: FAMILIA,
        createdById: RESPONSAVEL,
      },
    });
  }
}

async function main(): Promise<void> {
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error('O seed cria credenciais conhecidas e nao roda em producao.');
  }

  const prisma = new PrismaService();
  try {
    await prisma.$connect();
    await semear(prisma);
    console.log(
      [
        'Banco semeado.',
        `  Responsável: helena@exemplo.com.br / ${SENHA} (PIN ${PIN_RESPONSAVEL})`,
        `  Rafael (12 anos): PIN ${PIN_FILHO}`,
        '  Beatriz (8 anos): sem PIN',
        '  Catálogo: Carta de Transferência e uma recompensa; 3 tarefas pendentes.',
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
