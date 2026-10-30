import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);

const FALTANTES = ['@prisma/client'];

const caminho = join(process.cwd(), 'dist/apps/api/package.json');
const pacote = JSON.parse(readFileSync(caminho, 'utf8'));

for (const nome of FALTANTES) {
  if (pacote.dependencies[nome]) continue;
  const { version } = require(`${nome}/package.json`);
  pacote.dependencies[nome] = version;
  console.log(`acrescentado: ${nome}@${version}`);
}

pacote.dependencies = Object.fromEntries(Object.entries(pacote.dependencies).sort(([a], [b]) => a.localeCompare(b)));

writeFileSync(caminho, `${JSON.stringify(pacote, null, 2)}\n`);
