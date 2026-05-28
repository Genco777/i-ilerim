import OpenAI from 'openai';

let _client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!_client) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('OPENAI_API_KEY is not set');
    _client = new OpenAI({ apiKey: key });
  }
  return _client;
}

export type ImageQuality = 'low' | 'medium' | 'high' | 'auto';
export type ImageSize = '1024x1024' | '1024x1536' | '1536x1024';

export async function openaiGenerate(
  prompt: string,
  opts?: { quality?: ImageQuality; size?: ImageSize },
): Promise<Buffer> {
  const quality =
    opts?.quality ??
    (process.env.IMAGE_QUALITY as ImageQuality | undefined) ??
    'high';
  const size = opts?.size ?? '1024x1024';

  const result = await getClient().images.generate({
    model: 'gpt-image-1',
    prompt,
    size,
    quality,
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error('OpenAI gpt-image-1 returned no b64_json');
  }
  return Buffer.from(b64, 'base64');
}
