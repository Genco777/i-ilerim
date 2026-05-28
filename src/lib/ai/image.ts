import { openaiGenerate, type ImageQuality, type ImageSize } from './image-openai';
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

// Maps aspect ratio strings to OpenAI gpt-image-1 size parameters.
function aspectRatioToSize(ratio?: AspectRatio): ImageSize {
  if (ratio === '9:16') return '1024x1536';
  if (ratio === '16:9') return '1536x1024';
  return '1024x1024';
}

// ─────────────────────────────────────────────────────────────────────────────
// PILLAR SCENE TEMPLATES — Warm, Natural, Editorial Style
//
// Brand colors (from the actual Fly & Froth logo):
//   • Deep navy:       #1A2340  (primary — dark, confident, professional)
//   • Steel/periwinkle:#8A9DC8  (accent — the blue shimmer in the F monogram)
//   • Background:      #F2F4F6  (light warm gray — the logo card background)
//
// Visual direction: Kinfolk/Monocle magazine feel.
// Warm natural daylight, real materials (oak, linen, cotton paper, concrete).
// The navy and steel-blue appear as natural props (a dark notebook, a navy
// folder, a steel-blue ceramic mug) — never as painted studio backgrounds.
//
// gpt-image-1 responds best to concrete, specific scene descriptions.
// ─────────────────────────────────────────────────────────────────────────────
const PILLAR_SCENE: Record<string, string> = {
  // Portfolio showcase — warm editorial flat-lay
  vitrine: [
    'A warm, editorial overhead flat-lay photograph on a pale oak wood surface.',
    'The main subject: premium printed graphic design materials — a thick stack of cotton-paper business cards,',
    'a neatly folded tri-fold brochure, and a brand-color swatch sheet fanned out elegantly.',
    'Props: a dark navy (#1A2340) hardcover notebook, a steel-blue ceramic espresso cup, a short glass vase with dried pampas grass.',
    'Soft, diffused northern window light from the upper-left. Gentle, natural shadows — no harsh flash.',
    'Color mood: warm oak wood, ivory cotton paper, deep navy accents, a hint of dusty steel blue.',
    'The atmosphere is a boutique design agency portfolio — precise, warm, beautiful. Kinfolk magazine meets German Mittelstand.',
  ].join(' '),

  // Behind the scenes — candid designer at work
  prozess: [
    'A candid, editorial photograph of a graphic designer at work, shot from a slight three-quarter overhead angle.',
    'A pair of hands sketching confidently on white gridded paper with a fine-liner pen.',
    'The desk is warm light oak, natural grain visible. Props beside the sketch:',
    'a dark navy (#1A2340) mechanical pencil, a fanned spread of Pantone color chips,',
    'a half-drunk flat white in a handmade steel-blue ceramic mug, a small ruler.',
    'Lighting: soft, warm afternoon window light from the left. No studio flash, no ring light.',
    'Shallow depth of field — the hands are sharp, background beautifully blurred.',
    'The mood is genuine focus and creative energy — real, not staged.',
  ].join(' '),

  // Design knowledge — calm studious editorial
  insight: [
    'A thoughtful editorial still-life photograph on a warm light-wood desk surface.',
    'Center of frame: a large hardcover book open to a beautiful typography or grid-system spread.',
    'Supporting props: a curated stack of two more design and branding books (one with a deep navy (#1A2340) spine),',
    'a steel-blue (#8A9DC8) ceramic pen holder, a sharp pencil, a brushed-steel ruler.',
    'A small reading lamp with a warm bulb casts soft directional light from the upper right.',
    'Color palette: warm ivory pages, pale oak, deep navy book spine, cool steel-blue accents.',
    'The mood is calm expertise — a designer-educator\'s desk. Authoritative but approachable.',
    'Shot slightly above eye level, 50mm lens feel, natural film-like grain.',
  ].join(' '),

  // Local/Frankfurt area — authentic warm street scene
  lokal: [
    'A warm, authentic editorial photograph of everyday life in the Rhine-Main region of Germany.',
    'Scene A: A Karben or Bad Vilbel old-town street in late afternoon — warm light on sandstone buildings,',
    'a bicycle leaned against a wall, a local bakery window glowing amber.',
    'Scene B: A Frankfurt café terrace — a flat white on a white marble table,',
    'a dark navy (#1A2340) sketchbook open beside it, soft sunlight dappling through plane trees.',
    'The color temperature is warm amber afternoon. Everything feels lived-in, unhurried, local.',
    'No tourist angles, no posed subjects. Wide angle, slight natural vignette.',
    'The mood: a creative professional who belongs to this city and loves it.',
  ].join(' '),

  // Reel cover — energetic, authentic, vertical
  reel: [
    'A dynamic editorial vertical photograph designed as a reel or story cover.',
    'A creative professional seen from behind or in profile, holding a mirrorless camera or smartphone,',
    'actively framing a shot in a bright, warm interior or sunlit outdoor location.',
    'Clothing: a navy (#1A2340) bomber jacket or a clean white linen shirt — simple, stylish, unbranded.',
    'The environment is warm: afternoon sun through large windows, or an urban courtyard with warm stone.',
    'A steel-blue (#8A9DC8) tote bag or notebook is visible as a casual prop.',
    'The feeling is alive, modern, and scroll-stopping — caught mid-action, not posed.',
    'Shot on 35mm, slight motion blur on background, shallow depth of field.',
  ].join(' '),
};

