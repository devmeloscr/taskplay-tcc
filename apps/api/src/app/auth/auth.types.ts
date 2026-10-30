import type { TokenScope } from '@taskplay/shared-types';
import type { UserRole } from '@taskplay/api-database';

export interface Actor {
  userId: string;
  familyId: string;
  role: UserRole;
  scope: TokenScope;
  deviceId: string;
}

/** Conteudo do JWT. Nomes curtos porque o token viaja em toda requisicao. */
export interface AccessTokenPayload {
  sub: string;
  fid: string;
  role: UserRole;
  scope: TokenScope;
  did: string;
}

/** Requisicao com o ator ja resolvido pelo AuthGuard. */
export interface RequestWithActor {
  actor?: Actor;
}
