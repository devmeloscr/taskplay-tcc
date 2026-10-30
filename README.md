# TaskPlay

Aplicativo mobile com gamificação para gestão de tarefas domésticas e estímulo à
responsabilidade infantil.

Trabalho de Curso de Ciência da Computação, UNIP, Polo Afogados da Ingazeira.
Autor: Júlio César Pereira de Melo. Orientação: Profa. Sandra Bozolan.

## O que o aplicativo faz

- Perfis de responsável e de filho, num aparelho compartilhado ou no celular
  próprio do filho (vinculado por código de convite).
- Tarefas com prazo e pontos, entregues com foto e conferidas pelo responsável.
- Pontuação com desconto gradual por atraso, sem saldo negativo.
- Loja de recompensas cadastradas pela família e Carta de Transferência.
- Avisos dentro do aplicativo e notificações push.

## Tecnologias

| Parte | Tecnologia |
| --- | --- |
| Aplicativo | React Native com Expo |
| API | NestJS |
| Banco de dados | PostgreSQL com Prisma |
| Fotos | MinIO (armazenamento de objetos) |
| Observabilidade | OpenTelemetry e SigNoz |
| Monorepo | Nx com pnpm |

## Estrutura

```
apps/api         API NestJS
apps/api-e2e     testes de ponta a ponta da API
apps/mobile      aplicativo Expo / React Native
libs/shared/*    contratos, eventos e regras de pontuação usados pelos dois lados
libs/api/*       banco de dados, armazenamento e observabilidade (só a API)
deploy/          implantação em servidor
observability/   configuração do SigNoz
docs/            diagramas de arquitetura, dados e estados da tarefa
```

O aplicativo não pode importar `libs/api/*`; o lint verifica essa regra.

## Como executar

Pré-requisitos: Node.js 24.19.0 (`.nvmrc`), pnpm 10+, Docker com Compose v2 e
Android Studio para o emulador.

```bash
nvm use
pnpm install                 # instala e gera o cliente Prisma
cp .env.example .env

pnpm db:up                   # PostgreSQL na porta 5433
pnpm prisma:migrate          # aplica as migrações
pnpm db:seed                 # família de exemplo (opcional)

pnpm nx serve api            # API em http://localhost:3000/api
pnpm nx start mobile         # aplicativo
```

O `db:seed` cria uma família com um responsável e dois filhos e imprime as
credenciais no fim. Ele não roda com `NODE_ENV=production`.

Para conferir a API: `curl localhost:3000/api/health`.

Push e câmera exigem um development build (`pnpm nx run mobile:run-android`); o
Expo Go cobre o restante. O pacote de instalação de release sai com `pnpm apk`.

## Testes

```bash
pnpm nx run-many -t test               # todos os testes
pnpm nx run-many -t lint typecheck     # análise estática e tipos
```

## Observabilidade

```bash
pnpm obs:up                  # SigNoz em http://localhost:8080 (~4 GB de RAM)
```

No primeiro acesso, conclua o cadastro inicial do SigNoz; sem ele o coletor
não aceita telemetria.

## Produção

O roteiro está em [deploy/README.md](deploy/README.md).
