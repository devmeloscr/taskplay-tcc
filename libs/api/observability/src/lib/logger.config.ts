import { randomUUID } from 'node:crypto';
import type { Params } from 'nestjs-pino';

export const loggerConfig: Params = {
  pinoHttp: {
    level: process.env['LOG_LEVEL'] ?? 'info',

    genReqId: (req, res) => {
      const existing = req.headers['x-request-id'];
      const id = typeof existing === 'string' && existing ? existing : randomUUID();
      res.setHeader('x-request-id', id);
      return id;
    },

    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
        'req.body.email',
        'req.body.childName',
        '*.password',
        '*.email',
        '*.childName',
      ],
      censor: '[REDIGIDO]',
    },

    // Sem isto, o pino registra todos os headers da requisicao - incluindo
    // qualquer coisa que um cliente decida enviar.
    serializers: {
      req: (req) => ({
        id: req.id,
        method: req.method,
        url: req.url,
      }),
      res: (res) => ({ statusCode: res.statusCode }),
    },

    // Checagem de saude e ruido: em producao ela e chamada a cada poucos
    // segundos e afogaria os registros que interessam a pesquisa.
    autoLogging: {
      ignore: (req) => req.url === '/api/health',
    },

    transport:
      process.env['NODE_ENV'] !== 'production'
        ? { target: 'pino-pretty', options: { singleLine: true, translateTime: 'HH:MM:ss' } }
        : undefined,
  },
};