const SCENE_FALLBACK = [
  'A warm, editorial lifestyle photograph in a bright creative workspace.',
  'Pale oak desk, soft northern window light, natural materials (linen, cotton paper, ceramic).',
  'Brand color accents: one deep navy (#1A2340) element and one steel-blue (#8A9DC8) element as natural props.',
  'Shallow depth of field, authentic and unposed.',
  'The aesthetic is Kinfolk magazine meets German precision — warm, considered, real.',
].join(' ');

// ─────────────────────────────────────────────────────────────────────────────
export function buildImagePrompt(
  topic: string,
  brandKit: BrandKit,
  channel?: keyof typeof CHANNEL_ASPECT,
  pillar?: string,
): string {
  const isVertical = channel === 'ig_story' || channel === 'fb_story' || channel === 'ig_reel';
  const isLandscape = channel === 'blog_hero' || channel === 'fb_cover';

  const formatNote = isVertical
    ? 'COMPOSITION: Vertical frame (9:16). Strong central subject, bold hierarchy. Designed for story/reel — must grab attention in the first split-second of scrolling.'
    : isLandscape
      ? 'COMPOSITION: Landscape frame (16:9). Wide, breathing composition with generous negative space on one side for a headline overlay.'
      : 'COMPOSITION: Square frame. Balanced, centered energy with visual weight distributed evenly.';

  const sceneBase = pillar && PILLAR_SCENE[pillar] ? PILLAR_SCENE[pillar] : SCENE_FALLBACK;

  // Brand kit style guide is injected as additional visual context
  const styleContext = brandKit.visual_style_guide
    ? `BRAND VISUAL CONTEXT: ${brandKit.visual_style_guide}`
    : '';

  return [
    `SCENE: ${sceneBase}`,
    '',
    `SUBJECT FOCUS: ${topic}`,
    '',
    formatNote,
    '',
    styleContext,
    '',
    'PHOTOGRAPHY STYLE: Ultra-realistic, high-end commercial photography. Shot on a full-frame camera.',
    'Cinematic lighting with strong shadows and rich highlights. Natural, film-like color grading.',
    'The image must be indistinguishable from a real professional photograph.',
    'Skin tones (if any) must look natural. No artificial or plastic-looking textures.',
    '',
    'STRICTLY AVOID: Any text, words, letters, or numbers rendered inside the image.',
    'No watermarks, logos, or graphic overlays. No distorted faces or anatomy.',
    'No stock-photo aesthetic, no cluttered backgrounds, no fake depth of field.',
    'The Fly & Froth logo will be composited onto the image automatically — do not include it.',
  ].filter(Boolean).join('\n');
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
  return 'openai'; // Default: gpt-image-1
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
      const buffer = await openaiGenerate(prompt, {
        quality: opts?.quality,
        size: aspectRatioToSize(opts?.aspectRatio),
      });
      return { buffer, provider: 'openai' };
    }
  }

  // primary === 'openai' — pass correct size for aspect ratio
  try {
    const buffer = await openaiGenerate(prompt, {
      quality: opts?.quality,
      size: aspectRatioToSize(opts?.aspectRatio),
    });
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
