import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESTINO = join(RAIZ, 'apps', 'mobile', 'assets', 'images');

const INDIGO_CLARO = '#6366F1';
const INDIGO_ESCURO = '#4338CA';

/** O check é mais escuro que o indigo do fundo para se separar do âmbar. */
const INDIGO_CHECK = '#3730A3';

const defs = `
  <linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${INDIGO_CLARO}"/>
    <stop offset="1" stop-color="${INDIGO_ESCURO}"/>
  </linearGradient>
  <linearGradient id="ouro" x1="0.25" y1="0.05" x2="0.75" y2="0.95">
    <stop offset="0" stop-color="#FCD34D"/>
    <stop offset="0.55" stop-color="#FBBF24"/>
    <stop offset="1" stop-color="#F59E0B"/>
  </linearGradient>`;

const marca = `
  <g transform="translate(512 512) scale(0.965) translate(-512 -512)">
    <path d="M 512 168 L 620 396 L 868 432 L 690 610 L 732 856
             L 512 740 L 292 856 L 334 610 L 156 432 L 404 396 Z"
          fill="url(#ouro)" stroke="url(#ouro)" stroke-width="76"
          stroke-linejoin="round"/>
  </g>
  <path d="M 427 545 L 489 607 L 597 480" fill="none" stroke="${INDIGO_CHECK}"
        stroke-width="78" stroke-linecap="round" stroke-linejoin="round"/>`;

const svg = (interior) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
     <defs>${defs}</defs>${interior}
   </svg>`;

/** Reduz a marca em torno do centro da tela. */
const escala = (fator) =>
  `<g transform="translate(512 512) scale(${fator}) translate(-512 -512)">${marca}</g>`;

const icone = svg(`<rect width="1024" height="1024" fill="url(#fundo)"/>${escala(0.78)}`);

const adaptativo = svg(escala(0.66));

const splash = svg(
  `<rect width="1024" height="1024" rx="225" fill="url(#fundo)"/>${escala(0.78)}`,
);

const saidas = [
  ['icon.png', icone, 1024],
  ['adaptive-icon.png', adaptativo, 1024],
  ['splash-icon.png', splash, 1024],
  ['favicon.png', icone, 48],
];

// ---------------------------------------------------------------------------

let Resvg;
try {
  ({ Resvg } = await import('@resvg/resvg-js'));
} catch {
  console.error(
    'Falta o rasterizador. Ele não é dependência do projeto porque só serve a\n' +
      'esta tarefa. Instale sob demanda e rode de novo:\n\n' +
      '  pnpm add -Dw @resvg/resvg-js && pnpm icones\n',
  );
  process.exit(1);
}

for (const [nome, fonte, largura] of saidas) {
  const png = new Resvg(fonte, { fitTo: { mode: 'width', value: largura } }).render().asPng();
  writeFileSync(join(DESTINO, nome), png);
  console.log(`${nome} (${largura}px)`);
}
