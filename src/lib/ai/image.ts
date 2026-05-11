import { openaiGenerate, type ImageQuality } from './image-openai';
import { replicateGenerate, type AspectRatio } from './image-replicate';
import { routeImageTool, generateWithRouter } from './image-router';
import type { BrandKit, ImageProvider, ContentPillar } from '@/types';

export type { AspectRatio };

// Per-channel aspect ratio map.
export const CHANNEL_ASPECT: Record<string, AspectRatio> = {
  ig_post: '1:1',
  fb_post: '1:1',
  ig_story: '9:16',
  fb_story: '9:16',
  ig_reel: '9:16',
  blog_hero: '16:9',
  fb_cover: '16:9',
  popup: '4:5',
};

export function buildImagePrompt(
  topic: string,
  brandKit: BrandKit,
  channel?: keyof typeof CHANNEL_ASPECT,
): string {
  const channelHint =
    channel === 'ig_story' || channel === 'fb_story' || channel === 'ig_reel'
      ? '\nFormat: vertical (9:16). Strong central subject. Bold, attention-grabbing composition for story/reel viewing.'
      : channel === 'blog_hero' || channel === 'fb_cover'
        ? '\nFormat: landscape (16:9). Wide composition with negative space for headline overlay.'
        : '\nFormat: square. Balanced composition.';

  return [
    brandKit.visual_style_guide,
    '',
    `Subject: ${topic}`,
    channelHint,
    '',
    'Style: Photorealistic, high-end photography look. Nothing cartoonish or 3D-rendered.',
    'The image must look like a real professional photograph, not AI-generated.',
    'Composition: rule of thirds, dynamic framing, natural depth of field.',
    'Lighting: cinematic, natural light, dramatic shadows where appropriate.',
    'Mood: engaging, informative yet entertaining. Premium German design aesthetic.',
    'People (if any): natural expressions, candid moments, diverse, professional.',
    '',
    'Avoid: watermarks, text in image, low resolution, distorted faces,',
    'artificial-looking elements, cluttered composition, fake/stock-photo vibes.',
    'The Fly & Froth logo will be added automatically in post-processing.',
  ].join('\n');
}

interface GenerateOptions {
  forceProvider?: ImageProvider;
  quality?: ImageQuality;
  aspectRatio?: AspectRatio;
}

interface GenerateResult {
  buffer: Buffer;
  provider: ImageProvider;
}

function resolveProvider(forced?: ImageProvider): ImageProvider {
  if (forced) return forced;
  const env = process.env.IMAGE_PROVIDER;
  if (env === 'openai' || env === 'replicate') return env;
  return 'replicate';
}

export async function generateImage(
  prompt: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const primary = resolveProvider(opts?.forceProvider);

  if (primary === 'replicate') {
    try {
      const buffer = await replicateGenerate(prompt, {
        aspectRatio: opts?.aspectRatio,
      });
      return { buffer, provider: 'replicate' };
    } catch (err) {
      if (opts?.forceProvider === 'replicate') throw err;
      console.warn(
        '[image] Replicate failed, falling back to OpenAI:',
        err instanceof Error ? err.message : err,
      );
      const buffer = await openaiGenerate(prompt, { quality: opts?.quality });
      return { buffer, provider: 'openai' };
    }
  }

  // primary === 'openai'
  try {
    const buffer = await openaiGenerate(prompt, { quality: opts?.quality });
    return { buffer, provider: 'openai' };
  } catch (err) {
    if (opts?.forceProvider === 'openai') throw err;
    console.warn(
      '[image] OpenAI failed, falling back to Replicate:',
      err instanceof Error ? err.message : err,
    );
    const buffer = await replicateGenerate(prompt, {
      aspectRatio: opts?.aspectRatio,
    });
    return { buffer, provider: 'replicate' };
  }
}

export async function generateImageRouted(
  prompt: string,
  pillar: ContentPillar,
  topic: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const route = routeImageTool(pillar, topic);

  try {
    const { buffer, tool } = await generateWithRouter(prompt, route, {
      aspectRatio: opts?.aspectRatio,
    });
    return {
      buffer,
      provider: tool === 'openai' ? 'openai' : 'replicate',
    };
  } catch (err) {
    // Fallback to OpenAI if Replicate tools fail
    if (route.tool !== 'openai') {
      console.warn(`[image] ${route.tool} failed, falling back to OpenAI`);
      const buffer = await openaiGenerate(prompt, { quality: opts?.quality });
      return { buffer, provider: 'openai' };
    }
    throw err;
  }
}
