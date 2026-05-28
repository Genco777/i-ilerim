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

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE MOCKUP SCENES — Behance / Smartmockups quality  +  INFO-CARD LAYOUT
//
// Two visual modes are mixed in the weekly content plan:
//
//   MODE A — "Photo mockup"  (pure AI image, editorial photography)
//     Uses hyper-realistic product/device photography prompts.
//     Device screens are visible but text inside is intentionally blurry.
//
//   MODE B — "Info card"  (programmatic Sharp compositor, see compose-info-card.ts)
//     Clean white background.  Readable bold headline + 3 bullet points.
//     AI generates ONLY the content that fills the device screen.
//     Sharp composes: white bg + SVG text + device frame + AI screen + logo.
//     Triggered when channel === "info_card" in generatePost().
//
// Both modes use brand colors: navy #1A2340  ·  steel blue #8A9DC8
// ─────────────────────────────────────────────────────────────────────────────

const SERVICE_MOCKUP: Array<{ keywords: string[]; scene: string }> = [
  {
    keywords: ['logo', 'logodesign', 'markenzeichen', 'brand mark', 'signet', 'logo redesign'],
    scene: [
      'Hyper-realistic product mockup photography, Behance Featured quality.',
      'Hero object: one thick square business card (90×90 mm) propped at 30 ° on white marble.',
      'Card face: a single strong geometric logo mark — vector-sharp, deep navy (#1A2340) on cream cotton paper.',
      'No text, no readable words — only the abstract mark fills the card.',
      'A second card lies flat behind, partially overlapping, back side showing a steel-blue (#8A9DC8) gradient field.',
      'Prop: one brushed-nickel mechanical pencil lying diagonally. Nothing else.',
      'Lighting: single large softbox upper-left, sharp specular highlight on card edge.',
      'Camera: 45 ° top-front angle, 85 mm macro, shallow DOF — propped card tack-sharp.',
      'Tone: clean, airy, slightly cool-white. Screams "premium brand identity studio."',
    ].join(' '),
  },
  {
    keywords: ['flyer', 'flyerdesign', 'werbeflyer', 'prospekt', 'leaflet'],
    scene: [
      'Hyper-realistic print mockup photography, Smartmockups.com quality.',
      'A single A5 flyer slightly bent at the edges — held between elegant fingers (hands only, no face).',
      'Flyer layout: bold grid — strong headline zone top 1/3, clean image block center, generous white space.',
      'Palette: deep navy (#1A2340) header, white body, steel-blue (#8A9DC8) accent rule. No readable text.',
      'Background: softly blurred warm-wood cafe interior, ambient golden light.',
      'Camera: eye-level 50 mm, natural hand-held feel, warm golden-right light.',
      'The image says: "this flyer was designed by someone who knows what they are doing."',
    ].join(' '),
  },
  {
    keywords: ['visitenkarte', 'visitenkartendesign', 'business card', 'visitenkarten'],
    scene: [
      'Premium business-card mockup, ultra-photorealistic product photography.',
      'Five 600 gsm matte-laminate cards fanned perfectly on smooth white marble.',
      'Top card angled toward camera: bold navy (#1A2340) background, clean white typography (too small to read), sharp logo mark top-right.',
      'One card flipped to show back: single brushed steel-blue (#8A9DC8) gradient field.',
      'Cards have visible soft-touch velvet texture you can almost feel through the screen.',
      'Prop: slim brushed-nickel letter-opener at an angle. Nothing else.',
      'Lighting: dual softbox — crisp highlights on card edges, deep clean shadows.',
      'Camera: overhead 60 ° angle, 100 mm macro. The thickness and quality is unmistakable.',
    ].join(' '),
  },
  {
    keywords: ['webdesign', 'website', 'homepage', 'webseite', 'web design', 'webentwicklung', 'landing page', 'responsive'],
    scene: [
      'Premium device mockup photography, Behance top-shot quality.',
      'Open MacBook Pro on pale oak desk, screen bright and sharp.',
      'Screen shows a stunning minimal website homepage: bold hero section, clean navy (#1A2340) nav bar, large high-contrast typography, spacious white space.',
      'No readable text on screen — only layout structure and color hierarchy.',
      'In front of laptop: an iPhone showing the mobile-responsive version — pixel-perfect.',
      'Phone propped at a slight angle against the laptop base.',
      'Prop: a white ceramic mug steaming softly. A thin navy notebook closed beside it.',
      'Lighting: large diffused natural window light from the left, warm afternoon quality.',
      'Camera: front-overhead 45 °, 35 mm. The scene radiates: "I build websites that look this good."',
    ].join(' '),
  },
  {
    keywords: ['corporate identity', 'ci', 'corporate design', 'brand identity', 'markenidentitaet', 'branding'],
    scene: [
      'Full brand-identity system mockup, editorial photography, Behance Featured quality.',
      'Flat-lay on white marble: an open brand-guideline booklet (A4, open to logo-usage spread) at center.',
      'Around it: one business card, one letterhead sheet, one folded A5 envelope, one small notebook.',
      'Every piece: deep navy (#1A2340) dominant, steel-blue (#8A9DC8) accent. No readable text.',
      'One brushed-steel rollerball pen placed diagonally lower-right.',
      'Lighting: even overhead softbox, zero harsh shadows. Colors clean and accurate.',
      'Camera: directly overhead, 50 mm. Perfect grid composition — symmetry communicates "this designer is excellent."',
    ].join(' '),
  },
  {
    keywords: ['rollup', 'banner', 'aufsteller', 'roll-up', 'messestand', 'x-banner'],
    scene: [
      'Photorealistic trade-show banner mockup in a real environment.',
      'A premium roll-up banner (200 cm tall) in a bright minimalist office reception.',
      'Banner design: full-bleed graphic — bold image zone top 60 %, clean unreadable text zone below.',
      'Palette: deep navy (#1A2340) dominant, white, steel-blue accent line at bottom.',
      'Environment: warm herringbone oak floor, white plaster wall, large window flooding soft natural light from right.',
      'Shot from slight 3/4 front angle at eye level, 35 mm. Banner sharp and confident.',
    ].join(' '),
  },
  {
    keywords: ['stempel', 'firmenstempel', 'stamp', 'rubber stamp', 'siegel'],
    scene: [
      'Artisan product photography, premium print & identity focus.',
      'On thick 350 gsm cotton-paper letterhead: a fresh, crisp logo stamp impression in deep navy (#1A2340) ink.',
      'Impression: bold geometric monogram — clean edges, perfect coverage.',
      'Stamp beside it: dark oiled-wood handle, clean rubber base.',
      'Small open navy inkpad placed precisely behind the stamp.',
      'Prop: fountain pen with steel nib, uncapped, resting diagonally.',
      'Shot 45 ° overhead on pale oak, directional window light upper-left.',
    ].join(' '),
  },
  {
    keywords: ['schild', 'firmenschild', 'leuchtreklame', 'beschriftung', 'signage', 'firmenbeschriftung'],
    scene: [
      'Architectural signage mockup, real-location photography quality.',
      'Precision-cut acrylic or powder-coated aluminum sign mounted flush on exterior sandstone wall.',
      'Sign: clean minimal logo mark — geometric, bold, no readable text.',
      'Wall: warm Rhein-Main sandstone, typical Karben Altstadt building.',
      'Golden-hour light (5 pm) catches the sign — metal edges catch the sun.',
      'Camera: slight upward angle, 50 mm. Sign in sharp focus, stone wall softly blurred.',
    ].join(' '),
  },
  {
    keywords: ['speisekarte', 'menuekarte', 'menu', 'restaurant', 'gastro'],
    scene: [
      'Fine-dining menu mockup photography, editorial restaurant quality.',
      'Premium leather-bound A4 menu on a dark walnut restaurant table.',
      'Menu open to a double-page spread: elegant serif typography, generous white space, minimal decorative rules. Individual words not readable.',
      'Table setup: crystal wine glass catching warm candlelight right, white linen napkin folded sharp left.',
      'Background: softly blurred dining room, warm amber light, fine-dining atmosphere.',
      'Camera: slight overhead 30 °, 50 mm. The leather has visible grain and quality.',
    ].join(' '),
  },
  {
    keywords: ['aufkleber', 'sticker', 'etiketten', 'folie', 'folien', 'label'],
    scene: [
      'Premium product label mockup, packshot photography quality.',
      'A cylindrical matte-white canister on white marble: clean die-cut label in navy (#1A2340) with strong logo mark, no readable text.',
      'Beside it: the same label as a flat die-cut sticker floating above the surface casting a soft shadow.',
      'One sticker shown half-peeled — the adhesive layer looks premium.',
      'Lighting: dual softbox, studio packshot setup. Clean white highlights, controlled shadows.',
      'Camera: front 3/4 angle, 85 mm macro. Every detail crisp — this is a studio packshot.',
    ].join(' '),
  },
  {
    keywords: ['textil', 'shirt', 't-shirt', 'textildruck', 'merch', 'kleidung', 'hoodie'],
    scene: [
      'Premium apparel mockup, fashion editorial quality.',
      'Heavyweight white 220 gsm organic-cotton t-shirt laid flat on white marble.',
      'Chest print: bold logo in deep navy (#1A2340) — clean screen-print edges, perfect registration.',
      'Fabric texture clearly visible — quality you can almost feel.',
      'One corner of shirt slightly folded back revealing printed inner label area.',
      'Prop: neatly folded navy tissue paper underneath one edge.',
      'Lighting: overhead softbox, fashion packshot quality. Accurate white, clean shadows.',
    ].join(' '),
  },
  {
    keywords: ['druckdesign', 'broschuere', 'broschure', 'druck', 'printdesign', 'print'],
    scene: [
      'Premium print collateral mockup, Behance portfolio quality.',
      'White marble surface: tri-fold brochure open to full interior — three panels visible.',
      'Design: strong typographic grid, image zones, bold header blocks navy (#1A2340), steel-blue (#8A9DC8) accents. No readable text.',
      'Paper has visible quality — thick, slight gloss, crisp fold edges.',
      'Beside it: a closed copy of same brochure exterior + one business card.',
      'Camera: directly overhead, 50 mm. Deliberately geometric — a portfolio shot.',
    ].join(' '),
  },
  {
    keywords: ['seo', 'google', 'ranking', 'suchmaschine', 'auffindbar', 'google ranking'],
    scene: [
      'Digital-marketing desk mockup, Unsplash-quality editorial photography.',
      'MacBook open on pale oak: clean SEO dashboard — upward-trending position graph left, keyword ranking table right, one large "Position 1" badge in steel-blue (#8A9DC8).',
      'No real brand names or URLs — only graph shapes, color zones, position numbers.',
      'Beside laptop: dark navy Moleskine notebook open to hand-drawn keyword mind-map.',
      'Prop: tall glass of water, mechanical pencil.',
      'Camera: front-overhead 40 °, 35 mm. Soft, clean window light from left.',
    ].join(' '),
  },
  {
    keywords: ['email marketing', 'newsletter', 'e-mail marketing', 'mailing', 'kampagne'],
    scene: [
      'Email-marketing mockup photography, device editorial quality.',
      'MacBook Pro on pale oak: beautifully designed email template — clean masthead, bold hero section, structured content blocks, large CTA button in navy (#1A2340). No readable text.',
      'Propped beside laptop: iPhone showing same email on mobile — pixel-perfect responsive.',
      'Prop: steel-blue (#8A9DC8) ceramic mug, slim navy notebook closed.',
      'Lighting: warm directional window light from left.',
      'Camera: 45 ° front-overhead, 35 mm. Screens glow clean and bright.',
    ].join(' '),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BEFORE / AFTER CONCEPT SCENES
// These produce the "Vorher / Nachher" split-layout style the user referenced.
// When channel === "info_card", the compositor handles the real rendering.
// These prompts are used when generating AI-only photo content instead.
// ─────────────────────────────────────────────────────────────────────────────
const BEFORE_AFTER_KEYWORDS = [
  'vorher nachher', 'before after', 'redesign', 'neugestaltung', 'rebrand',
  'überarbeitung', 'auffrischung', 'modernisierung', 'vorher/nachher',
  'transformation', 'verwandlung', 'verbesserung', 'upgrade',
];

const BEFORE_AFTER_SCENES: string[] = [
  // Split business card
  [
    'Dramatic split-panel product mockup showing a brand-redesign transformation.',
    'LEFT HALF (slightly desaturated, cooler): old business card — cluttered layout, mismatched fonts, cheap glossy finish, generic amateur logo mark. Clearly dated.',
    'RIGHT HALF (warm, vibrant, sharp): new premium card — 600 gsm matte, clean minimal logo mark in deep navy (#1A2340), precise typography, quality you can feel.',
    'A thin clean vertical dividing line separates the two halves like a reveal.',
    'Background: white marble, even overhead lighting on both halves.',
    'Camera: directly overhead 85 mm macro. The contrast is immediately powerful.',
  ].join(' '),
  // Split laptop screen
  [
    'Split-screen laptop mockup showing website before-and-after redesign.',
    'MacBook Pro on pale oak, screen divided exactly in half vertically.',
    'LEFT HALF of screen: old cluttered website — tiny text, dated 2010-era design, too many colors, no hierarchy.',
    'RIGHT HALF of screen: new clean site — strong typography, bold navy (#1A2340) nav, spacious white space. Modern and confident.',
    'A thin bright line divides screen halves like a reveal slider.',
    'Camera: front-overhead 40 °, 35 mm. No readable text on either version.',
  ].join(' '),
  // Hands holding both cards
  [
    'Editorial lifestyle: two confident hands (no face) holding two business cards side by side.',
    'Left hand holds OLD card: thin paper, bad printing, cluttered design — visibly cheap.',
    'Right hand holds NEW card: 600 gsm cotton-paper, matte laminate, minimal navy (#1A2340) design — visibly premium.',
    'Background: softly blurred warm cafe interior.',
    'Camera: 50 mm, shallow DOF — cards sharp, background creamy.',
  ].join(' '),
];

function detectBeforeAfter(topic: string): string | null {
  const lower = topic.toLowerCase();
  if (BEFORE_AFTER_KEYWORDS.some((kw) => lower.includes(kw))) {
    return BEFORE_AFTER_SCENES[Math.floor(Math.random() * BEFORE_AFTER_SCENES.length)] ?? BEFORE_AFTER_SCENES[0]!;
  }
  return null;
}

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
    'PHOTOGRAPHY STYLE: Ultra-photorealistic commercial mockup photography. Full-frame DSLR or medium-format quality.',
    'The image must be indistinguishable from a real Smartmockups.com premium product photo or a Behance portfolio shot.',
    'Cinematic lighting, clean highlights, controlled shadows. Natural film-like colour grade.',
    'Every material must look physically real: paper grain, leather texture, screen glow, fabric weave.',
    'Skin tones (if any) must look natural. No plastic, rendered, or AI-artifact textures.',
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
