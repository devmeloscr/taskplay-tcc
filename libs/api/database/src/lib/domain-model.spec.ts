import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pointsChangedEvent, taskImageVerificationEvent } from '@taskplay/shared-telemetry';
import { createTaskRequest } from '@taskplay/shared-types';
import { AiVerdict, TaskVerification, TransactionReason } from '../generated/prisma/enums';

const prismaDir = join(__dirname, '..', '..', 'prisma');
const schema = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8');

/** Corpo de um `model X { ... }` do schema. */
function modelBody(name: string): string {
  const match = new RegExp(`^model ${name} \\{$([\\s\\S]*?)^\\}$`, 'm').exec(schema);
  if (!match) throw new Error(`Modelo ${name} nao encontrado no schema.prisma`);
  return match[1];
}

describe('modelagem do dominio', () => {
  describe('alinhamento com o catalogo de telemetria', () => {
    it('TransactionReason cobre exatamente os motivos de points.changed', () => {
      const doEvento = [...pointsChangedEvent.shape.reason.options].sort();
      const doBanco = Object.values(TransactionReason)
        .map((valor) => valor.toLowerCase())
        .sort();
      expect(doBanco).toEqual(doEvento);
    });

    it('AiVerdict cobre exatamente os resultados de task.verification.image', () => {
      const doEvento = [...taskImageVerificationEvent.shape.result.options].sort();
      const doBanco = Object.values(AiVerdict)
        .map((valor) => valor.toLowerCase())
        .sort();
      expect(doBanco).toEqual(doEvento);
    });
  });

  describe('alinhamento com o contrato de tarefas', () => {
    it('createTaskRequest.verification repete o enum task_verification', () => {
      const doContrato = [...createTaskRequest.shape.verification.unwrap().options].sort();
      const doBanco = Object.values(TaskVerification).sort();
      expect(doContrato).toEqual(doBanco);
    });
  });

  describe('isolamento por familia', () => {
    it.each(['User', 'Task', 'StoreItem', 'Purchase', 'Notification', 'Device', 'DeviceEnrollment'])(
      '%s declara familyId',
      (raiz) => {
        expect(modelBody(raiz)).toMatch(/^\s*familyId\s+String\s+@map\("family_id"\)/m);
      },
    );

    it.each(['Wallet', 'WalletTransaction', 'TaskEvidence', 'TaskTransfer', 'DeviceSession'])(
      '%s nao repete familyId, por chegar a familia pelo seu agregado',
      (subordinado) => {
        expect(modelBody(subordinado)).not.toMatch(/\bfamilyId\b/);
      },
    );
  });

  describe('invariantes escritas a mao nas migrations', () => {
    const sql = readdirSync(join(prismaDir, 'migrations'), { withFileTypes: true })
      .filter((entrada) => entrada.isDirectory())
      .map((dir) => readFileSync(join(prismaDir, 'migrations', dir.name, 'migration.sql'), 'utf8'))
      .join('\n');

    it.each([
      'wallets_balance_nao_negativo',
      'wallets_lifetime_earned_nao_negativo',
      'tasks_pontos_nao_negativos',
      'store_items_custo_nao_negativo',
      'purchases_custo_nao_negativo',
      'task_evidences_confianca_no_intervalo',
      'task_evidences_veredito_com_confianca',
      'task_transfers_membros_distintos',
      'users_tentativas_nao_negativas',
      'device_enrollments_uso_antes_da_expiracao',
      'device_sessions_expiracao_apos_criacao',
      'devices_push_token_com_data',
      'devices_push_token_formato',
      'notifications_recibo_exige_envio',
    ])('a restricao %s consta nas migrations', (restricao) => {
      expect(sql).toContain(restricao);
    });
  });
});
