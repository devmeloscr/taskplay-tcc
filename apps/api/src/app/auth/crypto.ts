import {
  createHash,
  randomBytes,
  randomInt,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';

function scryptAsync(
  secret: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

const SCRYPT_N = 32768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 32;
const SCRYPT_SALT_BYTES = 16;

const SCRYPT_MAXMEM = 64 * 1024 * 1024;

export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derived = await scryptAsync(secret.normalize('NFKC'), salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    'scrypt',
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    salt.toString('base64url'),
    derived.toString('base64url'),
  ].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, n, r, p, salt, expected] = parts;
  const expectedBuffer = Buffer.from(expected, 'base64url');
  let derived: Buffer;
  try {
    derived = await scryptAsync(
      secret.normalize('NFKC'),
      Buffer.from(salt, 'base64url'),
      expectedBuffer.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT_MAXMEM },
    );
  } catch {
    return false;
  }

  return timingSafeEqual(derived, expectedBuffer);
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function tokenFingerprint(token: string): string {
  return hashToken(token).slice(0, 12);
}

/** O mesmo prefixo, a partir do hash ja armazenado. */
export function hashFingerprint(storedHash: string): string {
  return storedHash.slice(0, 12);
}

/** Comparacao de hashes em tempo constante. */
export function tokensMatch(token: string, storedHash: string): boolean {
  const candidate = Buffer.from(hashToken(token), 'utf8');
  const stored = Buffer.from(storedHash, 'utf8');
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23456789';

export function generateEnrollmentCode(): string {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  }
  return code;
}
