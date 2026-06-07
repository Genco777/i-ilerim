/**
 * GET /api/admin/env-check?secret=<CRON_SECRET>
 *
 * Hızlı debug: Canva + diğer kritik env'lerin Vercel'de gerçekten set'li
 * olup olmadığını gösterir. Değerleri AÇMAZ — sadece "SET" / "MISSING" durumu.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const envs = [
    // Canva Connect (Sprint I)
    'CANVA_CLIENT_ID',
    'CANVA_CLIENT_SECRET',
    'CANVA_TEMPLATE_ID_DEFAULT',
    'CANVA_REDIRECT_URI',
    // Other crucial
    'POST_DESIGN_MODE',
    'OPENAI_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'DATABASE_URL',
    'STRIPE_SECRET_KEY',
    'NEXT_PUBLIC_GA4_ID',
    'NEXT_PUBLIC_META_PIXEL_ID',
    'PINTEREST_APP_ID',
  ];

  const status: Record<string, { set: boolean; preview?: string }> = {};
  for (const key of envs) {
    const val = process.env[key];
    if (!val) {
      status[key] = { set: false };
    } else {
      // Preview: first 8 + last 4 char, mask middle (don't leak secret)
      const preview = val.length <= 12
        ? `(${val.length} char)`
        : `${val.slice(0, 8)}...${val.slice(-4)} (${val.length} char)`;
      status[key] = { set: true, preview };
    }
  }

  // Hesap durumu
  const canvaReady = Boolean(
    process.env.CANVA_CLIENT_ID &&
    process.env.CANVA_CLIENT_SECRET &&
    process.env.CANVA_TEMPLATE_ID_DEFAULT,
  );

  return NextResponse.json({
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    canvaConfigured: canvaReady,
    designMode: process.env.POST_DESIGN_MODE ?? 'auto',
    envs: status,
  });
}
