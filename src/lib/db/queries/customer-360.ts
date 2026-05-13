import { db } from '@/lib/db';
import { invoices, incomingMessages, kleinanzeigenThreads, mailInbox } from '@/lib/db/schema';
import { eq, or, sql } from 'drizzle-orm';

export interface Customer360 {
  identifier: string; // email or name
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  street: string | null;
  zipCity: string | null;
  source: string | null; // 'kleinanzeigen', 'instagram', 'facebook', 'email', 'referral'
  invoices: InvoiceSummary[];
  totalRevenue: number;
  invoiceCount: number;
  firstContact: string | null;
  lastContact: string | null;
  interactions: InteractionSummary[];
  status: 'active' | 'occasional' | 'one_time' | 'at_risk';
}

export interface InvoiceSummary {
  id: string;
  number: string;
  type: string;
  status: string;
  totalCents: number;
  date: string;
}

export interface InteractionSummary {
  type: 'social_message' | 'kleinanzeigen' | 'email' | 'invoice';
  date: string;
  details: string;
}

export async function getCustomer360(identifier: string): Promise<Customer360 | null> {
  // Try to find customer by email or name
  const [matchedInvoice] = await db
    .select({
      name: sql<string>`recipient->>'name'`.as('name'),
      email: sql<string>`recipient->>'email'`.as('email'),
      company: sql<string>`recipient->>'company'`.as('company'),
      street: sql<string>`recipient->>'street'`.as('street'),
      zipCity: sql<string>`recipient->>'zipCity'`.as('zipCity'),
      phone: sql<string>`recipient->>'phone'`.as('phone'),
    })
    .from(invoices)
    .where(
      or(
        sql`recipient->>'email' = ${identifier}`,
        sql`recipient->>'name' ILIKE ${`%${identifier}%`}`,
      ),
    )
    .limit(1);

  if (!matchedInvoice) return null;

  // All invoices by this customer
  const customerInvoices = await db
    .select()
    .from(invoices)
    .where(
      or(
        sql`recipient->>'email' = ${matchedInvoice.email}`,
        sql`recipient->>'name' = ${matchedInvoice.name}`,
      ),
    )
    .orderBy(sql`created_at DESC`);

  const totalRevenue = customerInvoices
    .filter((i) => i.status === 'sent')
    .reduce((sum, i) => sum + (i.total_cents ?? 0), 0);

  const firstDate = customerInvoices[customerInvoices.length - 1]?.created_at;
  const lastDate = customerInvoices[0]?.created_at;

  // Interactions through social messages
  const socialMessages = await db
    .select()
    .from(incomingMessages)
    .where(
      or(
        sql`${incomingMessages.sender_name} ILIKE ${`%${matchedInvoice.name}%`}`,
      ),
    )
    .orderBy(sql`received_at DESC`)
    .limit(20);

  // Interactions through Kleinanzeigen
  const kzThreads = await db
    .select()
    .from(kleinanzeigenThreads)
    .where(
      or(
        sql`${kleinanzeigenThreads.buyer_name} ILIKE ${`%${matchedInvoice.name}%`}`,
      ),
    )
    .orderBy(sql`created_at DESC`)
    .limit(10);

  // Determine customer status
  let status: Customer360['status'] = 'one_time';
  if (customerInvoices.length >= 3) {
    const lastInvoice = customerInvoices[0];
    const lastDate = lastInvoice?.created_at ? new Date(lastInvoice.created_at) : new Date();
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

    if (lastDate > sixMonthsAgo) {
      status = 'active';
    } else {
      status = 'at_risk';
    }
  } else if (customerInvoices.length === 2) {
    status = 'occasional';
  }

  // Determine source
  let source: string | null = null;
  if (kzThreads.length > 0) source = 'kleinanzeigen';
  else if (socialMessages.length > 0) source = socialMessages[0]?.platform ?? 'social';
  else source = 'email';

  const interactions: InteractionSummary[] = [
    ...socialMessages.map((m) => ({
      type: 'social_message' as const,
      date: (m.received_at ?? new Date()).toISOString(),
      details: `${m.platform}: ${(m.message_text ?? '').slice(0, 100)}`,
    })),
    ...kzThreads.map((t) => ({
      type: 'kleinanzeigen' as const,
      date: (t.created_at ?? new Date()).toISOString(),
      details: `${t.listing_title ?? 'İlan'}: ${t.status}`,
    })),
    ...customerInvoices.slice(0, 5).map((i) => ({
      type: 'invoice' as const,
      date: (i.created_at ?? new Date()).toISOString(),
      details: `${i.number ?? ''} — ${i.status} (${((i.total_cents ?? 0) / 100).toFixed(2)}€)`,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    identifier,
    name: matchedInvoice.name,
    company: matchedInvoice.company,
    email: matchedInvoice.email,
    phone: matchedInvoice.phone,
    street: matchedInvoice.street,
    zipCity: matchedInvoice.zipCity,
    source,
    invoices: customerInvoices.map((i) => ({
      id: i.id,
      number: i.number ?? '',
      type: i.type ?? 'rechnung',
      status: i.status ?? 'unknown',
      totalCents: i.total_cents ?? 0,
      date: (i.created_at ?? new Date()).toISOString(),
    })),
    totalRevenue,
    invoiceCount: customerInvoices.length,
    firstContact: firstDate?.toISOString() ?? null,
    lastContact: lastDate?.toISOString() ?? null,
    interactions,
    status,
  };
}

export async function listCustomers360(filter?: {
  status?: string;
  minRevenue?: number;
}): Promise<Pick<Customer360, 'name' | 'email' | 'company' | 'totalRevenue' | 'invoiceCount' | 'status' | 'lastContact'>[]> {
  const rows = await db
    .select({
      name: sql<string>`recipient->>'name'`.as('name'),
      email: sql<string>`recipient->>'email'`.as('email'),
      company: sql<string>`recipient->>'company'`.as('company'),
      totalRevenue: sql<number>`COALESCE(SUM(CASE WHEN status = 'sent' THEN total_cents ELSE 0 END), 0)`.as('total_revenue'),
      invoiceCount: sql<number>`count(*)::int`.as('invoice_count'),
      lastInvoice: sql<Date>`MAX(created_at)`.as('last_invoice'),
    })
    .from(invoices)
    .where(sql`recipient->>'name' IS NOT NULL`)
    .groupBy(
      sql`recipient->>'name'`,
      sql`recipient->>'email'`,
      sql`recipient->>'company'`,
    )
    .orderBy(sql`total_revenue DESC`);

  let filtered = rows.map((r) => {
    const lastDate = r.lastInvoice ? new Date(r.lastInvoice) : new Date();
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    let status: Customer360['status'] = 'one_time';
    if (r.invoiceCount >= 3 && lastDate > sixMonthsAgo) status = 'active';
    else if (r.invoiceCount >= 3) status = 'at_risk';
    else if (r.invoiceCount === 2) status = 'occasional';

    return {
      name: r.name,
      email: r.email,
      company: r.company,
      totalRevenue: r.totalRevenue,
      invoiceCount: r.invoiceCount,
      status,
      lastContact: (r.lastInvoice ?? new Date()).toISOString(),
    };
  });

  if (filter?.status) {
    filtered = filtered.filter((c) => c.status === filter.status);
  }
  if (filter?.minRevenue) {
    filtered = filtered.filter((c) => c.totalRevenue >= filter.minRevenue!);
  }

  return filtered;
}
