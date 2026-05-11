import Replicate from 'replicate';

const MODEL = 'recraft-ai/recraft-v4' as const;

export type RecraftStyle = 'logo_presentation' | 'brand_board' | 'design_mockup';

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

export async function recraftGenerate(
  prompt: string,
  opts?: { style?: RecraftStyle },
): Promise<Buffer> {
  const style = opts?.style ?? 'design_mockup';
  const input: Record<string, unknown> = {
    prompt,
    style,
    output_format: 'png',
  };

  const output = await getClient().run(MODEL as `${string}/${string}:${string}`, { input });

  let url: string | undefined;
  if (typeof output === 'string') {
    url = output;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    url = output[0];
  }

  if (!url) {
    throw new Error('Unexpected Recraft output: ' + JSON.stringify(output).slice(0, 200));
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Recraft image fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
