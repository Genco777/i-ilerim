/**
 * Admin: Regenerate mockups for products with empty mockup_image_urls.
 *
 * Usage:
 *   GET /api/admin/regen-mockups?secret=<CRON_SECRET>&limit=10
 *   GET /api/admin/regen-mockups?secret=...&slug=<slug>           (single)
 *   GET /api/admin/regen-mockups?secret=...&productId=<uuid>      (single)
 *
 * Pulls product, runs composeMockupsForHero against the existing
 * hero_image_url, writes new mockup_image_urls to DB. Does NOT re-publish
 * to Etsy (run /api/admin/republish-all separately for that).
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, eq, isNotNull, isNull, sql, desc } from 'drizzle-orm';
import { composeMockupsForHero } from '@/lib/trend/visual';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 800;

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === expected;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return new NextResponse('Unauthorized', { status: 401 });

  const url = new URL(req.url);
  const limit = url.searchParams.get('limit')
    ? Math.max(1, Math.min(20, Number(url.searchParams.get('limit'))))
    : 5;
  const slug = url.searchParams.get('slug');
  const productId = url.searchParams.get('productId');

  // Build query: single product or bulk (missing-mockups, approved)
  let candidates;
  if (slug || productId) {
    candidates = await db
      .select()
      .from(products)
      .where(slug ? eq(products.slug, slug) : eq(products.id, productId!))
      .limit(1);
  } else {
    // Bulk: approved products with empty mockup_image_urls
    candidates = await db
      .select()
      .from(products)
      .where(
        and(
          isNotNull(products.approved_at),
          isNotNull(products.hero_image_url),
          // empty array check
          sql`coalesce(array_length(${products.mockup_image_urls}, 1), 0) = 0`,
        ),
      )
      .orderBy(desc(products.approved_at))
      .limit(limit);
  }

  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, message: 'No products need mockup regen.' });
  }

  const results: Array<{
    productId: string;
    slug: string | null;
    status: 'ok' | 'partial' | 'error';
    mockupCount: number;
    error?: string;
  }> = [];

  for (const product of candidates) {
    const result: (typeof results)[number] = {
      productId: product.id,
      slug: product.slug,
      status: 'ok',
      mockupCount: 0,
    };

    try {
      if (!product.hero_image_url) {
        result.status = 'error';
        result.error = 'no hero_image_url';
        results.push(result);
        continue;
      }

      // Re-fetch hero buffer from Blob (composeMockupsForHero needs Buffer)
      const heroRes = await fetch(product.hero_image_url);
      if (!heroRes.ok) throw new Error(`hero fetch ${heroRes.status}`);
      const heroBuffer = Buffer.from(await heroRes.arrayBuffer());

      const mockResult = await composeMockupsForHero(
        heroBuffer,
        product.type as 'planner' | 'poster' | 'sticker' | 'template' | 'social_template',
        product.id,
        product.hero_image_url,
      );

      result.mockupCount = mockResult.mockupUrls.length;
      result.status = mockResult.mockupUrls.length >= 3 ? 'ok' : mockResult.mockupUrls.length > 0 ? 'partial' : 'error';

      if (mockResult.mockupUrls.length > 0) {
        await db
          .update(products)
          .set({
            mockup_image_urls: mockResult.mockupUrls,
            updated_at: new Date(),
          })
          .where(eq(products.id, product.id));
      }
    } catch (err) {
      result.status = 'error';
      result.error = err instanceof Error ? err.message.slice(0, 200) : String(err);
    }

    results.push(result);
  }

  void isNull; // silence unused

  return NextResponse.json({
    ok: true,
    considered: candidates.length,
    processed: results.length,
    success: results.filter((r) => r.status === 'ok').length,
    partial: results.filter((r) => r.status === 'partial').length,
    errors: results.filter((r) => r.status === 'error').length,
    totalMockups: results.reduce((s, r) => s + r.mockupCount, 0),
    results,
  });
}
