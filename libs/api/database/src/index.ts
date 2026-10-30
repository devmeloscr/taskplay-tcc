export * from './lib/prisma.module';
export * from './lib/prisma.service';

export { Prisma } from './generated/prisma/client';

export type {
  Family,
  User,
  Task,
  TaskEvidence,
  TaskTransfer,
  Wallet,
  WalletTransaction,
  StoreItem,
  Purchase,
  Notification,
  Device,
  DeviceSession,
  DeviceEnrollment,
  FamilyAuditLog,
} from './generated/prisma/client';

// Os enums sao exportados como valor, e nao apenas como tipo: o codigo precisa
// escrever `TaskStatus.APPROVED` em tempo de execucao, e nao so anotar o tipo.
export {
  UserRole,
  TaskStatus,
  TaskVerification,
  AiVerdict,
  ReviewDecision,
  TransactionReason,
  StoreItemKind,
  PurchaseStatus,
  NotificationType,
  DeviceMode,
  FamilyAuditAction,
} from './generated/prisma/enums';
