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

// Sprint M3.5 fix — Kling 404 olduğunda fallback chain.
// Sırayla dene: ilk başarılı olanı kullan.
const VIDEO_MODELS = [
  'minimax/video-01',                        // $0.15, 5sn, stable
  'kwaivgi/kling-v1.6-standard',             // $0.13, 5sn (yeniden dene)
  'lightricks/ltx-video-097-distilled',      // $0.05, daha basit
] as const;

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

  // Fallback chain — ilk başarılı olan model'i kullan
  const errors: string[] = [];

  for (const modelId of VIDEO_MODELS) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 120_000); // 2dk timeout
    try {
      // Her model'in farklı input format'ı var — generic mapping
      const input: Record<string, unknown> = {
        prompt: motionPrompt,
      };
      // Minimax: image_url, kling: start_image, ltx: image
      if (modelId.startsWith('minimax/')) {
        input.first_frame_image = opts.imageUrl;
      } else if (modelId.startsWith('kwaivgi/kling')) {
        input.start_image = opts.imageUrl;
        input.duration = durationSec;
        input.aspect_ratio = aspectRatio;
        input.cfg_scale = 0.5;
      } else if (modelId.startsWith('lightricks/ltx')) {
        input.image = opts.imageUrl;
        input.num_frames = durationSec * 24;
      }

      const output = await getClient().run(
        modelId as `${string}/${string}`,
        { input, signal: ac.signal },
      );
      clearTimeout(timer);

      // Model-specific output parsing
      let url: string | undefined;
      if (typeof output === 'string') {
        url = output;
      } else if (Array.isArray(output) && typeof output[0] === 'string') {
        url = output[0];
      } else if (output && typeof output === 'object') {
        const obj = output as Record<string, unknown>;
        // Replicate file objects: .url() function
        if (typeof obj.url === 'function') {
          url = (obj as unknown as { url: () => string }).url();
        }
        // Minimax: { video: "url" }
        else if (typeof obj.video === 'string') {
          url = obj.video;
        }
        // Generic: { output: "url" }
        else if (typeof obj.output === 'string') {
          url = obj.output;
        }
        // String url field (non-function)
        else if (typeof obj.url === 'string') {
          url = obj.url;
        }
      }

      if (!url) {
        throw new Error(`${modelId}: unexpected output shape: ${JSON.stringify(output).slice(0, 150)}`);
      }

      const costMap: Record<string, number> = {
        'minimax/video-01': 0.15,
        'kwaivgi/kling-v1.6-standard': durationSec === 5 ? 0.13 : 0.26,
        'lightricks/ltx-video-097-distilled': 0.05,
      };

      return {
        url,
        durationSec,
        costUsd: costMap[modelId] ?? 0.15,
        model: modelId,
      };
    } catch (err) {
      clearTimeout(timer);
      const msg = err instanceof Error ? err.message.slice(0, 180) : String(err);
      errors.push(`${modelId}: ${msg}`);
      // Next model
    }
  }

  throw new Error(`All ${VIDEO_MODELS.length} video models failed:\n  ${errors.join('\n  ')}`);
}
