import { startTracing } from '@taskplay/api-observability/tracing';
startTracing();

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger as PinoLogger } from 'nestjs-pino';
import { AppModule } from './app/app.module';
import { origensPermitidas } from './app/cors.config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });

  // Substitui o logger padrao do Nest pelo pino, para que ate as mensagens do
  // proprio framework saiam em JSON estruturado e correlacionadas ao trace.
  app.useLogger(app.get(PinoLogger));

  app.setGlobalPrefix('api');

  const saltosDeProxy = Number(process.env['TRUST_PROXY_HOPS'] ?? 0);
  if (saltosDeProxy > 0) {
    app.set('trust proxy', saltosDeProxy);
  }

  const origens = origensPermitidas();
  if (origens) {
    app.enableCors({
      origin: origens,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['authorization', 'content-type', 'accept'],
      // O token viaja no cabecalho `authorization`, nunca em cookie: nao ha
      // credencial de navegador a liberar, e liberar abriria caminho para CSRF.
      credentials: false,
    });
  }
  app.enableShutdownHooks();

  const port = process.env['PORT'] ?? 3000;
  await app.listen(port);
  app.get(PinoLogger).log(`TaskPlay API ouvindo em http://localhost:${port}/api`);
}

bootstrap();
