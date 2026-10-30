import {
  createParamDecorator,
  SetMetadata,
  type ExecutionContext,
} from '@nestjs/common';
import type { UserRole } from '@taskplay/api-database';
import type { Actor, RequestWithActor } from './auth.types';

export const IS_PUBLIC_KEY = 'taskplay:public';
export const ROLES_KEY = 'taskplay:roles';
export const ALLOW_TELEMETRY_SCOPE_KEY = 'taskplay:allow-telemetry-scope';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restringe a rota a determinados papeis. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

export const AllowTelemetryScope = () => SetMetadata(ALLOW_TELEMETRY_SCOPE_KEY, true);

/** Entrega o ator ja resolvido pelo AuthGuard. */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): Actor => {
  const request = ctx.switchToHttp().getRequest<RequestWithActor>();
  if (!request.actor) {
    // Chegar aqui significa rota marcada como publica pedindo o ator: erro de
    // programacao, e nao entrada invalida do usuario.
    throw new Error('@CurrentUser usado em rota sem AuthGuard');
  }
  return request.actor;
});
