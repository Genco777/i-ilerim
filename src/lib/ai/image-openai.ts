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

export type ImageModel = 'gpt-image-2' | 'dall-e-3' | 'gpt-image-1';
export type ImageQuality = 'low' | 'medium' | 'high';

// DALL-E 3 sizes: 1024x1024 | 1024x1792 (portrait 9:16) | 1792x1024 (landscape 16:9)
// gpt-image-1/2 sizes: 1024x1024 | 1024x1536 (portrait) | 1536x1024 (landscape)
export type ImageSize =
  | '1024x1024'
  | '1024x1792'
  | '1792x1024'
  | '1024x1536'
  | '1536x1024';

export async function openaiGenerate(
  prompt: string,
  opts?: { size?: ImageSize; model?: ImageModel; quality?: ImageQuality },
): Promise<Buffer> {
  const model: ImageModel =
    opts?.model ??
    (process.env.IMAGE_MODEL as ImageModel | undefined) ??
    'gpt-image-2';

  const quality: ImageQuality =
    opts?.quality ??
    (process.env.IMAGE_QUALITY as ImageQuality | undefined) ??
    'high';

  const size = opts?.size ?? '1024x1024';

  // gpt-image-2 / gpt-image-1: b64_json response
  if (model === 'gpt-image-2' || model === 'gpt-image-1') {
    const gptSize = (
      size === '1024x1792' ? '1024x1536'
      : size === '1792x1024' ? '1536x1024'
      : size
    ) as '1024x1024' | '1024x1536' | '1536x1024';

    const result = await getClient().images.generate({
      model,
      prompt,
      size: gptSize,
      quality,
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error(`${model} returned no b64_json`);
    return Buffer.from(b64, 'base64');
  }

  if (model === 'dall-e-3') {
    // DALL-E 3 supports only three sizes
    const dalle3Size: '1024x1024' | '1024x1792' | '1792x1024' =
      size === '1024x1536' || size === '1024x1792'
        ? '1024x1792'
        : size === '1536x1024' || size === '1792x1024'
          ? '1792x1024'
          : '1024x1024';

    const result = await getClient().images.generate({
      model: 'dall-e-3',
      prompt,
      size: dalle3Size,
      quality: 'hd',
      response_format: 'b64_json',
      n: 1,
    });

    const b64 = result.data?.[0]?.b64_json;
    if (!b64) throw new Error('DALL-E 3 returned no b64_json');
    return Buffer.from(b64, 'base64');
  }

  throw new Error(`Desteklenmeyen IMAGE_MODEL: ${model}`);
}
