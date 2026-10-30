export const CORES = {
  fundo: '#F7F7FB',
  superficie: '#FFFFFF',
  texto: '#1A1A2E',
  textoSuave: '#6B6B80',
  primaria: '#4F46E5',
  primariaTexto: '#FFFFFF',
  borda: '#E3E3ED',
  erro: '#DC2626',
  sucesso: '#059669',
  atencao: '#B45309',
  responsavel: '#0891B2',
  filho: '#7C3AED',
} as const;

export const ESPACO = { p: 8, m: 16, g: 24, gg: 32 } as const;

/** Lado minimo de um alvo de toque. Acima do minimo de 44pt das plataformas. */
export const ALVO_MINIMO = 56;

export const TIPO = {
  titulo: 28,
  subtitulo: 20,
  corpo: 16,
  apoio: 14,
} as const;
