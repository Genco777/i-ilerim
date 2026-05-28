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
import {
  composeWallFrame,
  composeTabletScene,
  composePaperPrint,
  composeGallery,
} from './mockup';
import type { NicheCandidate } from './discovery';
import type { ProductContent } from './content';

export interface HeroVisualResult {
  url: string;
  pathname: string;
  promptUsed: string;
  /** Per-product-type mockup variants (Faz 2-B). Hero plus 3 mockups. */
  mockupUrls?: string[];
  /** 2x2 grid composite (hero + 3 mockups) — used as the Telegram photo. */
  galleryUrl?: string;
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
 * Generates a hero image + 3 procedural mockup scenes + a 2x2 gallery
 * composite. Uploads hero, mockups, and gallery to Vercel Blob.
 *
 * Returns:
 *  - `url`          → hero image URL (used by Faz 3 publish to Etsy/Stripe)
 *  - `mockupUrls`   → 3 mockup variant URLs (wall frame, tablet, paper)
 *  - `galleryUrl`   → single 2x2 composite (best for Telegram photo card)
 *  - `promptUsed`   → the OpenAI/Replicate prompt (debug / regen)
 *
 * If mockup compositing fails for any reason, hero is still returned so the
 * pipeline doesn't crash — Telegram will fall back to plain hero.
 */
export async function generateHeroVisual(
  niche: NicheCandidate,
  content: ProductContent,
  productId: string,
): Promise<HeroVisualResult> {
  const prompt = buildImagePrompt(niche, content);
  const route = routeImageTool('vitrine', niche.topic);

  const { buffer: heroBuffer } = await generateWithRouter(prompt, route, {
    aspectRatio: '1:1',
    quality: 'high', // user prefers quality over cost; ~90s but premium detail
  });

  const ts = Date.now();
  const heroFilename = `trend/${productId}/hero-${ts}.png`;
  const uploadedHero = await uploadImage(heroBuffer, heroFilename, 'image/png');

  // Mockups + gallery — best-effort. Failures don't break the hero return.
  try {
    const [wallBuf, tabletBuf, paperBuf] = await Promise.all([
      composeWallFrame(heroBuffer),
      composeTabletScene(heroBuffer),
      composePaperPrint(heroBuffer),
    ]);

    const galleryBuf = await composeGallery(heroBuffer, [wallBuf, tabletBuf, paperBuf]);

    const [wallUp, tabletUp, paperUp, galleryUp] = await Promise.all([
      uploadImage(wallBuf, `trend/${productId}/mockup-wall-${ts}.jpg`, 'image/jpeg'),
      uploadImage(tabletBuf, `trend/${productId}/mockup-tablet-${ts}.jpg`, 'image/jpeg'),
      uploadImage(paperBuf, `trend/${productId}/mockup-paper-${ts}.jpg`, 'image/jpeg'),
      uploadImage(galleryBuf, `trend/${productId}/gallery-${ts}.jpg`, 'image/jpeg'),
    ]);

    return {
      url: uploadedHero.url,
      pathname: uploadedHero.pathname,
      promptUsed: prompt,
      mockupUrls: [wallUp.url, tabletUp.url, paperUp.url],
      galleryUrl: galleryUp.url,
    };
  } catch (err) {
    console.error('[trend] mockup compositing failed, falling back to hero only', err);
    return {
      url: uploadedHero.url,
      pathname: uploadedHero.pathname,
      promptUsed: prompt,
    };
  }
}
