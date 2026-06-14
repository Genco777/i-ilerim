/**
 * etsy-apparel-upload.ts — Sprint M4
 *
 * Apparel candidate'in Vercel Blob'daki extra asset'lerini Etsy listing'e
 * direct upload eder (flat lay cover, color grid, size chart, video).
 *
 * Tetikleyici: Printify `product:publish:succeeded` webhook → Etsy listing_id
 * geldikten sonra bu helper'lar çağrılır.
 *
 * NOT: Helper'lar etsy.client'tan import (etsy.adapter'da export değil).
 * fetchAsBlob lokal implement — minimal, decoupled.
 */

import {
  etsyFetch,
  getEtsyShopId,
  isEtsyConnected,
} from './etsy.client';

/** URL'den blob indir — etsy.adapter'daki private helper'ın lokal kopyası. */
async function fetchAsBlob(url: string): Promise<{ blob: Blob; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`fetchAsBlob: HTTP ${res.status} — ${url.slice(0, 100)}`);
  }
  const contentType = res.headers.get('content-type') ?? 'application/octet-stream';
  const blob = await res.blob();
  return { blob, contentType };
}

export interface EtsyImageUploadResult {
  listing_image_id: number;
  url_fullxfull?: string;
  rank?: number;
}

export interface EtsyVideoUploadResult {
  video_id: number;
  video_state?: string;
}

/**
 * Vercel Blob'daki bir image URL'sini Etsy listing'e yükle.
 *
 * @param listingId Etsy listing_id (Printify webhook'tan gelir)
 * @param imageUrl Vercel Blob public URL (PNG/JPEG)
 * @param rank Etsy carousel'daki sıralama (1 = cover)
 * @param mimeType Default 'image/png' — Vercel Blob URL'leri genelde .png
 */
export async function uploadListingImageFromUrl(
  listingId: number,
  imageUrl: string,
  rank: number = 1,
  mimeType: string = 'image/png',
): Promise<EtsyImageUploadResult> {
  if (!(await isEtsyConnected())) {
    throw new Error('Etsy not connected — /api/auth/etsy/start ile OAuth tamamla');
  }

  const shopId = getEtsyShopId();
  const { blob } = await fetchAsBlob(imageUrl);

  // Etsy image upload: max 10 MB, multipart form
  const imageBlob = new Blob([await blob.arrayBuffer()], { type: mimeType });
  const fd = new FormData();
  fd.append('image', imageBlob, `apparel-${rank}.png`);
  fd.append('rank', String(rank));
  fd.append('overwrite', 'false'); // başka image'ı silme, yeni ekle

  return etsyFetch<EtsyImageUploadResult>(
    `/application/shops/${shopId}/listings/${listingId}/images`,
    { method: 'POST', rawBody: fd },
  );
}

/**
 * Vercel Blob'daki video URL'sini Etsy listing'e yükle.
 * Etsy max 100 MB, max 15 sn. Bizim Kling/LTX video 5 sn → güvenli.
 */
export async function uploadListingVideoFromUrl(
  listingId: number,
  videoUrl: string,
  name: string = 'apparel-product-video.mp4',
): Promise<EtsyVideoUploadResult> {
  if (!(await isEtsyConnected())) {
    throw new Error('Etsy not connected');
  }

  const shopId = getEtsyShopId();
  const { blob } = await fetchAsBlob(videoUrl);

  const videoBlob = new Blob([await blob.arrayBuffer()], { type: 'video/mp4' });
  const fd = new FormData();
  fd.append('video', videoBlob, name);
  fd.append('name', name);

  return etsyFetch<EtsyVideoUploadResult>(
    `/application/shops/${shopId}/listings/${listingId}/videos`,
    { method: 'POST', rawBody: fd },
  );
}

/**
 * Etsy listing'i DRAFT state'ine çek (active veya inactive ise).
 * Etsy v3 API: PATCH /application/shops/{shop_id}/listings/{listing_id}
 * body: { state: 'draft' }
 *
 * Sprint M4 — Mehmet'in Etsy mağazasının ayarı yeni listing'leri ACTIVE
 * yapıyor olabilir. Webhook'tan listing geldikten sonra bu helper'la
 * DRAFT'a çekiyoruz, Mehmet manuel review yapsın.
 */
export async function setListingStateDraft(listingId: number): Promise<{ ok: true }> {
  if (!(await isEtsyConnected())) {
    throw new Error('Etsy not connected');
  }
  const shopId = getEtsyShopId();
  await etsyFetch<unknown>(
    `/application/shops/${shopId}/listings/${listingId}`,
    {
      method: 'PATCH',
      form: { state: 'draft' },
    },
  );
  return { ok: true };
}

/**
 * Bir apparel candidate için tüm extra asset'leri Etsy listing'e yükle.
 * Sıra: flat lay (rank 1 = cover), color grid (rank 8), size chart (rank 9),
 * video. Etsy'de listing fotoğraf sırası: rank 1 = primary cover photo.
 *
 * Hata olsa bile diğer asset'lere devam eder, kısmi başarı OK.
 */
export interface BulkUploadResult {
  flatLay?: EtsyImageUploadResult | { error: string };
  colorGrid?: EtsyImageUploadResult | { error: string };
  sizeChart?: EtsyImageUploadResult | { error: string };
  video?: EtsyVideoUploadResult | { error: string };
  uploadedCount: number;
  errorCount: number;
}

export async function uploadApparelAssetsToEtsy(opts: {
  listingId: number;
  flatLayUrl?: string | null;
  colorGridUrl?: string | null;
  sizeChartUrl?: string | null;
  videoUrl?: string | null;
}): Promise<BulkUploadResult> {
  const result: BulkUploadResult = { uploadedCount: 0, errorCount: 0 };

  if (opts.flatLayUrl) {
    try {
      result.flatLay = await uploadListingImageFromUrl(opts.listingId, opts.flatLayUrl, 1);
      result.uploadedCount++;
    } catch (err) {
      result.flatLay = { error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
      result.errorCount++;
    }
  }
  if (opts.colorGridUrl) {
    try {
      result.colorGrid = await uploadListingImageFromUrl(opts.listingId, opts.colorGridUrl, 8);
      result.uploadedCount++;
    } catch (err) {
      result.colorGrid = { error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
      result.errorCount++;
    }
  }
  if (opts.sizeChartUrl) {
    try {
      result.sizeChart = await uploadListingImageFromUrl(opts.listingId, opts.sizeChartUrl, 9);
      result.uploadedCount++;
    } catch (err) {
      result.sizeChart = { error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
      result.errorCount++;
    }
  }
  if (opts.videoUrl) {
    try {
      result.video = await uploadListingVideoFromUrl(opts.listingId, opts.videoUrl);
      result.uploadedCount++;
    } catch (err) {
      result.video = { error: err instanceof Error ? err.message.slice(0, 200) : String(err) };
      result.errorCount++;
    }
  }

  return result;
}
