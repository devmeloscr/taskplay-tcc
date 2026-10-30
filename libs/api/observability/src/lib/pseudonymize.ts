import { createHmac } from 'node:crypto';

export function pseudonymize(id: string): string {
  const salt = process.env['TELEMETRY_PSEUDONYM_SALT'];
  if (!salt) {
    throw new Error(
      'TELEMETRY_PSEUDONYM_SALT não definido: a API se recusa a registrar telemetria sem pseudonimização.',
    );
  }
  return createHmac('sha256', salt).update(id).digest('hex').slice(0, 32);
}
