/**
 * GET /api/admin/printify-diag?secret=<CRON_SECRET>
 *
 * Printify hesabını teşhis et: token geçerli mi, Etsy shop bağlı mı,
 * blueprint+provider erişimi var mı. Sprint K kurulum doğrulama.
 *
 * READ-ONLY — hiçbir ürün/upload/order yaratmaz.
 */

import { NextResponse } from 'next/server';
import { diagnosePrintify } from '@/lib/publish/printify';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const diag = await diagnosePrintify();
  return NextResponse.json({
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    apiToken: diag.apiTokenValid ? 'valid ✅' : `invalid ❌ — ${diag.error}`,
    shopCount: diag.shops.length,
    shops: diag.shops.map((s) => ({ id: s.id, title: s.title, channel: s.sales_channel })),
    etsyConnected: diag.etsyShop ? `✅ shop_id=${diag.etsyShop.id} (${diag.etsyShop.title})` : '❌ no Etsy shop',
    next_step: diag.etsyShop
      ? 'Ready — apparel product create test endpoint can run'
      : 'Connect Etsy in Printify dashboard first: https://printify.com/app/dashboard',
  });
}
