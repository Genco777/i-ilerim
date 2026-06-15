/**
 * GET /api/admin/video-test?secret=<CRON_SECRET>&url=<image-url>
 *
 * Kling prediction'ı gerçek olarak tetikler, raw error / response döner.
 * Telegram'a slice'lanmadan tam mesajı görmek için.
 *
 * Default image URL: Mehmet'in en son apparel candidate flat_lay_url'u (DB'den).
 *
 * READ-ONLY (prediction create eder ama webhook yok, küçük cost ~$0.13).
 */

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apparelCandidates } from '@/lib/db/schema';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

interface PredictionResponse {
  id?: string;
  status?: string;
  error?: string | null;
  detail?: string;
  output?: unknown;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    return NextResponse.json({ ok: false, error: 'REPLICATE_API_TOKEN yok' });
  }

  // Image URL: query param veya DB'den son flat_lay_url
  let imageUrl = url.searchParams.get('url') ?? '';
  if (!imageUrl) {
    const rows = await db
      .select({ flat_lay_url: apparelCandidates.flat_lay_url, slogan: apparelCandidates.slogan })
      .from(apparelCandidates)
      .where(sql`${apparelCandidates.flat_lay_url} IS NOT NULL`)
      .orderBy(sql`${apparelCandidates.created_at} DESC`)
      .limit(1);
    imageUrl = rows[0]?.flat_lay_url ?? '';
  }

  if (!imageUrl) {
    return NextResponse.json({ ok: false, error: 'imageUrl yok — ?url=... veya DB\'de flat_lay_url\'lu candidate ekle' });
  }

  // Replicate predictions.create (sync wait yok, sadece start)
  // Kling v1.6 standard latest version ID: e6f571e8d6990da3c96abf8d3082894024d652822f0ca3cd244acece84a1cc3e
  const versionId = 'e6f571e8d6990da3c96abf8d3082894024d652822f0ca3cd244acece84a1cc3e';

  const requestBody = {
    version: versionId,
    input: {
      prompt: 'Camera slowly zooms in on the folded t-shirt with gentle smooth motion, soft natural daylight, cozy editorial aesthetic.',
      start_image: imageUrl,
      duration: 5,
      aspect_ratio: '4:5',
      cfg_scale: 0.5,
    },
  };

  let predictionRes: PredictionResponse | null = null;
  let predictionError: string | null = null;
  let httpStatus: number | null = null;
  let responseHeaders: Record<string, string> = {};

  try {
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'User-Agent': 'fly-froth-social/1.0',
      },
      body: JSON.stringify(requestBody),
    });
    httpStatus = res.status;
    responseHeaders = Object.fromEntries(res.headers.entries());
    const text = await res.text();
    try {
      predictionRes = JSON.parse(text) as PredictionResponse;
    } catch {
      predictionError = `Non-JSON response: ${text.slice(0, 500)}`;
    }
    if (!res.ok && !predictionError) {
      predictionError = `HTTP ${res.status}: ${text.slice(0, 500)}`;
    }
  } catch (err) {
    predictionError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }

  return NextResponse.json({
    ok: !predictionError,
    imageUrlUsed: imageUrl,
    requestBody,
    httpStatus,
    predictionResponse: predictionRes,
    predictionError,
    responseHeaders,
    hint: predictionError?.includes('quota')
      ? '→ Replicate quota/balance sorunu — billing page kontrol et'
      : predictionError?.includes('Insufficient')
      ? '→ Replicate kredi yetersiz — billing yatır'
      : predictionError
      ? '→ Yukarıdaki error mesajını paste et, beraber bakalım'
      : '→ Prediction başlatıldı (id var), id ile status follow edebilirsin: /v1/predictions/{id}',
  });
}
