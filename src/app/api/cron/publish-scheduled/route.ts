import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, and, or, lte, isNull } from 'drizzle-orm';
import { publishPost, publishStory } from '@/lib/meta/publisher';
import { sendMessage } from '@/lib/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

  let publishedCount = 0;
  let failedCount = 0;

  for (const post of duePosts) {
    try {
      const isStory = post.channel === 'story' || post.channel === 'reel';
      if (isStory) {
        await publishStory(post.id);
      } else {
        await publishPost(post.id);
      }
      results.push({ id: post.id, status: 'published' });
      publishedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: post.id, status: 'failed', error: msg });
      failedCount++;
    }
  }

  // Telegram bildirimi
  if (publishedCount > 0 || failedCount > 0) {
    const lines = ['📤 Yayınlama raporu'];
    if (publishedCount > 0) {
      lines.push(`✅ ${publishedCount} post yayınlandı`);
    }
    if (failedCount > 0) {
      lines.push(`❌ ${failedCount} başarısız`);
      const failed = results.filter((r) => r.status === 'failed');
      for (const f of failed.slice(0, 3)) {
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
    published: publishedCount,
    failed: failedCount,
    timestamp: now.toISOString(),
  });
}
