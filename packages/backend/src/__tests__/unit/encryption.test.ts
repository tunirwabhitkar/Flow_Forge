import { encryptCredential, decryptCredential, encryptString, decryptString, hashApiKey, generateApiKey } from '../../credentials/encryption.js';

// ─── Credential Encryption Tests ──────────────────────────────────────────────

describe('Credential Encryption (AES-256-GCM)', () => {
  beforeAll(() => {
    // Ensure encryption key is set
    process.env['FLOWFORGE_ENCRYPTION_KEY'] = 'test-encryption-key-32-chars!!!!';
  });

  it('encrypts and decrypts credential data round-trip', () => {
    const data = {
      apiKey: 'sk-my-secret-api-key-123',
      host: 'api.example.com',
      port: 443,
      enabled: true,
      nested: { token: 'Bearer xyz' },
    };

    const encrypted = encryptCredential(data);

    // Encrypted fields must exist
    expect(encrypted.encryptedData).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.authTag).toBeDefined();

    // Raw data must NOT appear in ciphertext
    expect(encrypted.encryptedData).not.toContain('sk-my-secret-api-key-123');

    // Round-trip must produce identical data
    const decrypted = decryptCredential(encrypted);
    expect(decrypted).toEqual(data);
  });

  it('produces unique ciphertext for the same plaintext (random IV)', () => {
    const data = { key: 'same-value' };
    const enc1 = encryptCredential(data);
    const enc2 = encryptCredential(data);

    expect(enc1.iv).not.toBe(enc2.iv);
    expect(enc1.encryptedData).not.toBe(enc2.encryptedData);

    // Both must still decrypt correctly
    expect(decryptCredential(enc1)).toEqual(data);
    expect(decryptCredential(enc2)).toEqual(data);
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptCredential({ secret: 'value' });
    enc.encryptedData = enc.encryptedData.slice(0, -4) + 'dead';
    expect(() => decryptCredential(enc)).toThrow();
  });

  it('throws on tampered auth tag', () => {
    const enc = encryptCredential({ secret: 'value' });
    enc.authTag = 'deadbeef'.repeat(4);
    expect(() => decryptCredential(enc)).toThrow();
  });

  it('handles empty objects', () => {
    const data = {};
    const enc = encryptCredential(data);
    expect(decryptCredential(enc)).toEqual({});
  });

  it('handles large credential objects', () => {
    const data: Record<string, unknown> = {};
    for (let i = 0; i < 100; i++) {
      data[`field_${i}`] = `value_${'x'.repeat(100)}_${i}`;
    }
    const enc = encryptCredential(data);
    expect(decryptCredential(enc)).toEqual(data);
  });
});

describe('encryptString / decryptString', () => {
  it('round-trips a plain string', () => {
    const original = 'my-secret-token-abc123';
    const encoded = encryptString(original);
    expect(encoded).not.toContain(original);
    expect(decryptString(encoded)).toBe(original);
  });

  it('handles special characters', () => {
    const original = 'token=abc&secret=xyz/path?q=1#hash 日本語';
    expect(decryptString(encryptString(original))).toBe(original);
  });
});

describe('API Key utilities', () => {
  it('generates keys with the ff_ prefix', () => {
    const key = generateApiKey();
    expect(key).toMatch(/^ff_[a-f0-9]{48}$/);
  });

  it('generates unique keys', () => {
    const keys = new Set(Array.from({ length: 100 }, generateApiKey));
    expect(keys.size).toBe(100);
  });

  it('hashes consistently with the same input', () => {
    const key = 'ff_abc123';
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });

  it('produces different hashes for different keys', () => {
    expect(hashApiKey('ff_key1')).not.toBe(hashApiKey('ff_key2'));
  });

  it('hash is not the same as original', () => {
    const key = 'ff_mysecretkey';
    expect(hashApiKey(key)).not.toBe(key);
  });
});
