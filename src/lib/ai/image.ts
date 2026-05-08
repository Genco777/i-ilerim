import { openaiGenerate, type ImageQuality } from './image-openai';
import { replicateGenerate } from './image-replicate';
import type { ImageProvider } from '@/types';

interface GenerateOptions {
  forceProvider?: ImageProvider;
  quality?: ImageQuality;
}

interface GenerateResult {
  buffer: Buffer;
  provider: ImageProvider;
}

function resolveProvider(forced?: ImageProvider): ImageProvider {
  if (forced) return forced;
  const env = process.env.IMAGE_PROVIDER;
  if (env === 'openai' || env === 'replicate') return env;
  return 'openai';
}

export async function generateImage(
  prompt: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const primary = resolveProvider(opts?.forceProvider);

  if (primary === 'openai') {
    try {
      const buffer = await openaiGenerate(prompt, { quality: opts?.quality });
      return { buffer, provider: 'openai' };
    } catch (err) {
      if (opts?.forceProvider === 'openai') {
        throw err;
      }
      console.warn(
        '[image] OpenAI failed, falling back to Replicate:',
        err instanceof Error ? err.message : err,
      );
      const buffer = await replicateGenerate(prompt);
      return { buffer, provider: 'replicate' };
    }
  }

  // Forced or default replicate
  const buffer = await replicateGenerate(prompt);
  return { buffer, provider: 'replicate' };
}
