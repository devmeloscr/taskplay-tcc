import {
  generateEnrollmentCode,
  generateRefreshToken,
  hashSecret,
  hashToken,
  tokensMatch,
  verifySecret,
} from './crypto';

describe('criptografia da autenticacao', () => {
  describe('segredos humanos (senha e PIN)', () => {
    it('confere o segredo correto e recusa o errado', async () => {
      const hash = await hashSecret('senha-forte-1');
      expect(await verifySecret('senha-forte-1', hash)).toBe(true);
      expect(await verifySecret('senha-forte-2', hash)).toBe(false);
    });

    it('produz hashes diferentes para o mesmo segredo', async () => {
      // Salt aleatorio por hash: dois responsaveis com a mesma senha nao tem a
      // mesma linha no banco, e uma tabela pre-computada nao serve para os dois.
      const a = await hashSecret('senha-repetida');
      const b = await hashSecret('senha-repetida');
      expect(a).not.toEqual(b);
      expect(await verifySecret('senha-repetida', a)).toBe(true);
      expect(await verifySecret('senha-repetida', b)).toBe(true);
    });

    it('grava os parametros junto do hash', async () => {
      // Sem isso, aumentar o custo no futuro invalidaria todos os hashes
      // existentes e deslogaria as familias no meio do teste de campo.
      const hash = await hashSecret('4821');
      const [algoritmo, n, r, p, salt, digest] = hash.split('$');
      expect(algoritmo).toBe('scrypt');
      expect(Number(n)).toBeGreaterThanOrEqual(16384);
      expect(Number(r)).toBeGreaterThan(0);
      expect(Number(p)).toBeGreaterThan(0);
      expect(salt.length).toBeGreaterThan(0);
      expect(digest.length).toBeGreaterThan(0);
    });

    it('devolve false para hash malformado em vez de lancar', async () => {
      // Uma excecao aqui distinguiria "registro corrompido" de "senha errada"
      // para quem esta tentando adivinhar.
      expect(await verifySecret('x', 'lixo')).toBe(false);
      expect(await verifySecret('x', '')).toBe(false);
      expect(await verifySecret('x', 'scrypt$0$0$0$aaaa$bbbb')).toBe(false);
    });
  });

  describe('segredos gerados pelo servidor', () => {
    it('gera refresh tokens distintos e verificaveis', () => {
      const a = generateRefreshToken();
      const b = generateRefreshToken();
      expect(a).not.toEqual(b);
      expect(tokensMatch(a, hashToken(a))).toBe(true);
      expect(tokensMatch(b, hashToken(a))).toBe(false);
    });

    it('nunca guarda o token em claro', () => {
      const token = generateRefreshToken();
      expect(hashToken(token)).not.toContain(token);
      expect(hashToken(token)).toHaveLength(64);
    });

    it('recusa comparacao com hash de tamanho diferente', () => {
      expect(tokensMatch(generateRefreshToken(), 'curto')).toBe(false);
    });
  });

  describe('codigo de convite', () => {
    it('tem 6 caracteres do alfabeto sem ambiguidade', () => {
      // Sem O/0, I/1 e S/5: o codigo e ditado em voz alta de um aparelho para
      // o outro, e confusao ai custa tentativa numa janela de 15 minutos.
      for (let i = 0; i < 200; i += 1) {
        expect(generateEnrollmentCode()).toMatch(/^[ABCDEFGHJKLMNPQRTUVWXYZ23456789]{6}$/);
      }
    });

    it('nao se repete em uso normal', () => {
      const codigos = new Set(Array.from({ length: 500 }, () => generateEnrollmentCode()));
      expect(codigos.size).toBeGreaterThan(495);
    });
  });
});
