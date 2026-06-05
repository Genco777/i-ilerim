/**
 * Admin: Regenerate PDF for a single product + push to Etsy.
 *
 * Used to fix products from timed-out crons where digital_file_url is null
 * and the Etsy listing has 0 attached files. Idempotent — safe to call
 * multiple times.
 *
 * Usage:
 *   GET /api/admin/regen-pdf?productId=<uuid>&secret=<CRON_SECRET>
 *
 * Or by slug:
 *   GET /api/admin/regen-pdf?slug=<slug>&secret=<CRON_SECRET>
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products, niches, productListings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { uploadImage } from '@/lib/blob';
import { generateProductPdf } from '@/lib/trend/pdf-generator';
import type { NicheCandidate } from '@/lib/trend/discovery';
import type { ProductContent } from '@/lib/trend/content';

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
  const url = new URL(req.url);
  return url.searchParams.get('secret') === expected;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) return unauthorized();

  const url = new URL(req.url);
  const productId = url.searchParams.get('productId');
  const slug = url.searchParams.get('slug');

  if (!productId && !slug) {
    return NextResponse.json({ error: 'productId or slug required' }, { status: 400 });
  }

  // Find product
  const prodRows = await db
    .select()
    .from(products)
    .where(productId ? eq(products.id, productId) : eq(products.slug, slug!))
    .limit(1);
  const product = prodRows[0];
  if (!product) {
    return NextResponse.json({ error: 'Product not found' }, { status: 404 });
  }

  // Find niche
  const nicheRows = product.niche_id
    ? await db.select().from(niches).where(eq(niches.id, product.niche_id)).limit(1)
    : [];
  const niche = nicheRows[0];
  if (!niche) {
    return NextResponse.json({ error: 'Niche missing for product' }, { status: 404 });
  }

  // Reconstruct NicheCandidate + ProductContent shapes
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

  // Regenerate PDF using the existing cover URL (don't waste $ on Banana)
  let pdfUrl: string | null = null;
  let pdfSize: number | null = null;
  try {
    const pdfResult = await generateProductPdf(
      nicheShape,
      contentShape,
      product.hero_image_url ?? undefined,
    );
    const filename = `trend/${product.id}/product-regen-${Date.now()}.pdf`;
    const uploaded = await uploadImage(pdfResult.buffer, filename, 'application/pdf');
    pdfUrl = uploaded.url;
    pdfSize = pdfResult.sizeBytes;
    console.log(`[regen-pdf] generated PDF for ${product.id}: ${pdfUrl}`);
  } catch (err) {
    return NextResponse.json(
      { error: `PDF gen failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 500 },
    );
  }

  await db
    .update(products)
    .set({
      digital_file_url: pdfUrl,
      digital_file_size_bytes: pdfSize,
      updated_at: new Date(),
    })
    .where(eq(products.id, product.id));

  // If there's an Etsy listing for this product, upload the PDF to it.
  const listingRows = await db
    .select()
    .from(productListings)
    .where(
      and(
        eq(productListings.product_id, product.id),
        eq(productListings.channel, 'etsy'),
      ),
    )
    .limit(1);
  const listing = listingRows[0];

  let etsyUploadResult: { ok: boolean; message: string } = {
    ok: false,
    message: 'No Etsy listing for this product',
  };

  if (listing && listing.external_id) {
    try {
      const { uploadListingFile } = await import('@/lib/publish/etsy.adapter');
      const shopId = Number(process.env.ETSY_SHOP_ID);
      if (!shopId) throw new Error('ETSY_SHOP_ID not set');
      const r = await uploadListingFile({
        shopId,
        listingId: Number(listing.external_id),
        sourceUrl: pdfUrl,
        filename: `${product.slug ?? 'product'}.pdf`,
      });
      etsyUploadResult = {
        ok: true,
        message: `Etsy file uploaded: listing_file_id=${r.listing_file_id} size=${r.size_bytes}`,
      };
    } catch (err) {
      etsyUploadResult = {
        ok: false,
        message: `Etsy upload failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    productId: product.id,
    slug: product.slug,
    pdfUrl,
    pdfSize,
    etsyListingId: listing?.external_id ?? null,
    etsyUpload: etsyUploadResult,
  });
}
