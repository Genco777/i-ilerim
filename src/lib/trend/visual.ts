/**
 * Visual Generation — Faz 2-A
 *
 * Hero image generation for a trend-engine product. Uses the existing
 * src/lib/ai/image-router.ts (IMAGE_PROVIDER env decides openai/flux/recraft).
 * Uploads result to Vercel Blob and returns the public URL.
 *
 * Faz 2-B will add mockup compositing on top of the hero (poster on wall,
 * planner on tablet, etc.). Faz 2-C will add per-product-type PDF generation.
 */

import { generateWithRouter, routeImageTool } from '@/lib/ai/image-router';
import { uploadImage } from '@/lib/blob';
import type { NicheCandidate } from './discovery';
import type { ProductContent } from './content';

export interface HeroVisualResult {
  url: string;
  pathname: string;
  promptUsed: string;
}

/**
 * Builds a tasteful, market-aware image prompt for a digital product hero.
 *
 * Key decisions baked into the prompt:
 *  - "studio product photography of a printable PDF mockup" anchors the
 *    image type so we don't get random scenes
 *  - Type-specific framing (planner on desk, poster on wall, etc.)
 *  - Asks for clean editorial style — avoids overly busy AI artefacts
 *  - Tells the model NOT to render real text (LLMs are bad at it) — uses
 *    abstract lines/shapes to suggest typography instead
 */
function buildImagePrompt(
  niche: NicheCandidate,
  content: ProductContent,
): string {
  const typeFraming: Record<NicheCandidate['productHint'], string> = {
    planner:
      'a top-down studio photo of an open printable planner on a clean linen-textured desk, soft morning light, with a ceramic coffee cup and a brass pen partially in frame',
    poster:
      'a framed printable art poster hanging on a warm off-white wall in a minimalist interior, soft natural side-light, a small monstera leaf visible at the edge',
    sticker:
      'a flatlay of die-cut printable stickers on a soft pastel paper background, slight overhead shadow, designer studio aesthetic',
    template:
      'a laptop screen on a clean wooden desk showing an organized Notion-style template, soft daylight, with a ceramic mug and notebook in frame',
    social_template:
      'a smartphone on a soft beige fabric surface showing an Instagram post carousel preview, soft window light, a coffee cup partially visible',
  };

  const framing = typeFraming[niche.productHint] ?? typeFraming.planner;

  return [
    `Editorial product hero image for a digital download titled "${content.shopTitle}".`,
    framing + '.',
    `The product itself evokes the theme: "${niche.topic}" — ${niche.gapAngle.slice(0, 220)}`,
    'Style: refined editorial product photography, restrained colour palette, slightly desaturated, magazine-quality composition, gentle film grain.',
    'IMPORTANT: do not render any readable text, letters, words, or logos on the printed product — instead suggest typography with abstract lines, soft blocks, and tasteful symbols. No watermarks. No mockup-website overlay. Centered composition with breathing room.',
    'Avoid: chaotic decoration, cluttered background, neon colours, cartoonish style, garish AI artefacts, distorted hands or text.',
  ].join(' ');
}

/**
 * Generates a hero image and uploads it to Vercel Blob.
 * Returns the public URL ready to be sent in a Telegram sendPhoto call.
 */
export async function generateHeroVisual(
  niche: NicheCandidate,
  content: ProductContent,
  productId: string,
): Promise<HeroVisualResult> {
  const prompt = buildImagePrompt(niche, content);

  // Pick the configured image tool (OpenAI by default per image-router)
  const route = routeImageTool('vitrine', niche.topic);

  const { buffer } = await generateWithRouter(prompt, route, {
    aspectRatio: '1:1', // Etsy + Pinterest happiest with square
    quality: 'medium',
  });

  const filename = `trend/${productId}/hero-${Date.now()}.png`;
  const uploaded = await uploadImage(buffer, filename, 'image/png');

  return { url: uploaded.url, pathname: uploaded.pathname, promptUsed: prompt };
}
