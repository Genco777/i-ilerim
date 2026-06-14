/**
 * POST /api/webhooks/printify
 *
 * Sprint L Faz 3 — Printify webhook handler.
 *
 * Events handled:
 *   - product:publish:succeeded → etsy_listing_id DB'ye yazılır, status=published
 *   - product:publish:failed    → status=failed, error_log yazılır
 *
 * Signature verification: Printify webhook'larda HMAC SHA-256 imzası vardır
 * (PRINTIFY_WEBHOOK_SECRET env ile karşılaştırılır). Eksikse warn-only mode.
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apparelCandidates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { sendMessage } from '@/lib/telegram/bot';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 30;

interface PrintifyWebhookPayload {
  id?: string;
  type?: string;
  created_at?: string;
  resource?: {
    id?: string;
    type?: string;
    data?: {
      shop_id?: number;
      reason?: string;
      action?: string;
      external?: {
        id?: string;
        handle?: string;
      };
    };
  };
}

function getAdminUserIds(): number[] {
  return (process.env.ALLOWED_TELEGRAM_USER_IDS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

async function notifyAdminsApparelEvent(text: string): Promise<void> {
  const ids = getAdminUserIds();
  for (const chatId of ids) {
    try {
      await sendMessage({ chatId, text, parseMode: 'Markdown' });
    } catch (err) {
      console.warn('[printify-webhook] notify fail:', err instanceof Error ? err.message : String(err));
    }
  }
}

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  // Printify format: 'sha256=<hex>'
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const received = signature.replace(/^sha256=/, '');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();

  // Signature check (opsiyonel — secret yoksa warn-only)
  const signature = req.headers.get('x-pfy-signature');
  const secret = process.env.PRINTIFY_WEBHOOK_SECRET;
  if (secret) {
    if (!verifySignature(rawBody, signature, secret)) {
      console.warn('[printify-webhook] invalid signature');
      return new NextResponse('Invalid signature', { status: 401 });
    }
  } else {
    console.warn('[printify-webhook] PRINTIFY_WEBHOOK_SECRET yok — signature check atlanıyor');
  }

  let payload: PrintifyWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as PrintifyWebhookPayload;
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }

  const eventType = payload.type ?? '';
  const productId = payload.resource?.id;
  const externalId = payload.resource?.data?.external?.id;
  const externalHandle = payload.resource?.data?.external?.handle;
  const reason = payload.resource?.data?.reason;

  if (!productId) {
    return NextResponse.json({ ok: true, ignored: true, reason: 'no-product-id', eventType });
  }

  // DB'de candidate bul
  const rows = await db
    .select()
    .from(apparelCandidates)
    .where(eq(apparelCandidates.printify_product_id, productId))
    .limit(1);

  if (rows.length === 0) {
    // Belki bizim apparel cron'umuzdan değil — sessizce geç
    return NextResponse.json({ ok: true, ignored: true, reason: 'no-candidate-match', productId, eventType });
  }
  const candidate = rows[0];

  if (eventType === 'product:publish:succeeded' || eventType === 'product:publish.succeeded') {
    await db
      .update(apparelCandidates)
      .set({
        status: 'published',
        etsy_listing_id: externalId ?? null,
        updated_at: new Date(),
      })
      .where(eq(apparelCandidates.id, candidate.id));

    const etsyUrl = externalHandle ?? (externalId ? `https://www.etsy.com/listing/${externalId}` : null);

    // Sprint M4 — Etsy listing'e extra asset auto-upload + DRAFT force
    let uploadSummary = '';
    let draftSummary = '';
    if (externalId) {
      const listingId = Number(externalId);

      // 1) Extra asset upload (flat lay cover, color grid, size chart, video)
      try {
        const { uploadApparelAssetsToEtsy } = await import('@/lib/publish/etsy-apparel-upload');
        const upload = await uploadApparelAssetsToEtsy({
          listingId,
          flatLayUrl: candidate.flat_lay_url,
          colorGridUrl: candidate.color_grid_url,
          sizeChartUrl: candidate.size_chart_url,
          videoUrl: candidate.video_url,
        });
        uploadSummary = `\n📤 Auto-upload: ${upload.uploadedCount} OK, ${upload.errorCount} fail`;
        console.log('[printify-webhook] etsy upload result:', JSON.stringify(upload).slice(0, 400));
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 180) : String(err);
        uploadSummary = `\n⚠️ Auto-upload fail: ${msg}`;
        console.warn('[printify-webhook] etsy upload fail:', msg);
      }

      // 2) DRAFT force — Etsy mağaza ayarı listing'i ACTIVE'e çekmiş olabilir,
      // bizim sistem garanti DRAFT yapsın (Mehmet manual review için bekler).
      try {
        const { setListingStateDraft } = await import('@/lib/publish/etsy-apparel-upload');
        await setListingStateDraft(listingId);
        draftSummary = `\n📝 Listing DRAFT'a alındı`;
      } catch (err) {
        const msg = err instanceof Error ? err.message.slice(0, 120) : String(err);
        draftSummary = `\n⚠️ DRAFT force fail (manuel kontrol): ${msg}`;
        console.warn('[printify-webhook] etsy state=draft fail:', msg);
      }
    }

    await notifyAdminsApparelEvent(
      [
        `🟢 *Etsy'de DRAFT hazır!*`,
        ``,
        `*${candidate.slogan}*`,
        candidate.niche ? `_niche: ${candidate.niche}_` : '',
        externalId ? `Etsy listing: ${externalId}` : '',
        etsyUrl ? `🔗 ${etsyUrl}` : '',
        uploadSummary,
        draftSummary,
        ``,
        `👀 Etsy DRAFT'ı aç → son göz at → "Yayınla"`,
      ].filter(Boolean).join('\n'),
    );

    return NextResponse.json({ ok: true, productId, etsyListingId: externalId, uploadSummary });
  }

  if (eventType === 'product:publish:failed' || eventType === 'product:publish.failed') {
    await db
      .update(apparelCandidates)
      .set({
        status: 'failed',
        error_log: `printify-publish-fail: ${reason ?? '(no reason)'}`,
        updated_at: new Date(),
      })
      .where(eq(apparelCandidates.id, candidate.id));

    await notifyAdminsApparelEvent(
      [
        `🔴 *Etsy publish fail!*`,
        ``,
        `*${candidate.slogan}*`,
        `Sebep: ${reason ?? '(belirtilmemiş)'}`,
        ``,
        `Printify dashboard'da kontrol et:`,
        `https://printify.com/app/store/products/${productId}`,
      ].join('\n'),
    );

    return NextResponse.json({ ok: true, productId, status: 'failed', reason });
  }

  // Diğer event tipleri sessizce kabul
  return NextResponse.json({ ok: true, ignored: true, eventType, productId });
}

// Health check
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/webhooks/printify',
    events: ['product:publish:succeeded', 'product:publish:failed'],
    signatureCheck: process.env.PRINTIFY_WEBHOOK_SECRET ? 'enabled' : 'disabled (PRINTIFY_WEBHOOK_SECRET yok)',
  });
}
