const ORIGENS_DE_DESENVOLVIMENTO = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

export function origensPermitidas(
  env: NodeJS.ProcessEnv = process.env,
): (string | RegExp)[] | null {
  const declaradas = (env['CORS_ORIGINS'] ?? '')
    .split(',')
    .map((origem) => origem.trim())
    .filter(Boolean);

  if (declaradas.length > 0) return declaradas;

  // Sem declaracao explicita, so o ambiente de desenvolvimento ganha origens.
  // Producao sem `CORS_ORIGINS` fica sem CORS, que e o padrao seguro.
  return env['NODE_ENV'] === 'production' ? null : ORIGENS_DE_DESENVOLVIMENTO;
}
