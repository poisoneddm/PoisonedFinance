import { encrypt, decrypt } from '@/lib/crypto';

process.env.ENCRYPTION_KEY = Buffer.from('a'.repeat(32)).toString('base64');

describe('encrypt / decrypt', () => {
  it('roundtrips a plain string', () => {
    const plain = 'super-secret-token-abc123';
    const ciphertext = encrypt(plain);
    expect(ciphertext).not.toBe(plain);
    expect(decrypt(ciphertext)).toBe(plain);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const a = encrypt('same');
    const b = encrypt('same');
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe('same');
    expect(decrypt(b)).toBe('same');
  });

  it('throws on tampered ciphertext', () => {
    const ct = encrypt('hello');
    const tampered = ct.slice(0, -4) + 'XXXX';
    expect(() => decrypt(tampered)).toThrow();
  });
});
