import { db } from '@/lib/db';
import {
  adsDrafts,
  type AdsDraftPayload,
  type AdsGeneratedCopy,
  type AdsGeneratedKeyword,
} from '@/lib/db/schema';
import { and, eq, inArray, desc } from 'drizzle-orm';

export type AdsDraftStatus =
  | 'collecting'
  | 'awaiting_approval'
  | 'confirmed'
  | 'cancelled'
  | 'failed';

export type AdsWizardStep =
  | 'type'
  | 'target'
  | 'budget'
  | 'copy_review'
  | 'approval';

export type AdsDraft = {
  id: string;
  status: AdsDraftStatus;
  current_step: AdsWizardStep;
  draft_payload: AdsDraftPayload;
  generated_copy: AdsGeneratedCopy | null;
  generated_keywords: AdsGeneratedKeyword[] | null;
  telegram_chat_id: number;
  telegram_preview_msg_id: number | null;
  error: string | null;
  created_at: Date;
  sent_at: Date | null;
};

const ACTIVE_STATUSES: AdsDraftStatus[] = ['collecting', 'awaiting_approval'];

export async function createAdsDraft(chatId: number): Promise<AdsDraft> {
  const [created] = await db
    .insert(adsDrafts)
    .values({
      telegram_chat_id: chatId,
      status: 'collecting',
      current_step: 'type',
      draft_payload: {},
    })
    .returning();
  if (!created) throw new Error('Failed to insert ads_drafts row');
  return created as AdsDraft;
}

export async function getAdsDraft(id: string): Promise<AdsDraft | null> {
  const rows = await db
    .select()
    .from(adsDrafts)
    .where(eq(adsDrafts.id, id))
    .limit(1);
  return (rows[0] as AdsDraft | undefined) ?? null;
}

export async function getActiveAdsDraft(chatId: number): Promise<AdsDraft | null> {
  const rows = await db
    .select()
    .from(adsDrafts)
    .where(
      and(
        eq(adsDrafts.telegram_chat_id, chatId),
        inArray(adsDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(adsDrafts.created_at))
    .limit(1);
  return (rows[0] as AdsDraft | undefined) ?? null;
}

export async function updateAdsDraft(
  id: string,
  patch: Partial<{
    status: AdsDraftStatus;
    current_step: AdsWizardStep;
    draft_payload: AdsDraftPayload;
    generated_copy: AdsGeneratedCopy | null;
    generated_keywords: AdsGeneratedKeyword[] | null;
    telegram_preview_msg_id: number | null;
    error: string | null;
    sent_at: Date | null;
  }>,
): Promise<AdsDraft> {
  const [updated] = await db
    .update(adsDrafts)
    .set(patch)
    .where(eq(adsDrafts.id, id))
    .returning();
  if (!updated) throw new Error(`AdsDraft ${id} not found`);
  return updated as AdsDraft;
}

export async function cancelActiveAdsDrafts(chatId: number): Promise<number> {
  const rows = await db
    .update(adsDrafts)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(adsDrafts.telegram_chat_id, chatId),
        inArray(adsDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .returning({ id: adsDrafts.id });
  return rows.length;
}
