import { BadRequestException } from '@nestjs/common';
import type { ZodType } from 'zod';

export function parseBody<T>(schema: ZodType<T>, body: unknown, mensagem: string): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new BadRequestException(
      corpoDeErro(
        mensagem,
        parsed.error.issues.map((i) => ({
          path: i.path.join('.'),
          code: i.code,
          message: i.message,
        })),
      ),
    );
  }
  return parsed.data;
}

export interface CampoRecusado {
  /** Caminho do campo no corpo enviado, como `email` ou `device.platform`. */
  path: string;
  code: string;
  message: string;
}

export function corpoDeErro(resumo: string, issues: CampoRecusado[]) {
  return {
    error: resumo,
    message: issues[0]?.message ?? resumo,
    issues,
  };
}
