import { db } from '@/lib/db';
import { mailDrafts, type MailAttachment } from '@/lib/db/schema';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';
import type { MailDraft, NewMailDraft } from '@/types';

type MailDraftStatus =
  | 'drafting'
  | 'awaiting_regen'
  | 'awaiting_attachment'
  | 'sent'
  | 'cancelled';

const ACTIVE_STATUSES: MailDraftStatus[] = [
  'drafting',
  'awaiting_regen',
  'awaiting_attachment',
];

export async function createDraft(data: NewMailDraft): Promise<MailDraft> {
  const [created] = await db.insert(mailDrafts).values(data).returning();
  if (!created) throw new Error('Failed to insert mail draft');
  return created;
}

export async function getDraft(id: string): Promise<MailDraft | null> {
  const rows = await db
    .select()
    .from(mailDrafts)
    .where(eq(mailDrafts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveDraft(
  chatId: number,
): Promise<MailDraft | null> {
  const rows = await db
    .select()
    .from(mailDrafts)
    .where(
      and(
        eq(mailDrafts.telegram_chat_id, chatId),
        inArray(mailDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(mailDrafts.created_at))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDraft(
  id: string,
  patch: Partial<NewMailDraft>,
): Promise<MailDraft> {
  const [updated] = await db
    .update(mailDrafts)
    .set(patch)
    .where(eq(mailDrafts.id, id))
    .returning();
  if (!updated) throw new Error(`MailDraft ${id} not found`);
  return updated;
}

export async function cancelActiveDrafts(chatId: number): Promise<number> {
  const rows = await db
    .update(mailDrafts)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(mailDrafts.telegram_chat_id, chatId),
        inArray(mailDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .returning({ id: mailDrafts.id });
  return rows.length;
}

export async function markSent(id: string): Promise<MailDraft> {
  return updateDraft(id, { status: 'sent', sent_at: new Date() });
}

export async function markCancelled(id: string): Promise<MailDraft> {
  return updateDraft(id, { status: 'cancelled' });
}

export async function addAttachment(
  id: string,
  attachment: MailAttachment,
): Promise<MailDraft> {
  const [updated] = await db
    .update(mailDrafts)
    .set({
      attachments: sql`${mailDrafts.attachments} || ${JSON.stringify([attachment])}::jsonb`,
      status: 'drafting',
    })
    .where(eq(mailDrafts.id, id))
    .returning();
  if (!updated) throw new Error(`MailDraft ${id} not found`);
  return updated;
}
