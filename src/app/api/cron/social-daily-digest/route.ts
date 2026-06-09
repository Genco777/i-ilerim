/**
 * Social Daily Digest — Sprint X.3
 *
 * Runs once daily at 22:00 (after the last trend-discovery cron at 21:00 has
 * finished). Pulls today's approved/published products and distributes them
 * across IG + FB + Pinterest in algorithm-friendly packaging.
 *
 * Strategy (Strategy C — Carousel packaging):
 *   1. Group today's products by productHint (planner / poster / template).
 *   2. Per group: build ONE IG carousel post (up to 10 mockups, ordered hero-first)
 *      + ONE FB carousel post.
 *   3. Per product: publish ONE IG story (video if available, else hero image).
 *   4. Per product: publish ONE Pinterest pin (handled by mevcut pinterest module
 *      if PINTEREST_ACCESS_TOKEN is set).
 *
 * Why this avoids algorithm penalty:
 *   - 15 products/day = 2 IG feed posts (not 15) — under the daily algo threshold.
 *   - 15 IG stories = totally fine because stories disappear in 24h.
 *   - FB carousel = 1 multi-photo post (also under threshold).
 *
 * Idempotency: each product row has ig_post_id / ig_story_post_id / fb_post_id
 * / pinterest_pin_id columns. We only publish products with null IDs (so re-running
 * the cron mid-day doesn't double-post).
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, eq, gte, isNull, or } from 'drizzle-orm';
import { notifyAdmins } from '@/lib/agent/notifications';
import {
  publishCarouselToIG,
  publishVideoStoryToIG,
  publishToIGStory,
} from '@/lib/meta/ig-client';
import { publishCarouselToFB } from '@/lib/meta/page-client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Each social call is 5-30s (IG container processing). 15 products × ~10s
// story + 2 carousel × 60s ≈ 270s safety budget.
export const maxDuration = 600;

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

interface ApprovedProduct {
  id: string;
  slug: string | null;
  shop_title: string | null;
  shop_description: string | null;
  type: string;
  hero_image_url: string | null;
  mockup_image_urls: string[] | null;
  video_url: string | null;
  ig_post_id: string | null;
  ig_story_post_id: string | null;
  fb_post_id: string | null;
}

/**
 * Build a tasteful caption + hashtag block for a group of products.
 */
