import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { publishPost, publishStory } from '@/lib/meta/publisher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
        eq(posts.status, 'draft'),
        lte(posts.scheduled_at, now),
        isNull(posts.published_at),
      ),
    )
    .limit(20);

  for (const post of duePosts) {
    try {
      const isStory = post.channel === 'story' || post.channel === 'reel';
      if (isStory) {
        await publishStory(post.id);
      } else {
        await publishPost(post.id);
      }
      results.push({ id: post.id, status: 'published' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: post.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    timestamp: now.toISOString(),
  });
}
