import type { ContentPillar } from '@/types';
import { replicateGenerate, type FluxModel } from './image-replicate';
import { recraftGenerate, type RecraftStyle } from './image-recraft';
import { openaiGenerate, type ImageSize } from './image-openai';

export type ImageTool = 'flux' | 'recraft' | 'openai';

export interface RouteResult {
  tool: ImageTool;
  model?: FluxModel;
  recraftStyle?: RecraftStyle;
}

// All pillars route to OpenAI gpt-image-1 (highest quality, best prompt adherence).
// Flux/Recraft kept available for explicit forceProvider overrides.
export function routeImageTool(_pillar: ContentPillar, _topic: string): RouteResult {
  return { tool: 'openai' };
}

function aspectRatioToSize(ratio?: string): ImageSize {
  if (ratio === '9:16') return '1024x1536';
  if (ratio === '16:9') return '1536x1024';
  return '1024x1024';
}

export async function generateWithRouter(
  prompt: string,
  route: RouteResult,
  opts?: { aspectRatio?: '1:1' | '9:16' | '16:9' | '4:5' },
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

  // OpenAI gpt-image-1 — pass correct size for aspect ratio
  const buffer = await openaiGenerate(prompt, {
    size: aspectRatioToSize(opts?.aspectRatio),
  });
  return { buffer, tool: 'openai' };
}
