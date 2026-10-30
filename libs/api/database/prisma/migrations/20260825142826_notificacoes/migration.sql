-- AlterTable
ALTER TABLE "devices" ADD COLUMN     "push_token" VARCHAR(255),
ADD COLUMN     "push_token_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "push_error" VARCHAR(255),
ADD COLUMN     "push_ticket_id" VARCHAR(64);

-- ---------------------------------------------------------------------------
-- Invariantes acrescentadas a mao.
-- ---------------------------------------------------------------------------

-- Token e data de atualizacao andam juntos: um token sem data impediria saber
-- se ele e recente, e uma data sem token nao descreve nada.
ALTER TABLE "devices" ADD CONSTRAINT "devices_push_token_com_data"
  CHECK (("push_token" IS NULL) = ("push_token_updated_at" IS NULL));

-- Formato do token do Expo. A verificacao existe no banco, e nao so na rota,
-- porque um token malformado so falha no momento do envio - horas depois, na
-- rotina, longe de quem o cadastrou.
ALTER TABLE "devices" ADD CONSTRAINT "devices_push_token_formato"
  CHECK ("push_token" IS NULL OR "push_token" ~ '^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$');

-- Um recibo so existe para notificacao que foi enviada.
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recibo_exige_envio"
  CHECK ("push_ticket_id" IS NULL OR "sent_at" IS NOT NULL);
