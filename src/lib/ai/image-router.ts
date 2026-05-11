import type { ContentPillar } from '@/types';
import { replicateGenerate, type FluxModel } from './image-replicate';
import { recraftGenerate, type RecraftStyle } from './image-recraft';
import { openaiGenerate } from './image-openai';

export type ImageTool = 'flux' | 'recraft' | 'openai';

export interface RouteResult {
  tool: ImageTool;
  model?: FluxModel;
  recraftStyle?: RecraftStyle;
}

export function routeImageTool(pillar: ContentPillar, topic: string): RouteResult {
  const t = topic.toLowerCase();

  // Recraft for logo/branding/corporate identity presentations
  if (
    pillar === 'vitrine' &&
    (t.includes('logo') || t.includes('branding') || t.includes('corporate') || t.includes('firmenidentität'))
  ) {
    return { tool: 'recraft', recraftStyle: 'logo_presentation' };
  }

  // Recraft for insight design-theory posts (brand boards, color systems)
  if (
    pillar === 'insight' &&
    (t.includes('farbpalette') || t.includes('brand') || t.includes('designsystem') || t.includes('farbtheorie'))
  ) {
    return { tool: 'recraft', recraftStyle: 'brand_board' };
  }

  // FLUX.2 flex for reel covers (vertical)
  if (pillar === 'reel') {
    return { tool: 'flux', model: 'flux-2-flex' };
  }

  // FLUX.2 flex for prozess and lokal (need photorealism)
  if (pillar === 'prozess' || pillar === 'lokal') {
    return { tool: 'flux', model: 'flux-2-flex' };
  }

  // FLUX.2 max for vitrine showcase posts (highest quality)
  if (pillar === 'vitrine') {
    return { tool: 'flux', model: 'flux-2-max' };
  }

  return { tool: 'flux', model: 'flux-2-flex' };
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

  // Fallback to OpenAI
  const buffer = await openaiGenerate(prompt);
  return { buffer, tool: 'openai' };
}
