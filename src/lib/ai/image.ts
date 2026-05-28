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

// Maps aspect ratio strings to DALL-E 3 size parameters.
// DALL-E 3: 1024x1024 | 1024x1792 (portrait) | 1792x1024 (landscape)
function aspectRatioToSize(ratio?: AspectRatio): ImageSize {
  if (ratio === '9:16') return '1024x1792';
  if (ratio === '16:9') return '1792x1024';
  return '1024x1024';
}

// -----------------------------------------------------------------------------
// PILLAR SCENE TEMPLATES
//
// Brand colors (from the actual Fly & Froth logo):
//   * Deep navy:       #1A2340  (primary)
//   * Steel/periwinkle:#8A9DC8  (accent)
//   * Background:      #F2F4F6  (light warm gray)
//
// Visual direction: Kinfolk/Monocle magazine feel.
// Warm natural daylight, real materials (oak, linen, cotton paper, concrete).
// -----------------------------------------------------------------------------
const PILLAR_SCENE: Record<string, string> = {
  vitrine: [
    'A warm, editorial overhead flat-lay photograph on a pale oak wood surface.',
    'The main subject: premium printed graphic design materials -- a thick stack of cotton-paper business cards,',
    'a neatly folded tri-fold brochure, and a brand-color swatch sheet fanned out elegantly.',
    'Props: a dark navy (#1A2340) hardcover notebook, a steel-blue ceramic espresso cup, a short glass vase with dried pampas grass.',
    'Soft, diffused northern window light from the upper-left. Gentle, natural shadows -- no harsh flash.',
    'Color mood: warm oak wood, ivory cotton paper, deep navy accents, a hint of dusty steel blue.',
    'The atmosphere is a boutique design agency portfolio -- precise, warm, beautiful. Kinfolk magazine meets German Mittelstand.',
  ].join(' '),

  prozess: [
    'A candid, editorial photograph of a graphic designer at work, shot from a slight three-quarter overhead angle.',
    'A pair of hands sketching confidently on white gridded paper with a fine-liner pen.',
    'The desk is warm light oak, natural grain visible. Props beside the sketch:',
    'a dark navy (#1A2340) mechanical pencil, a fanned spread of Pantone color chips,',
    'a half-drunk flat white in a handmade steel-blue ceramic mug, a small ruler.',
    'Lighting: soft, warm afternoon window light from the left. No studio flash, no ring light.',
    'Shallow depth of field -- the hands are sharp, background beautifully blurred.',
    'The mood is genuine focus and creative energy -- real, not staged.',
  ].join(' '),

  insight: [
    'A thoughtful editorial still-life photograph on a warm light-wood desk surface.',
    'Center of frame: a large hardcover book open to a beautiful typography or grid-system spread.',
    'Supporting props: a curated stack of two more design and branding books (one with a deep navy (#1A2340) spine),',
    'a steel-blue (#8A9DC8) ceramic pen holder, a sharp pencil, a brushed-steel ruler.',
    'A small reading lamp with a warm bulb casts soft directional light from the upper right.',
    'Color palette: warm ivory pages, pale oak, deep navy book spine, cool steel-blue accents.',
    "The mood is calm expertise -- a designer-educator's desk. Authoritative but approachable.",
    'Shot slightly above eye level, 50mm lens feel, natural film-like grain.',
  ].join(' '),

  lokal: [
    'A warm, authentic editorial photograph of everyday life in the Rhine-Main region of Germany.',
    'Scene A: A Karben or Bad Vilbel old-town street in late afternoon -- warm light on sandstone buildings,',
    'a bicycle leaned against a wall, a local bakery window glowing amber.',
    'Scene B: A Frankfurt cafe terrace -- a flat white on a white marble table,',
    'a dark navy (#1A2340) sketchbook open beside it, soft sunlight dappling through plane trees.',
    'The color temperature is warm amber afternoon. Everything feels lived-in, unhurried, local.',
    'No tourist angles, no posed subjects. Wide angle, slight natural vignette.',
    'The mood: a creative professional who belongs to this city and loves it.',
  ].join(' '),

  reel: [
    'A dynamic editorial vertical photograph designed as a reel or story cover.',
    'A creative professional seen from behind or in profile, holding a mirrorless camera or smartphone,',
    'actively framing a shot in a bright, warm interior or sunlit outdoor location.',
    'Clothing: a navy (#1A2340) bomber jacket or a clean white linen shirt -- simple, stylish, unbranded.',
    'The environment is warm: afternoon sun through large windows, or an urban courtyard with warm stone.',
    'A steel-blue (#8A9DC8) tote bag or notebook is visible as a casual prop.',
    'The feeling is alive, modern, and scroll-stopping -- caught mid-action, not posed.',
    'Shot on 35mm, slight motion blur on background, shallow depth of field.',
  ].join(' '),
};