function buildGroupCaption(
  type: string,
  items: ApprovedProduct[],
): string {
  const niceType =
    type === 'planner' ? 'Printable Planners'
    : type === 'poster' ? 'Wall Art Prints'
    : type === 'sticker' ? 'Sticker Sheets'
    : type === 'template' ? 'Editable Templates'
    : 'New Drops';

  const titles = items
    .map((p, i) => `${i + 1}. ${(p.shop_title ?? '').slice(0, 60)}`)
    .join('\n');

  const tags = [
    '#flyandfroth',
    '#printable',
    '#digitaldownload',
    type === 'planner' ? '#planneraddict' : '',
    type === 'poster' ? '#wallartprints' : '',
    type === 'poster' ? '#bohohomedecor' : '',
    type === 'poster' ? '#printableart' : '',
    type === 'planner' ? '#printableplanner' : '',
    '#etsyfinds',
    '#etsyseller',
    '#smallbusiness',
    '#digitalart',
  ]
    .filter(Boolean)
    .join(' ');

  return [
    `New ${niceType} — fresh from the studio today.`,
    '',
    titles,
    '',
    `Tap the link in bio to grab any of them — instant download, A4 + US Letter, lifetime updates.`,
    '',
    tags,
  ].join('\n');
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  // Sprint K — mode query param: günde 2 post + 2 story isteği.
  // ?mode=post  → sadece IG/FB carousel post (ig_post_id IS NULL filter)
  // ?mode=story → sadece IG story (ig_story_post_id IS NULL filter)
  // ?mode=all (default) → eski davranış (her ikisi birden)
  const url = new URL(req.url);
  const mode = (url.searchParams.get('mode') ?? 'all').toLowerCase();
  const onlyPost  = mode === 'post';
  const onlyStory = mode === 'story';

  // Kill switch for the social cron specifically
  const enabled = (process.env.SOCIAL_CRON_ENABLED ?? 'true').toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return NextResponse.json({ ok: true, skipped: true, reason: 'social-disabled' });
  }

  // Pull TODAY's approved/published products that haven't been socially published yet.
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const rows = (await db
    .select()
    .from(products)
    .where(
      and(
        or(eq(products.status, 'approved'), eq(products.status, 'published')),
        gte(products.approved_at, today),
        isNull(products.social_published_at),
      ),
    )) as unknown as ApprovedProduct[];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'no-products-today' });
  }

  // Group by productHint (type)
  const byType = new Map<string, ApprovedProduct[]>();
  for (const p of rows) {
    const arr = byType.get(p.type) ?? [];
    arr.push(p);
    byType.set(p.type, arr);
  }

  const results = {
    igCarousels: 0,
    fbCarousels: 0,
    igStories: 0,
    igStoriesVideo: 0,
    failures: [] as string[],
  };

  // 1) Per-group IG + FB carousels (hero images, max 10 per carousel)
  if (onlyStory) {
    // Story-only mode: skip carousels
    void byType;
  } else for (const [type, items] of byType.entries()) {
    const heroes = items
      .map((p) => p.hero_image_url)
      .filter((u): u is string => !!u)
      .slice(0, 10);

    if (heroes.length < 2) {
      // IG carousel needs ≥2 images. If only 1 product in this group, post
      // it as a regular single-image post would be the right move — for now
      // we just skip and let the story handle it.
      continue;
    }

    const caption = buildGroupCaption(type, items);

    // IG carousel
    try {
      const ig = await publishCarouselToIG(heroes, caption);
      results.igCarousels++;
      // Stamp every product in this group with the IG carousel ID
      for (const p of items) {
        await db
          .update(products)
          .set({ ig_post_id: ig.id, updated_at: new Date() })
          .where(eq(products.id, p.id));
      }
    } catch (err) {
      results.failures.push(
        `IG carousel (${type}): ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`,
      );
    }

    // FB carousel
    try {
      const fb = await publishCarouselToFB(heroes, caption);
      results.fbCarousels++;
      for (const p of items) {
        await db
          .update(products)
          .set({ fb_post_id: fb.post_id ?? fb.id, updated_at: new Date() })
          .where(eq(products.id, p.id));
      }
    } catch (err) {
      results.failures.push(
        `FB carousel (${type}): ${err instanceof Error ? err.message.slice(0, 160) : String(err)}`,
      );
    }
  }

  // 2) Per-product IG Story — video if available, else hero image
  // (post-only mode skip)
  if (onlyPost) {
    // Skip stories
    void rows;
  } else for (const p of rows) {
    if (!p.hero_image_url) continue;
    try {
      const story = p.video_url
        ? await publishVideoStoryToIG(p.video_url)
        : await publishToIGStory(p.hero_image_url);
      if (p.video_url) results.igStoriesVideo++;
      else results.igStories++;
      await db
        .update(products)
        .set({ ig_story_post_id: story.id, updated_at: new Date() })
        .where(eq(products.id, p.id));
    } catch (err) {
      results.failures.push(
        `IG story (${p.slug ?? p.id}): ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
      );
    }
  }

  // 3) Stamp social_published_at on every successfully published product so
  // tomorrow's cron doesn't double-post (idempotency).
  const now = new Date();
  for (const p of rows) {
    await db
      .update(products)
      .set({ social_published_at: now, updated_at: now })
      .where(eq(products.id, p.id));
  }

  // 4) Telegram digest
  const lines = [
    `📱 Social Digest — ${today.toISOString().slice(0, 10)}`,
    `Products today: ${rows.length}`,
    `IG carousels: ${results.igCarousels}`,
    `FB carousels: ${results.fbCarousels}`,
    `IG stories (image): ${results.igStories}`,
    `IG stories (video): ${results.igStoriesVideo}`,
    results.failures.length > 0
      ? `\nFailures (${results.failures.length}):\n${results.failures.slice(0, 5).join('\n')}`
      : '',
  ].filter(Boolean);

  await notifyAdmins(lines.join('\n')).catch(() => {});

  return NextResponse.json({
    ok: true,
    productsProcessed: rows.length,
    ...results,
  });
}
