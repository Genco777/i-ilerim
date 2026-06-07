import type { ContentPillar } from '@/types';
import { replicateGenerate, type FluxModel } from './image-replicate';
import { recraftGenerate, type RecraftStyle } from './image-recraft';
import { openaiGenerate, type ImageSize, type ImageQuality } from './image-openai';

export type ImageTool = 'flux' | 'recraft' | 'openai' | 'nano-banana';

export interface RouteResult {
  tool: ImageTool;
  model?: FluxModel;
  recraftStyle?: RecraftStyle;
}

// Default: Nano Banana Pro (google/nano-banana-pro) — premium quality, brand-aware,
// Canva autofill alternative since Canva requires Enterprise. flux/recraft/openai
// kept for explicit forceProvider overrides.
export function routeImageTool(_pillar: ContentPillar, _topic: string): RouteResult {
  return { tool: 'nano-banana' };
}

function aspectRatioToSize(ratio?: string): ImageSize {
  if (ratio === '9:16') return '1024x1536';
  if (ratio === '16:9') return '1536x1024';
  return '1024x1024';
}

function aspectRatioToNB(ratio?: string): '1:1' | '9:16' | '16:9' | '4:5' {
  if (ratio === '9:16') return '9:16';
  if (ratio === '16:9') return '16:9';
  if (ratio === '4:5') return '4:5';
  return '1:1';
}

export async function generateWithRouter(
  prompt: string,
  route: RouteResult,
  opts?: { aspectRatio?: '1:1' | '9:16' | '16:9' | '4:5'; quality?: ImageQuality },
): Promise<{ buffer: Buffer; tool: ImageTool }> {
  if (route.tool === 'recraft') {
    const buffer = await recraftGenerate(prompt, { style: route.recraftStyle });
    return { buffer, tool: 'recraft' };
  }

  if (route.tool === 'flux') {
    const buffer = await replicateGenerate(prompt, {
      model: route.model,
      aspectRatio: opts?.aspectRatio ?? '1:1',
    });
    return { buffer, tool: 'flux' };
  }

  if (route.tool === 'nano-banana') {
    const { nanoBananaGenerate } = await import('@/lib/publish/nano-banana');
    const buffer = await nanoBananaGenerate({
      prompt,
      aspectRatio: aspectRatioToNB(opts?.aspectRatio),
      resolution: '2K',
      outputFormat: 'jpg',
      model: 'nano-banana-pro',
    });
    return { buffer, tool: 'nano-banana' };
  }

  // OpenAI fallback
  const buffer = await openaiGenerate(prompt, {
    size: aspectRatioToSize(opts?.aspectRatio),
    quality: opts?.quality,
  });
  return { buffer, tool: 'openai' };
}
