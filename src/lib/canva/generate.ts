/**
 * canva/generate.ts
 *
 * Instagram post üretim pipeline'ı — Canva Connect API üzerinden:
 *
 *  1. AI görselini Canva'ya asset olarak yükle
 *  2a. CANVA_TEMPLATE_ID_<PILLAR> varsa → brand template autofill
 *  2b. Yoksa → boş instagram_post design oluştur, görseli ekle
 *  3. PNG olarak export et (1080×1080)
 *  4. Buffer olarak döndür
 *
 * Çevre değişkenleri:
 *   CANVA_CLIENT_ID            — Canva app client ID
 *   CANVA_CLIENT_SECRET        — Canva app client secret
 *   CANVA_TEMPLATE_ID_DEFAULT  — Varsayılan Instagram post şablonu
 *   CANVA_TEMPLATE_ID_VITRINE  — (opsiyonel) vitrine pillar şablonu
 *   CANVA_TEMPLATE_ID_REEL     — (opsiyonel) reel pillar şablonu
 *   CANVA_TEMPLATE_ID_LOKAL    — (opsiyonel) lokal pillar şablonu
 */

import { canvaFetch, canvaJson } from './client';
import type { ContentPillar } from '@/types';

// ── Asset upload ──────────────────────────────────────────────────────────────

interface AssetUploadResponse {
  job: { id: string; status: string };
}

interface AssetUploadJob {
  job: {
    id: string;
    status: 'failed' | 'in_progress' | 'success';
    asset?: { id: string };
    error?: { code: string; message: string };
  };
}

async function uploadAsset(imageBuffer: Buffer, filename: string): Promise<string> {
  // Multipart upload — Canva requires two headers for the asset metadata
  const res = await canvaFetch('/asset-uploads', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Asset-Upload-Metadata': JSON.stringify({ name_base64: Buffer.from(filename).toString('base64') }),
    },
    body: new Blob([imageBuffer as unknown as ArrayBuffer]),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Canva asset upload failed (${res.status}): ${err}`);
  }

  const data = await res.json() as AssetUploadResponse;
  const jobId = data.job.id;

  // Poll until done
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const job = await canvaJson<AssetUploadJob>(`/asset-uploads/${jobId}`);
    if (job.job.status === 'success' && job.job.asset?.id) {
      return job.job.asset.id;
    }
    if (job.job.status === 'failed') {
      throw new Error(`Canva asset upload job failed: ${job.job.error?.message}`);
    }
  }
  throw new Error('Canva asset upload timed out');
}

// ── Brand template autofill ───────────────────────────────────────────────────

interface AutofillResponse {
  job: { id: string; status: string };
}

interface AutofillJob {
  job: {
    id: string;
    status: 'failed' | 'in_progress' | 'success';
    result?: { design: { id: string } };
    error?: { code: string; message: string };
  };
}

async function autofillTemplate(
  templateId: string,
  title: string,
  bodyText: string,
  assetId?: string,
): Promise<string> {
  const data_fields: Record<string, unknown>[] = [
    { name: 'title', type: 'text', text: { text: title } },
    { name: 'body', type: 'text', text: { text: bodyText } },
  ];

  if (assetId) {
    data_fields.push({ name: 'hero_image', type: 'image', asset: { asset_id: assetId } });
  }

  const res = await canvaJson<AutofillResponse>(
    `/brand-templates/${templateId}/autofills`,
    {
      method: 'POST',
      body: JSON.stringify({ data: { data_fields } }),
    },
  );

  const jobId = res.job.id;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await canvaJson<AutofillJob>(`/brand-templates/${templateId}/autofills/${jobId}`);
    if (job.job.status === 'success' && job.job.result?.design.id) {
      return job.job.result.design.id;
    }
    if (job.job.status === 'failed') {
      throw new Error(`Canva autofill failed: ${job.job.error?.message}`);
    }
  }
  throw new Error('Canva autofill timed out');
}

// ── Design export ─────────────────────────────────────────────────────────────

interface ExportResponse {
  job: { id: string; status: string };
}

interface ExportJob {
  job: {
    id: string;
    status: 'failed' | 'in_progress' | 'success';
    urls?: string[];
    error?: { code: string; message: string };
  };
}

async function exportDesignAsPng(designId: string): Promise<Buffer> {
  const res = await canvaJson<ExportResponse>('/exports', {
    method: 'POST',
    body: JSON.stringify({
      design_id: designId,
      format: { type: 'png', width: 1080, height: 1080, lossless: false },
    }),
  });

  const jobId = res.job.id;

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const job = await canvaJson<ExportJob>(`/exports/${jobId}`);
    if (job.job.status === 'success' && job.job.urls?.[0]) {
      const imgRes = await fetch(job.job.urls[0]);
      return Buffer.from(await imgRes.arrayBuffer());
    }
    if (job.job.status === 'failed') {
      throw new Error(`Canva export failed: ${job.job.error?.message}`);
    }
  }
  throw new Error('Canva export timed out');
}

// ── Pillar → template ID ──────────────────────────────────────────────────────

function getTemplateId(pillar?: ContentPillar): string | null {
  const env = process.env;
  const byPillar: Record<string, string | undefined> = {
    vitrine:   env.CANVA_TEMPLATE_ID_VITRINE,
    reel:      env.CANVA_TEMPLATE_ID_REEL,
    lokal:     env.CANVA_TEMPLATE_ID_LOKAL,
    edukatif:  env.CANVA_TEMPLATE_ID_EDUKATIF,
    sosyal:    env.CANVA_TEMPLATE_ID_SOSYAL,
  };
  if (pillar && byPillar[pillar]) return byPillar[pillar]!;
  return env.CANVA_TEMPLATE_ID_DEFAULT ?? null;
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface CanvaGenerateOpts {
  /** İçerik konusu / başlık */
  title: string;
  /** Post gövde metni */
  bodyText: string;
  /** Content pillar — doğru şablonu seçmek için */
  pillar?: ContentPillar;
  /** AI tarafından üretilen ham görsel (varsa şablona hero olarak girer) */
  heroImageBuffer?: Buffer;
}

export interface CanvaGenerateResult {
  buffer: Buffer;
  designId: string;
  provider: 'canva';
}

/**
 * Canva üzerinden Instagram post görseli üretir.
 *
 * Eğer CANVA_TEMPLATE_ID_* tanımlıysa brand template autofill kullanır.
 * Tanımlı değilse hata fırlatır — önce şablonları Canva'da oluşturup ID'leri .env'e ekle.
 */
export async function generateCanvaPost(opts: CanvaGenerateOpts): Promise<CanvaGenerateResult> {
  const templateId = getTemplateId(opts.pillar);

  if (!templateId) {
    throw new Error(
      'Canva şablon ID bulunamadı. .env dosyasına CANVA_TEMPLATE_ID_DEFAULT ekle.\n' +
      'Canva\'da bir Instagram post şablonu aç → URL\'deki design ID\'yi kopyala.',
    );
  }

  // 1. Hero görseli Canva'ya yükle (varsa)
  let assetId: string | undefined;
  if (opts.heroImageBuffer) {
    assetId = await uploadAsset(opts.heroImageBuffer, `hero-${Date.now()}.png`);
  }

  // 2. Şablonu autofill ile doldur → design ID al
  const designId = await autofillTemplate(templateId, opts.title, opts.bodyText, assetId);

  // 3. PNG olarak export et
  const buffer = await exportDesignAsPng(designId);

  return { buffer, designId, provider: 'canva' };
}
