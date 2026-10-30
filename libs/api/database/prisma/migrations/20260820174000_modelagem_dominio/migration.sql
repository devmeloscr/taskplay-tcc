-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('PARENT', 'CHILD');

-- CreateEnum
CREATE TYPE "task_status" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "task_verification" AS ENUM ('MANUAL', 'IMAGE');

-- CreateEnum
CREATE TYPE "ai_verdict" AS ENUM ('APPROVED', 'REJECTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "review_decision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "transaction_reason" AS ENUM ('TASK_COMPLETED', 'LATE_PENALTY', 'STORE_PURCHASE', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "store_item_kind" AS ENUM ('REWARD', 'TRANSFER_LETTER');

-- CreateEnum
CREATE TYPE "purchase_status" AS ENUM ('PENDING', 'FULFILLED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "notification_type" AS ENUM ('TASK_ASSIGNED', 'TASK_DUE_SOON', 'TASK_OVERDUE', 'TASK_APPROVED', 'TASK_REJECTED', 'TASK_TRANSFERRED', 'POINTS_CHANGED', 'PURCHASE_FULFILLED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "role" "user_role" NOT NULL,
    "birth_date" DATE,
    "email" VARCHAR(180),
    "password_hash" VARCHAR(255),
    "deactivated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "created_by_id" UUID NOT NULL,
    "assignee_id" UUID NOT NULL,
    "points" INTEGER NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "status" "task_status" NOT NULL DEFAULT 'PENDING',
    "verification" "task_verification" NOT NULL DEFAULT 'MANUAL',
    "completed_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "compensation_for_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_evidences" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "submitted_by_id" UUID NOT NULL,
    "image_key" VARCHAR(255),
    "image_discarded_at" TIMESTAMP(3),
    "note" TEXT,
    "ai_verdict" "ai_verdict",
    "ai_confidence" DOUBLE PRECISION,
    "ai_model" VARCHAR(120),
    "ai_evaluated_at" TIMESTAMP(3),
    "review_decision" "review_decision",
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMP(3),
    "review_comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "lifetime_earned" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallet_transactions" (
    "id" UUID NOT NULL,
    "wallet_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "reason" "transaction_reason" NOT NULL,
    "note" VARCHAR(255),
    "task_id" UUID,
    "purchase_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_items" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "kind" "store_item_kind" NOT NULL DEFAULT 'REWARD',
    "cost_points" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "stock" INTEGER,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "buyer_id" UUID NOT NULL,
    "cost_points" INTEGER NOT NULL,
    "status" "purchase_status" NOT NULL DEFAULT 'PENDING',
    "fulfilled_by_id" UUID,
    "fulfilled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_transfers" (
    "id" UUID NOT NULL,
    "task_id" UUID NOT NULL,
    "from_user_id" UUID NOT NULL,
    "to_user_id" UUID NOT NULL,
    "purchase_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "notification_type" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "body" VARCHAR(255) NOT NULL,
    "task_id" UUID,
    "persistent_until" TIMESTAMP(3),
    "scheduled_for" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_family_id_role_idx" ON "users"("family_id", "role");

-- CreateIndex
CREATE INDEX "tasks_family_id_status_idx" ON "tasks"("family_id", "status");

-- CreateIndex
CREATE INDEX "tasks_assignee_id_status_idx" ON "tasks"("assignee_id", "status");

-- CreateIndex
CREATE INDEX "tasks_status_due_at_idx" ON "tasks"("status", "due_at");

-- CreateIndex
CREATE INDEX "task_evidences_task_id_created_at_idx" ON "task_evidences"("task_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- CreateIndex
CREATE INDEX "wallet_transactions_wallet_id_created_at_idx" ON "wallet_transactions"("wallet_id", "created_at");

-- CreateIndex
CREATE INDEX "store_items_family_id_active_idx" ON "store_items"("family_id", "active");

-- CreateIndex
CREATE INDEX "purchases_family_id_created_at_idx" ON "purchases"("family_id", "created_at");

-- CreateIndex
CREATE INDEX "purchases_buyer_id_status_idx" ON "purchases"("buyer_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_transfers_purchase_id_key" ON "task_transfers"("purchase_id");

-- CreateIndex
CREATE INDEX "task_transfers_task_id_created_at_idx" ON "task_transfers"("task_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_scheduled_for_sent_at_idx" ON "notifications"("scheduled_for", "sent_at");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_compensation_for_id_fkey" FOREIGN KEY ("compensation_for_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "store_items"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_fulfilled_by_id_fkey" FOREIGN KEY ("fulfilled_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_transfers" ADD CONSTRAINT "task_transfers_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_transfers" ADD CONSTRAINT "task_transfers_from_user_id_fkey" FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_transfers" ADD CONSTRAINT "task_transfers_to_user_id_fkey" FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_transfers" ADD CONSTRAINT "task_transfers_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Restricoes de dominio acrescentadas a mao.
--
-- O Prisma nao expressa CHECK no schema. Estas regras foram escritas
-- diretamente na migration em vez de ficarem apenas na camada de aplicacao
-- porque sao invariantes do dominio, e nao validacao de formulario: o banco e
-- alcancado tambem por seeds, correcoes manuais e pelo Prisma Studio, e uma
-- regra que so vive no servico nao protege nenhum desses caminhos.
-- ---------------------------------------------------------------------------

-- Saldo nunca negativo: a penalidade construtiva por atraso (objetivo e) para
-- no zero. Divida de pontos seria uma punicao sem forma de quitacao.
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balance_nao_negativo" CHECK ("balance" >= 0);
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_lifetime_earned_nao_negativo" CHECK ("lifetime_earned" >= 0);

-- Pontuacao e custo sao valores de recompensa, nunca negativos. Uma tarefa que
-- tira pontos ao ser concluida inverteria o incentivo do sistema.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_pontos_nao_negativos" CHECK ("points" >= 0);
ALTER TABLE "store_items" ADD CONSTRAINT "store_items_custo_nao_negativo" CHECK ("cost_points" >= 0);
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_custo_nao_negativo" CHECK ("cost_points" >= 0);

-- Confianca do classificador no intervalo reportado pelas APIs de visao
-- computacional. O campo alimenta a analise do limiar de aceitacao adotado; um
-- valor fora de [0,1] tornaria essa analise sem sentido.
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_confianca_no_intervalo"
  CHECK ("ai_confidence" IS NULL OR ("ai_confidence" >= 0 AND "ai_confidence" <= 1));

-- Um veredito da IA sem confianca registrada nao permite avaliar o limiar.
ALTER TABLE "task_evidences" ADD CONSTRAINT "task_evidences_veredito_com_confianca"
  CHECK (("ai_verdict" IS NULL) = ("ai_confidence" IS NULL));

-- Transferir uma tarefa para si mesmo nao e um repasse (objetivo f).
ALTER TABLE "task_transfers" ADD CONSTRAINT "task_transfers_membros_distintos"
  CHECK ("from_user_id" <> "to_user_id");
