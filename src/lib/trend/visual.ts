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
import { composeProductMockups, composeGallery } from './mockup';
import { renderPdfCoverToPng } from './pdf-render';
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
  // ── Hero strategy ──
  // The hero is the PRODUCT DESIGN ITSELF on a clean neutral background — NOT
  // a lifestyle scene. Mockups (frame on wall, tablet, paper, laptop) add the
  // scene context as separate composites. Without this we get "laptop inside
  // laptop" recursion when mockup-compositing.
  const designByType: Record<NicheCandidate['productHint'], string> = {
    planner:
      'a top-down studio shot of the printable planner page design ITSELF, lying flat on a pure off-white seamless background, no desk, no props, no hands, no devices, no objects around it — only the printable sheet centered with breathing room',
    poster:
      'the printable art poster design ITSELF presented flat on a pure off-white seamless background, centered with generous border, no frame, no wall, no objects around it — just the printable artwork',
    sticker:
      'a flat layout of the printable sticker sheet design ITSELF on a pure off-white seamless background, top-down view, no desk, no props, no shadow except a very subtle one under each sticker, just the printable sheet centered',
    template:
      'a top-down clean studio shot of the printable template page design ITSELF on a pure off-white seamless background, no laptop, no tablet, no desk, no props — only the template sheet centered with breathing room',
    social_template:
      'the social media post template design ITSELF (a single 1:1 layout mockup with placeholder shapes for image + headline + body) on a pure off-white seamless background, no phone, no devices, no props — only the layout centered',
  };
  const design = designByType[niche.productHint] ?? designByType.planner;

  return [
    `Editorial product hero for a digital download titled "${content.shopTitle}".`,
    `${design}.`,
    `The design itself evokes the theme: "${niche.topic}" — ${niche.gapAngle.slice(0, 220)}`,
    'Visual style of the design: refined editorial, restrained pastel/earth-tone palette, magazine-quality typography hints, generous white space, minimal decoration.',
    'CRITICAL — NO LIFESTYLE STAGING: this is the product design on a neutral background, NOT a scene. No desk, no cup, no plant, no hand, no device frame, no environmental lighting. Treat it like a vector mockup you would upload to Etsy as the primary product image.',
    'IMPORTANT: do not render any readable text, letters, words, or logos on the printed product — instead suggest typography with abstract lines, soft blocks, dots, and tasteful symbols. No watermarks.',
    'Avoid: lifestyle props, desk scenes, hands, devices, chaotic decoration, busy background, neon colours, cartoon style, garish AI artefacts, distorted text.',
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
  // Legacy entry point — kept for the regen-visual handler. New pipeline
  // should call generateAiHeroForPdfCover + composeMockupsForHero separately
  // (see orchestrator.ts after V-1 refactor).
  const ai = await generateAiHeroForPdfCover(niche, content, productId);
  const mockups = await composeMockupsForHero(ai.buffer, niche.productHint, productId);
  return {
    url: ai.url,
    pathname: ai.pathname,
    promptUsed: ai.promptUsed,
    mockupUrls: mockups.mockupUrls,
    galleryUrl: mockups.galleryUrl,
  };
}

/**
 * AI-generated hero image used ONLY as the cover image embedded inside the
 * generated PDF. The customer never sees this as a standalone marketing hero
 * (V-1 architecture: the real marketing hero is a render of the actual PDF
 * cover page — see generateRealHeroFromPdf below).
 *
 * Kept separate so the regen flow can still regenerate the AI cover image
 * without having to regenerate the entire pipeline.
 */
export async function generateAiHeroForPdfCover(
  niche: NicheCandidate,
  content: ProductContent,
  productId: string,
): Promise<{ buffer: Buffer; url: string; pathname: string; promptUsed: string }> {
  const prompt = buildImagePrompt(niche, content);
  const route = routeImageTool('vitrine', niche.topic);

  const { buffer } = await generateWithRouter(prompt, route, {
    aspectRatio: '1:1',
    quality: 'high', // user prefers quality over cost; ~90s but premium detail
  });

  const ts = Date.now();
  const filename = `trend/${productId}/ai-cover-${ts}.png`;
  const uploaded = await uploadImage(buffer, filename, 'image/png');

  return { buffer, url: uploaded.url, pathname: uploaded.pathname, promptUsed: prompt };
}

/**
 * Mockup compositing for any hero buffer (AI-generated OR rendered from PDF).
 * Produces 3 type-appropriate mockup scenes + a 2×2 gallery composite, uploads
 * everything to Vercel Blob.
 *
 * Failures here are non-fatal — caller should fall back to plain hero if
 * mockup compositing crashes (e.g., Sharp OOM on Vercel).
 */
export async function composeMockupsForHero(
  heroBuffer: Buffer,
  productHint: NicheCandidate['productHint'],
  productId: string,
): Promise<{ mockupUrls: string[]; galleryUrl: string }> {
  const ts = Date.now();
  const mockups = await composeProductMockups(heroBuffer, productHint);
  const galleryBuf = await composeGallery(heroBuffer, mockups);

  const [m1Up, m2Up, m3Up, galleryUp] = await Promise.all([
    uploadImage(mockups[0], `trend/${productId}/mockup-1-${ts}.jpg`, 'image/jpeg'),
    uploadImage(mockups[1], `trend/${productId}/mockup-2-${ts}.jpg`, 'image/jpeg'),
    uploadImage(mockups[2], `trend/${productId}/mockup-3-${ts}.jpg`, 'image/jpeg'),
    uploadImage(galleryBuf, `trend/${productId}/gallery-${ts}.jpg`, 'image/jpeg'),
  ]);

  return {
    mockupUrls: [m1Up.url, m2Up.url, m3Up.url],
    galleryUrl: galleryUp.url,
  };
}

/**
 * V-1: Render the FIRST page of the just-generated PDF to a high-res PNG and
 * upload it. This becomes the actual marketing hero — consistent with what the
 * customer downloads.
 *
 * scale=3 → ~1750×2475 for A4 (≈216dpi). Plenty for Etsy hero (3000px max) and
 * Stripe shop card.
 */
export async function generateRealHeroFromPdf(
  pdfBuffer: Buffer,
  productId: string,
): Promise<{ buffer: Buffer; url: string; pathname: string }> {
  const coverPng = await renderPdfCoverToPng(pdfBuffer, 3.0);
  const ts = Date.now();
  const filename = `trend/${productId}/hero-${ts}.png`;
  const uploaded = await uploadImage(coverPng, filename, 'image/png');
  return { buffer: coverPng, url: uploaded.url, pathname: uploaded.pathname };
}
