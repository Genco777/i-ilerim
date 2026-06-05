/**
 * Admin: List approved products with missing/null digital_file_url.
 *
 * Quick diagnostic — shows which products got approved but never had PDF
 * persisted (cron timeout or PDF gen failure). Combine with /api/admin/regen-pdf
 * (or republish-all) to fix them.
 *
 * Usage:
 *   GET /api/admin/missing-pdfs?secret=<CRON_SECRET>
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { and, isNotNull, isNull, desc } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(req.url);
  return url.searchParams.get('secret') === expected;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return new NextResponse('Unauthorized', { status: 401 });

  const rows = await db
    .select({
      id: products.id,
      slug: products.slug,
      shop_title: products.shop_title,
      etsy_title: products.etsy_title,
      type: products.type,
      hero_image_url: products.hero_image_url,
      digital_file_url: products.digital_file_url,
      approved_at: products.approved_at,
      created_at: products.created_at,
    })
    .from(products)
    .where(
      and(
        isNotNull(products.approved_at),
        isNull(products.digital_file_url),
      ),
    )
    .orderBy(desc(products.approved_at))
    .limit(50);

  return NextResponse.json({
    ok: true,
    count: rows.length,
    products: rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      title: p.shop_title || p.etsy_title,
      type: p.type,
      hasCover: !!p.hero_image_url,
      approved_at: p.approved_at,
      created_at: p.created_at,
    })),
  });
}
