import { db } from '@/lib/db';
import { adsCampaigns } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

export type AdsCampaignType = 'search' | 'pmax' | 'display' | 'retargeting' | 'local';
export type AdsCampaignStatus = 'enabled' | 'paused' | 'removed';

export type AdsCampaign = {
  id: string;
  google_campaign_id: string | null;
  name: string;
  type: AdsCampaignType;
  status: AdsCampaignStatus;
  daily_budget_cents: number;
  target_url: string;
  conversion_action: string | null;
  start_date: string | null;
  end_date: string | null;
  created_via: string;
  telegram_chat_id: number;
  created_at: Date;
  updated_at: Date;
};

export type NewAdsCampaign = Omit<AdsCampaign, 'id' | 'created_at' | 'updated_at'>;

export async function createCampaignRow(data: NewAdsCampaign): Promise<AdsCampaign> {
  const [created] = await db.insert(adsCampaigns).values(data).returning();
  if (!created) throw new Error('Failed to insert ads_campaigns row');
  return created;
}

export async function getCampaign(id: string): Promise<AdsCampaign | null> {
  const rows = await db
    .select()
    .from(adsCampaigns)
    .where(eq(adsCampaigns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCampaignByGoogleId(googleId: string): Promise<AdsCampaign | null> {
  const rows = await db
    .select()
    .from(adsCampaigns)
    .where(eq(adsCampaigns.google_campaign_id, googleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCampaignsByChat(
  chatId: number,
  statuses: AdsCampaignStatus[] = ['enabled', 'paused'],
): Promise<AdsCampaign[]> {
  return db
    .select()
    .from(adsCampaigns)
    .where(
      and(
        eq(adsCampaigns.telegram_chat_id, chatId),
        inArray(adsCampaigns.status, statuses),
      ),
    );
}

export async function updateCampaignRow(
  id: string,
  patch: Partial<Omit<NewAdsCampaign, 'telegram_chat_id'>>,
): Promise<AdsCampaign> {
  const [updated] = await db
    .update(adsCampaigns)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(adsCampaigns.id, id))
    .returning();
  if (!updated) throw new Error(`AdsCampaign ${id} not found`);
  return updated;
}

export async function sumActiveDailyBudgetCents(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(daily_budget_cents), 0)::int AS total
    FROM ads_campaigns
    WHERE status = 'enabled'
  `);
  const rows =
    (result as unknown as { rows: { total: number }[] }).rows ??
    (result as unknown as { total: number }[]);
  return rows[0]?.total ?? 0;
}
