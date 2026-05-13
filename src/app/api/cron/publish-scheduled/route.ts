import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, and, or, lte, isNull } from 'drizzle-orm';
import { publishPost, publishStory } from '@/lib/meta/publisher';
import { sendMessage } from '@/lib/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const results: { id: string; status: string; error?: string }[] = [];

  const duePosts = await db
    .select()
    .from(posts)
    .where(
      and(
        or(eq(posts.status, 'draft'), eq(posts.status, 'scheduled')),
        lte(posts.scheduled_at, now),
        isNull(posts.published_at),
      ),
    )
    .limit(20);

  let fullOk = 0;
  let partialOk = 0;
  let failed = 0;

  for (const post of duePosts) {
    try {
      const isStory = post.channel === 'story' || post.channel === 'reel';
      const result = isStory
        ? await publishStory(post.id)
        : await publishPost(post.id);

      if (result.fbError || result.igError) {
        partialOk++;
        results.push({
          id: post.id,
          status: 'partial',
          error: [result.fbError, result.igError].filter(Boolean).join(' | '),
        });
      } else {
        fullOk++;
        results.push({ id: post.id, status: 'published' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: post.id, status: 'failed', error: msg });
      failed++;
    }
  }

  // Telegram bildirimi
  if (fullOk > 0 || partialOk > 0 || failed > 0) {
    const lines = ['📤 Yayınlama raporu'];
    if (fullOk > 0) lines.push(`✅ ${fullOk} tam yayınlandı (FB + IG)`);
    if (partialOk > 0) lines.push(`⚠️ ${partialOk} kısmi (tek platform)`);
    if (failed > 0) {
      lines.push(`❌ ${failed} başarısız`);
      const failedList = results.filter((r) => r.status === 'failed');
      for (const f of failedList.slice(0, 3)) {
        lines.push(`  - ${f.id.slice(0, 8)}: ${(f.error ?? '').slice(0, 100)}`);
      }
    }
    const text = lines.join('\n');
    const ids = adminUserIds();
    await Promise.all(
      ids.map((chatId) =>
        sendMessage({ chatId, text }).catch((err) =>
          console.error('[publish-scheduled] Telegram notify failed:', err),
        ),
      ),
    );
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    published: fullOk + partialOk,
    fullOk,
    partialOk,
    timestamp: now.toISOString(),
  });
}
