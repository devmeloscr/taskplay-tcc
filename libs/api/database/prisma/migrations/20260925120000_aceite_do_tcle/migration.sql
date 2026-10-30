-- Aceite do TCLE no cadastro da familia.
--
-- As colunas aceitam nulo porque as familias criadas antes desta migracao nao
-- passaram pelo aceite no aplicativo. Preenche-las com uma data qualquer
-- registraria um consentimento que nao aconteceu.

-- AlterTable
ALTER TABLE "families" ADD COLUMN "tcle_version" VARCHAR(20),
ADD COLUMN "tcle_accepted_at" TIMESTAMP(3);

-- Versao e data andam juntas: um aceite sem data nao diz quando, e uma data
-- sem versao nao diz o que foi aceito. O Prisma nao expressa esta regra, dai
-- o CHECK escrito a mao, como os da modelagem do dominio.
ALTER TABLE "families" ADD CONSTRAINT "families_tcle_aceite_completo"
  CHECK (("tcle_version" IS NULL) = ("tcle_accepted_at" IS NULL));
