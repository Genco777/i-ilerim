import { db } from '@/lib/db';
import {
  invoices,
  posts,
  incomingMessages,
  kleinanzeigenThreads,
  contentPlans,
  adsCampaigns,
  adsPreferences,
  mailInbox,
} from '@/lib/db/schema';
import { and, eq, gte, lte, sql } from 'drizzle-orm';

export interface WatchdogItem {
  category: string;
  emoji: string;
  message: string;
  count: number;
  urgency: 'high' | 'medium' | 'low';
}

export async function scanAll(): Promise<WatchdogItem[]> {
  const items: WatchdogItem[] = [];
  const now = new Date();

  // 1. New mail since ~30 min ago
  const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
  const [newMail] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mailInbox)
    .where(gte(mailInbox.created_at, thirtyMinAgo));
  if ((newMail?.count ?? 0) > 0) {
    items.push({
      category: 'mail',
      emoji: '📧',
      message: `${newMail!.count} yeni mail var`,
      count: newMail!.count,
      urgency: 'medium',
    } as WatchdogItem);
  }

  // 2. Unpaid invoices (sent > 30 days ago)
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const [unpaid] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.status, 'sent'),
        sql`${invoices.created_at} < ${thirtyDaysAgo.toISOString()}`,
      ),
    );
  if ((unpaid?.count ?? 0) > 0) {
    items.push({
      category: 'payment',
      emoji: '⚠️',
      message: `${unpaid!.count} fatura 30+ gündür ödenmedi`,
      count: unpaid!.count,
      urgency: 'high',
    } as WatchdogItem);
  }

  // 3. Pending Kleinanzeigen threads
  const [kzThreads] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kleinanzeigenThreads)
    .where(
      sql`${kleinanzeigenThreads.status} IN ('new', 'awaiting_action', 'awaiting_custom', 'awaiting_refinement', 'awaiting_gap_info')`,
    );
  if ((kzThreads?.count ?? 0) > 0) {
    items.push({
      category: 'kleinanzeigen',
      emoji: '🏷️',
      message: `${kzThreads!.count} Kleinanzeigen mesajı cevap bekliyor`,
      count: kzThreads!.count,
      urgency: 'high',
    } as WatchdogItem);
  }

  // 4. Unanswered social media messages
  const [socialMsgs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incomingMessages)
    .where(eq(incomingMessages.status, 'new'));
  if ((socialMsgs?.count ?? 0) > 0) {
    items.push({
      category: 'social',
      emoji: '💬',
      message: `${socialMsgs!.count} cevapsız sosyal medya mesajı`,
      count: socialMsgs!.count,
      urgency: 'medium',
    } as WatchdogItem);
  }

  // 5. Posts scheduled for today
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  const [scheduledToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(
      and(
        sql`${posts.status} IN ('draft', 'scheduled')`,
        sql`${posts.scheduled_at} IS NOT NULL`,
        sql`${posts.scheduled_at} >= ${now.toISOString()}`,
        sql`${posts.scheduled_at} <= ${endOfDay.toISOString()}`,
        sql`${posts.published_at} IS NULL`,
      ),
    );
  if ((scheduledToday?.count ?? 0) > 0) {
    items.push({
      category: 'content',
      emoji: '📅',
      message: `${scheduledToday!.count} gönderi bugün yayınlanacak`,
      count: scheduledToday!.count,
      urgency: 'low',
    } as WatchdogItem);
  }

  // 6. Ads budget check
  const [prefs] = await db.select().from(adsPreferences).limit(1);
  const [activeCampaigns] = await db
    .select({
      count: sql<number>`count(*)::int`,
      totalDaily: sql<number>`COALESCE(SUM(${adsCampaigns.daily_budget_cents}), 0)`,
    })
    .from(adsCampaigns)
    .where(eq(adsCampaigns.status, 'enabled'));
  const dailyLimit = prefs?.daily_limit_cents ?? 5000;
  const totalDaily = activeCampaigns?.totalDaily ?? 0;
  if (totalDaily > dailyLimit) {
    items.push({
      category: 'ads',
      emoji: '💰',
      message: `Google Ads günlük bütçe aşımı: ${(totalDaily / 100).toFixed(2)}€ / ${(dailyLimit / 100).toFixed(2)}€`,
      count: activeCampaigns!.count,
      urgency: 'high',
    } as WatchdogItem);
  } else if (totalDaily > dailyLimit * 0.9) {
    items.push({
      category: 'ads',
      emoji: '📊',
      message: `Google Ads bütçesi %90+ dolu: ${(totalDaily / 100).toFixed(2)}€ / ${(dailyLimit / 100).toFixed(2)}€`,
      count: activeCampaigns!.count,
      urgency: 'medium',
    } as WatchdogItem);
  }

  // 7. Weekly content plan status
  const currentWeek = getWeekNumber(now);
  const [plan] = await db
    .select()
    .from(contentPlans)
    .where(
      and(
        eq(contentPlans.calendar_week, currentWeek),
        eq(contentPlans.year, now.getFullYear()),
      ),
    )
    .limit(1);
  if (!plan) {
    items.push({
      category: 'content',
      emoji: '📝',
      message: `Bu hafta (${currentWeek}. hafta) için içerik planı yok`,
      count: 0,
      urgency: 'medium',
    } as WatchdogItem);
  } else if (plan.status === 'draft') {
    items.push({
      category: 'content',
      emoji: '📝',
      message: `Bu haftaki içerik planı hala taslak`,
      count: 0,
      urgency: 'low',
    } as WatchdogItem);
  }

  return items;
}

function getWeekNumber(d: Date): number {
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  const oneWeek = 7 * 24 * 60 * 60 * 1000;
  return Math.ceil(((diff / oneWeek) + start.getDay() + 1) / 7);
}

export function formatWatchdogReport(items: WatchdogItem[]): string {
  if (items.length === 0) return '';

  const high = items.filter((i) => i.urgency === 'high');
  const medium = items.filter((i) => i.urgency === 'medium');
  const low = items.filter((i) => i.urgency === 'low');

  const lines: string[] = [];
  const now = new Date();
  const time = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  lines.push(`🦅 **Watchdog Raporu** — ${time}`);
  lines.push('');

  if (high.length > 0) {
    lines.push('🔴 **ACİL**');
    for (const item of high) {
      lines.push(`${item.emoji} ${item.message}`);
    }
    lines.push('');
  }

  if (medium.length > 0) {
    lines.push('🟡 **DİKKAT**');
    for (const item of medium) {
      lines.push(`${item.emoji} ${item.message}`);
    }
    lines.push('');
  }

  if (low.length > 0) {
    lines.push('🟢 **BİLGİ**');
    for (const item of low) {
      lines.push(`${item.emoji} ${item.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
