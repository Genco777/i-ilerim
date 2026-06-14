/**
 * video-generator.ts — Sprint M3 Faz 5 (Video)
 *
 * Replicate Kling v1.6 standard ile image-to-video (5-10 sn).
 * Etsy listing'lerin video badge'i için, sadece /approve sırasında çağrılır.
 *
 * Maliyet:
 *   - 5 sn: $0.13
 *   - 10 sn: $0.26
 *
 * Kullanım: flat lay PNG → 5 sn lifelike product showcase video.
 */

import Replicate from 'replicate';

const KLING_MODEL = 'kwaivgi/kling-v1.6-standard';

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN env yok — video gen için zorunlu');
    _client = new Replicate({ auth });
  }
  return _client;
}

export interface ProductVideoOpts {
  /** Public URL — Vercel Blob'da kayıtlı flat lay (start frame). */
  imageUrl: string;
  /** Motion prompt — kameranın hareketi, sahne dinamiği. */
  motionPrompt?: string;
  /** Video uzunluğu (saniye). Default 5. */
  durationSec?: 5 | 10;
  /** Aspect ratio. Default 4:5 (Etsy ideal). */
  aspectRatio?: '16:9' | '9:16' | '1:1' | '4:5' | '3:4';
}

export interface ProductVideoResult {
  url: string;
  durationSec: number;
  costUsd: number;
  model: string;
}

const DEFAULT_MOTION_PROMPT =
  'Camera slowly zooms in on the folded t-shirt with gentle smooth motion, soft natural daylight, ' +
  'small props around the shirt gently shifting, cozy editorial aesthetic, magazine-quality cinematography.';

export async function generateProductVideo(opts: ProductVideoOpts): Promise<ProductVideoResult> {
  if (!opts.imageUrl) {
    throw new Error('generateProductVideo: imageUrl boş olamaz');
  }

  const durationSec = opts.durationSec ?? 5;
  const aspectRatio = opts.aspectRatio ?? '4:5';
  const motionPrompt = opts.motionPrompt ?? DEFAULT_MOTION_PROMPT;

  // 60 sn timeout — Kling generation genelde 30-50 sn, safety margin
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 90_000);

  try {
    const output = await getClient().run(
      KLING_MODEL,
      {
        input: {
          start_image: opts.imageUrl,
          prompt: motionPrompt,
          duration: durationSec,
          aspect_ratio: aspectRatio,
          cfg_scale: 0.5,
        },
        signal: ac.signal,
      },
    );
    clearTimeout(timer);

    let url: string | undefined;
    if (typeof output === 'string') {
      url = output;
    } else if (Array.isArray(output) && typeof output[0] === 'string') {
      url = output[0];
    } else if (
      output &&
      typeof output === 'object' &&
      'url' in output &&
      typeof (output as { url: unknown }).url === 'function'
    ) {
      url = (output as { url: () => string }).url();
    }

    if (!url) {
      throw new Error('Kling unexpected output shape: ' + JSON.stringify(output).slice(0, 200));
    }

    return {
      url,
      durationSec,
      costUsd: durationSec === 5 ? 0.13 : 0.26,
      model: KLING_MODEL,
    };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}
