import Replicate from 'replicate';

// Flux Pro 1.1 Ultra: 4 megapixel, photorealism > DALL-E
// Pricing: ~$0.06 per image (vs $0.04 for non-ultra)
const MODEL = 'black-forest-labs/flux-1.1-pro-ultra' as const;

// Aspect ratios per channel
export type AspectRatio =
  | '1:1'      // IG/FB post (square)
  | '9:16'     // IG/FB story, Reels (vertical)
  | '16:9'     // Blog hero, FB cover (landscape)
  | '4:5';     // IG portrait

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

export async function replicateGenerate(
  prompt: string,
  opts?: { aspectRatio?: AspectRatio },
): Promise<Buffer> {
  const output = await getClient().run(MODEL, {
    input: {
      prompt,
      aspect_ratio: opts?.aspectRatio ?? '1:1',
      output_format: 'png',
      safety_tolerance: 2,
      raw: false,
    },
  });

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
    throw new Error(
      'Unexpected Replicate output shape: ' +
        JSON.stringify(output).slice(0, 200),
    );
  }

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Replicate image fetch failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}
