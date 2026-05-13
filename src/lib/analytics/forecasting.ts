import { db } from '@/lib/db';
import { invoices } from '@/lib/db/schema';
import { eq, gte, and, sql } from 'drizzle-orm';

export interface RevenueForecast {
  conservative: number; // worst case
  expected: number; // expected
  optimistic: number; // best case
  confidence: number; // 0-1
  drivers: string[];
  risks: string[];
  monthlyTrend: Array<{ month: string; revenue: number; invoices: number }>;
}

export interface ServiceProfitability {
  category: string;
  invoiceCount: number;
  totalRevenue: number;
  avgInvoice: number;
  pctOfTotal: number;
}

export interface CustomerSegment {
  segment: 'VIP' | 'Regular' | 'One-shot' | 'At-risk';
  count: number;
  totalRevenue: number;
  avgRevenue: number;
}

export async function forecastMonthlyRevenue(): Promise<RevenueForecast> {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Current month revenue so far
  const [currentMonth] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(invoices)
    .where(
      and(
        gte(invoices.created_at, startOfMonth),
        eq(invoices.status, 'sent'),
      ),
    );

  // Pending work (collecting + preview)
  const [pending] = await db
    .select({
      total: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)`,
      count: sql<number>`count(*)::int`,
    })
    .from(invoices)
    .where(
      sql`${invoices.status} IN ('collecting', 'preview', 'sent')`,
    );

  // Previous 6 months for trend
  const monthlyData: Array<{ month: string; revenue: number; invoices: number }> = [];
  for (let i = 0; i < 6; i++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const [data] = await db
      .select({
        revenue: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)`,
        count: sql<number>`count(*)::int`,
      })
      .from(invoices)
      .where(
        and(
          gte(invoices.created_at, monthStart),
          sql`${invoices.created_at} < ${monthEnd.toISOString()}`,
          eq(invoices.status, 'sent'),
        ),
      );
    monthlyData.push({
      month: monthStart.toLocaleDateString('de-DE', { month: 'short', year: 'numeric' }),
      revenue: data?.revenue ?? 0,
      invoices: data?.count ?? 0,
    });
  }

  // Calculate averages
  const last3Months = monthlyData.slice(0, 3);
  const avgRevenue = last3Months.reduce((s, m) => s + m.revenue, 0) / Math.max(1, last3Months.length);
  const currentSoFar = currentMonth?.total ?? 0;
  const pendingCash = pending?.total ?? 0;

  // Forecast: current + pending + expected from trend
  const expected = Math.round(currentSoFar + pendingCash * 0.5 + avgRevenue * 0.3);
  const conservative = Math.round(currentSoFar + pendingCash * 0.3);
  const optimistic = Math.round(currentSoFar + pendingCash * 0.8 + avgRevenue * 0.5);

  const confidence = last3Months.length >= 2 ? 0.7 : 0.5;

  const drivers: string[] = [];
  if ((pending?.count ?? 0) > 0) {
    drivers.push(`${pending!.count} aktif iş bekliyor (${((pending!.total ?? 0) / 100).toFixed(0)}€)`);
  }
  const prevMonthRev = monthlyData[1]?.revenue ?? 0;
  if (prevMonthRev > 0 && currentSoFar > prevMonthRev * 0.8) {
    drivers.push('Geçen aya göre iyi gidiyor');
  }

  const risks: string[] = [];
  const overdue = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'sent'),
        sql`${invoices.created_at} < now() - interval '30 days'`,
      ),
    );
  if ((overdue[0]?.count ?? 0) > 0) {
    risks.push(`${overdue[0]!.count} fatura 30+ gündür ödenmedi`);
  }

  return {
    conservative,
    expected,
    optimistic,
    confidence,
    drivers,
    risks,
    monthlyTrend: monthlyData.reverse(),
  };
}

export async function analyzeServiceProfitability(): Promise<ServiceProfitability[]> {
  // Group by service type based on invoice items
  const rows = await db
    .select({
      category: sql<string>`COALESCE(invoice_type, 'other')`,
      count: sql<number>`count(*)::int`,
      total: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.status, 'sent'))
    .groupBy(sql`invoice_type`)
    .orderBy(sql`total DESC`);

  const grandTotal = rows.reduce((sum, r) => sum + r.total, 0);

  const categoryLabels: Record<string, string> = {
    rechnung: 'Logo Tasarımı',
    angebot: 'Angebot (teklif)',
    teilrechnung: 'Web Tasarımı',
    schlussrechnung: 'Kurumsal Kimlik',
  };

  return rows.map((r) => ({
    category: categoryLabels[r.category] ?? r.category,
    invoiceCount: r.count,
    totalRevenue: r.total,
    avgInvoice: Math.round(r.total / Math.max(1, r.count)),
    pctOfTotal: grandTotal > 0 ? Math.round((r.total / grandTotal) * 100) : 0,
  }));
}

export async function segmentCustomers(): Promise<CustomerSegment[]> {
  const rows = await db
    .select({
      name: sql<string>`recipient->>'name'`.as('name'),
      count: sql<number>`count(*)::int`,
      total: sql<number>`COALESCE(SUM(CASE WHEN status = 'sent' THEN total_cents ELSE 0 END), 0)`,
      lastInvoice: sql<Date>`MAX(created_at)`.as('last_invoice'),
    })
    .from(invoices)
    .where(sql`recipient->>'name' IS NOT NULL`)
    .groupBy(sql`recipient->>'name'`)
    .having(sql`count(*) > 0`);

  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

  const segments: Record<string, { count: number; totalRevenue: number }> = {
    VIP: { count: 0, totalRevenue: 0 },
    Regular: { count: 0, totalRevenue: 0 },
    'One-shot': { count: 0, totalRevenue: 0 },
    'At-risk': { count: 0, totalRevenue: 0 },
  };

  const vip = segments.VIP!;
  const regular = segments.Regular!;
  const oneShot = segments['One-shot']!;
  const atRisk = segments['At-risk']!;

  for (const r of rows) {
    const lastDate = r.lastInvoice ? new Date(r.lastInvoice) : new Date();
    if (r.count >= 3 && lastDate > sixMonthsAgo) {
      vip.count++;
      vip.totalRevenue += r.total;
    } else if (r.count >= 2) {
      regular.count++;
      regular.totalRevenue += r.total;
    } else if (r.count === 1 && lastDate < sixMonthsAgo) {
      atRisk.count++;
      atRisk.totalRevenue += r.total;
    } else {
      oneShot.count++;
      oneShot.totalRevenue += r.total;
    }
  }

  return Object.entries(segments)
    .filter(([, s]) => s.count > 0)
    .map(([segment, s]) => ({
      segment: segment as CustomerSegment['segment'],
      count: s.count,
      totalRevenue: s.totalRevenue,
      avgRevenue: Math.round(s.totalRevenue / s.count),
    }));
}