const SCENE_FALLBACK = [
  'A warm, editorial lifestyle photograph in a bright creative workspace.',
  'Pale oak desk, soft northern window light, natural materials (linen, cotton paper, ceramic).',
  'Brand color accents: one deep navy (#1A2340) element and one steel-blue (#8A9DC8) element as natural props.',
  'Shallow depth of field, authentic and unposed.',
  'The aesthetic is Kinfolk magazine meets German precision -- warm, considered, real.',
].join(' ');

// -----------------------------------------------------------------------------
// SERVICE MOCKUP SCENES — Real-product photography style
//
// When a post topic matches a known Fly & Froth service, we show that service
// as a physical mockup: a logo on a business card, a flyer on a cafe table,
// a website on a laptop screen, etc.
// Same warm editorial aesthetic — but now the product is the hero.
// -----------------------------------------------------------------------------
const SERVICE_MOCKUP: Array<{ keywords: string[]; scene: string }> = [
  {
    keywords: ['logo', 'logodesign', 'markenzeichen', 'brand mark', 'signet'],
    scene: [
      'A premium product photography scene on pale oak: a thick, high-quality business card lying flat',
      'displaying a clean, minimal vector logo mark -- no readable brand name, just the geometric symbol',
      'in deep navy (#1A2340) on a cream cotton-paper card.',
      'Beside it: a dark navy hardcover brand guideline booklet, open to a logo usage page.',
      'A steel-blue (#8A9DC8) rollerball pen rests diagonally across the corner.',
      'Overhead flat-lay, soft diffused window light from the upper left.',
      'The result: a designer logo presentation, editorial and premium. No text visible in the image.',
    ].join(' '),
  },
  {
    keywords: ['flyer', 'flyerdesign', 'werbeflyer', 'prospekt', 'leaflet'],
    scene: [
      'Editorial product photography: a single A5 flyer lying flat on a warm concrete cafe table.',
      'The flyer shows a clean, bold layout -- strong headline zone at top, minimal imagery, generous whitespace.',
      'Beside it: a white porcelain espresso cup on a small saucer, a steel-blue ceramic coaster.',
      'Shot from directly overhead, 50mm lens feel. Soft, even ambient cafe lighting.',
      'The flyer design is unreadable -- just the layout structure, color blocks, and typographic hierarchy are visible.',
      'The scene reads: "this is a professionally designed print piece." Warm, tactile, real.',
    ].join(' '),
  },
  {
    keywords: ['visitenkarte', 'visitenkartendesign', 'business card', 'visitenkarten'],
    scene: [
      'A fan-spread of six premium business cards on a pale oak surface.',
      'The top card is angled to show the front -- minimal dark navy (#1A2340) background,',
      'clean white typography, a small logo mark in the upper corner. No readable text.',
      'One card is turned to show the back: a single steel-blue (#8A9DC8) geometric element.',
      'The cards are thick -- 600gsm with a soft-touch matte laminate finish you can almost feel.',
      'A slim navy mechanical pencil rests beside the spread.',
      'Overhead shot, soft northern window light. The scene: a premium identity, physical and confident.',
    ].join(' '),
  },
  {
    keywords: ['webdesign', 'website', 'homepage', 'webseite', 'web design', 'webentwicklung'],
    scene: [
      'An open modern laptop on a pale oak desk, screen glowing with a beautiful minimal website homepage.',
      'The website shows: a bold hero section with clean typography and a high-quality hero image,',
      'a navigation bar in deep navy, white body sections with generous spacing.',
      'No real brand name visible -- just the layout and color palette.',
      'Beside the laptop: a smartphone showing the mobile version of the same site.',
      'A steel-blue ceramic mug steams gently in the upper corner of the frame.',
      'Soft, warm window light from the left. The scene: a professional web design desk, polished and calm.',
    ].join(' '),
  },
  {
    keywords: ['corporate identity', 'ci', 'corporate design', 'brand identity', 'markenidentitaet', 'branding'],
    scene: [
      'An editorial flat-lay of a complete brand identity system on pale oak.',
      'Center: a business card, a letterhead, a folded envelope, and a small brand guideline booklet',
      'all arranged in a clean, geometric composition.',
      'Every piece uses the same palette: deep navy (#1A2340) as primary, steel-blue (#8A9DC8) as accent.',
      'A single navy fountain pen is placed diagonally across the lower corner.',
      'Overhead shot, diffused northern light. The whole scene communicates systematic design thinking --',
      'every touchpoint consistent, every element intentional.',
    ].join(' '),
  },
  {
    keywords: ['rollup', 'banner', 'aufsteller', 'roll-up', 'messestand', 'roll up'],
    scene: [
      'A premium roll-up banner standing in a bright, airy office reception area.',
      'The banner: 2m tall, clean design -- bold graphic in upper third, minimal text below, strong visual hierarchy.',
      'No readable text, just the layout structure and color zones in deep navy and warm white.',
      'Warm oak herringbone floor, a white wall behind. Natural light from a large window to the right.',
      'Shot from a slight 3/4 angle, 35mm lens feel. The banner looks professional and confident.',
      'The scene: a first impression at a trade show or office entrance.',
    ].join(' '),
  },
  {
    keywords: ['stempel', 'firmenstempel', 'stamp', 'rubber stamp', 'siegel'],
    scene: [
      'A premium rubber stamp lying beside a fresh ink impression on heavy cream cotton paper.',
      'The ink impression: a clean, minimal monogram-style logo mark in deep navy (#1A2340) ink.',
      'The stamp body: dark wood handle, professional quality.',
      'The paper is 300gsm cotton, the impression is crisp and confident.',
      'Beside them: a small open inkpad in navy blue, a sharp pencil.',
      'Shot from a slight overhead angle on a pale oak desk. Warm, directional window light.',
      'The scene: artisan craftsmanship meets modern graphic design.',
    ].join(' '),
  },
  {
    keywords: ['schild', 'firmenschild', 'leuchtreklame', 'beschriftung', 'signage', 'firmenbeschriftung'],
    scene: [
      'A modern business sign on an exterior sandstone wall, photographed in warm late-afternoon light.',
      'The sign: laser-cut acrylic letters or a brushed-aluminum plate, showing a clean minimal logo mark.',
      'No readable brand name -- just the geometric logo symbol, mounted precisely.',
      'The wall is warm sandstone, typical of a German Altstadt building.',
      'Shot from a slight upward angle, 50mm lens. The sign catches the golden-hour sun.',
      'The scene: a local business that takes its identity seriously. Confident, permanent, local.',
    ].join(' '),
  },
  {
    keywords: ['speisekarte', 'menuekarte', 'menue', 'menu', 'restaurant', 'gastro', 'online menu'],
    scene: [
      'A premium menu card on a fine-dining restaurant table.',
      'The menu: leather-bound, A4 size, open to reveal a clean interior spread --',
      'elegant serif typography, generous whitespace, a minimal decorative rule in gold-tone.',
      'Beside it: a wine glass catching warm ambient light, a white linen napkin folded crisply.',
      'Shot from a slight overhead angle. The table surface is dark walnut.',
      'Warm, intimate restaurant lighting -- candle-soft, not harsh.',
      'The scene: a place where design and hospitality meet.',
    ].join(' '),
  },
  {
    keywords: ['aufkleber', 'sticker', 'etiketten', 'folie', 'folien', 'label'],
    scene: [
      'A collection of premium die-cut stickers laid out on a pale oak surface.',
      'Center sticker: a clean, minimal logo mark on a white base with deep navy (#1A2340) graphic.',
      'Surrounding it: 3-4 variations in different shapes -- round, rectangular, shield-shaped.',
      'Some are peeled slightly to show the glossy finish and the backing paper.',
      'A steel-blue pen rests beside the spread.',
      'Overhead flat-lay, even soft light. The stickers look precise, professional, and satisfying.',
    ].join(' '),
  },
  {
    keywords: ['textil', 'shirt', 't-shirt', 'textildruck', 'merch', 'kleidung', 'bekleidung', 'hoodie'],
    scene: [
      'A neatly folded premium white t-shirt on a pale oak surface.',
      'On the chest: a clean, minimal logo print in deep navy (#1A2340) --',
      'precise screen-print, sharp edges, professional quality.',
      'Beside the folded shirt: the same t-shirt hanging on a slim wooden hanger against a warm white wall.',
      'Shot in soft, even northern window light. The fabric has visible texture -- good quality cotton.',
      'The scene: branded merchandise that people actually want to wear.',
    ].join(' '),
  },
  {
    keywords: ['druckdesign', 'broschuere', 'broschure', 'broshuere', 'druck', 'printdesign', 'print'],
    scene: [
      'Premium printed materials arranged on a white marble surface.',
      'Center: a tri-fold brochure open to its interior -- clean layout, strong typographic grid, quality imagery zones.',
      'Beside it: a business card, a folded envelope, all in the same design system.',
      'The palette: deep navy (#1A2340) headline blocks, clean white body, steel-blue (#8A9DC8) accents.',
      'Shot from directly overhead. Even studio-quality lighting, no harsh shadows.',
      'The scene: a complete print system designed with intention -- every piece cohesive.',
    ].join(' '),
  },
  {
    keywords: ['seo', 'google', 'ranking', 'suchmaschinenkunden', 'suchmaschine', 'auffindbar'],
    scene: [
      'A laptop on a pale oak desk, screen showing a clean analytics dashboard with upward-trending line graphs.',
      'The dashboard shows position graphs, traffic curves, keyword rankings -- no real brand names visible.',
      'Beside the laptop: a dark navy (#1A2340) notebook open to a page with handwritten keyword notes and arrows.',
      'A steel-blue ceramic mug and a sharp pencil complete the desk.',
      'Soft, focused window light from the left. The scene: a strategic, data-informed work session.',
    ].join(' '),
  },
  {
    keywords: ['email marketing', 'newsletter', 'e-mail marketing', 'mailing', 'kampagne'],
    scene: [
      'A laptop on a pale oak desk, screen showing a beautifully designed email newsletter layout --',
      'clean header, bold hero image zone, structured content blocks, a clear call-to-action button.',
      'No readable text, just the layout structure in deep navy and white.',
      'A smartphone beside the laptop shows the same email rendered on mobile.',
      'Steel-blue coffee mug, slim navy notebook. Soft directional window light.',
      'The scene: digital marketing that looks as good as print.',
    ].join(' '),
  },
  {
    keywords: ['whatsapp', 'whatsapp business', 'messenger', 'chat'],
    scene: [
      'A smartphone propped at a slight angle on a pale oak desk, screen showing a WhatsApp Business chat interface.',
      'The chat shows a professional auto-reply message in clean, friendly German.',
      'No real names visible -- just the chat UI structure and message bubbles in the familiar green.',
      'Beside the phone: a dark navy (#1A2340) notebook, a steel-blue pen.',
      'Soft, warm ambient light. The scene: a small business that responds quickly and professionally.',
    ].join(' '),
  },
];

