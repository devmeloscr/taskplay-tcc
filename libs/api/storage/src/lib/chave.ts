import { randomUUID } from 'node:crypto';

export function montarChave(familyId: string, taskId: string, contentType: string): string {
  const extensao = EXTENSOES[contentType];
  if (!extensao) {
    throw new Error(`Tipo de imagem não suportado: ${contentType}`);
  }
  return `familias/${familyId}/tarefas/${taskId}/${randomUUID()}.${extensao}`;
}

const EXTENSOES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/** Prefixo de tudo o que pertence a uma familia. */
export function prefixoDaFamilia(familyId: string): string {
  return `familias/${familyId}/`;
}

export function chaveEhDaFamilia(chave: string, familyId: string): boolean {
  return chave.startsWith(prefixoDaFamilia(familyId));
}
