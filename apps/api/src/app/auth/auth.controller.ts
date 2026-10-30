import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  enrollRequest,
  loginRequest,
  refreshRequest,
  registerRequest,
  sessionRequest,
} from '@taskplay/shared-types';
import { AuthService } from './auth.service';
import { CurrentUser, Public } from './auth.decorators';
import type { Actor } from './auth.types';
import { parseBody } from './zod-validation';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() body: unknown) {
    return this.auth.register(parseBody(registerRequest, body, 'Cadastro inválido'));
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() body: unknown) {
    return this.auth.login(parseBody(loginRequest, body, 'Credenciais inválidas'));
  }

  @Post('profiles')
  @Public()
  @HttpCode(200)
  profiles(@Body() body: unknown) {
    const { refreshToken } = parseBody(refreshRequest, body, 'Sessão inválida');
    return this.auth.listProfiles(refreshToken);
  }

  /** Selecao de perfil. O PIN, quando exigido, e conferido no servico. */
  @Post('sessions')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  createSession(@Body() body: unknown) {
    return this.auth.createSession(parseBody(sessionRequest, body, 'Seleção de perfil inválida'));
  }

  @Post('refresh')
  @Public()
  @HttpCode(200)
  refresh(@Body() body: unknown) {
    const { refreshToken } = parseBody(refreshRequest, body, 'Sessão inválida');
    return this.auth.refresh(refreshToken);
  }

  @Post('logout')
  @Public()
  @HttpCode(204)
  async logout(@Body() body: unknown) {
    const { refreshToken } = parseBody(refreshRequest, body, 'Sessão inválida');
    await this.auth.logout(refreshToken);
  }

  /** Vincula o aparelho proprio de um filho pelo codigo de convite. */
  @Post('enroll')
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  enroll(@Body() body: unknown) {
    return this.auth.enroll(parseBody(enrollRequest, body, 'Código inválido'));
  }

  @Delete('devices/:id')
  @HttpCode(204)
  async revokeDevice(@CurrentUser() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    await this.auth.revokeDevice(actor, id);
  }
}
