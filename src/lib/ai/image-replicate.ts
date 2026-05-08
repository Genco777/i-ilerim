import Replicate from 'replicate';

const MODEL = 'black-forest-labs/flux-1.1-pro' as const;

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

export async function replicateGenerate(prompt: string): Promise<Buffer> {
  const output = await getClient().run(MODEL, {
    input: {
      prompt,
      aspect_ratio: '1:1',
      output_format: 'png',
      output_quality: 95,
      safety_tolerance: 2,
    },
  });

  // replicate.run signature varies between SDK versions: string URL,
  // ReadableStream-like FileOutput, string[], or { url(): string }.
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
