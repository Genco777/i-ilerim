import { db } from '@/lib/db';
import { kleinanzeigenThreads, businessProfileOverrides } from '@/lib/db/schema';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type {
  KleinanzeigenThread,
  NewKleinanzeigenThread,
  BusinessProfileOverride,
} from '@/types';

export interface ConversationTurn {
  buyerMessage: string;
  ourReply: string;
  sentAt: Date;
}

export async function createThread(data: NewKleinanzeigenThread): Promise<KleinanzeigenThread> {
  const [row] = await db.insert(kleinanzeigenThreads).values(data).returning();
  if (!row) throw new Error('Failed to insert kleinanzeigen_threads row');
  return row;
}

export async function getThread(id: string): Promise<KleinanzeigenThread | null> {
  const rows = await db.select().from(kleinanzeigenThreads).where(eq(kleinanzeigenThreads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateThread(
  id: string,
  patch: Partial<NewKleinanzeigenThread>,
): Promise<KleinanzeigenThread> {
  const [row] = await db
    .update(kleinanzeigenThreads)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(kleinanzeigenThreads.id, id))
    .returning();
  if (!row) throw new Error(`Thread ${id} not found`);
  return row;
}

export async function getActiveThreadAwaitingText(chatId: number): Promise<KleinanzeigenThread | null> {
  const rows = await db
    .select()
    .from(kleinanzeigenThreads)
    .where(
      and(
        eq(kleinanzeigenThreads.telegram_chat_id, chatId),
        inArray(kleinanzeigenThreads.status, ['awaiting_custom', 'awaiting_refinement', 'awaiting_gap_info']),
      ),
    )
    .orderBy(desc(kleinanzeigenThreads.updated_at))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveThreadAwaitingImage(chatId: number): Promise<KleinanzeigenThread | null> {
  const rows = await db
    .select()
    .from(kleinanzeigenThreads)
    .where(
      and(
        eq(kleinanzeigenThreads.telegram_chat_id, chatId),
        eq(kleinanzeigenThreads.status, 'awaiting_image'),
      ),
    )
    .orderBy(desc(kleinanzeigenThreads.updated_at))
    .limit(1);
  return rows[0] ?? null;
}

export interface UpsertOverrideInput {
  topic: string;
  kind: 'offered' | 'not_offered' | 'note' | 'tone' | 'signature';
  content: string;
  origin?: string;
}

export async function upsertOverride(data: UpsertOverrideInput): Promise<BusinessProfileOverride> {
  const [row] = await db
    .insert(businessProfileOverrides)
    .values({
      topic: data.topic,
      kind: data.kind,
      content: data.content,
      origin: data.origin ?? 'telegram',
    })
    .onConflictDoUpdate({
      target: [businessProfileOverrides.topic, businessProfileOverrides.kind],
      set: { content: data.content, updated_at: new Date() },
    })
    .returning();
  if (!row) throw new Error('Failed to upsert business_profile_overrides row');
  return row;
}

export async function listOverrides(): Promise<BusinessProfileOverride[]> {
  return db.select().from(businessProfileOverrides).orderBy(desc(businessProfileOverrides.updated_at));
}

export async function deleteOverride(id: string): Promise<void> {
  await db.delete(businessProfileOverrides).where(eq(businessProfileOverrides.id, id));
}

export async function getConversationHistory(
  routingToken: string,
  limit = 10,
): Promise<ConversationTurn[]> {
  const rows = await db
    .select({
      buyerMessage: kleinanzeigenThreads.raw_body,
      ourReply: kleinanzeigenThreads.final_reply,
      sentAt: kleinanzeigenThreads.sent_at,
    })
    .from(kleinanzeigenThreads)
    .where(
      and(
        eq(kleinanzeigenThreads.routing_token, routingToken),
        eq(kleinanzeigenThreads.status, 'sent'),
      ),
    )
    .orderBy(desc(kleinanzeigenThreads.sent_at))
    .limit(limit);

  return rows
    .filter((r) => r.ourReply !== null && r.sentAt !== null)
    .map((r) => ({
      buyerMessage: r.buyerMessage,
      ourReply: r.ourReply as string,
      sentAt: r.sentAt as Date,
    }))
    .reverse();
}
