export interface StorageConfig {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  retencaoAposVerificacaoDias: number;
  retencaoMaximaDias: number;
}

export function loadStorageConfig(): StorageConfig {
  const accessKey = process.env['STORAGE_ACCESS_KEY'];
  const secretKey = process.env['STORAGE_SECRET_KEY'];

  if (!accessKey || !secretKey) {
    throw new Error(
      'STORAGE_ACCESS_KEY/STORAGE_SECRET_KEY não definidos: a API se recusa a subir sem credencial de armazenamento.',
    );
  }

  return {
    endPoint: process.env['STORAGE_ENDPOINT'] ?? 'localhost',
    port: Number(process.env['STORAGE_PORT'] ?? 9000),
    useSSL: process.env['STORAGE_USE_SSL'] === 'true',
    accessKey,
    secretKey,
    bucket: process.env['STORAGE_BUCKET'] ?? 'taskplay-evidencias',
    retencaoAposVerificacaoDias: Number(process.env['STORAGE_RETENTION_AFTER_REVIEW_DAYS'] ?? 7),
    retencaoMaximaDias: Number(process.env['STORAGE_RETENTION_MAX_DAYS'] ?? 30),
  };
}

/** Tipos de imagem aceitos. Lista fechada, e nao "qualquer image/*". */
export const TIPOS_ACEITOS = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const TAMANHO_MAXIMO_BYTES = 5 * 1024 * 1024;
