import Replicate from 'replicate';

// FLUX.2 flex — top-ranked photorealism model on Artificial Analysis
// Also supports flux-2-max (larger) and flux-2-pro (fast)
// Reference images: up to 10 URLs for style guidance
export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5';

export type FluxModel = 'flux-2-flex' | 'flux-2-max' | 'flux-2-pro';

const MODEL_MAP: Record<FluxModel, `${string}/${string}`> = {
  'flux-2-flex': 'black-forest-labs/flux-2-flex',
  'flux-2-max': 'black-forest-labs/flux-2-max',
  'flux-2-pro': 'black-forest-labs/flux-2-pro',
};

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function replicateGenerate(
  prompt: string,
  opts?: {
    aspectRatio?: AspectRatio;
    model?: FluxModel;
    referenceImages?: string[];
    maxRetries?: number;
  },
): Promise<Buffer> {
  const modelId = MODEL_MAP[opts?.model ?? 'flux-2-flex'];
  const maxRetries = opts?.maxRetries ?? 3;
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: opts?.aspectRatio ?? '1:1',
    output_format: 'png',
    safety_tolerance: 2,
  };

  if (opts?.referenceImages?.length) {
    input.reference_images = opts.referenceImages.slice(0, 10);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const output = await getClient().run(modelId as `${string}/${string}:${string}`, { input });

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
        throw new Error('Unexpected Replicate output shape: ' + JSON.stringify(output).slice(0, 200));
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Replicate image fetch failed (${res.status})`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[replicate] Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`);
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Replicate generation failed after retries');
}
