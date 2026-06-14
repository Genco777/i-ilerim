/**
 * GET /api/admin/printify-providers?secret=<CRON_SECRET>&blueprintId=384
 *
 * Bir blueprint için available print provider'ları listele.
 * Sprint K Faz 2 debug — APPAREL_PRESETS'teki provider_id'leri doğrulamak için.
 *
 * Default blueprintIds: 384 (Bella+Canvas T-shirt), 6 (Gildan Hoodie), 49 (Tote)
 * — `?blueprintId=6` ile özel sorgu yap.
 */

import { NextResponse } from 'next/server';

const PRINTIFY_API_BASE = 'https://api.printify.com/v1';

interface Provider {
  id: number;
  title: string;
  location: { country?: string; region?: string };
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const token = process.env.PRINTIFY_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'PRINTIFY_API_TOKEN env yok' }, { status: 500 });
  }

  // Tek blueprint sorgusu mı, yoksa tüm preset'lerin providers'ı mı?
  const single = url.searchParams.get('blueprintId');
  const blueprintIds = single ? [Number(single)] : [384, 6, 49];
  if (single && !Number.isFinite(Number(single))) {
    return NextResponse.json({ ok: false, error: `blueprintId sayı olmalı (got: ${single})` }, { status: 400 });
  }

  const results: Record<string, unknown> = {};

  for (const bpId of blueprintIds) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${PRINTIFY_API_BASE}/catalog/blueprints/${bpId}/print_providers.json`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'User-Agent': 'fly-froth-social/1.0',
        },
      });
      if (!res.ok) {
        const txt = await res.text();
        results[`blueprint_${bpId}`] = {
          ok: false,
          status: res.status,
          error: txt.slice(0, 400),
          ms: Date.now() - t0,
        };
        continue;
      }
      const providers = (await res.json()) as Provider[];
      results[`blueprint_${bpId}`] = {
        ok: true,
        ms: Date.now() - t0,
        count: providers.length,
        providers: providers.map((p) => ({
          id: p.id,
          title: p.title,
          country: p.location?.country ?? p.location?.region ?? '?',
        })),
        suggested_provider_id: providers[0]?.id ?? null,
        note: 'İlk provider genelde en hızlı/popüler olur. APPAREL_PRESETS\'i bu ID ile güncelle.',
      };
    } catch (err) {
      results[`blueprint_${bpId}`] = {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        ms: Date.now() - t0,
      };
    }
  }

  return NextResponse.json({
    ok: true,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
    blueprintsQueried: blueprintIds,
    results,
    next_step: 'Her blueprint için suggested_provider_id\'yi al, src/lib/publish/printify.ts APPAREL_PRESETS\'i güncelle.',
  });
}
