/**
 * GET /api/admin/printify-test-product?secret=<CRON_SECRET>
 *   &type=tshirt|hoodie|tote   (default: tshirt)
 *   &imageUrl=https://...      (default: DB'den son onaylı ürünün hero'su)
 *   &priceCents=2499           (default: 2499 = $24.99)
 *   &title=...                 (default: image kaynağından)
 *   &dryRun=1                  (true ise upload+create yapar, publish ATLAR)
 *   &publishToEtsy=1           (true ise Etsy'ye publish tetikler, default: 0)
 *
 * Sprint K Faz 2 — ilk gerçek apparel ürün testi.
 *
 * Flow:
 *   1. Image URL al (query ya da DB)
 *   2. Printify Image library'ye yükle
 *   3. Bella+Canvas 3001 (T-shirt) ürünü yarat — variant'lar otomatik
 *   4. dryRun değilse + publishToEtsy=1 ise → Etsy'ye sync tetikle
 *
 * Sonuç JSON: her adımın çıktısı (printify product ID, Etsy publish status).
 * Hata olursa hangi adımda kaldığı net görünür.
 *
 * NOT: publish edilen ürün Etsy'de DRAFT olarak gelir — Mehmet Etsy seller
 * dashboard'undan manuel "publish" yapmalı (24-48 saatte canlıya çıkar).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { desc, isNotNull, and, or, eq } from 'drizzle-orm';
import {
  uploadImageByUrl,
  uploadImageByBase64,
  createApparelProduct,
  publishProduct,
  getEtsyShop,
  APPAREL_PRESETS,
  type ApparelType,
} from '@/lib/publish/printify';
import { generateApparelDesign } from '@/lib/publish/apparel-design';
import { generateApparelDesignAI } from '@/lib/publish/apparel-design-ai';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

interface StepResult {
  step: string;
  ok: boolean;
  ms?: number;
  data?: unknown;
  error?: string;
}

function nowMs(): number {
  return Date.now();
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const typeParam = (url.searchParams.get('type') ?? 'tshirt').toLowerCase();
  if (!(typeParam in APPAREL_PRESETS)) {
    return NextResponse.json(
      { ok: false, error: `Invalid type. Use: tshirt | hoodie | tote (got: ${typeParam})` },
      { status: 400 },
    );
  }
  const type = typeParam as ApparelType;

  const inputImageUrl = url.searchParams.get('imageUrl');
  const slogan = url.searchParams.get('slogan');
  const subtitle = url.searchParams.get('subtitle') ?? undefined;
  const styleParam = (url.searchParams.get('style') ?? 'vintage-stamp').toLowerCase();
  const inkParam = (url.searchParams.get('ink') ?? 'dark').toLowerCase();
  // Faz 4: mode=ai (varsayılan) → Nano Banana 2 illustration+slogan combo
  //         mode=typo            → eski procedural tipografi (Faz 3)
  const modeParam = (url.searchParams.get('mode') ?? 'ai').toLowerCase();
  const themeParam = url.searchParams.get('theme') ?? undefined;
  const priceCents = Number(url.searchParams.get('priceCents') ?? '2499');
  const titleParam = url.searchParams.get('title');
  const dryRun = url.searchParams.get('dryRun') === '1';
  const publishToEtsy = url.searchParams.get('publishToEtsy') === '1';

  const steps: StepResult[] = [];

  // ─── Step 1: Image kaynağı (slogan > imageUrl > DB hero) ─────────
  // slogan varsa apparel-design ile generate et → base64 upload
  // yoksa eski davranış: ?imageUrl ya da DB son hero → URL upload
  let imageUrl: string | null = null;
  let imageBase64: string | null = null;
  let sourceProductId: string | null = null;
  let sourceTitle: string | null = null;
  const t1 = nowMs();
  try {
    if (slogan && slogan.trim() && modeParam === 'ai') {
      // Faz 4: Nano Banana 2 illustration + slogan combo (DEFAULT)
      const aiStyles = ['vintage-stamp', 'line-art', 'retro-poster', 'botanical', 'minimal-graphic'] as const;
      const aiStyle = (aiStyles as readonly string[]).includes(styleParam)
        ? (styleParam as typeof aiStyles[number])
        : 'vintage-stamp';

      const design = await generateApparelDesignAI({
        slogan: slogan.trim(),
        theme: themeParam,
        style: aiStyle,
        aspectRatio: '4:5',
        resolution: '2K',
      });
      imageBase64 = design.buffer.toString('base64');
      steps.push({
        step: 'image-url',
        ok: true,
        ms: nowMs() - t1,
        data: {
          source: 'nano-banana-ai',
          mode: 'ai',
          slogan: slogan.trim(),
          theme: themeParam ?? '(auto from slogan)',
          style: aiStyle,
          model: design.model,
          buffer_kb: Math.round(design.buffer.length / 1024),
          costUsd: design.costEstimateUsd,
          promptUsed: design.prompt.slice(0, 200),
        },
      });
    } else if (slogan && slogan.trim() && modeParam === 'typo') {
      // Faz 3 fallback: procedural typography (Mehmet artık ai tercih ediyor)
      const procStyles = ['minimal', 'stamp', 'serif'] as const;
      const style = (procStyles as readonly string[]).includes(styleParam)
        ? (styleParam as typeof procStyles[number])
        : 'minimal';
      const ink = (['dark', 'light', 'indigo'] as const).includes(inkParam as 'dark' | 'light' | 'indigo')
        ? (inkParam as 'dark' | 'light' | 'indigo')
        : 'dark';

      const design = await generateApparelDesign({
        slogan: slogan.trim(),
        subtitle,
        style,
        inkColor: ink,
        showBrand: true,
      });
      imageBase64 = design.buffer.toString('base64');
      steps.push({
        step: 'image-url',
        ok: true,
        ms: nowMs() - t1,
        data: {
          source: 'generated-typo',
          mode: 'typo',
          slogan: slogan.trim(),
          subtitle: subtitle ?? null,
          style,
          ink,
          width: design.width,
          height: design.height,
          buffer_kb: Math.round(design.buffer.length / 1024),
        },
      });
    } else if (inputImageUrl) {
      imageUrl = inputImageUrl;
      steps.push({ step: 'image-url', ok: true, ms: nowMs() - t1, data: { source: 'query', url: imageUrl } });
    } else {
      // DB'den son onaylı/yayınlanmış ürünün hero'su
      const rows = await db
        .select({ id: products.id, hero: products.hero_image_url, title: products.shop_title })
        .from(products)
        .where(
          and(
            isNotNull(products.hero_image_url),
            or(eq(products.status, 'approved'), eq(products.status, 'published')),
          ),
        )
        .orderBy(desc(products.created_at))
        .limit(1);

      if (rows.length === 0 || !rows[0].hero) {
        throw new Error('DB\'de hero_image_url\'lü onaylı/yayınlı ürün yok. ?imageUrl=... query param ile manuel ver.');
      }
      imageUrl = rows[0].hero;
      sourceProductId = rows[0].id;
      sourceTitle = rows[0].title ?? null;
      steps.push({
        step: 'image-url',
        ok: true,
        ms: nowMs() - t1,
        data: { source: 'db', productId: sourceProductId, title: sourceTitle, url: imageUrl },
      });
    }
  } catch (err) {
    // Hata olsa bile JSON döndür (200) — Vercel default error page'i göstermesin
    // Mehmet tarayıcıda direkt error mesajını görsün
    steps.push({
      step: 'image-url',
      ok: false,
      ms: nowMs() - t1,
      error: errMsg(err),
      data: {
        hint: 'Banana 2 fail olduysa: nano-banana-2 destekli mi kontrol et, ya da ?mode=typo ile eski tipografi dene',
      },
    });
    return NextResponse.json({ ok: false, steps }, { status: 200 });
  }

  // ─── Step 2: Etsy shop seç ───────────────────────────────────────
  let shopId: number;
  let shopTitle: string;
  const t2 = nowMs();
  try {
    const shop = await getEtsyShop();
    shopId = shop.id;
    shopTitle = shop.title;
    steps.push({ step: 'get-etsy-shop', ok: true, ms: nowMs() - t2, data: { shopId, shopTitle } });
  } catch (err) {
    steps.push({ step: 'get-etsy-shop', ok: false, ms: nowMs() - t2, error: errMsg(err) });
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  // ─── Step 3: Image upload (base64 ya da URL) ─────────────────────
  let uploadedImageId: string;
  let uploadedPreview: string;
  const t3 = nowMs();
  try {
    const uploaded = imageBase64
      ? await uploadImageByBase64(imageBase64, `apparel-slogan-${Date.now()}.png`)
      : await uploadImageByUrl(imageUrl!, `apparel-test-${Date.now()}.png`);
    uploadedImageId = uploaded.id;
    uploadedPreview = uploaded.preview_url;
    steps.push({
      step: 'upload-image',
      ok: true,
      ms: nowMs() - t3,
      data: {
        imageId: uploadedImageId,
        width: uploaded.width,
        height: uploaded.height,
        preview: uploadedPreview,
        size_kb: Math.round(uploaded.size / 1024),
        uploadMode: imageBase64 ? 'base64' : 'url',
      },
    });
  } catch (err) {
    steps.push({ step: 'upload-image', ok: false, ms: nowMs() - t3, error: errMsg(err) });
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  // ─── Step 4: Product create ──────────────────────────────────────
  const sloganTitle = slogan?.trim();
  const finalTitle = (titleParam ?? sloganTitle ?? sourceTitle ?? 'Fly & Froth — Test Apparel').slice(0, 130);
  const description = [
    `${finalTitle}`,
    '',
    'Soft, comfortable, designed in our studio in Karben, Germany.',
    'Premium fabric, durable print. Ships from US.',
    '',
    '— Fly & Froth Studio',
  ].join('\n');
  const tags = ['fly and froth', 'apparel', 'modern', 'minimalist', 'gift', 'unisex', 'studio'];

  let productId: string;
  let variantCount: number;
  const t4 = nowMs();
  try {
    const product = await createApparelProduct({
      shopId,
      type,
      title: finalTitle,
      description,
      imageId: uploadedImageId,
      priceCents,
      tags,
    });
    productId = product.id;
    variantCount = product.variants?.length ?? 0;
    steps.push({
      step: 'create-product',
      ok: true,
      ms: nowMs() - t4,
      data: {
        productId,
        type,
        variantCount,
        title: product.title,
        blueprintId: product.blueprint_id,
      },
    });
  } catch (err) {
    steps.push({ step: 'create-product', ok: false, ms: nowMs() - t4, error: errMsg(err) });
    return NextResponse.json({ ok: false, steps }, { status: 500 });
  }

  // ─── Step 5: Publish to Etsy (optional) ──────────────────────────
  if (dryRun || !publishToEtsy) {
    steps.push({
      step: 'publish-etsy',
      ok: true,
      data: {
        skipped: true,
        reason: dryRun ? 'dryRun=1' : 'publishToEtsy=0 (default — manuel onay için bekleniyor)',
        hint: 'Hazırsan tekrar ?publishToEtsy=1 ile çağır',
      },
    });
  } else {
    const t5 = nowMs();
    try {
      await publishProduct(shopId, productId);
      steps.push({
        step: 'publish-etsy',
        ok: true,
        ms: nowMs() - t5,
        data: {
          note: 'Printify Etsy sync tetiklendi. Etsy seller dashboard\'unda 1-5dk içinde DRAFT olarak görünecek.',
          dashboard: 'https://www.etsy.com/your/shops/me/tools/listings/drafts',
        },
      });
    } catch (err) {
      steps.push({ step: 'publish-etsy', ok: false, ms: nowMs() - t5, error: errMsg(err) });
      // Publish hatası fatal değil — ürün Printify'da yaratıldı, manuel publish edilebilir
      return NextResponse.json({ ok: false, partial: true, steps }, { status: 207 });
    }
  }

  return NextResponse.json({
    ok: true,
    summary: {
      type,
      shopId,
      shopTitle,
      productId,
      variantCount,
      priceCents,
      sourceProductId,
      publishToEtsy: publishToEtsy && !dryRun,
    },
    steps,
    next_steps: [
      '1. Printify dashboard\'unda ürünü kontrol et: https://printify.com/app/products',
      '2. publishToEtsy=1 ile çağırdıysan Etsy draft\'ı kontrol et: https://www.etsy.com/your/shops/me/tools/listings/drafts',
      '3. Etsy draft\'ında resim, fiyat, başlık, kategori uygun mu bak; canlıya alacaksan oradan "Yayınla" tıkla.',
      '4. Ürün silmek için Printify dashboard\'unda → Products → Delete (Etsy draft\'ı da otomatik kalkar).',
    ],
  });
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message.slice(0, 500) : String(err);
}
