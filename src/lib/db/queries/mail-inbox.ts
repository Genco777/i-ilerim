import { db } from '@/lib/db';
import { mailInbox } from '@/lib/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import type { MailInbox, NewMailInbox } from '@/types';

export async function getLastSeenUid(): Promise<number | null> {
  const rows = await db
    .select({ max: sql<number | null>`max(${mailInbox.uid})` })
    .from(mailInbox);
  const row = rows[0];
  if (!row || row.max === null || row.max === undefined) return null;
  return Number(row.max);
}

export async function getCurrentMaxUid(): Promise<number | null> {
  return getLastSeenUid();
}

export async function insertInboxMessage(
  data: NewMailInbox,
): Promise<MailInbox> {
  const [row] = await db.insert(mailInbox).values(data).returning();
  if (!row) throw new Error('Failed to insert mail_inbox row');
  return row;
}

export async function getInboxById(id: string): Promise<MailInbox | null> {
  const rows = await db
    .select()
    .from(mailInbox)
    .where(eq(mailInbox.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getInboxByUid(uid: number): Promise<MailInbox | null> {
  const rows = await db
    .select()
    .from(mailInbox)
    .where(eq(mailInbox.uid, uid))
    .limit(1);
  return rows[0] ?? null;
}

export async function getRecentInbox(limit = 10): Promise<MailInbox[]> {
  return db
    .select()
    .from(mailInbox)
    .orderBy(desc(mailInbox.received_at))
    .limit(limit);
}

export async function setRepliedDraftId(
  inboxId: string,
  draftId: string,
): Promise<void> {
  await db
    .update(mailInbox)
    .set({ replied_draft_id: draftId })
    .where(eq(mailInbox.id, inboxId));
}
