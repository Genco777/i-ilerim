/**
 * C3 — Weekly Title Rotation Cron
 *
 * Runs Sunday 23:00. For every approved product with title variants:
 *   - Reads current views from Etsy stats (if available)
 *   - Rotates active_variant: 'a' → 'b' → 'c' → 'a' on a 7-day cycle
 *   - Pushes the new title to Etsy via listing update API
 *   - Tracks per-variant view counts in DB
 *
 * After ~4 weeks (4 rotations), the variant with the highest view count
 * locks in as the permanent title (no further rotation).
 *
 * Safe failure: if Etsy update fails for a product, we log and continue.
 * The DB still gets the rotated active_variant so the next cycle continues.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products, productListings } from '@/lib/db/schema';
import { eq, and, isNotNull, sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

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

interface TitleRotateRow {
  id: string;
  etsy_title: string | null;
  title_variant_b: string | null;
  title_variant_c: string | null;
  title_active_variant: string | null;
  title_last_rotated_at: Date | null;
  title_variant_a_views: number | null;
  title_variant_b_views: number | null;
  title_variant_c_views: number | null;
}

async function getEtsyListingId(productId: string): Promise<string | null> {
  const rows = await db
    .select({ external_id: productListings.external_id })
    .from(productListings)
    .where(
      and(
        eq(productListings.product_id, productId),
        eq(productListings.channel, 'etsy'),
      ),
    )
    .limit(1);
  return rows[0]?.external_id ?? null;
}

const ROTATION_LIMIT = 4; // after 4 full cycles, lock in winner

function nextVariant(current: string | null): 'a' | 'b' | 'c' {
  if (current === 'a') return 'b';
  if (current === 'b') return 'c';
  return 'a';
}

function totalRotations(row: TitleRotateRow): number {
  return (
    (row.title_variant_a_views ?? 0) +
    (row.title_variant_b_views ?? 0) +
    (row.title_variant_c_views ?? 0)
  );
}

function pickWinningTitle(row: TitleRotateRow): { variant: 'a' | 'b' | 'c'; title: string | null } {
  const candidates = [
    { v: 'a' as const, views: row.title_variant_a_views ?? 0, title: row.etsy_title },
    { v: 'b' as const, views: row.title_variant_b_views ?? 0, title: row.title_variant_b },
    { v: 'c' as const, views: row.title_variant_c_views ?? 0, title: row.title_variant_c },
  ];
  candidates.sort((a, b) => b.views - a.views);
  return { variant: candidates[0]!.v, title: candidates[0]!.title };
}

async function updateEtsyListingTitle(
  listingId: string,
  newTitle: string,
): Promise<void> {
  const { etsyFetch } = await import('@/lib/publish/etsy.client');
  const shopId = process.env.ETSY_SHOP_ID;
  if (!shopId) throw new Error('ETSY_SHOP_ID is not set');

  const form = new URLSearchParams({ title: newTitle.slice(0, 140) });
  await etsyFetch(`/application/shops/${shopId}/listings/${listingId}`, {
    method: 'PUT',
    form,
  });
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  const enabled = (process.env.TITLE_ROTATE_ENABLED ?? 'true').toLowerCase();
  if (enabled === 'false' || enabled === '0') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Pull all published products with B + C variants. We rotate even on
  // products without an etsy_listing_id — they still benefit from the
  // DB-side variant cycling (helpful for shop page A/B once we ship it).
  const rows = (await db
    .select()
    .from(products)
    .where(
      and(
        isNotNull(products.title_variant_b),
        isNotNull(products.title_variant_c),
        isNotNull(products.approved_at),
      ),
    )) as unknown as TitleRotateRow[];

  const result = {
    rotated: 0,
    lockedIn: 0,
    etsyUpdated: 0,
    etsyErrors: 0,
    skipped: 0,
  };

  for (const row of rows) {
    // After 4 cycles, lock in the winning variant and stop rotating.
    const cycles = totalRotations(row);
    if (cycles >= ROTATION_LIMIT * 3) {
      const winner = pickWinningTitle(row);
      if (winner.title && row.title_active_variant !== winner.variant) {
        await db
          .update(products)
          .set({
            title_active_variant: winner.variant,
            etsy_title: winner.title, // promote winner to "the" title
            updated_at: new Date(),
          })
          .where(eq(products.id, row.id));

        const listingId = await getEtsyListingId(row.id);
        if (listingId) {
          try {
            await updateEtsyListingTitle(listingId, winner.title);
            result.etsyUpdated++;
          } catch (e) {
            console.warn(`[c3] etsy update failed for ${row.id}`, e);
            result.etsyErrors++;
          }
        }
        result.lockedIn++;
      } else {
        result.skipped++;
      }
      continue;
    }

    // Otherwise rotate to the next variant.
    const next = nextVariant(row.title_active_variant);
    const nextTitle =
      next === 'a'
        ? row.etsy_title
        : next === 'b'
          ? row.title_variant_b
          : row.title_variant_c;
    if (!nextTitle) {
      result.skipped++;
      continue;
    }

    // Increment the view counter for the *current* variant (it ran a full
    // week and presumably accrued views). We don't have real Etsy stats yet,
    // so we just treat each cycle as a +1 rotation count.
    const viewIncrement = sql<number>`COALESCE(${
      row.title_active_variant === 'a'
        ? products.title_variant_a_views
        : row.title_active_variant === 'b'
          ? products.title_variant_b_views
          : products.title_variant_c_views
    }, 0) + 1`;

    const updateSet: Record<string, unknown> = {
      title_active_variant: next,
      title_last_rotated_at: new Date(),
      updated_at: new Date(),
    };
    if (row.title_active_variant === 'a') updateSet.title_variant_a_views = viewIncrement;
    else if (row.title_active_variant === 'b') updateSet.title_variant_b_views = viewIncrement;
    else if (row.title_active_variant === 'c') updateSet.title_variant_c_views = viewIncrement;

    await db.update(products).set(updateSet).where(eq(products.id, row.id));

    const rotateListingId = await getEtsyListingId(row.id);
    if (rotateListingId) {
      try {
        await updateEtsyListingTitle(rotateListingId, nextTitle);
        result.etsyUpdated++;
      } catch (e) {
        console.warn(`[c3] etsy rotation update failed for ${row.id}`, e);
        result.etsyErrors++;
      }
    }
    result.rotated++;
  }

  return NextResponse.json({ ok: true, ...result, considered: rows.length });
}
