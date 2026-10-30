-- Lembrete ao responsavel quando a crianca acumula pontos e a loja nao tem
-- recompensa para trocar.
--
-- Veio do teste de campo: a primeira familia chegou a 130 pontos em duas
-- semanas sem nunca cadastrar uma recompensa, e o ciclo pontos -> troca, que e
-- a metade da gamificacao, nao chegou a acontecer.

-- AlterEnum
ALTER TYPE "notification_type" ADD VALUE 'STORE_WITHOUT_REWARDS';
