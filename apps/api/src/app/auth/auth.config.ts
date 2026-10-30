export interface AuthConfig {
  jwtSecret: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlDays: number;
}

export function loadAuthConfig(): AuthConfig {
  const jwtSecret = process.env['AUTH_JWT_SECRET'];
  if (!jwtSecret) {
    throw new Error(
      'AUTH_JWT_SECRET não definido: a API se recusa a subir sem segredo de assinatura de token.',
    );
  }
  if (jwtSecret.length < 32) {
    throw new Error('AUTH_JWT_SECRET curto demais: use ao menos 32 caracteres aleatórios.');
  }

  return {
    jwtSecret,
    accessTokenTtlSeconds: Number(process.env['AUTH_ACCESS_TOKEN_TTL'] ?? 900),
    // 60 dias: o teste de campo dura 30, e uma familia que passe um fim de
    // semana sem abrir o aplicativo nao pode voltar a uma tela de login.
    refreshTokenTtlDays: Number(process.env['AUTH_REFRESH_TOKEN_TTL_DAYS'] ?? 60),
  };
}

/** Bloqueio progressivo por usuario. */
export const LOCKOUT = {
  /** Tentativas antes do primeiro bloqueio. */
  threshold: 5,
  /** Primeiro bloqueio, em segundos. Dobra a cada falha subsequente. */
  baseSeconds: 60,
  /** Teto: acima disso o atraso vira negacao de servico ao proprio usuario. */
  maxSeconds: 900,
} as const;

/** Janela de validade do codigo de convite, em minutos. */
export const ENROLLMENT_TTL_MINUTES = 15;
