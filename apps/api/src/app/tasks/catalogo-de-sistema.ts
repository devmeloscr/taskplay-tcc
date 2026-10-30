import { StoreItemKind } from '@taskplay/api-database';

export const CARTA_DE_TRANSFERENCIA = {
  name: 'Carta de Transferência',
  description: 'Permite transferir uma tarefa sua para outro membro da família.',
  kind: StoreItemKind.TRANSFER_LETTER,
  costPoints: 50,
} as const;
