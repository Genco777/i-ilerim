import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

function getEncKey(): string {
  const key = process.env.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('APP_ENCRYPTION_KEY is not set');
  }
  return key;
}

export async function setSecret(
  key: string,
  value: string,
  expiresAt?: Date,
): Promise<void> {
  const encKey = getEncKey();
  await db.execute(sql`
    INSERT INTO secrets (key, value, expires_at, last_refreshed_at)
    VALUES (
      ${key},
      pgp_sym_encrypt(${value}, ${encKey}),
      ${expiresAt ?? null},
      NOW()
    )
    ON CONFLICT (key) DO UPDATE
    SET value = pgp_sym_encrypt(${value}, ${encKey}),
        expires_at = ${expiresAt ?? null},
        last_refreshed_at = NOW()
  `);
}

export async function getSecret(key: string): Promise<string | null> {
  const encKey = getEncKey();
  const result = await db.execute(sql`
    SELECT pgp_sym_decrypt(value::bytea, ${encKey}) AS token
    FROM secrets
    WHERE key = ${key}
  `);
  const rows =
    (result as unknown as { rows: { token: string }[] }).rows ??
    (result as unknown as { token: string }[]);
  return rows[0]?.token ?? null;
}

export async function deleteSecret(key: string): Promise<void> {
  await db.execute(sql`DELETE FROM secrets WHERE key = ${key}`);
}

export async function listSecretKeys(): Promise<string[]> {
  const result = await db.execute(sql`
    SELECT key FROM secrets ORDER BY key
  `);
  const rows =
    (result as unknown as { rows: { key: string }[] }).rows ??
    (result as unknown as { key: string }[]);
  return rows.map((r) => r.key);
}
