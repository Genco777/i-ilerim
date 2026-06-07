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
  /** If PDF upload failed, exact error message (HTTP status + Etsy response body). */
  fileUploadError?: string;
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

  // P0.2 — Etsy SEO maxing: materials (long-tail keywords Etsy weights heavily)
  // + shop_section_id (organization → faster trust + filtered search)
  // + production_partner_ids omitted (we make it ourselves)
  const materials = inferMaterials(product.type);
  let shopSectionId: number | null = null;
  try {
    shopSectionId = await ensureShopSection(shopId, product.type);
  } catch (e) {
    console.warn('[etsy] could not resolve shop_section_id, continuing without', e);
  }

  const listingPayload: Record<string, string | number | boolean | undefined> = {
    quantity: 999, // digital downloads are unlimited
    title,
    description,
    price: priceEur,
    who_made: 'i_did',
    when_made: 'made_to_order',
    taxonomy_id: taxonomyId,
    type: 'download',
    state: 'draft',
    is_supply: false,
    tags: tags.join(','),
    materials: materials.join(','),
    is_taxable: true, // §19 Kleinunternehmer handled outside Etsy
    is_personalizable: false,
    should_auto_renew: false,
  };
  if (shopSectionId) listingPayload.shop_section_id = shopSectionId;

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

  // 5.b) Upload cinematic video (P0.1) — Etsy boosts listings with video by ~20%.
  let videoUploaded = false;
  if (product.video_url && product.video_url.trim().length > 0) {
    console.log(
      `[etsy-video] attempting upload for listing ${listingId} from ${product.video_url}`,
    );
    try {
      const r = await uploadListingVideo({
        shopId,
        listingId,
        sourceUrl: product.video_url,
        name: `${product.slug ?? 'product'}.mp4`,
      });
      videoUploaded = true;
      console.log(
        `[etsy-video] uploaded OK → listing_video_id=${JSON.stringify(r).slice(0, 200)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      console.error(
        `[etsy-video] UPLOAD FAILED for listing ${listingId} product ${productRowId}.\n` +
          `  source_url: ${product.video_url}\n` +
          `  full error: ${msg}`,
      );
    }
  } else {
    console.warn(
      `[etsy-video] product ${productRowId} has NO video_url (value=${JSON.stringify(product.video_url)}) — skipping video upload. Video gen likely failed during cron (Higgsfield timeout/quota).`,
    );
  }

  // 6) Upload digital file (the PDF)
  let fileCount = 0;
  let fileUploadError: string | undefined;
  if (!product.digital_file_url) {
    fileUploadError = `product has NO digital_file_url in DB (PDF gen failed earlier)`;
    console.error(
      `[etsy] CRITICAL: product ${productRowId} has NO digital_file_url — PDF gen must have failed during cron. Etsy listing will have 0 files. URL: ${product.digital_file_url}`,
    );
  } else {
    try {
      const result = await uploadListingFile({
        shopId,
        listingId,
        sourceUrl: product.digital_file_url,
        filename: `${product.slug ?? 'product'}.pdf`,
      });
      fileCount = 1;
      console.log(
        `[etsy] PDF uploaded OK → listing_file_id=${result.listing_file_id} size=${result.size_bytes}b`,
      );
    } catch (e) {
      const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      fileUploadError = msg.slice(0, 500);
      console.error(
        `[etsy] DIGITAL FILE UPLOAD FAILED for listing ${listingId} product ${productRowId}.\n` +
          `  source_url: ${product.digital_file_url}\n` +
          `  full error: ${msg}`,
      );
      // No throw — Mehmet can re-upload manually before activating.
    }
  }

  // Sprint I — Editable Canva tier ek dosyaları (instructions PDF + preview PNG)
  // Best-effort: bu dosyalar Etsy listing'inin Editable Canva değer önerisini
  // göstermek için. Yoksa atlanır (basic PDF yine var).
  if (product.editable_instructions_pdf_url || product.editable_preview_image_url) {
    const extras: Array<{ url: string; name?: string }> = [];
    if (product.editable_instructions_pdf_url) {
      extras.push({
        url: product.editable_instructions_pdf_url,
        name: `${product.slug ?? 'product'}-canva-instructions.pdf`,
      });
    }
    if (product.editable_preview_image_url) {
      extras.push({
        url: product.editable_preview_image_url,
        name: `${product.slug ?? 'product'}-preview.png`,
      });
    }
    try {
      const extraResult = await uploadAdditionalListingFiles({
        shopId,
        listingId,
        files: extras,
      });
      fileCount += extraResult.uploaded.length;
      console.log(
        `[etsy] Editable tier extras: ${extraResult.uploaded.length}/${extras.length} uploaded, ${extraResult.errors.length} errors`,
      );
      if (extraResult.errors.length > 0) {
        console.warn(
          `[etsy] Editable extras errors: ${extraResult.errors.map((e) => `${e.url.slice(-40)}: ${e.error}`).join(' | ')}`,
        );
      }
    } catch (err) {
      console.warn(
        `[etsy] Editable extras upload skipped — ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
      );
    }
  }
  // TANRILAR Module 4: GET-after-POST verification. The "listing created"
  // confirmation has been misleading — fetch the listing back and confirm it
  // actually exists with the files/images we expect.
  let verifiedState: string = 'unknown';
  let verifiedImageCount = 0;
  let verifiedFileCount = 0;
  try {
    const verify = await etsyFetch<{
      listing_id: number;
      state: string;
      url: string;
      title: string;
      num_favorers?: number;
      has_variations?: boolean;
    }>(`/application/shops/${shopId}/listings/${listingId}`);
    verifiedState = verify.state;
    console.log(
      `[etsy-verify] listing ${listingId} VERIFIED — state=${verify.state} title="${verify.title.slice(0, 60)}"`,
    );

    // Verify image + file counts
    const imgList = await etsyFetch<{ count: number; results: unknown[] }>(
      `/application/shops/${shopId}/listings/${listingId}/images`,
    );
    verifiedImageCount = imgList.results.length;
    const fileList = await etsyFetch<{ count: number; results: unknown[] }>(
      `/application/shops/${shopId}/listings/${listingId}/files`,
    );
    verifiedFileCount = fileList.results.length;
    console.log(
      `[etsy-verify] listing ${listingId} content: ${verifiedImageCount} images, ${verifiedFileCount} files`,
    );
  } catch (verifyErr) {
    console.error(
      `[etsy-verify] FAILED to verify listing ${listingId} — it may not have been created properly:`,
      verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
    );
  }

  console.log(
    `[etsy] published draft listing ${listingId} for product ${productRowId}: created=${imageCount}imgs/${videoUploaded ? 1 : 0}video/${fileCount}file · VERIFIED=${verifiedImageCount}imgs/${verifiedFileCount}files state=${verifiedState}`,
  );

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
    fileUploadError,
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

