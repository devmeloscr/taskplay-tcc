import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { UserRole } from '@taskplay/api-database';
import {
  ALLOW_TELEMETRY_SCOPE_KEY,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from './auth.decorators';
import type { AccessTokenPayload, RequestWithActor } from './auth.types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets)) {
      return true;
    }

    const request = context.switchToHttp().getRequest<
      RequestWithActor & { headers: Record<string, string | undefined> }
    >();

    const header = request.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token ausente');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(header.slice(7));
    } catch {
      // Assinatura invalida e token expirado devolvem a mesma coisa: a
      // diferenca so interessaria a quem esta testando tokens forjados.
      throw new UnauthorizedException('Token inválido ou expirado');
    }

    const scope = payload.scope ?? 'full';
    const allowsTelemetryScope = this.reflector.getAllAndOverride<boolean>(
      ALLOW_TELEMETRY_SCOPE_KEY,
      targets,
    );
    if (scope === 'telemetry' && !allowsTelemetryScope) {
      throw new ForbiddenException('Este token só vale para envio de telemetria');
    }

    const roles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, targets);
    if (roles?.length && !roles.includes(payload.role)) {
      throw new ForbiddenException('Papel insuficiente para esta operação');
    }

    request.actor = {
      userId: payload.sub,
      familyId: payload.fid,
      role: payload.role,
      scope,
      deviceId: payload.did,
    };

    return true;
  }
}
