import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  invoices,
  posts,
  incomingMessages,
  kleinanzeigenThreads,
  mailInbox,
  emailCampaigns,
  adsCampaigns,
} from '@/lib/db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { sendMessage } from '@/lib/telegram/bot';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 120;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const auth = req.headers.get('authorization') ?? '';
  if (auth === `Bearer ${expected}`) return true;
  if (req.headers.get('x-cron-secret') === expected) return true;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  return false;
}

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

async function gatherDailyStats() {
  const today = new Date();
  const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  // Invoices created today
  const [invoicesToday] = await db
    .select({ count: sql<number>`count(*)::int`, total: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)` })
    .from(invoices)
    .where(and(gte(invoices.created_at, startOfDay), eq(invoices.status, 'sent')));

  // Posts published today
  const [postsToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(and(gte(posts.published_at, startOfDay)));

  // Social messages received today
  const [msgsToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incomingMessages)
    .where(gte(incomingMessages.received_at, startOfDay));

  // Mail received today
  const [mailToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mailInbox)
    .where(gte(mailInbox.received_at, startOfDay));

  // Kleinanzeigen threads created today
  const [kzToday] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(kleinanzeigenThreads)
    .where(gte(kleinanzeigenThreads.created_at, startOfDay));

  // Monthly revenue so far
  const [monthlyRev] = await db
    .select({ total: sql<number>`COALESCE(SUM(${invoices.total_cents}), 0)`, count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(and(gte(invoices.created_at, startOfMonth), eq(invoices.status, 'sent')));

  // Pending items (active angebote, draft posts, unanswered messages)
  const [pendingInvoices] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(invoices)
    .where(sql`${invoices.status} IN ('collecting', 'preview', 'sent')`);
  const [pendingPosts] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(posts)
    .where(eq(posts.status, 'draft'));
  const [pendingMsgs] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(incomingMessages)
    .where(eq(incomingMessages.status, 'new'));

  return {
    invoicesToday: { count: invoicesToday?.count ?? 0, total: invoicesToday?.total ?? 0 },
    postsToday: postsToday?.count ?? 0,
    msgsToday: msgsToday?.count ?? 0,
    mailToday: mailToday?.count ?? 0,
    kzToday: kzToday?.count ?? 0,
    monthlyRevenue: { total: monthlyRev?.total ?? 0, count: monthlyRev?.count ?? 0 },
    pending: {
      invoices: pendingInvoices?.count ?? 0,
      posts: pendingPosts?.count ?? 0,
      messages: pendingMsgs?.count ?? 0,
    },
  };
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  try {
    const stats = await gatherDailyStats();

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

    const statsText = [
      `Bugünün Özeti:`,
      `- ${stats.invoicesToday.count} fatura kesildi (${(stats.invoicesToday.total / 100).toFixed(2)}€)`,
      `- ${stats.postsToday} gönderi yayınlandı`,
      `- ${stats.msgsToday} sosyal medya mesajı alındı`,
      `- ${stats.mailToday} yeni mail`,
      `- ${stats.kzToday} Kleinanzeigen mesajı`,
      ``,
      `Aybaşından beri: ${(stats.monthlyRevenue.total / 100).toFixed(2)}€ (${stats.monthlyRevenue.count} fatura)`,
      ``,
      `Bekleyenler: ${stats.pending.invoices} fatura/angebot, ${stats.pending.posts} taslak gönderi, ${stats.pending.messages} cevapsız mesaj`,
    ].join('\n');

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: [
        {
          type: 'text',
          text: 'Du bist der AI-Assistent von Fly & Froth. Schreibe eine kurze, freundliche Tageszusammenfassung für den Geschäftsinhaber Mehmet auf Deutsch. Stil: WhatsApp-Nachricht, 3-5 Sätze. Fasse die wichtigsten Zahlen zusammen und gib einen kurzen Ausblick für morgen. Keine Emojis im Titel. Maximal 2 Emojis insgesamt.',
        },
      ],
      messages: [
        {
          role: 'user',
          content: `Erstelle eine kurze Tageszusammenfassung:\n\n${statsText}`,
        },
      ],
    });

    const block = response.content[0];
    const report = block?.type === 'text' ? block.text : 'Tagesbericht konnte nicht erstellt werden.';

    const ids = adminUserIds();
    await Promise.all(
      ids.map((chatId) =>
        sendMessage({ chatId, text: report }).catch((err) =>
          console.error(`[eod-report] sendMessage to ${chatId} failed:`, err),
        ),
      ),
    );

    return NextResponse.json({ ok: true, report, stats });
  } catch (err) {
    console.error('[eod-report] error:', err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Report failed' },
      { status: 500 },
    );
  }
}
