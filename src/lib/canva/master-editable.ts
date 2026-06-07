/**
 * canva/master-editable.ts
 *
 * Sprint I — Editable Canva tier'ı için **master design generator**.
 *
 * Akış:
 *   1. Mevcut Canva brand template'ini autofill et (ürün başlığı + body)
 *   2. Design'ın share URL'sini çıkar (programatik link, view fallback)
 *   3. Design'ın PNG preview'unu export et
 *   4. Instructions PDF üret (QR code + step-by-step rehber)
 *   5. Tüm asset'leri DB'ye yaz (products tablosu editable_* kolonları)
 *
 * Best-effort: her adım kendi try/catch ile sarmalı. Bir adım fail edilirse
 * ürün yine Basic + Pro tier'da satılır, sadece Editable tier o ürün için
 * available olmaz (computeTiersForProduct otomatik handle eder).
 *
 * KRİTİK: Canva brand template'lerin (CANVA_TEMPLATE_ID_*) Canva UI'da
 * "Anyone with link → Can use as template" şeklinde paylaşıma açılması gerekli
 * (one-time manual setup). Yoksa share URL üretilir ama alıcı "no access" görür.
 */

import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export interface CreateMasterEditableResult {
  ok: boolean;
  designId?: string;
  shareUrl?: string;
  previewImageUrl?: string;
  instructionsPdfUrl?: string;
  error?: string;
}

/**
 * Bir trend ürünü için Editable Canva master design oluşturup DB'ye yazar.
 * Idempotent: aynı productId için ikinci çağrı eski design'ı bırakıp yeniden
 * üretir (caller dilerse eski design'ı silebilir Canva API'sinden).
 */
export async function createMasterEditableForProduct(
  productId: string,
): Promise<CreateMasterEditableResult> {
  // 1) Ürünü çek
  const rows = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  const product = rows[0];
  if (!product) {
    return { ok: false, error: 'product not found' };
  }

  const title = product.shop_title ?? product.etsy_title ?? 'Fly & Froth Printable';
  const bodyText =
    product.etsy_description ??
    product.shop_description ??
    product.turkish_summary ??
    title;

  // 2) Canva autofill — master editable design oluştur
  let designId: string;
  let previewBuffer: Buffer | null = null;
  try {
    const canvaGen = await import('@/lib/canva/generate');
    // Mevcut generateCanvaPost flow'u: brand template → autofill → PNG buffer
    // Bunu wrapper olarak kullan ama design ID'sini de geri alabilmek için
    // alttaki helpers'a direkt erişim olabilir. Önce mevcut wrapper'ı dene:
    const canvaResult = await canvaGen.generateCanvaPost({
      title,
      bodyText: bodyText.slice(0, 500), // template autofill text alanı sınırlı
      pillar: undefined,
    });
    designId = canvaResult.designId;
    previewBuffer = canvaResult.buffer;
  } catch (err) {
    return {
      ok: false,
      error: `canva autofill failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    };
  }

  // 3) Share URL üret (Agent 1)
  let shareUrl: string;
  try {
    const { createCopyableShareUrl } = await import('./share');
    const shareResult = await createCopyableShareUrl(designId);
    shareUrl = shareResult.shareUrl;
  } catch (err) {
    // Share URL fail — fallback olarak Canva design deeplink kullan
    console.warn(
      `[master-editable] share URL gen failed for ${designId}, falling back to deeplink:`,
      err instanceof Error ? err.message : err,
    );
    shareUrl = `https://www.canva.com/design/${designId}/view?mode=preview`;
  }

  // 4) Preview image'i Blob'a yükle
  let previewImageUrl: string | undefined;
  if (previewBuffer) {
    try {
      const { uploadImage } = await import('@/lib/blob');
      const blob = await uploadImage(
        previewBuffer,
        `editable-preview-${productId}-${Date.now()}.png`,
      );
      previewImageUrl = blob.url;
    } catch (err) {
      console.warn('[master-editable] preview upload failed:', err);
    }
  }

  // 5) Instructions PDF üret (Agent 2)
  let instructionsPdfUrl: string | undefined;
  try {
    const { buildInstructionsPdf } = await import('./instructions-pdf');
    const pdfResult = await buildInstructionsPdf({
      productTitle: title,
      canvaShareUrl: shareUrl,
      previewImageUrl,
      language: 'en', // Etsy core pazarı — DE varyantı Sprint J multi-lang ile
    });
    instructionsPdfUrl = pdfResult.url;
  } catch (err) {
    // Instructions PDF fail — ciddi, çünkü editable tier'ın asıl deliverable'ı
    // bu PDF (Canva link kuru ham link). Yine de share URL'yi DB'ye yaz —
    // belki manuel/sonra retry'da düzelir.
    console.error(
      '[master-editable] instructions PDF gen failed:',
      err instanceof Error ? err.message : err,
    );
  }

  // 6) DB'ye yaz (idempotent — instructions yoksa null yazılır, share URL persist eder)
  try {
    await db
      .update(products)
      .set({
        editable_canva_design_id:      designId,
        editable_canva_share_url:      shareUrl,
        editable_preview_image_url:    previewImageUrl ?? null,
        editable_instructions_pdf_url: instructionsPdfUrl ?? null,
        updated_at: new Date(),
      })
      .where(eq(products.id, productId));
  } catch (err) {
    return {
      ok: false,
      error: `DB update failed: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    };
  }

  console.log(
    `[master-editable] OK product=${productId} design=${designId} share=${shareUrl.slice(0, 60)}... preview=${previewImageUrl ? 'yes' : 'no'} pdf=${instructionsPdfUrl ? 'yes' : 'no'}`,
  );

  return {
    ok: true,
    designId,
    shareUrl,
    previewImageUrl,
    instructionsPdfUrl,
  };
}

/**
 * `Product.type` enum'u: 'planner' | 'poster' | 'sticker' | 'template' | 'social_template'.
 * Bu modül şu an type-spesifik branch'lemez (her tip aynı flow), ancak ileride
 * "social_template editable yok" gibi filtre eklenebilir.
 */
export type EditableEligibleType = 'planner' | 'poster' | 'sticker' | 'template' | 'social_template';
