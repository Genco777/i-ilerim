/**
 * GET /api/admin/printify-webhook-setup?secret=<CRON_SECRET>
 *   &action=list      — mevcut webhook'ları listele (default)
 *   &action=create    — apparel webhook'larını kur (idempotent)
 *   &action=clear     — tüm webhook'ları sil (yeniden setup için)
 *
 * Sprint L Faz 3 — One-time webhook kurulum endpoint'i.
 *
 * Yarattığı webhook'lar:
 *   - product:publish:succeeded → /api/webhooks/printify
 *   - product:publish:failed    → /api/webhooks/printify
 *
 * Secret: PRINTIFY_WEBHOOK_SECRET (env) — opsiyonel, varsa signature gönderir.
 */

import { NextResponse } from 'next/server';
import {
  getEtsyShop,
  listWebhooks,
  createWebhook,
  deleteWebhook,
  type PrintifyWebhook,
} from '@/lib/publish/printify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const WEBHOOK_TOPICS = ['product:publish:succeeded', 'product:publish:failed'] as const;

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get('secret') !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const action = (url.searchParams.get('action') ?? 'list').toLowerCase();
  const webhookSecret = process.env.PRINTIFY_WEBHOOK_SECRET;
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shop.fly-froth.com';
  const webhookUrl = `${baseUrl}/api/webhooks/printify`;

  let shop;
  try {
    shop = await getEtsyShop();
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }

  // LIST
  if (action === 'list') {
    const webhooks = await listWebhooks(shop.id);
    return NextResponse.json({
      ok: true,
      shopId: shop.id,
      shopTitle: shop.title,
      webhookUrl,
      signatureSecretConfigured: Boolean(webhookSecret),
      webhooks,
      hint: 'Webhook yoksa: ?action=create',
    });
  }

  // CLEAR
  if (action === 'clear') {
    const existing = await listWebhooks(shop.id);
    const deleted: string[] = [];
    const errors: string[] = [];
    for (const wh of existing) {
      try {
        await deleteWebhook(shop.id, wh.id);
        deleted.push(`${wh.topic} (${wh.id})`);
      } catch (err) {
        errors.push(`${wh.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return NextResponse.json({ ok: errors.length === 0, deletedCount: deleted.length, deleted, errors });
  }

  // CREATE — idempotent (varolanı atla)
  if (action === 'create') {
    const existing = await listWebhooks(shop.id);
    const existingMap = new Map<string, PrintifyWebhook>();
    for (const wh of existing) {
      existingMap.set(`${wh.topic}@${wh.url}`, wh);
    }
    const created: PrintifyWebhook[] = [];
    const skipped: string[] = [];
    const errors: string[] = [];

    for (const topic of WEBHOOK_TOPICS) {
      const key = `${topic}@${webhookUrl}`;
      if (existingMap.has(key)) {
        skipped.push(topic);
        continue;
      }
      try {
        const wh = await createWebhook(shop.id, topic, webhookUrl, webhookSecret);
        created.push(wh);
      } catch (err) {
        errors.push(`${topic}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return NextResponse.json({
      ok: errors.length === 0,
      shopId: shop.id,
      webhookUrl,
      signatureSecretSent: Boolean(webhookSecret),
      created: created.map((wh) => ({ id: wh.id, topic: wh.topic })),
      skipped,
      errors,
      next_steps: [
        'Mehmet /approve_<id> yaptığında Printify Etsy sync başlar.',
        'Sync biter bitmez webhook tetiklenir → /api/webhooks/printify çağrılır.',
        'DB candidate status=published olur + Telegram\'a "Etsy\'de yayında" mesajı düşer.',
      ],
    });
  }

  return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 });
}
