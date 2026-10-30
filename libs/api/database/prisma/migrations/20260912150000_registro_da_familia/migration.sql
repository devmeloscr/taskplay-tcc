-- CreateEnum
CREATE TYPE "family_audit_action" AS ENUM (
  'MEMBER_CREATED',
  'MEMBER_RENAMED',
  'MEMBER_BIRTH_DATE_CHANGED',
  'MEMBER_PIN_SET',
  'MEMBER_PIN_CHANGED',
  'MEMBER_PIN_REMOVED',
  'MEMBER_DEACTIVATED',
  'MEMBER_REACTIVATED'
);

-- CreateTable
CREATE TABLE "family_audit_logs" (
    "id" UUID NOT NULL,
    "family_id" UUID NOT NULL,
    "action" "family_audit_action" NOT NULL,
    "actor_id" UUID,
    "actor_name" VARCHAR(80) NOT NULL,
    "target_id" UUID,
    "target_name" VARCHAR(80) NOT NULL,
    "field" VARCHAR(40),
    "before_value" VARCHAR(120),
    "after_value" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_audit_logs_family_id_created_at_idx" ON "family_audit_logs"("family_id", "created_at");

-- AddForeignKey
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_family_id_fkey"
  FOREIGN KEY ("family_id") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_actor_id_fkey"
  FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_target_id_fkey"
  FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariantes acrescentadas a mao.
-- ---------------------------------------------------------------------------

-- O PIN nunca entra no registro, nem antes nem depois.
--
-- Esta e a razao de a restricao estar AQUI e nao so no servico: em codigo, a
-- promessa "nunca gravamos o PIN" depende de ninguem, um dia, montar a entrada
-- do registro passando o valor digitado por engano - e o erro seria silencioso,
-- porque a coluna aceita texto. O banco recusa a escrita.
--
-- As tres acoes de PIN se distinguem pelo proprio nome (definido, trocado,
-- removido). O "de que para o que" delas e justamente o que nao pode ser dito.
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_pin_sem_valor"
  CHECK (
    "action" NOT IN ('MEMBER_PIN_SET', 'MEMBER_PIN_CHANGED', 'MEMBER_PIN_REMOVED')
    OR ("before_value" IS NULL AND "after_value" IS NULL)
  );

-- Valor sem campo nao descreve nada: "mudou de Ana para Aninha" precisa dizer
-- o que mudou. A recusa pega a entrada montada pela metade.
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_valor_exige_campo"
  CHECK (
    "field" IS NOT NULL
    OR ("before_value" IS NULL AND "after_value" IS NULL)
  );

-- Entrar e sair do nucleo nao sao alteracao de campo: nao ha "de que para o
-- que", e um `field` preenchido ali seria invencao de quem escreveu a linha.
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_presenca_sem_campo"
  CHECK (
    "action" NOT IN ('MEMBER_DEACTIVATED', 'MEMBER_REACTIVATED')
    OR "field" IS NULL
  );

-- Uma alteracao em que nada mudou e ruido no historico: o registro so existe
-- quando o valor de fato saiu de um estado para outro.
ALTER TABLE "family_audit_logs" ADD CONSTRAINT "family_audit_logs_mudanca_efetiva"
  CHECK (
    "action" NOT IN ('MEMBER_RENAMED', 'MEMBER_BIRTH_DATE_CHANGED')
    OR "before_value" IS DISTINCT FROM "after_value"
  );
