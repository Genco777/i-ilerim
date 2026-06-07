/**
 * GET /api/admin/canva-diag?secret=<CRON_SECRET>
 *
 * Canva template diagnostic: aktif CANVA_TEMPLATE_ID_DEFAULT'u Canva API'ye
 * sorgular + dataset (autofill capable elements) listeler. Gerçek truth.
 */

import { NextResponse } from 'next/server';
import { canvaJson } from '@/lib/canva/client';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const templateId = url.searchParams.get('id') ?? process.env.CANVA_TEMPLATE_ID_DEFAULT;
  if (!templateId) {
    return NextResponse.json({ ok: false, error: 'CANVA_TEMPLATE_ID_DEFAULT env not set + no ?id= param' });
  }

  const result: Record<string, unknown> = {
    activeTemplateId: templateId,
    deploymentSha: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown',
  };

  // 1. Brand template meta
  try {
    const meta = await canvaJson<unknown>(`/brand-templates/${templateId}`);
    result.brandTemplateMeta = meta;
  } catch (err) {
    result.brandTemplateMetaError = err instanceof Error ? err.message : String(err);
  }

  // 2. Dataset (autofill capable elements)
  try {
    const dataset = await canvaJson<unknown>(`/brand-templates/${templateId}/dataset`);
    result.dataset = dataset;
  } catch (err) {
    result.datasetError = err instanceof Error ? err.message : String(err);
  }

  return NextResponse.json(result, { status: 200 });
}
