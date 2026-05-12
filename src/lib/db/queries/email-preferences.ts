import { db } from '@/lib/db';
import { emailPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type ThemeId = 'dark_steel' | 'light_steel' | 'dark_gold';
export const DEFAULT_THEME: ThemeId = 'dark_steel';

export async function getEmailPreferences(): Promise<{ theme: string }> {
  const rows = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.id, 1))
    .limit(1);

  const row = rows[0];
  if (row) return row;

  // Seed default row
  const [created] = await db
    .insert(emailPreferences)
    .values({ id: 1, theme: DEFAULT_THEME })
    .returning();
  if (!created) throw new Error('Failed to seed email preferences');
  return created;
}

export async function updateEmailPreferences(theme: string): Promise<void> {
  await db
    .update(emailPreferences)
    .set({ theme, updatedAt: new Date() })
    .where(eq(emailPreferences.id, 1));
}
