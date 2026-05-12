import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { and, eq, notInArray, sql } from 'drizzle-orm';

export interface ParsedInvoiceNumber {
  year: number;
  seq: number;
}

const FORMAT = /^(\d{4})-(\d{3})$/;
const INITIAL_SEQ = 50;

export function parseInvoiceNumber(s: string): ParsedInvoiceNumber | null {
  const m = FORMAT.exec(s);
  if (!m || !m[1] || !m[2]) return null;
  return { year: Number(m[1]), seq: Number(m[2]) };
}

function format(year: number, seq: number): string {
  return `${year}-${String(seq).padStart(3, '0')}`;
}

export async function nextInvoiceNumber(): Promise<string> {
  const rows = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(notInArray(invoices.status, ['cancelled', 'deleted']))
    .orderBy(sql`${invoices.number} DESC`);

  const currentYear = new Date().getFullYear();

  if (rows.length === 0) {
    return format(currentYear, INITIAL_SEQ);
  }

  let maxSeqCurrentYear = 0;
  for (const row of rows) {
    const parsed = parseInvoiceNumber(row.number);
    if (!parsed) continue;
    if (parsed.year === currentYear && parsed.seq > maxSeqCurrentYear) {
      maxSeqCurrentYear = parsed.seq;
    }
  }

  if (maxSeqCurrentYear === 0) {
    return format(currentYear, INITIAL_SEQ);
  }
  return format(currentYear, maxSeqCurrentYear + 1);
}

const ANGEBOT_FORMAT = /^(\d{4})-AN-(\d{3})$/;
const ANGEBOT_INITIAL_SEQ = 50;

export function parseAngebotNumber(s: string): ParsedInvoiceNumber | null {
  const m = ANGEBOT_FORMAT.exec(s);
  if (!m || !m[1] || !m[2]) return null;
  return { year: Number(m[1]), seq: Number(m[2]) };
}

function formatAngebot(year: number, seq: number): string {
  return `${year}-AN-${String(seq).padStart(3, '0')}`;
}

export async function nextAngebotNumber(): Promise<string> {
  const rows = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, 'angebot'),
        notInArray(invoices.status, ['cancelled', 'deleted']),
      ),
    )
    .orderBy(sql`${invoices.number} DESC`);

  const currentYear = new Date().getFullYear();

  if (rows.length === 0) {
    return formatAngebot(currentYear, ANGEBOT_INITIAL_SEQ);
  }

  let maxSeqCurrentYear = 0;
  for (const row of rows) {
    const parsed = parseAngebotNumber(row.number);
    if (!parsed) continue;
    if (parsed.year === currentYear && parsed.seq > maxSeqCurrentYear) {
      maxSeqCurrentYear = parsed.seq;
    }
  }

  if (maxSeqCurrentYear === 0) {
    return formatAngebot(currentYear, ANGEBOT_INITIAL_SEQ);
  }
  return formatAngebot(currentYear, maxSeqCurrentYear + 1);
}
