/**
 * Video Generation — Faz 2-D
 *
 * Uses Higgsfield Cloud's DoP (Director of Photography) model for cinematic
 * camera movement from a still hero image. DoP excels at the exact use case
 * we want: product still → slow dolly-in / parallax pan / rack focus,
 * "shot on Hasselblad" feel rather than animated content.
 *
 * Async flow:
 *   1. POST {prompt, image_url, duration} to platform.higgsfield.ai/<model>
 *   2. Returns {request_id, status_url} immediately
 *   3. Poll status_url until {status: 'completed'} with {video: {url}}
 *   4. Download MP4 → upload to Vercel Blob → return public URL
 *
 * Polling timeout: 6 min (Higgsfield DoP typical ≈ 60-180 s).
 * Cron route maxDuration = 800 s — fits comfortably for 2 products.
 */

import { uploadImage } from '@/lib/blob';
import type { NicheCandidate } from './discovery';
import type { ProductContent } from './content';

export interface ProductVideoResult {
  url: string;
  pathname: string;
  durationSec: number;
  modelUsed: string;
  promptUsed: string;
  requestId: string;
}

const HIGGSFIELD_BASE = 'https://platform.higgsfield.ai';
const DEFAULT_MODEL = 'higgsfield-ai/dop/standard';

function getCredentials(): { key: string; secret: string } {
  const key = process.env.HIGGSFIELD_API_KEY;
  const secret = process.env.HIGGSFIELD_API_SECRET;
  if (!key || !secret) {
    throw new Error(
      'HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must both be set. ' +
        'Get them at https://cloud.higgsfield.ai/api-keys',
    );
  }
  return { key, secret };
}

function authHeader(): string {
  const { key, secret } = getCredentials();
  return `Key ${key}:${secret}`;
}

function resolveModel(): string {
  const env = process.env.HIGGSFIELD_VIDEO_MODEL;
  if (env && /^[a-z0-9-]+\/[a-z0-9./-]+$/i.test(env)) return env;
  return DEFAULT_MODEL;
}

/**
 * Build a DoP-tuned prompt — Higgsfield DoP reads "camera direction" prompts
 * better than narrative prompts. We tell it the camera move explicitly.
 */
function buildVideoPrompt(
  niche: NicheCandidate,
  content: ProductContent,
): string {
  const cameraByType: Record<NicheCandidate['productHint'], string> = {
    planner:
      'slow cinematic dolly-in from above, gentle parallax over the open planner, soft window light shifts subtly',
    poster:
      'slow push-in on the framed poster, light dust particles drift through warm side-light',
    sticker:
      'gentle horizontal pan across the sticker sheet, soft overhead light catches paper texture',
    template:
      'smooth dolly-in over the laptop screen showing the template, ambient blur on background',
    social_template:
      'slow cinematic push-in on the phone screen, gentle bokeh shifts in background',
  };
  const cameraMove = cameraByType[niche.productHint] ?? cameraByType.planner;
  return [
    `Editorial still-life: ${content.shopTitle}. Theme: ${niche.topic}.`,
    `Camera direction: ${cameraMove}.`,
    'Cinematic, magazine-quality, restrained colour palette, gentle film grain.',
    'Subject stays still — only the CAMERA moves; no animated objects, no rotating items, no changing text.',
  ].join(' ');
}

interface HiggsfieldCreateResponse {
  request_id: string;
  status_url?: string;
}

interface HiggsfieldStatusResponse {
  status: 'pending' | 'in_progress' | 'queued' | 'completed' | 'failed' | 'nsfw';
  request_id: string;
  video?: { url: string };
  images?: Array<{ url: string }>;
  error?: string;
}

async function postCreate(
  model: string,
  body: Record<string, unknown>,
): Promise<HiggsfieldCreateResponse> {
  const url = `${HIGGSFIELD_BASE}/${model}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Higgsfield create failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return (await res.json()) as HiggsfieldCreateResponse;
}

async function pollStatus(
  requestId: string,
  statusUrl?: string,
): Promise<HiggsfieldStatusResponse> {
  const url = statusUrl ?? `${HIGGSFIELD_BASE}/requests/${requestId}/status`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { Authorization: authHeader(), Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Higgsfield status failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as HiggsfieldStatusResponse;
}

async function waitForCompletion(
  requestId: string,
  statusUrl: string | undefined,
  opts: { intervalMs: number; maxAttempts: number },
): Promise<HiggsfieldStatusResponse> {
  for (let i = 0; i < opts.maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, opts.intervalMs));
    const s = await pollStatus(requestId, statusUrl);
    if (s.status === 'completed') return s;
    if (s.status === 'failed' || s.status === 'nsfw') {
      throw new Error(
        `Higgsfield generation ${s.status}: ${s.error ?? '(no detail)'}`,
      );
    }
  }
  throw new Error(`Higgsfield generation timed out after ${opts.maxAttempts} polls`);
}

/**
 * Creates a video generation request, polls until ready, downloads the MP4,
 * uploads to Vercel Blob. Returns the public URL ready for sendVideo.
 */
export async function generateProductVideo(
  niche: NicheCandidate,
  content: ProductContent,
  productId: string,
  heroUrl: string,
): Promise<ProductVideoResult> {
  const model = resolveModel();
  const prompt = buildVideoPrompt(niche, content);

  // Higgsfield DoP body. Field names follow the docs/examples.
  const created = await postCreate(model, {
    prompt,
    image_url: heroUrl,
    duration: 5,
    aspect_ratio: '9:16',
  });

  // Poll every 5s, up to 6 minutes (72 attempts)
  const final = await waitForCompletion(created.request_id, created.status_url, {
    intervalMs: 5_000,
    maxAttempts: 72,
  });

  if (!final.video?.url) {
    throw new Error('Higgsfield completed but returned no video URL');
  }

  // Download → re-upload to OUR Blob (Higgsfield URLs may have short TTL).
  const fetched = await fetch(final.video.url);
  if (!fetched.ok) {
    throw new Error(`Failed to download Higgsfield MP4: ${fetched.status}`);
  }
  const buffer = Buffer.from(await fetched.arrayBuffer());
  const filename = `trend/${productId}/video-${Date.now()}.mp4`;
  const uploaded = await uploadImage(buffer, filename, 'video/mp4');

  return {
    url: uploaded.url,
    pathname: uploaded.pathname,
    durationSec: 5,
    modelUsed: model,
    promptUsed: prompt,
    requestId: created.request_id,
  };
}
