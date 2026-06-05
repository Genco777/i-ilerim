/**
 * Admin: Re-publish all approved products to Etsy.
 *
 * Used after manually deleting all Etsy drafts. Walks every approved
 * product in DB, regenerates PDF if missing, then calls publishToEtsy
 * to create a fresh Etsy draft. Sequential to respect Etsy rate limits.
 *
 * Idempotency: deletes any existing product_listings row for the product
 * (since the old Etsy listing was manually deleted) before publishing.
 *
 * Usage:
 *   GET /api/admin/republish-all?secret=<CRON_SECRET>
 *   GET /api/admin/republish-all?secret=...&limit=5      (only first 5)
 *   GET /api/admin/republish-all?secret=...&missingOnly=1 (skip products that still have Etsy listings)
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products, niches, productListings } from '@/lib/db/schema';
import { and, eq, isNotNull, isNull, desc } from 'drizzle-orm';
import { uploadImage } from '@/lib/blob';
import { generateProductPdf } from '@/lib/trend/pdf-generator';
import { publishToEtsy } from '@/lib/publish/etsy.adapter';
import type { NicheCandidate } from '@/lib/trend/discovery';
import type { ProductContent } from '@/lib/trend/content';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
// Per product ~20-40s (PDF regen if needed + 5-10 Etsy API calls).
// 10 products × 30s = 300s budget.
export const maxDuration = 800;

function unauthorized(): NextResponse {
  return new NextResponse('Unauthorized', { status: 401 });
}

function checkAuth(req: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  const url = new URL(req.url);
  if (url.searchParams.get('secret') === expected) return true;
  const auth = req.headers.get('authorization') ?? '';
  return auth === `Bearer ${expected}`;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  const url = new URL(req.url);
  const limit = url.searchParams.get('limit')
    ? Math.max(1, Math.min(50, Number(url.searchParams.get('limit'))))
    : 50;
  const missingOnly = url.searchParams.get('missingOnly') === '1';

  // Pull approved products, newest first
  const approvedProducts = await db
    .select()
    .from(products)
    .where(
      and(
        isNotNull(products.approved_at),
        eq(products.is_public_in_shop, 1),
      ),
    )
    .orderBy(desc(products.approved_at))
    .limit(limit);

  if (approvedProducts.length === 0) {
    return NextResponse.json({ ok: true, message: 'No approved products to republish.' });
  }

  // If missingOnly: filter to products that don't currently have an Etsy listing
  let toProcess = approvedProducts;
  if (missingOnly) {
    const existingListings = await db
      .select({ product_id: productListings.product_id })
      .from(productListings)
      .where(eq(productListings.channel, 'etsy'));
    const withListing = new Set(existingListings.map((l) => l.product_id));
    toProcess = approvedProducts.filter((p) => !withListing.has(p.id));
  }

  const results: Array<{
    productId: string;
    slug: string | null;
    status: 'ok' | 'skip' | 'error';
    pdfRegenerated: boolean;
    etsyUrl?: string;
    etsyListingId?: number;
    etsyFileCount?: number;
    etsyImageCount?: number;
    fileUploadError?: string;
    error?: string;
  }> = [];

  for (const product of toProcess) {
    const result: (typeof results)[number] = {
      productId: product.id,
      slug: product.slug,
      status: 'ok',
      pdfRegenerated: false,
    };

    try {
      // Step 1: Regenerate PDF if missing
      if (!product.digital_file_url) {
        const nicheRows = product.niche_id
          ? await db.select().from(niches).where(eq(niches.id, product.niche_id)).limit(1)
          : [];
        const niche = nicheRows[0];
        if (!niche) {
          throw new Error('niche missing for product, cannot regen PDF');
        }

        const nicheShape: NicheCandidate = {
          topic: niche.topic,
          gapAngle: niche.gap_angle,
          score: niche.score,
          competition: niche.competition,
          sourceSignals: (niche.source_signals as string[] | null) ?? [],
          productHint: product.type,
        };

        const contentShape: ProductContent = {
          etsyTitle: product.etsy_title ?? '',
          etsyDescription: product.etsy_description ?? '',
          tags: (product.tags as string[] | null) ?? [],
          shopTitle: product.shop_title ?? '',
          shopDescription: product.shop_description ?? '',
          priceCents: product.price_cents,
          slug: product.slug ?? '',
          turkishGapAngle: '',
          turkishSummary: '',
          pdfBody: (product.pdf_body as ProductContent['pdfBody']) ?? {},
        };

        const pdfResult = await generateProductPdf(
          nicheShape,
          contentShape,
          product.hero_image_url ?? undefined,
        );
        const filename = `trend/${product.id}/product-regen-${Date.now()}.pdf`;
        const uploaded = await uploadImage(pdfResult.buffer, filename, 'application/pdf');

        await db
          .update(products)
          .set({
            digital_file_url: uploaded.url,
            digital_file_size_bytes: pdfResult.sizeBytes,
            updated_at: new Date(),
          })
          .where(eq(products.id, product.id));

        product.digital_file_url = uploaded.url;
        result.pdfRegenerated = true;
      }

      // Step 2: Clean old product_listings rows (the Etsy listings they
      // referenced were manually deleted, so the external_id is stale).
      await db
        .delete(productListings)
        .where(
          and(
            eq(productListings.product_id, product.id),
            eq(productListings.channel, 'etsy'),
          ),
        );

      // Step 3: Push to Etsy
      const etsyResult = await publishToEtsy(product.id);
      result.etsyUrl = etsyResult.url ?? undefined;
      result.etsyListingId = etsyResult.listingId;
      result.etsyFileCount = etsyResult.fileCount;
      result.etsyImageCount = etsyResult.imageCount;
      result.fileUploadError = etsyResult.fileUploadError;
      // If PDF didn't get uploaded, treat as error (not "ok")
      result.status = etsyResult.fileCount === 0 ? 'error' : 'ok';
      if (etsyResult.fileCount === 0 && etsyResult.fileUploadError) {
        result.error = etsyResult.fileUploadError;
      }
    } catch (err) {
      result.status = 'error';
      result.error = err instanceof Error ? err.message.slice(0, 200) : String(err);
      console.error(`[republish] ${product.id} failed`, err);
    }

    results.push(result);
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  const errCount = results.filter((r) => r.status === 'error').length;
  const pdfRegenCount = results.filter((r) => r.pdfRegenerated).length;

  return NextResponse.json({
    ok: true,
    considered: approvedProducts.length,
    processed: results.length,
    success: okCount,
    errors: errCount,
    pdfRegenerated: pdfRegenCount,
    results,
  });
}