/**
 * Sanitize a filename so it passes Etsy's strict rule:
 *   - 3-70 characters total (including extension)
 *   - Only [a-zA-Z0-9._-]
 *
 * Strategy: extract extension, strip everything else from the stem to safe
 * chars, truncate stem so stem+extension ≤ 70.
 */
function sanitizeEtsyFilename(input: string): string {
  const safe = (input ?? 'product.pdf').trim();
  // Split extension (last ".xxx" up to 5 chars)
  const m = safe.match(/^(.*?)(\.[a-zA-Z0-9]{1,5})?$/);
  let stem = m?.[1] ?? safe;
  let ext = m?.[2] ?? '.pdf';
  // Etsy allows only [a-zA-Z0-9._-] — replace everything else with "-"
  stem = stem.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  ext = ext.replace(/[^a-zA-Z0-9.]/g, '');
  if (!ext.startsWith('.')) ext = '.' + ext;
  if (ext.length > 6) ext = '.pdf';
  // Truncate so stem + ext ≤ 70
  const maxStem = 70 - ext.length;
  if (stem.length > maxStem) stem = stem.slice(0, maxStem).replace(/-$/, '');
  // Minimum 3 chars
  if (stem.length < 2) stem = 'printable';
  return stem + ext;
}

export async function uploadListingFile(args: {
  shopId: number;
  listingId: number;
  sourceUrl: string;
  filename: string;
}): Promise<EtsyListingFileResponse> {
  // Etsy rule: filename must be 3-70 chars, [a-zA-Z0-9._-] only.
  // Our slugs can be up to 80 chars + ".pdf" = 85, plus sometimes Unicode
  // or other punctuation crept in via shop_title. Normalize hard.
  const sanitizedFilename = sanitizeEtsyFilename(args.filename);

  // Fetch the PDF from Vercel Blob → re-upload to Etsy as multipart binary.
  const { blob, contentType } = await fetchAsBlob(args.sourceUrl);
  const sizeBytes = blob.size;
  console.log(
    `[etsy-file] PDF fetched from Blob: ${sizeBytes} bytes (${(sizeBytes / 1024).toFixed(0)}KB), content-type=${contentType}, filename=${sanitizedFilename}`,
  );

  // Etsy v3 listing files endpoint accepts multipart with field name "file".
  // Some accounts/configurations reject the request unless content-type is
  // application/pdf explicitly. Build a fresh Blob with the right MIME.
  const pdfBlob = new Blob([await blob.arrayBuffer()], { type: 'application/pdf' });
  const fd = new FormData();
  fd.append('file', pdfBlob, sanitizedFilename);
  fd.append('name', sanitizedFilename);
  fd.append('rank', '1');

  try {
    const result = await etsyFetch<EtsyListingFileResponse>(
      `/application/shops/${args.shopId}/listings/${args.listingId}/files`,
      { method: 'POST', rawBody: fd },
    );
    console.log(
      `[etsy-file] PDF upload OK → listing_file_id=${result.listing_file_id}, size_bytes=${result.size_bytes}`,
    );
    return result;
  } catch (e) {
    // Surface the FULL Etsy response body — the recurring "0 files" issue
    // has been hidden by a swallowed error. Make it impossible to hide now.
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[etsy-file] BINARY UPLOAD REJECTED — full response: ${msg}\n` +
        `  shop_id=${args.shopId} listing_id=${args.listingId} filename=${args.filename} size=${sizeBytes}b`,
    );
    throw e;
  }
}

// ─────────────────────────────────────────────────────────────
// P0.1 — Listing video upload
// ─────────────────────────────────────────────────────────────

interface EtsyListingVideoResponse {
  video_id: number;
  height: number;
  width: number;
  thumbnail_url: string;
  video_state: 'active' | 'inactive' | 'deleted' | 'flagged';
}

async function uploadListingVideo(args: {
  shopId: number;
  listingId: number;
  sourceUrl: string;
  name: string;
}): Promise<EtsyListingVideoResponse> {
  const { blob } = await fetchAsBlob(args.sourceUrl);
  // Etsy limits: max 100MB, max 15s, max 1080×1080. Our Higgsfield video is
  // 5s and well under both, so we just pass through.
  const fd = new FormData();
  fd.append('video', blob, args.name);
  fd.append('name', args.name);

  return etsyFetch<EtsyListingVideoResponse>(
    `/application/shops/${args.shopId}/listings/${args.listingId}/videos`,
    { method: 'POST', rawBody: fd },
  );
}

// ─────────────────────────────────────────────────────────────
// P0.2 — Materials, shop section, attribute helpers
// ─────────────────────────────────────────────────────────────

/**
 * Per-product-type materials list. Etsy weights these in long-tail search —
 * a printable planner found for "PDF planner" gains rank from "PDF" being
 * declared as a material, not just a tag.
 */
function inferMaterials(type: string): string[] {
  const base = ['PDF', 'Digital Download', 'Printable'];
  const per: Record<string, string[]> = {
    planner: [...base, 'A4', 'Letter', 'Journal'],
    sticker: [...base, 'Sticker Paper', 'Vinyl', 'A4'],
    poster: [...base, 'Wall Art', 'Print at Home', 'A4'],
    template: [...base, 'Editable', 'Template', 'A4'],
    social_template: [...base, 'Canva Template', 'Social Media', 'Instagram'],
  };
  return (per[type] ?? base).slice(0, 13);
}

interface EtsyShopSection {
  shop_section_id: number;
  title: string;
  rank: number;
  user_id: number;
  active_listing_count: number;
}

interface EtsyShopSectionsResponse {
  count: number;
  results: EtsyShopSection[];
}

/**
 * Resolve (or create) the Etsy shop section for a given product type.
 * Cached in-memory for the lifetime of the lambda so we don't re-list every
 * call. Falls back to null on any error — listing creation still works.
 */
const sectionCache = new Map<string, number>();

async function ensureShopSection(shopId: number, productType: string): Promise<number> {
  const cacheKey = `${shopId}:${productType}`;
  const cached = sectionCache.get(cacheKey);
  if (cached) return cached;

  const wantedTitle = sectionTitleForType(productType);

  // List existing sections
  const sections = await etsyFetch<EtsyShopSectionsResponse>(
    `/application/shops/${shopId}/sections`,
  );
  const match = sections.results.find(
    (s) => s.title.toLowerCase() === wantedTitle.toLowerCase(),
  );
  if (match) {
    sectionCache.set(cacheKey, match.shop_section_id);
    return match.shop_section_id;
  }

  // Create new section. Etsy create-section is a simple POST with `title`.
  const created = await etsyFetch<EtsyShopSection>(
    `/application/shops/${shopId}/sections`,
    { method: 'POST', form: { title: wantedTitle } },
  );
  sectionCache.set(cacheKey, created.shop_section_id);
  return created.shop_section_id;
}

function sectionTitleForType(productType: string): string {
  const map: Record<string, string> = {
    planner: 'Printable Planners',
    sticker: 'Sticker Sheets',
    poster: 'Wall Art & Posters',
    template: 'Templates',
    social_template: 'Social Media Templates',
  };
  return map[productType] ?? 'Printables';
}

// ─────────────────────────────────────────────────────────────
// Sprint I — Additional digital files (multi-file listings)
// ─────────────────────────────────────────────────────────────
//
// Etsy lets a single listing carry up to 5 digital files (each ≤ 20 MB),
// types: PDF, ZIP, JPG, PNG, MP3, MP4, MOBI, etc. Sprint I uses this so a
// listing can ship the main PDF + a Canva-instructions PDF + an editable-
// preview PNG, all as separate downloads the buyer sees in their order.
//
// This module ONLY adds files to an existing listing. It does NOT modify
// `publishToEtsy()` — Mehmet wires it in via the orchestrator after the
// main publish call succeeds. Best-effort by design: one bad URL never
// blocks the others (errors collected per-file).

/** Etsy hard limit per listing — see https://developer.etsy.com docs. */
const ETSY_MAX_FILES_PER_LISTING = 5;
/** Etsy hard limit per file (20 MB). */
const ETSY_MAX_FILE_BYTES = 20 * 1024 * 1024;
/** Source-URL fetch timeout — Blob storage can be slow for ~15 MB PDFs. */
const ADDITIONAL_FILE_FETCH_TIMEOUT_MS = 30_000;

export interface UploadAdditionalFilesArgs {
  listingId: number;
  files: Array<{
    /** Source URL the file will be fetched from (e.g. blob.vercel-storage.com). */
    url: string;
    /** Etsy listing display order, 1–5. If omitted, auto-assigned after existing files. */
    rank?: number;
    /** Override filename — otherwise derived from the URL's pathname. */
    name?: string;
  }>;
}

export interface UploadAdditionalFilesResult {
  uploaded: Array<{
    url: string;
    listing_file_id: number;
    size_bytes: number;
    rank: number;
  }>;
  errors: Array<{ url: string; error: string }>;
  /** How many files were already on the listing before this call. */
  existingFileCount: number;
  /** How many slots Etsy refused (over the 5-file cap) — surfaced for logging. */
  skippedDueToQuota: number;
}

/**
 * Upload additional digital files to an existing Etsy listing.
 *
 * Sequence (intentionally serial — Etsy public-app rate limit is 10 rps and
 * 10 000/day per shop, and multipart uploads are I/O heavy — parallelism
 * gains nothing and risks 429s):
 *
 *   1. GET /listings/{listingId}/files  → discover current file count
 *   2. Respect ETSY_MAX_FILES_PER_LISTING (5) — extra inputs go to `errors`
 *      with a 'quota' reason so the caller can tell the operator
 *   3. For each remaining input, in order:
 *        a. Fetch source URL with 30 s timeout
 *        b. Reject if > 20 MB (Etsy would 400 anyway, but our error is clearer)
 *        c. Sanitize filename via existing sanitizeEtsyFilename helper
 *        d. POST as multipart 'file' with correct Content-Type
 *        e. Push success/failure into result arrays, continue regardless
 *
 * Never throws on a per-file failure. Only throws if the initial
 * GET /files call fails (i.e. the listing itself is gone / token revoked).
 */
export async function uploadAdditionalListingFiles(
  args: UploadAdditionalFilesArgs,
): Promise<UploadAdditionalFilesResult> {
  const shopId = getEtsyShopId();
  const { listingId } = args;

  const result: UploadAdditionalFilesResult = {
    uploaded: [],
    errors: [],
    existingFileCount: 0,
    skippedDueToQuota: 0,
  };

  // 1) Probe current file count so we know how many slots remain.
  let existingFiles: EtsyListingFileResponse[] = [];
  try {
    const list = await etsyFetch<{ count: number; results: EtsyListingFileResponse[] }>(
      `/application/shops/${shopId}/listings/${listingId}/files`,
    );
    existingFiles = list.results ?? [];
    result.existingFileCount = existingFiles.length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(
      `[etsy-extra] could not list existing files for listing ${listingId}: ${msg.slice(0, 400)}`,
    );
  }

  const availableSlots = Math.max(
    0,
    ETSY_MAX_FILES_PER_LISTING - existingFiles.length,
  );

  if (availableSlots === 0) {
    result.skippedDueToQuota = args.files.length;
    for (const f of args.files) {
      result.errors.push({
        url: f.url,
        error: `Etsy quota: listing ${listingId} already has ${existingFiles.length}/${ETSY_MAX_FILES_PER_LISTING} files — no slot available`,
      });
    }
    console.warn(
      `[etsy-extra] listing ${listingId} is FULL (${existingFiles.length} files) — skipped ${args.files.length} uploads`,
    );
    return result;
  }

  // 2) Limit input to remaining slots (FIFO priority)
  const toUpload = args.files.slice(0, availableSlots);
  const overflow = args.files.slice(availableSlots);
  result.skippedDueToQuota = overflow.length;
  for (const f of overflow) {
    result.errors.push({
      url: f.url,
      error: `Etsy quota: only ${availableSlots} slot(s) available, you submitted ${args.files.length}`,
    });
  }

  // 3) Sequential upload (Etsy 10 req/sec rate limit — don't parallelise)
  for (let i = 0; i < toUpload.length; i++) {
    const file = toUpload[i]!;
    const rank = file.rank ?? existingFiles.length + i + 1;
    try {
      const { blob, contentType } = await fetchAsBlob(file.url);
      const sizeBytes = blob.size;
      if (sizeBytes === 0) {
        throw new Error(`source returned 0 bytes (blob signed URL may have expired): ${redactQuery(file.url)}`);
      }
      if (sizeBytes > ETSY_MAX_FILE_BYTES) {
        throw new Error(`file too large: ${(sizeBytes / 1024 / 1024).toFixed(1)}MB > 20MB Etsy cap`);
      }

      const filename = sanitizeEtsyFilename(file.name ?? filenameFromUrl(file.url));
      const mime = pickMimeForEtsy(filename, contentType);
      const typedBlob = new Blob([await blob.arrayBuffer()], { type: mime });
      const fd = new FormData();
      fd.append('file', typedBlob, filename);
      fd.append('name', filename);
      fd.append('rank', String(rank));

      const uploadRes = await etsyFetch<EtsyListingFileResponse>(
        `/application/shops/${shopId}/listings/${listingId}/files`,
        { method: 'POST', rawBody: fd },
      );

      console.log(
        `[etsy-extra] uploaded rank=${rank} ${filename} → listing_file_id=${uploadRes.listing_file_id} (${sizeBytes}b, ${mime})`,
      );
      result.uploaded.push({
        url: file.url,
        listing_file_id: uploadRes.listing_file_id,
        size_bytes: uploadRes.size_bytes ?? sizeBytes,
        rank,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 500) : String(err);
      console.warn(`[etsy-extra] upload failed for ${redactQuery(file.url)}: ${msg}`);
      result.errors.push({ url: file.url, error: msg });
    }
  }

  return result;
}

function filenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').pop() ?? '';
    return last || 'file.pdf';
  } catch {
    return 'file.pdf';
  }
}

function pickMimeForEtsy(filename: string, headerContentType: string): string {
  const ext = (filename.match(/\.([a-z0-9]+)$/i)?.[1] ?? '').toLowerCase();
  const extMap: Record<string, string> = {
    pdf: 'application/pdf',
    zip: 'application/zip',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    txt: 'text/plain',
  };
  if (extMap[ext]) return extMap[ext]!;
  if (headerContentType && !headerContentType.startsWith('application/octet-stream')) {
    return headerContentType;
  }
  return 'application/pdf';
}

function redactQuery(url: string): string {
  try {
    const u = new URL(url);
    return u.origin + u.pathname + (u.search ? '?<redacted>' : '');
  } catch {
    return url.slice(0, 80);
  }
}
