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
  const multipleEtsy = diag.shops.filter((s) => s.sales_channel === 'etsy').length > 1;
  return NextResponse.json({
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    apiToken: diag.apiTokenValid ? 'valid ✅' : `invalid ❌ — ${diag.error}`,
    shopCount: diag.shops.length,
    shops: diag.shops.map((s) => ({ id: s.id, title: s.title, channel: s.sales_channel })),
    envShopId: diag.envShopId ?? '(set yok — first-etsy fallback)',
    selectionMode: diag.selectionMode,
    etsyConnected: diag.etsyShop ? `✅ shop_id=${diag.etsyShop.id} (${diag.etsyShop.title})` : '❌ no Etsy shop',
    warning: !diag.envShopId && multipleEtsy
      ? '⚠️ Birden çok Etsy shop var, PRINTIFY_SHOP_ID env zorunlu — yanlış mağazaya ürün gidebilir!'
      : null,
    next_step: diag.etsyShop
      ? diag.selectionMode === 'env'
        ? 'Ready (env-pinned) — apparel product create test endpoint can run'
        : 'Çalışıyor ama PRINTIFY_SHOP_ID env eklemeyi öner (yanlış shop riski)'
      : 'Connect Etsy in Printify dashboard first: https://printify.com/app/dashboard',
  });
}
