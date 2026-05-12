import { db } from '@/lib/db';
import { adsPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const DEFAULT_ADS_PREFERENCES = {
  daily_limit_cents: 5000,
  monthly_limit_cents: 100000,
  default_location_id: 2276,
  default_language_code: 'de',
  notify_anomaly_threshold_pct: 300,
} as const;

export type AdsPreferences = {
  id: number;
  daily_limit_cents: number;
  monthly_limit_cents: number;
  default_location_id: number;
  default_language_code: string;
  notify_anomaly_threshold_pct: number;
  report_chat_id: number | null;
  updated_at: Date;
};

export async function getAdsPreferences(): Promise<AdsPreferences> {
  const rows = await db
    .select()
    .from(adsPreferences)
    .where(eq(adsPreferences.id, 1))
    .limit(1);

  const row = rows[0];
  if (row) return row;

  const [created] = await db
    .insert(adsPreferences)
    .values({ id: 1 })
    .returning();
  if (!created) throw new Error('Failed to seed ads_preferences');
  return created;
}

export async function updateAdsPreferences(
  patch: Partial<Omit<AdsPreferences, 'id' | 'updated_at'>>,
): Promise<void> {
  // Ensure row exists
  await getAdsPreferences();
  const [updated] = await db
    .update(adsPreferences)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(adsPreferences.id, 1))
    .returning();
  if (!updated) throw new Error('ads_preferences row missing after seed');
}