function detectServiceMockup(topic: string): string | null {
  const lower = topic.toLowerCase();
  for (const entry of SERVICE_MOCKUP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.scene;
    }
  }
  return null;
}



// -----------------------------------------------------------------------------
export function buildImagePrompt(
  topic: string,
  brandKit: BrandKit,
  channel?: keyof typeof CHANNEL_ASPECT,
  pillar?: string,
): string {
  const isVertical = channel === 'ig_story' || channel === 'fb_story' || channel === 'ig_reel';
  const isLandscape = channel === 'blog_hero' || channel === 'fb_cover';

  const formatNote = isVertical
    ? 'COMPOSITION: Vertical frame (9:16). Strong central subject, bold hierarchy. Designed for story/reel -- must grab attention in the first split-second of scrolling.'
    : isLandscape
      ? 'COMPOSITION: Landscape frame (16:9). Wide, breathing composition with generous negative space on one side for a headline overlay.'
      : 'COMPOSITION: Square frame. Balanced, centered energy with visual weight distributed evenly.';

  const mockupScene = detectServiceMockup(topic);
  const sceneBase = mockupScene ?? (pillar && PILLAR_SCENE[pillar] ? PILLAR_SCENE[pillar] : SCENE_FALLBACK);

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
    'STRICTLY AVOID:',
    '- Any text, words, letters, numbers, or typography rendered anywhere in the image.',
    '- Any brand name, studio name, or the words "Fly" "Froth" "Fly & Froth" in the image.',
    '- Any logo, badge, watermark, or graphic overlay of any kind.',
    '- Human faces, portraits, or any person whose face is visible -- hands and arms are allowed.',
    '- Distorted anatomy, AI-looking skin, plastic textures.',
    '- Stock-photo aesthetic, cluttered backgrounds, fake or artificial depth of field.',
    'The Fly & Froth logo is composited automatically onto the bottom-right corner after generation -- do NOT include it.',
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
  return 'openai';
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
      quality: opts?.quality,
    });
    return {
      buffer,
      provider: tool === 'openai' ? 'openai' : 'replicate',
    };
  } catch (err) {
    if (route.tool !== 'openai') {
      console.warn(`[image] ${route.tool} failed, falling back to OpenAI`);
      const buffer = await openaiGenerate(prompt, { quality: opts?.quality });
      return { buffer, provider: 'openai' };
    }
    throw err;
  }
}
