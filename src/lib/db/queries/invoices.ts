import { db } from '@/lib/db';
import {
  invoices,
  type InvoiceLineItem,
  type InvoicePendingItem,
  type InvoiceRecipient,
} from '@/lib/db/schema';
import { todayDDMMYYYY, type InvoiceType } from '@/lib/invoice/types';
import { and, eq, inArray, notInArray, desc, sql } from 'drizzle-orm';
import type { Invoice, NewInvoice } from '@/types';

const ACTIVE_STATUSES = ['collecting', 'preview'] as const;

export async function createDraft(args: {
  chatId: number;
  type?: InvoiceType;
}): Promise<Invoice> {
  const [created] = await db
    .insert(invoices)
    .values({
      number: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: args.type ?? 'rechnung',
      date: '',
      status: 'collecting',
      current_step: args.type === 'angebot' ? 'recipient_name' : 'type',
      telegram_chat_id: args.chatId,
    } as NewInvoice)
    .returning();
  if (!created) throw new Error('Failed to insert invoice');
  return created;
}

export async function getActiveDraft(chatId: number): Promise<Invoice | null> {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.telegram_chat_id, chatId),
        inArray(invoices.status, [...ACTIVE_STATUSES]),
      ),
    )
    .orderBy(desc(invoices.created_at))
    .limit(1);
  return rows[0] ?? null;
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  const rows = await db
    .select()
    .from(invoices)
    .where(eq(invoices.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function updateDraft(
  id: string,
  patch: Partial<NewInvoice>,
): Promise<Invoice> {
  const [updated] = await db
    .update(invoices)
    .set(patch)
    .where(eq(invoices.id, id))
    .returning();
  if (!updated) throw new Error(`Invoice ${id} not found`);
  return updated;
}

export async function cancelActiveDrafts(chatId: number): Promise<number> {
  const rows = await db
    .update(invoices)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(invoices.telegram_chat_id, chatId),
        inArray(invoices.status, [...ACTIVE_STATUSES]),
      ),
    )
    .returning({ id: invoices.id });
  return rows.length;
}

export async function markPreview(id: string): Promise<Invoice> {
  return updateDraft(id, { status: 'preview', current_step: null });
}

export async function markSent(id: string): Promise<Invoice> {
  return updateDraft(id, { status: 'sent', sent_at: new Date() });
}

export async function markCancelled(id: string): Promise<Invoice> {
  return updateDraft(id, { status: 'cancelled' });
}

export async function markDeleted(id: string): Promise<Invoice> {
  return updateDraft(id, { status: 'deleted' });
}

export async function getInvoiceByNumber(
  number: string,
): Promise<Invoice | null> {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.number, number),
        notInArray(invoices.status, ['cancelled', 'deleted']),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function getAngebotByNumber(
  number: string,
): Promise<Invoice | null> {
  const rows = await db
    .select()
    .from(invoices)
    .where(
      and(
        eq(invoices.number, number),
        eq(invoices.type, 'angebot'),
        notInArray(invoices.status, ['cancelled', 'deleted']),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function setRecipient(
  id: string,
  recipient: InvoiceRecipient,
): Promise<Invoice> {
  return updateDraft(id, { recipient });
}

export async function setPendingItem(
  id: string,
  item: InvoicePendingItem | null,
): Promise<Invoice> {
  return updateDraft(id, { pending_item: item });
}

export async function appendItem(
  id: string,
  item: InvoiceLineItem,
): Promise<Invoice> {
  const [updated] = await db
    .update(invoices)
    .set({
      items: sql`${invoices.items} || ${JSON.stringify([item])}::jsonb`,
      pending_item: null,
      total_cents: sql`${invoices.total_cents} + ${item.unitPriceCents * item.quantity}`,
    })
    .where(eq(invoices.id, id))
    .returning();
  if (!updated) throw new Error(`Invoice ${id} not found`);
  return updated;
}

export async function deleteAllInvoices(): Promise<number> {
  const rows = await db
    .update(invoices)
    .set({ status: 'deleted' })
    .returning({ id: invoices.id });
  return rows.length;
}

export async function convertAngebotToInvoice(
  angebotId: string,
  newNumber: string,
): Promise<Invoice> {
  const angebot = await getInvoice(angebotId);
  if (!angebot || angebot.type !== 'angebot') {
    throw new Error('Angebot not found');
  }

  const [invoice] = await db
    .insert(invoices)
    .values({
      number: newNumber,
      type: 'rechnung',
      date: todayDDMMYYYY(),
      recipient: angebot.recipient,
      items: angebot.items,
      total_cents: angebot.total_cents,
      footer_note: angebot.footer_note,
      status: 'collecting',
      current_step: null,
      telegram_chat_id: angebot.telegram_chat_id,
    } as NewInvoice)
    .returning();

  if (!invoice) throw new Error('Failed to create invoice from angebot');

  await db
    .update(invoices)
    .set({ status: 'converted', converted_to_invoice_id: invoice.id })
    .where(eq(invoices.id, angebotId));

  return invoice;
}
