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
import { composeProductMockups, composeGallery, composeEnhancedCover } from './mockup';
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
 * V-2 mockup pipeline (Nano Banana 2 / Gemini 3.1 Flash Image).
 *
 * Strategy: each mockup is a separate Nano Banana call where the V-1 PDF cover
 * render is passed as a REFERENCE IMAGE alongside a lifestyle scene prompt.
 * The model naturally places the actual product into the scene with correct
 * perspective, lighting, and shadow — no Sharp coordinate hardcoding.
 *
 * Architecture:
 *   coverUrl (V-1 PDF render) → Nano Banana 2 × 4 in parallel → 4 photoreal mockups
 *   → Sharp 2×2 composite (gallery) → upload all → return URLs
 *
 * Cost: 4 × $0.04 = $0.16 per product. Roughly 8-15s wall time per mockup,
 * parallelised → total ~15s (vs Sharp 3s, but ~10× quality jump).
 *
 * Failures: best-effort. If <2 mockups succeed we fall back to Sharp
 * procedural composite of the cover image so the pipeline never crashes.
 */
export async function composeMockupsForHero(
  heroBuffer: Buffer,
  productHint: NicheCandidate['productHint'],
  productId: string,
  /** V-1 PDF cover URL (public Blob URL — required for Nano Banana 2). */
  coverUrl?: string,
): Promise<{ mockupUrls: string[]; galleryUrl: string; enhancedCoverUrl?: string }> {
  const ts = Date.now();

  // Path A — Nano Banana 2 (V-2 default, when we have a public cover URL).
  if (coverUrl) {
    try {
      const { generateMockupsForProduct } = await import('@/lib/publish/nano-banana');
      // TANRILAR V-10: nano-banana-pro (Gemini 3 Pro Image) at 2K. Hyper-
      // realistic lifestyle scenes, $0.10×5 = $0.50/product. Parallel ≈ 25-40s.
      // 2K resolution = 2048×2048 sharp enough for Etsy hero (Etsy max 3000px).
      const banana = await generateMockupsForProduct(coverUrl, productHint, {
        model: 'nano-banana-pro',
        aspectRatio: '1:1',
        resolution: '2K',
      });

      if (banana.length >= 1) {
        // Compose 2×2 gallery: cover + top 3 lifestyle mockups
        const galleryMockups: [Buffer, Buffer, Buffer] = [
          banana[0]!,
          banana[1] ?? banana[0]!,
          banana[2] ?? banana[1] ?? banana[0]!,
        ];
        const galleryBuf = await composeGallery(heroBuffer, galleryMockups);

        // V-14: Composite ENHANCED cover — typography hero + 4-mockup strip +
        // trust bar. This is what gets uploaded to Etsy/shop as the marketing
        // hero, showing the actual product in lifestyle scenes (magazine-style).
        // The PLAIN cover (heroBuffer) still gets embedded in the PDF.
        //
        // Poster Sprint B: SKIP enhanced cover for posters. The poster art IS
        // the marketing hero — slapping a "WHAT'S INSIDE · TRUST BAR" magazine
        // chrome over a wall-art piece destroys what makes it sellable. The
        // mockup gallery handles the lifestyle proof job for posters.
        let enhancedCoverBuf: Buffer | null = null;
        if (productHint !== 'poster') {
          try {
            enhancedCoverBuf = await composeEnhancedCover(heroBuffer, banana.slice(0, 4));
          } catch (err) {
            console.warn('[visual] enhanced cover composite failed (using plain cover)', err);
          }
        }

        const uploads = await Promise.all([
          ...banana.map((buf, i) =>
            uploadImage(buf, `trend/${productId}/mockup-${i + 1}-${ts}.jpg`, 'image/jpeg'),
          ),
          uploadImage(galleryBuf, `trend/${productId}/gallery-${ts}.jpg`, 'image/jpeg'),
          ...(enhancedCoverBuf
            ? [uploadImage(enhancedCoverBuf, `trend/${productId}/enhanced-cover-${ts}.jpg`, 'image/jpeg')]
            : []),
        ]);

        const mockupUrls = uploads.slice(0, banana.length).map((u) => u.url);
        const galleryUrl = uploads[banana.length]!.url;
        const enhancedCoverUrl = enhancedCoverBuf ? uploads[uploads.length - 1]!.url : undefined;
        return { mockupUrls, galleryUrl, enhancedCoverUrl };
      }
      console.warn(
        `[mockup] Nano Banana returned only ${banana.length}/4 mockups — no Sharp fallback (V-7 design)`,
      );
    } catch (err) {
      console.error('[mockup] Nano Banana pipeline failed — no Sharp fallback (V-7 design)', err);
    }
  }

  // V-7: Sharp procedural fallback removed. If Nano Banana failed entirely,
  // we used to return the hero as the only mockup — BUT that caused Etsy to
  // upload [hero, hero] as "2 identical images" because the Etsy adapter
  // appends mockup_image_urls after hero_image_url. Worse, V-14 enhanced
  // cover meant the same poster art got reuploaded under three different
  // filenames pretending to be different images.
  //
  // Fix: return mockupUrls = [] (empty) when Banana failed. Etsy then gets
  // ONLY the hero (1 image), which is honest and avoids the duplicate. The
  // gallery still falls back to the hero so the Telegram approval card has
  // a visual.
  console.warn(
    '[mockup-fallback] Banana returned <2 mockups — returning empty mockupUrls to avoid Etsy duplicate-image bug',
  );
  const heroUpload = await uploadImage(
    heroBuffer,
    `trend/${productId}/hero-only-${ts}.jpg`,
    'image/jpeg',
  );
  // Note: galleryUrl reuses the hero — Telegram card needs a photo, but
  // it's a single source. Etsy reads mockup_image_urls only (now empty)
  // so we won't send Etsy a duplicate.
  return {
    mockupUrls: [],
    galleryUrl: heroUpload.url,
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

/**
 * V-5: Generate the V-4 illustrated cover via Nano Banana Pro and use it as
 * the single source of truth for the product visual everywhere. Returns
 * buffer + uploaded URL so the orchestrator can:
 *   • use the URL as the marketing hero
 *   • pass the URL to Nano Banana mockup gen as reference image
 *   • pass the URL to Higgsfield video gen as the input frame
 *   • pass the buffer to PDF gen (embedded as the actual PDF cover)
 *
 * Result: what the buyer sees in the Etsy gallery, the Telegram preview,
 * the cinematic video, and the PDF first page are LITERALLY the same image.
 */
export async function generateCoverHeroImage(
  niche: NicheCandidate,
  content: ProductContent,
  themeKey: string,
  productId: string,
): Promise<{ buffer: Buffer; url: string; pathname: string }> {
  const { generateCoverImageOnly } = await import('./pdf-ai-pages');
  const buffer = await generateCoverImageOnly({ niche, content, theme: themeKey });
  const ts = Date.now();
  const filename = `trend/${productId}/cover-hero-${ts}.jpg`;
  const uploaded = await uploadImage(buffer, filename, 'image/jpeg');
  return { buffer, url: uploaded.url, pathname: uploaded.pathname };
}

/**
 * Poster Sprint B — Wall-art hero generator.
 *
 * Posters live and die by the art itself. For planner / template / sticker the
 * "cover" is editorial typography on a watercolour ground. For posters the
 * cover IS the artwork — no typography overlay, no monogram, just a beautiful
 * print-ready illustration that buyers can imagine framed above their sofa.
 *
 * This bypasses the next/og cover renderer entirely and asks Nano Banana Pro
 * to produce the artwork directly at 2K resolution, vertical 3:4 (matches
 * standard A3/A2 print ratio).
 *
 * Theme + niche + art-style cues flow through `buildPosterArtPrompt` below
 * so the visual stays on-niche (boho vs. mid-century vs. botanical etc.).
 */
export async function generatePosterArtHero(
  niche: NicheCandidate,
  content: ProductContent,
  productId: string,
): Promise<{ buffer: Buffer; url: string; pathname: string }> {
  const { nanoBananaGenerate } = await import('@/lib/publish/nano-banana');
  const prompt = buildPosterArtPrompt(niche, content);

  let buffer: Buffer;
  try {
    buffer = await nanoBananaGenerate({
      prompt,
      aspectRatio: '3:4',
      resolution: '2K',
      // No reference image — we want freshly-composed wall art.
    });
  } catch (err) {
    console.warn(
      '[poster-hero] Nano Banana Pro failed, falling back to router (gpt-image-2/flux)',
      err,
    );
    // Fallback: gpt-image-2 / flux via image-router so the pipeline survives.
    // Router only accepts 1:1 / 9:16 / 16:9 / 4:5 — '4:5' is the closest
    // vertical match to the 3:4 we requested from Banana Pro (acceptable
    // crop loss on the long edge, posters get re-exported per size later).
    const route = routeImageTool('vitrine', niche.topic);
    const res = await generateWithRouter(prompt, route, {
      aspectRatio: '4:5',
      quality: 'high',
    });
    buffer = res.buffer;
  }

  // Sharp auto-trim — Banana Pro often leaves a wide cream paper margin even
  // with "edge-to-edge" in the prompt. We use Sharp.trim() with a threshold
  // tuned for warm cream backgrounds. The trim() call detects uniform edges
  // and crops them. If trim removes too aggressively (rare), we fall back
  // to the original buffer.
  const sharpMod = (await import('sharp')).default;
  let trimmed: Buffer = buffer;
  try {
    const original = sharpMod(buffer);
    const meta = await original.metadata();
    const w0 = meta.width ?? 0;
    const h0 = meta.height ?? 0;

    // trim with threshold ~25 — catches near-white / cream backgrounds while
    // leaving genuine art pixels intact. Background sampled from top-left corner.
    const trimmedBuf = await sharpMod(buffer).trim({ threshold: 25 }).toBuffer();
    const trimMeta = await sharpMod(trimmedBuf).metadata();
    const w1 = trimMeta.width ?? 0;
    const h1 = trimMeta.height ?? 0;

    // Sanity check: trim shouldn't remove more than 40% of either dimension —
    // that would mean we cropped art, not margin. Also, never accept a trim
    // smaller than 200px (Banana sometimes returns tiny crops).
    const widthDrop = (w0 - w1) / w0;
    const heightDrop = (h0 - h1) / h0;
    if (widthDrop > 0.4 || heightDrop > 0.4 || w1 < 800 || h1 < 1000) {
      console.warn(
        `[poster-trim] rejecting aggressive trim: ${w0}x${h0} -> ${w1}x${h1}, using original`,
      );
    } else if (widthDrop < 0.02 && heightDrop < 0.02) {
      // No meaningful trim possible — original was already tight.
      console.log(`[poster-trim] no trim needed (${w0}x${h0} stayed)`);
    } else {
      // After trimming, pad back to a clean 3:4 ratio so PDF/Etsy don't have
      // weird aspects. Pad with a cream tone matched to the watercolor papers.
      const targetW = w1;
      const targetH = Math.round((targetW * 4) / 3);
      const padTop = Math.max(0, Math.floor((targetH - h1) / 2));
      const padBottom = Math.max(0, targetH - h1 - padTop);
      const padded = await sharpMod(trimmedBuf)
        .extend({
          top: padTop,
          bottom: padBottom,
          left: 0,
          right: 0,
          background: { r: 244, g: 238, b: 224 }, // warm cream
        })
        .jpeg({ quality: 92 })
        .toBuffer();
      trimmed = padded;
      console.log(
        `[poster-trim] trimmed margins: ${w0}x${h0} -> ${w1}x${h1} -> padded to ${targetW}x${targetH}`,
      );
    }
  } catch (err) {
    console.warn('[poster-trim] sharp trim failed, using original buffer', err);
  }

  const ts = Date.now();
  const filename = `trend/${productId}/poster-art-${ts}.jpg`;
  const uploaded = await uploadImage(trimmed, filename, 'image/jpeg');
  return { buffer: trimmed, url: uploaded.url, pathname: uploaded.pathname };
}

/**
 * Build a poster-specific art prompt. Hits four key elements every line:
 *  1. Art style cue — boho watercolour / mid-century geometric / botanical line / etc.
 *  2. Subject matter — derived from niche topic
 *  3. Color palette — derived from theme (cream / forest / rose / noir / slate)
 *  4. Print-ready quality — vertical, generous margin, no text, suitable for framing
 *
 * Why no title text? Because:
 *  - Buyers want art they can frame, not a "cover" that says the niche name on it
 *  - Quote / typography posters can be a separate seed niche later (we'll detect
 *    those by topic keyword and switch the prompt accordingly)
 */
function buildPosterArtPrompt(niche: NicheCandidate, content: ProductContent): string {
  const topic = (niche.topic ?? '').toLowerCase();

  // Style inference from niche topic (cheap heuristic; later we'll get this
  // from Claude as a structured field in ProductContent).
  let style: string;
  if (/boho|watercolor|cottagecore|botan|nursery|floral|garden|mushroom/.test(topic)) {
    style = 'hand-painted watercolour with soft botanical illustration and warm cream paper texture';
  } else if (/mid-century|geometric|abstract|bauhaus|modern/.test(topic)) {
    style = 'mid-century modern flat illustration with bold geometric shapes, limited 3-color palette, and crisp vector edges';
  } else if (/line art|line-art|minimalist|line drawing|continuous line/.test(topic)) {
    style = 'minimalist single-line continuous drawing in deep ink on cream, generous whitespace';
  } else if (/mountain|landscape|forest|nature|cabin|wabi/.test(topic)) {
    style = 'serene minimalist landscape illustration in a muted earth-tone palette, soft watercolour washes and faint ink contours';
  } else if (/celestial|moon|cosmic|astro|witch|tarot|spiritual/.test(topic)) {
    style = 'celestial line illustration in deep navy and warm gold, moon phases or constellation motifs on a dusky paper ground';
  } else if (/affirmation|quote|typography|feminist|empowerment/.test(topic)) {
    style = 'editorial typographic poster: short uplifting quote rendered in elegant serif typography centered on a warm cream ground, no decorative imagery beyond two minimal botanical sprigs at top and bottom';
  } else if (/kids|nursery|baby|alphabet|animal/.test(topic)) {
    style = 'soft watercolour children\'s illustration in pastel palette, gentle round shapes, friendly characters or alphabet motifs on cream paper';
  } else if (/city map|city|map|travel/.test(topic)) {
    style = 'minimalist single-line continuous skyline illustration of ONE single city only (pick the most iconic skyline that matches the niche topic), monochrome deep ink on cream paper, the city skyline fills the page horizontally edge-to-edge, no second city, no globe, no other compositions — just one city skyline + a small unobtrusive city name label and coordinate in elegant small typography at the bottom';
  } else if (/french|bistro|kitchen|food|culinary/.test(topic)) {
    style = 'vintage French bistro illustration in muted sepia and burgundy on cream, hand-drawn ink with subtle watercolour wash, evokes 1920s Parisian print';
  } else if (/dark academia|book|library|study/.test(topic)) {
    style = 'dark academia illustration in deep forest green and warm parchment, vintage book / quill / candle motifs, ink etching style';
  } else {
    style = 'soft watercolour and ink illustration in a warm editorial palette on cream paper, hand-drawn organic composition';
  }

  // City-map / typography niches NEED minimal text (city name, coordinate,
  // quote). Other niches must be 100% text-free.
  const allowsText = /city map|city|map|travel|affirmation|quote|typography|feminist/.test(topic);

  return [
    `Printable wall art poster. ${style}.`,
    `Subject: ${niche.topic}. Inspiration / mood: ${niche.gapAngle.slice(0, 160)}.`,
    // EDGE-TO-EDGE composition — this is critical. Previous renders left a
    // wide cream paper border so the artwork "floated" on the A4 PDF cover
    // page. We now demand full-bleed: the artwork fills the entire 3:4
    // canvas with no visible paper margin.
    `Composition: vertical 3:4 portrait orientation. CRITICAL: the artwork fills the ENTIRE 3:4 canvas EDGE-TO-EDGE — no white paper border around the artwork, no cream paper margin, no decorative frame. The composition extends all the way to the four edges of the canvas. The subject is large, confidently sized, anchored to fill the canvas.`,
    `Style: print-ready, high resolution, gallery-quality artwork. Looks like something from a high-end Etsy print shop or Society6 bestseller.`,
    allowsText
      ? `Minor text is acceptable ONLY where the style explicitly calls for it (city name + coordinate, or the quote itself). NO watermarks, NO logos, NO monograms.`
      : `STRICT: absolutely NO text, NO captions, NO watermarks, NO logos, NO monograms, NO frames in the image, NO photographic 3D — purely illustrated 2D artwork.`,
    `The image IS the poster art — what you generate is exactly what gets framed on a wall.`,
  ].join(' ');
}
