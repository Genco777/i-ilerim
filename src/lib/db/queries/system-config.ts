import { db } from '@/lib/db';
import { systemConfig } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface SystemConfigEntry {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export async function getSystemConfig(key: string): Promise<SystemConfigEntry | null> {
  const rows = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.key, key))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getSystemConfigValue(key: string, fallback: string = ''): Promise<string> {
  const entry = await getSystemConfig(key);
  return entry?.value ?? fallback;
}

export async function setSystemConfig(
  key: string,
  value: string,
  description?: string,
): Promise<SystemConfigEntry> {
  const now = new Date();
  await db
    .insert(systemConfig)
    .values({
      key,
      value,
      description: description ?? null,
      updated_at: now,
    })
    .onConflictDoUpdate({
      target: systemConfig.key,
      set: { value, description: description ?? null, updated_at: now },
    });
  return {
    key,
    value,
    description: description ?? null,
    updatedAt: now.toISOString(),
  };
}

export async function getAllSystemConfig(): Promise<SystemConfigEntry[]> {
  const rows = await db.select().from(systemConfig).orderBy(systemConfig.key);
  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    description: row.description,
    updatedAt: row.updated_at.toISOString(),
  }));
}
