import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ANDROID = join(RAIZ, 'apps', 'mobile', 'android');
const APK = join(ANDROID, 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');

/** O `??` do cliente: se este texto sobrar no bundle, a variável não foi lida. */
const FALLBACK = 'http://localhost:3000/api';

function enderecoEsperado() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;

  const arquivo = join(RAIZ, 'apps', 'mobile', '.env.production');
  if (!existsSync(arquivo)) return null;

  const linha = readFileSync(arquivo, 'utf8')
    .split('\n')
    .find((l) => l.trim().startsWith('EXPO_PUBLIC_API_URL='));
  return linha ? linha.slice(linha.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '') : null;
}

function compilar() {
  console.log('Compilando o APK de release (leva alguns minutos)…\n');
  execFileSync('./gradlew', ['assembleRelease'], { cwd: ANDROID, stdio: 'inherit' });
}

function bundleDoApk() {
  return execFileSync('unzip', ['-p', APK, 'assets/index.android.bundle'], {
    encoding: 'latin1',
    maxBuffer: 256 * 1024 * 1024,
  });
}

function conferir() {
  const esperado = enderecoEsperado();
  const bundle = bundleDoApk();

  const temEsperado = esperado !== null && bundle.includes(esperado);
  const temFallback = bundle.includes(FALLBACK);

  console.log('\nEndereço da API gravado no pacote');
  console.log(`  esperado: ${esperado ?? '(nenhum definido)'}`);
  console.log(`  no bundle: ${temEsperado ? 'presente' : 'AUSENTE'}`);
  console.log(`  fallback localhost: ${temFallback ? 'PRESENTE: a variável não foi lida' : 'ausente'}`);

  if (esperado === null) {
    console.log(
      '\nSem EXPO_PUBLIC_API_URL no ambiente nem em apps/mobile/.env.production:\n' +
        'o aplicativo vai procurar a API em ' +
        FALLBACK +
        ', que no celular é o próprio celular.',
    );
    return false;
  }
  return temEsperado && !temFallback;
}

function abrirDiretorio() {
  const comando = { darwin: 'open', linux: 'xdg-open', win32: 'explorer' }[process.platform];
  if (!comando) return;

  // `-R` no macOS revela o arquivo dentro da pasta, em vez de só abri-la: chega
  // ao mesmo lugar já com o APK selecionado. Nos outros, abre o diretório.
  const argumentos =
    process.platform === 'darwin' ? ['-R', APK] : [join(ANDROID, 'app/build/outputs/apk/release')];

  try {
    execFileSync(comando, argumentos, { stdio: 'ignore' });
  } catch {
    // Sem gerenciador de arquivos, ou sem sessão gráfica. O caminho impresso
    // acima continua servindo.
  }
}

compilar();

const { size } = statSync(APK);
console.log(`\nAPK: ${APK}`);
console.log(`Tamanho: ${(size / 1024 / 1024).toFixed(0)} MB`);
console.log('Instalar no aparelho conectado: adb install -r ' + APK);

const confere = conferir();
abrirDiretorio();

if (!confere) {
  console.error(
    '\nO pacote NÃO tem o endereço esperado. Instalar assim significa descobrir\n' +
      'o problema no primeiro login do celular. Confira apps/mobile/.env.production\n' +
      'e refaça o build.',
  );
  process.exit(1);
}
