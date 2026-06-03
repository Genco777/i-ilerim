/**
 * Etsy publishing adapter — turns an approved trend-engine product into
 * an Etsy DRAFT listing with images + digital file uploaded.
 *
 * Draft (not active) is intentional: a brand-new Etsy shop publishing 2
 * AI-generated listings/day with `state=active` is flagged within a week.
 * Mehmet manually flips draft → active in the Etsy seller dashboard.
 *
 * Idempotent: looks up productListings first; if a successful row exists
 * for (product_id, 'etsy'), returns the existing external_id/url. If a
 * failed row exists, logs to error_log and retries.
 *
 * Used by:
 *   src/lib/trend/approval-handlers.ts  (handleTrendApprove → parallel Stripe + Etsy)
 */

import { db } from '@/lib/db';
import { products, productListings } from '@/lib/db/schema';
import { and, eq } from 'drizzle-orm';
import { etsyFetch, getEtsyShopId, isEtsyConnected } from './etsy.client';

// ─────────────────────────────────────────────────────────────
// Etsy types (minimal — we only consume what we need)
// ─────────────────────────────────────────────────────────────

interface EtsyListingResponse {
  listing_id: number;
  shop_id: number;
  state: string;
  url: string;
  title: string;
  description: string;
  price: { amount: number; divisor: number; currency_code: string };
}

interface EtsyListingImageResponse {
  listing_image_id: number;
  hex_code: string | null;
  red: number | null;
  url_75x75: string;
  url_170x135: string;
  url_570xN: string;
  url_fullxfull: string;
  rank: number;
}

interface EtsyListingFileResponse {
  listing_file_id: number;
  listing_id: number;
  rank: number;
  filename: string;
  filesize: string;
  size_bytes: number;
  filetype: string;
  create_timestamp: number;
}

// ─────────────────────────────────────────────────────────────
// Taxonomy mapping — per product type
// ─────────────────────────────────────────────────────────────

/**
 * Etsy taxonomy IDs (verified against Etsy v3 taxonomy as of 2026):
 *   2078 → Paper & Party > Paper > Stationery > Planners
 *   1190 → Paper & Party > Paper > Stickers
 *   2080 → Paper & Party > Paper > Wall Art > Prints (digital prints)
 *   2079 → Paper & Party > Paper > Stationery > Templates
 *
 * Override per-type via env: ETSY_TAXONOMY_PLANNER, etc.
 */
function taxonomyIdForType(type: string): number {
  const overrides: Record<string, string | undefined> = {
    planner: process.env.ETSY_TAXONOMY_PLANNER,
    sticker: process.env.ETSY_TAXONOMY_STICKER,
    poster: process.env.ETSY_TAXONOMY_POSTER,
    template: process.env.ETSY_TAXONOMY_TEMPLATE,
    social_template: process.env.ETSY_TAXONOMY_TEMPLATE,
  };
  const o = overrides[type];
  if (o) {
    const n = Number(o);
    if (Number.isFinite(n)) return n;
  }
  const defaults: Record<string, number> = {
    planner: 2078,
    sticker: 1190,
    poster: 2080,
    template: 2079,
    social_template: 2079,
  };
  return defaults[type] ?? 2078;
}

// ─────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────

export interface PublishToEtsyResult {
  listingId: number;
  url: string;
  state: 'draft' | 'active' | 'inactive';
  imageCount: number;
  fileCount: number;
  alreadyExisted: boolean;
}

/**
 * Create a draft Etsy listing for the given product. Idempotent.
 *
 * @throws if Etsy is not OAuth-connected (no refresh token), or the create
 *         call fails. Caller is expected to catch and record into
 *         productListings.error_log.
 */
