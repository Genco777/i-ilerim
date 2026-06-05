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
// DoP family is camera-focused (minimises subject distortion). Valid slugs
// per the API enum: lite / standard / turbo (+ first-last-frame variants).
// `preview` from the docs example is NOT a valid slug → was returning 422.
// Standard is the quality sweet spot; turbo is faster/cheaper, lite is budget.
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
  // Camera moves tuned for "high-end commercial product film" feel.
  // DoP Preview rewards SPECIFIC camera direction (Hasselblad, Arri, focal length).
  const cameraByType: Record<NicheCandidate['productHint'], string> = {
    planner:
      'DRAMATIC cinematic dolly-in shot on Arri Alexa with 50mm prime lens, smooth parallax over the open planner from overhead-tilted angle, soft window light slowly intensifies, professional commercial product film',
    poster:
      'DRAMATIC slow push-in on the framed poster with shallow depth of field, light dust particles drift through warm directional side-light, Hasselblad medium-format aesthetic, gallery-quality cinematography',
    sticker:
      'SMOOTH cinematic dolly across the sticker sheet at low angle, focus rack from foreground stickers to back, soft overhead key light, premium product commercial style',
    template:
      'CINEMATIC dolly-in over the laptop screen showing the template, professional camera move with subtle parallax, ambient bokeh on background, Apple product film aesthetic',
    social_template:
      'CINEMATIC push-in on the phone screen with rack focus, premium commercial framing, gentle bokeh shifts, smooth gimbal movement',
  };
  const cameraMove = cameraByType[niche.productHint] ?? cameraByType.planner;
  return [
    `Editorial slideshow-style product reveal: "${content.shopTitle}". Theme: ${niche.topic}.`,
    // V-12.5: Ken-Burns slideshow feel — multiple smooth camera moves over 5s
    // so a single shot feels like a 2-3 frame slideshow.
    `CAMERA CHOREOGRAPHY: start with slow Ken-Burns zoom-in (0-2 s, focal point centred on the title), then smooth lateral pan to the right (2-3.5 s, revealing the lower botanical detail), then gentle pull-back to wide framing (3.5-5 s, full cover composition revealed). ${cameraMove}.`,
    'STYLE: high-end Anthropologie / Magnolia commercial film, restrained editorial colour palette, magazine-quality cinematography, gentle film grain, golden-hour soft lighting, occasional dust particle drift through the light beam.',
    'CRITICAL — ABSOLUTE STATIC SUBJECT REQUIREMENT: the product itself must remain 100% identical to the source image — no movement, no morphing, no rotation, no text changing, no objects appearing or disappearing. The PRODUCT IS FROZEN IN PLACE. Only the camera moves through space. This is a slideshow reveal, not a subject animation.',
    'AVOID: animated objects, rotating items, changing text, distortion, morphing, additional elements, AI artefacts, jittery motion, cartoon style.',
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
  // V-12 PIVOT: User wants slideshow-style from generated images, not
  // hyperrealistic single-shot. Veo 3 Fast was also fail-prone ("Prediction
  // failed: null"). Switching default back to Higgsfield DoP (proven, slow
  // camera motion on the cover image — closest thing to "slideshow feel"
  // without FFmpeg infrastructure). V-13 will introduce real FFmpeg slideshow
  // stitching cover + 5 mockups together with crossfades.
  if (process.env.VIDEO_PROVIDER === 'veo3') {
    return generateProductVideoVeo3(niche, content, productId, heroUrl);
  }

  // Legacy Higgsfield path (kept behind env flag for emergency fallback).
  const model = resolveModel();
  const prompt = buildVideoPrompt(niche, content);
  const created = await postCreate(model, {
    prompt,
    image_url: heroUrl,
    duration: 5,
    aspect_ratio: '9:16',
    negative_prompt:
      'animated subject, rotating product, morphing text, changing letters, distorted geometry, AI artefacts',
  });
  const final = await waitForCompletion(created.request_id, created.status_url, {
    intervalMs: 5_000,
    maxAttempts: 72,
  });
  if (!final.video?.url) throw new Error('Higgsfield returned no video URL');
  const fetched = await fetch(final.video.url);
  if (!fetched.ok) throw new Error(`Failed to download Higgsfield MP4: ${fetched.status}`);
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

/**
 * TANRILAR V-10 — Google Veo 3 Fast via Replicate. Hyperrealistic 8s b-roll.
 * Cost ≈ $2/video (Replicate flat fee), result mimics top-end commercial
 * cinematography: real lighting physics, dust particles, depth of field.
 */
async function generateProductVideoVeo3(
  niche: NicheCandidate,
  content: ProductContent,
  productId: string,
  heroUrl: string,
): Promise<ProductVideoResult> {
  const Replicate = (await import('replicate')).default;
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('REPLICATE_API_TOKEN is not set');
  const replicate = new Replicate({ auth: token });

  // Editorial b-roll prompt — narrative + cinematography cues. Veo 3 Fast
  // reads these and produces commercial-quality motion.
  const prompt = [
    `Magazine editorial b-roll: a woman's hands in a cream cashmere sweater`,
    `gently flipping through the pages of this printed planner on a light wooden cafe table.`,
    `A small white ceramic coffee mug, a sprig of dried lavender, and a brass fountain pen`,
    `rest beside it. Morning sunlight streams through a window from the left,`,
    `casting soft long shadows. Visible dust particles float in the light beam.`,
    `Shallow depth of field — only the planner and hands are sharp. Slow,`,
    `deliberate finger movement. Anthropologie commercial aesthetic, warm`,
    `golden hour colour grading, 4K cinematography, ARRI Alexa look.`,
    `Topic context: ${niche.topic}.`,
  ].join(' ');

  const input = {
    prompt,
    image: heroUrl,
    duration: 8,
    aspect_ratio: '9:16',
    resolution: '720p',
  };

  // Try multiple Replicate slugs in order — Replicate sometimes renames or
  // versions Veo 3 endpoints. We try the latest first, then fall back.
  const candidates: `${string}/${string}`[] = [
    'google/veo-3-fast',
    'google/veo-3',
    'google/veo-3-fast:latest' as `${string}/${string}`,
  ];

  let output: unknown;
  let usedSlug = '';
  let lastErr: Error | undefined;
  for (const slug of candidates) {
    try {
      console.log('[veo-3] trying slug', slug);
      output = await replicate.run(slug, { input });
      usedSlug = slug;
      break;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      console.warn(`[veo-3] slug ${slug} failed: ${lastErr.message.slice(0, 200)}`);
    }
  }
  if (!output || !usedSlug) {
    throw lastErr ?? new Error('All Veo 3 slugs failed');
  }

  // Output shape: either string URL, array with URL, or FileOutput.
  let url: string | undefined;
  if (typeof output === 'string') {
    url = output;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    url = output[0];
  } else if (output && typeof output === 'object' && 'url' in output && typeof (output as { url: unknown }).url === 'function') {
    url = (output as { url: () => string }).url();
  }
  if (!url) throw new Error('Veo 3 returned unexpected output shape');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Veo 3 fetch failed: ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const filename = `trend/${productId}/video-${Date.now()}.mp4`;
  const uploaded = await uploadImage(buffer, filename, 'video/mp4');

  void content;
  return {
    url: uploaded.url,
    pathname: uploaded.pathname,
    durationSec: 8,
    modelUsed: usedSlug,
    promptUsed: prompt,
    requestId: 'veo3-' + Date.now(),
  };
}
