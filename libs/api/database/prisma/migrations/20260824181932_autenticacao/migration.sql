-- CreateEnum
CREATE TYPE "device_mode" AS ENUM ('SHARED', 'PERSONAL');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failed_auth_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "locked_until" TIMESTAMP(3),
ADD COLUMN     "pin_hash" VARCHAR(255);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "mode" "device_mode" NOT NULL,
    "label" VARCHAR(80) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "model" VARCHAR(80),
    "last_seen_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_sessions" (
    "id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_enrollments" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "devices_family_id_revoked_at_idx" ON "devices"("family_id", "revoked_at");

-- CreateIndex
CREATE INDEX "device_sessions_user_id_idx" ON "device_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_sessions_device_id_user_id_key" ON "device_sessions"("device_id", "user_id");

-- CreateIndex
CREATE INDEX "device_enrollments_family_id_used_at_idx" ON "device_enrollments"("family_id", "used_at");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes acrescentadas a mao.
--
-- O Prisma nao expressa CHECK no schema, mas o banco nao e alcancado somente
-- pela camada de servico: seeds, correcoes manuais e o Prisma Studio escrevem
-- direto. Uma regra que so existe em TypeScript nao vale para esses caminhos.
-- ---------------------------------------------------------------------------

-- Contador de tentativas nao regride abaixo de zero. Um valor negativo aqui
-- significaria bloqueio que nunca dispara - falha silenciosa de seguranca.
ALTER TABLE "users" ADD CONSTRAINT "users_tentativas_nao_negativas"
  CHECK ("failed_auth_attempts" >= 0);

-- Um codigo de convite consumido tem de ter sido consumido antes de expirar.
-- Sem isso, um registro de uso fora da janela passaria despercebido na
-- auditoria de quais aparelhos entraram na familia e quando.
ALTER TABLE "device_enrollments" ADD CONSTRAINT "device_enrollments_uso_antes_da_expiracao"
  CHECK ("used_at" IS NULL OR "used_at" <= "expires_at");

-- Uma sessao nasce com validade futura.
ALTER TABLE "device_sessions" ADD CONSTRAINT "device_sessions_expiracao_apos_criacao"
  CHECK ("expires_at" > "created_at");
