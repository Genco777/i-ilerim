import { db } from '@/lib/db';
import { incomingMessages } from '@/lib/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import type { IncomingMessage, NewIncomingMessage } from '@/types';

/**
 * Insert an incoming message. Returns null if external_id already exists
 * (ON CONFLICT DO NOTHING) — used by the polling cron for idempotency.
 */
export async function insertIncomingIfNew(
  data: NewIncomingMessage,
): Promise<IncomingMessage | null> {
  const rows = await db
    .insert(incomingMessages)
    .values(data)
    .onConflictDoNothing({ target: incomingMessages.external_id })
    .returning();
  return rows[0] ?? null;
}

export async function getIncomingMessage(
  id: string,
): Promise<IncomingMessage | null> {
  const rows = await db
    .select()
    .from(incomingMessages)
    .where(eq(incomingMessages.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateIncomingMessage(
  id: string,
  patch: Partial<NewIncomingMessage>,
): Promise<IncomingMessage> {
  const [updated] = await db
    .update(incomingMessages)
    .set(patch)
    .where(eq(incomingMessages.id, id))
    .returning();
  if (!updated) throw new Error(`IncomingMessage ${id} not found`);
  return updated;
}

export async function listIncomingMessages(opts?: {
  status?: 'new' | 'drafting' | 'awaiting_approval' | 'replied' | 'ignored' | 'failed';
  limit?: number;
}): Promise<IncomingMessage[]> {
  const limit = opts?.limit ?? 50;
  if (opts?.status) {
    return db
      .select()
      .from(incomingMessages)
      .where(eq(incomingMessages.status, opts.status))
      .orderBy(desc(incomingMessages.received_at))
      .limit(limit);
  }
  return db
    .select()
    .from(incomingMessages)
    .orderBy(desc(incomingMessages.received_at))
    .limit(limit);
}

/**
 * Find the most-recent received_at watermark, used by polling
 * to short-circuit if API returns nothing newer.
 */
export async function latestReceivedAt(
  platform: 'fb_comment' | 'fb_dm' | 'ig_comment' | 'ig_dm' | 'wa_message',
): Promise<Date | null> {
  const rows = await db
    .select({ received_at: incomingMessages.received_at })
    .from(incomingMessages)
    .where(eq(incomingMessages.platform, platform))
    .orderBy(desc(incomingMessages.received_at))
    .limit(1);
  return rows[0]?.received_at ?? null;
}

// Suppress unused-import warning while keeping helpers available.
void and;
void sql;