export async function publishToEtsy(productRowId: string): Promise<PublishToEtsyResult> {
  if (!(await isEtsyConnected())) {
    throw new Error(
      'Etsy not connected. Open https://admin.fly-froth.com/api/auth/etsy/start to authorize.',
    );
  }

  // 1) Idempotency check
  const existing = await db
    .select()
    .from(productListings)
    .where(and(eq(productListings.product_id, productRowId), eq(productListings.channel, 'etsy')))
    .limit(1);
  if (existing[0]?.status === 'published' && existing[0].external_id) {
    return {
      listingId: Number(existing[0].external_id),
      url: existing[0].external_url ?? '',
      state: 'draft',
      imageCount: 0,
      fileCount: 0,
      alreadyExisted: true,
    };
  }

  // 2) Load product row
  const productRows = await db.select().from(products).where(eq(products.id, productRowId)).limit(1);
  const product = productRows[0];
  if (!product) throw new Error(`Product ${productRowId} not found`);

  // 3) Build listing payload
  const shopId = getEtsyShopId();
  const taxonomyId = taxonomyIdForType(product.type);
  const priceEur = Number((product.price_cents / 100).toFixed(2));
  const title = (product.etsy_title ?? product.shop_title ?? 'Printable PDF')
    .slice(0, 140)
    .replace(/[^\x20-\x7E]/g, ''); // ASCII-only for Etsy title to dodge unicode quirks
  const description = product.etsy_description ?? product.shop_description ?? title;
  const rawTags = (product.tags as string[] | null) ?? [];
  // Etsy: max 13 tags, max 20 chars each, alphanumeric + spaces only.
  const tags = rawTags
    .map((t) => t.replace(/[^a-z0-9 ]/gi, '').trim().slice(0, 20))
    .filter((t) => t.length > 0)
    .slice(0, 13);

  const listingPayload = {
    quantity: 999, // digital downloads are unlimited
    title,
    description,
    price: priceEur,
    who_made: 'i_did' as const,
    when_made: 'made_to_order' as const,
    taxonomy_id: taxonomyId,
    type: 'download' as const,
    state: 'draft' as const,
    is_supply: false,
    tags: tags.join(','),
    is_taxable: true, // §19 Kleinunternehmer handled outside Etsy
    is_personalizable: false,
    should_auto_renew: false,
  };

  // 4) Create the listing
  const listing = await etsyFetch<EtsyListingResponse>(
    `/application/shops/${shopId}/listings`,
    { method: 'POST', form: listingPayload },
  );
  const listingId = listing.listing_id;
  const listingUrl = listing.url;

  // 5) Upload images (hero first, then mockups)
  const imageUrls: string[] = [
    ...(product.hero_image_url ? [product.hero_image_url] : []),
    ...((product.mockup_image_urls as string[] | null) ?? []),
  ].slice(0, 10); // Etsy max 10

  let imageCount = 0;
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      await uploadListingImage({
        shopId,
        listingId,
        sourceUrl: imageUrls[i]!,
        rank: i + 1,
        altText: title.slice(0, 250),
      });
      imageCount++;
    } catch (e) {
      console.error(`[etsy] image ${i + 1} upload failed`, e);
      // Continue with remaining images — partial gallery is better than none.
    }
  }

  // 6) Upload digital file (the PDF)
  let fileCount = 0;
  if (product.digital_file_url) {
    try {
      await uploadListingFile({
        shopId,
        listingId,
        sourceUrl: product.digital_file_url,
        filename: `${product.slug ?? 'product'}.pdf`,
      });
      fileCount = 1;
    } catch (e) {
      console.error('[etsy] digital file upload failed', e);
      // No throw — Mehmet can re-upload manually before activating.
    }
  }

  // 7) Record in productListings (idempotent — uniq constraint)
  await db
    .insert(productListings)
    .values({
      product_id: productRowId,
      channel: 'etsy',
      external_id: String(listingId),
      external_url: listingUrl,
      status: 'published', // 'published' here = "draft uploaded successfully to Etsy"
      published_at: new Date(),
    })
    .onConflictDoUpdate({
      target: [productListings.product_id, productListings.channel],
      set: {
        external_id: String(listingId),
        external_url: listingUrl,
        status: 'published',
        error_log: null,
        published_at: new Date(),
      },
    });

  return {
    listingId,
    url: listingUrl,
    state: 'draft',
    imageCount,
    fileCount,
    alreadyExisted: false,
  };
}

/**
 * Record an Etsy publish failure into productListings so the operator
 * can see "why" in the admin panel without scrolling Vercel logs.
 */
export async function recordEtsyFailure(
  productRowId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .insert(productListings)
    .values({
      product_id: productRowId,
      channel: 'etsy',
      status: 'failed',
      error_log: errorMessage.slice(0, 2000),
    })
    .onConflictDoUpdate({
      target: [productListings.product_id, productListings.channel],
      set: { status: 'failed', error_log: errorMessage.slice(0, 2000) },
    });
}

// ─────────────────────────────────────────────────────────────
// Multipart helpers — image + digital-file upload
// ─────────────────────────────────────────────────────────────

async function fetchAsBlob(url: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch ${url} → HTTP ${res.status}`);
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const buf = await res.arrayBuffer();
  return { blob: new Blob([buf], { type: contentType }), contentType };
}

async function uploadListingImage(args: {
  shopId: number;
  listingId: number;
  sourceUrl: string;
  rank: number;
  altText?: string;
}): Promise<EtsyListingImageResponse> {
  const { blob, contentType } = await fetchAsBlob(args.sourceUrl);
  const ext = contentType.includes('png') ? 'png' : contentType.includes('webp') ? 'webp' : 'jpg';
  const fd = new FormData();
  fd.append('image', blob, `img-${args.rank}.${ext}`);
  fd.append('rank', String(args.rank));
  fd.append('overwrite', 'false');
  if (args.altText) fd.append('alt_text', args.altText.slice(0, 250));

  return etsyFetch<EtsyListingImageResponse>(
    `/application/shops/${args.shopId}/listings/${args.listingId}/images`,
    { method: 'POST', rawBody: fd },
  );
}

async function uploadListingFile(args: {
  shopId: number;
  listingId: number;
  sourceUrl: string;
  filename: string;
}): Promise<EtsyListingFileResponse> {
  const { blob } = await fetchAsBlob(args.sourceUrl);
  const fd = new FormData();
  fd.append('file', blob, args.filename);
  fd.append('name', args.filename);
  fd.append('rank', '1');

  return etsyFetch<EtsyListingFileResponse>(
    `/application/shops/${args.shopId}/listings/${args.listingId}/files`,
    { method: 'POST', rawBody: fd },
  );
}
