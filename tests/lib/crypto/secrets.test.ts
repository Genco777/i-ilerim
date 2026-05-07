import { describe, it, expect } from 'vitest';
import {
  setSecret,
  getSecret,
  deleteSecret,
  listSecretKeys,
} from '@/lib/crypto/secrets';

describe('secrets', () => {
  it('encrypts and decrypts a token (round-trip)', async () => {
    const key = 'test_token_' + Date.now();
    const value = 'super-secret-value-123!@#';
    await setSecret(key, value);
    const got = await getSecret(key);
    expect(got).toBe(value);
    await deleteSecret(key);
  });

  it('returns null for missing key', async () => {
    const got = await getSecret('nonexistent_' + Date.now());
    expect(got).toBeNull();
  });

  it('upserts (overwrites existing key)', async () => {
    const key = 'test_upsert_' + Date.now();
    await setSecret(key, 'first');
    await setSecret(key, 'second');
    const got = await getSecret(key);
    expect(got).toBe('second');
    await deleteSecret(key);
  });

  it('lists secret keys', async () => {
    const key = 'test_list_' + Date.now();
    await setSecret(key, 'x');
    const keys = await listSecretKeys();
    expect(keys).toContain(key);
    await deleteSecret(key);
  });
});
