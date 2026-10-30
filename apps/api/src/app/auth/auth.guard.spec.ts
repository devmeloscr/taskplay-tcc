import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@taskplay/api-database';
import { AuthGuard } from './auth.guard';
import {
  ALLOW_TELEMETRY_SCOPE_KEY,
  IS_PUBLIC_KEY,
  ROLES_KEY,
} from './auth.decorators';
import type { AccessTokenPayload, RequestWithActor } from './auth.types';

const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres';
const FAMILIA = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

function contexto(request: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => 'handler',
    getClass: () => 'classe',
  } as unknown as ExecutionContext;
}

function criarGuard(metadados: Record<string, unknown> = {}) {
  const reflector = {
    getAllAndOverride: (chave: string) => metadados[chave],
  } as unknown as Reflector;
  const jwt = new JwtService({
    secret: SEGREDO,
    signOptions: { algorithm: 'HS256' },
    verifyOptions: { algorithms: ['HS256'] },
  });
  return { guard: new AuthGuard(jwt, reflector), jwt };
}

function token(jwt: JwtService, overrides: Partial<AccessTokenPayload> = {}) {
  const payload: AccessTokenPayload = {
    sub: 'usuario-1',
    fid: FAMILIA,
    role: UserRole.CHILD,
    scope: 'full',
    did: 'aparelho-1',
    ...overrides,
  };
  return jwt.sign(payload, { expiresIn: 900 });
}

describe('AuthGuard', () => {
  it('libera rota marcada como publica', async () => {
    const { guard } = criarGuard({ [IS_PUBLIC_KEY]: true });
    await expect(guard.canActivate(contexto({ headers: {} }))).resolves.toBe(true);
  });

  it('recusa requisicao sem token', async () => {
    const { guard } = criarGuard();
    await expect(guard.canActivate(contexto({ headers: {} }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('recusa token assinado com outro segredo', async () => {
    const { guard } = criarGuard();
    const forjado = new JwtService({ secret: 'outro-segredo-qualquer-com-32-caracteres' }).sign({
      sub: 'usuario-1',
      fid: FAMILIA,
      role: UserRole.PARENT,
      scope: 'full',
      did: 'aparelho-1',
    });

    await expect(
      guard.canActivate(contexto({ headers: { authorization: `Bearer ${forjado}` } })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('reconstroi o ator a partir do token, e nao do corpo', async () => {
    const { guard, jwt } = criarGuard();
    // O corpo mente: diz ser responsavel de outra familia. O guard nao o le.
    const request: RequestWithActor & { headers: Record<string, string>; body: unknown } = {
      headers: { authorization: `Bearer ${token(jwt)}` },
      body: { role: 'PARENT', familyId: 'familia-alheia', userId: 'outro' },
    };

    await guard.canActivate(contexto(request));

    expect(request.actor).toEqual({
      userId: 'usuario-1',
      familyId: FAMILIA,
      role: UserRole.CHILD,
      scope: 'full',
      deviceId: 'aparelho-1',
    });
  });

  it('recusa token de filho em rota restrita ao responsavel', async () => {
    // A fronteira que o desenho existe para proteger: a crianca nao administra
    // a familia nem aprova a propria tarefa.
    const { guard, jwt } = criarGuard({ [ROLES_KEY]: [UserRole.PARENT] });

    await expect(
      guard.canActivate(
        contexto({ headers: { authorization: `Bearer ${token(jwt)}` } }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aceita token de responsavel na mesma rota', async () => {
    const { guard, jwt } = criarGuard({ [ROLES_KEY]: [UserRole.PARENT] });
    const request = {
      headers: { authorization: `Bearer ${token(jwt, { role: UserRole.PARENT })}` },
    };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });

  it('recusa token de escopo telemetry fora da rota de ingestao', async () => {
    // E o que permite que o escopo `telemetry` dispense PIN: ele nao alcanca
    // mais nada. Sem esta recusa, o PIN do responsavel deixaria de proteger.
    const { guard, jwt } = criarGuard();

    await expect(
      guard.canActivate(
        contexto({
          headers: { authorization: `Bearer ${token(jwt, { scope: 'telemetry' })}` },
        }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('aceita token de escopo telemetry na rota que o declara', async () => {
    const { guard, jwt } = criarGuard({ [ALLOW_TELEMETRY_SCOPE_KEY]: true });
    const request = {
      headers: { authorization: `Bearer ${token(jwt, { scope: 'telemetry' })}` },
    };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });

  it('aceita token de escopo full na rota de telemetria', async () => {
    // O perfil que esta na tela envia a propria fila com o token corrente.
    const { guard, jwt } = criarGuard({ [ALLOW_TELEMETRY_SCOPE_KEY]: true });
    const request = { headers: { authorization: `Bearer ${token(jwt)}` } };

    await expect(guard.canActivate(contexto(request))).resolves.toBe(true);
  });
});
