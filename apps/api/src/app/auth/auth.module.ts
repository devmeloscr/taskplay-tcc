import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { loadAuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { ConsentimentoService } from './consentimento.service';
import { FamilyController } from './family.controller';
import { MembrosService } from './membros.service';
import { RegistroDaFamiliaService } from './registro-da-familia.service';
import { TcleController } from './tcle.controller';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => {
        const config = loadAuthConfig();
        return {
          secret: config.jwtSecret,
          signOptions: { algorithm: 'HS256' },
          verifyOptions: { algorithms: ['HS256'] },
        };
      },
    }),
    // Limite global de fundo; as rotas de credencial apertam com @Throttle.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
  ],
  controllers: [AuthController, FamilyController, TcleController],
  providers: [
    AuthService,
    ConsentimentoService,
    MembrosService,
    RegistroDaFamiliaService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AuthService, ConsentimentoService, MembrosService, RegistroDaFamiliaService],
})
export class AuthModule {}
