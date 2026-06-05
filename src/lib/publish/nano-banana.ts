/**
 * Nano Banana 2 (Gemini 3.1 Flash Image) — Replicate client.
 *
 * Why this exists (V-2 architecture):
 *   Sharp procedural compositing produced amateur-looking mockups (coordinates
 *   never quite right, no real lighting/shadow). Nano Banana 2 takes the V-1
 *   PDF cover render as a reference image + a natural-language scene prompt
 *   and returns a photorealistic mockup with our actual product naturally
 *   placed in the scene — magazine-grade output, no PSD wrangling.
 *
 * Models:
 *   google/nano-banana-2   — Flash tier, ~$0.04/img, used for bulk mockups
 *   google/nano-banana-pro — Pro tier  (Gemini 3 Pro Image), ~$0.10/img,
 *                            used for the marketing hero when we want top
 *                            premium output. Same input shape.
 *
 * Limits:
 *   • Up to 14 reference images per call
 *   • Output resolutions: 512px, 1K, 2K, 4K (4K is heaviest + most expensive)
 *   • Aspect ratios: 1:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9,
 *                    plus 1:4, 4:1, 1:8, 8:1 (banners)
 *   • SynthID watermark embedded in all outputs (Google policy)
 *
 * Used by:
 *   src/lib/trend/mockup.ts        (5 lifestyle scenes per product)
 *   src/lib/trend/visual.ts        (optional premium hero variant)
 *   src/lib/publish/etsy.adapter.ts (alternative: more variations for Etsy)
 */

import Replicate from 'replicate';

export type NanoBananaModel = 'nano-banana-2' | 'nano-banana-pro';

const MODEL_MAP: Record<NanoBananaModel, `${string}/${string}`> = {
  'nano-banana-2': 'google/nano-banana-2',
  'nano-banana-pro': 'google/nano-banana-pro',
};

export type NanoBananaAspect =
  | '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4'
  | '9:16' | '16:9' | '21:9' | '1:4' | '4:1' | '1:8' | '8:1';

export type NanoBananaResolution = '512px' | '1K' | '2K' | '4K';

export interface NanoBananaOptions {
  /** Lifestyle scene description. Be specific about props, lighting, mood. */
  prompt: string;
  /**
   * Reference images (URLs). The first one is anchor (e.g., PDF cover render).
   * Up to 14. Must be publicly accessible.
   */
  imageInput?: string[];
  /** Default '1:1'. Use 4:5 for Etsy hero (Etsy crops to 4:5 in feed). */
  aspectRatio?: NanoBananaAspect;
  /** Default '1K'. Use '2K' or '4K' for hero. Mockups fine at 1K. */
  resolution?: NanoBananaResolution;
  /** 'jpg' (default — smaller) or 'png' (lossless). */
  outputFormat?: 'jpg' | 'png';
  /** Default 'nano-banana-2' (Flash). Use 'nano-banana-pro' for premium. */
  model?: NanoBananaModel;
  /** Default 3. */
  maxRetries?: number;
}

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run Nano Banana 2/Pro and return the resulting image as a Buffer.
 *
 * @throws if all retries fail or REPLICATE_API_TOKEN is missing.
 */
export async function nanoBananaGenerate(opts: NanoBananaOptions): Promise<Buffer> {
  const model = opts.model ?? 'nano-banana-2';
  const modelId = MODEL_MAP[model];
  const maxRetries = opts.maxRetries ?? 3;

  const input: Record<string, unknown> = {
    prompt: opts.prompt,
    aspect_ratio: opts.aspectRatio ?? '1:1',
    output_format: opts.outputFormat ?? 'jpg',
  };
  if (opts.resolution) {
    input.resolution = opts.resolution;
  }
  if (opts.imageInput?.length) {
    input.image_input = opts.imageInput.slice(0, 14);
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const output = await getClient().run(
        modelId as `${string}/${string}:${string}`,
        { input },
      );

      let url: string | undefined;
      if (typeof output === 'string') {
        url = output;
      } else if (Array.isArray(output) && typeof output[0] === 'string') {
        url = output[0];
      } else if (
        output &&
        typeof output === 'object' &&
        'url' in output &&
        typeof (output as { url: unknown }).url === 'function'
      ) {
        url = (output as { url: () => string }).url();
      }

      if (!url) {
        throw new Error(
          'Unexpected Replicate output shape: ' + JSON.stringify(output).slice(0, 200),
        );
      }

      const res = await fetch(url);
      if (!res.ok) throw new Error(`Image fetch failed (${res.status}) for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10_000);
        console.warn(
          `[nano-banana ${model}] attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms: ${lastError.message}`,
        );
        await sleep(delay);
      }
    }
  }

  throw lastError ?? new Error('Nano Banana generation failed after retries');
}

// ─────────────────────────────────────────────────────────────
// Per-product-type mockup prompt sets
// ─────────────────────────────────────────────────────────────

export type ProductHint = 'planner' | 'sticker' | 'poster' | 'template' | 'social_template';

/**
 * 4 lifestyle prompts per product type. Each one renders the PDF cover
 * (passed as imageInput) naturally placed in a magazine-grade scene.
 *
 * IMPORTANT prompt engineering notes:
 *   • Mention "this printable" or "this design" so the model uses the
 *     reference image as the actual product, not an inspiration.
 *   • Anchor the lighting + props — magazines use specific styling cues.
 *   • Avoid words like "perfect" or "amazing" — they trigger overproduction.
 */
export const MOCKUP_PROMPTS: Record<ProductHint, string[]> = {
  planner: [
    // 1. Hands-held lifestyle — EXPLICIT reference-image instruction
    'USE THE REFERENCE IMAGE as a printed printable planner cover that this scene must contain. Scene: a young woman in a cream cashmere sweater holds the reference-image planner with both hands, fingers visible on the edges, at a sunlit wooden cafe table. A small white ceramic cappuccino, a sprig of dried lavender in a tiny vase, and a brass fountain pen sit beside it. Soft morning window light from the left, dust particles floating in the beam, shallow depth of field f/2.0, photographed on Hasselblad medium format. The planner the woman holds MUST be identical to the reference image input — same title, same design, no alteration. Editorial Anthropologie magazine aesthetic, warm golden hour grading, 4K detail.',
    // 2. Flatlay top-down with props
    'USE THE REFERENCE IMAGE as a printed planner cover lying flat in the centre of this scene. Top-down editorial flatlay: the reference-image planner lies on natural cream linen tablecloth surrounded by a small white ceramic coffee cup with cappuccino foam, a brass pen at 4 o\'clock, dried eucalyptus sprig at 11 o\'clock, three small white roses at 2 o\'clock, and a folded linen napkin at 7 o\'clock. Soft diffused morning light from above, deep warm shadows, medium format film photo with visible grain. The planner is identical to the reference image — same title, same exact design.',
    // 3. Laptop screen showing planner
    'USE THE REFERENCE IMAGE as the content displayed on a 13-inch MacBook Pro screen in this scene. Setup: the MacBook sits on a clean white linen-covered desk in a sunlit home office. A small terracotta plant pot with trailing pothos at left, a ceramic mug at right, a leather journal in front. Floor-to-ceiling window left provides warm afternoon natural light. The screen displays EXACTLY the reference-image planner cover — same title, same design, edge-to-edge fill of the screen. Apple commercial product photography, 4K detail.',
    // 4. Framed on warm plaster wall
    'USE THE REFERENCE IMAGE as the printed art inside a thin oak wood frame with cream matting. Scene: the framed reference image hangs on a warm-toned plaster wall above a mid-century walnut sideboard. A ceramic vase with dried pampas grass at left, two stacked leather-bound books and a small beeswax candle at right rest on the sideboard. Soft natural light from the right, deep brown shadows. The framed print is IDENTICAL to the reference image — same title, same composition, no alteration. Architectural Digest interior photography style.',
    // 5. Macro close-up with hand
    'USE THE REFERENCE IMAGE as a printed planner cover that a hand interacts with in this macro close-up. A young woman\'s hand wearing the cuff of a cream cashmere sweater holds a brass fountain pen just above the upper-right corner of the reference-image planner. Soft cream linen background. Shallow depth of field f/1.8, beautiful bokeh, morning natural light, hands shot with extreme photorealism, paper texture of the planner clearly visible. The planner cover MUST match the reference image exactly.',
  ],
  sticker: [
    'This printable sticker sheet design, freshly printed on glossy paper, placed on a cream linen tablecloth next to a journal, scissors, and rolls of washi tape. Top-down view, soft natural light, warm neutral tones, craft aesthetic.',
    'This sticker design printed and three stickers peeled off, placed inside a leather-bound journal. Hand-cut precision, paper texture visible, magazine-quality close-up styling.',
    'Flatlay: this sticker sheet design surrounded by an open planner, a fountain pen, dried botanicals, and a porcelain cup of tea. Top-down minimal scandi composition, soft window light.',
    'This sticker sheet design displayed on a cork board pinned with brass pushpins, alongside polaroid photos, a sprig of olive leaves, and a handwritten note. Warm cottage-core aesthetic, editorial home interior photography.',
  ],
  poster: [
    // 1. ABOVE-SOFA living room (the single most converting Etsy poster mockup)
    'USE THE REFERENCE IMAGE as the printed art inside this oak wood frame hanging on the wall in this scene. Scene: a sun-filled mid-century modern living room. Below the framed reference image, a curved cream bouclé sofa with a folded camel throw blanket, a small walnut side-table with a stoneware mug and a stack of art books, and a tall fiddle-leaf fig at the corner. Warm afternoon light falling diagonally across the wall, gentle shadow under the frame. The framed print is IDENTICAL to the reference image — same composition, same colors, no alteration. Architectural Digest editorial photography, shot on Hasselblad medium format, 4K detail, photorealistic.',
    // 2. ABOVE-BED bedroom — Pinterest top-pin format
    'USE THE REFERENCE IMAGE as the framed print hanging above the bed in this scene. Scene: a serene boho bedroom with a linen-dressed king bed, rumpled cream sheets, a folded chunky-knit throw at the foot, two natural-linen pillows, and a small woven bedside stool holding a ceramic vase of dried pampas grass. Morning sunlight streams through sheer linen curtains on the right, casting soft shadows. The frame is a wide oak with thin cream matting and the artwork inside MUST match the reference image exactly — same composition, same colors. Editorial home interior photography, magazine-grade finish, Anthropologie aesthetic.',
    // 3. GALLERY WALL — 3-print arrangement (drives upsell to "Pro" tier 3-set)
    'USE THE REFERENCE IMAGE as the centre print in a 3-piece framed gallery wall in this scene. Three matching oak frames hang in a row on a warm sage-green painted wall: left and right frames hold complementary minimalist abstract prints; the CENTRE frame contains the reference-image artwork IDENTICAL to the reference (same composition, same colors, no alteration). Below the gallery wall is a vintage walnut console table with a stack of large art books, a small porcelain bud vase holding one white ranunculus, and a tapered beeswax candle in a brass holder. Warm directional light from the left. Editorial home photography style.',
    // 4. HANDS-HELD print (most-pinned Pinterest format — sells emotion + scale)
    'USE THE REFERENCE IMAGE as the loose printed art being held by two hands in this scene. A young woman in a cream cashmere sweater holds the printed reference image with both hands at the top edge, fingers visible, examining it. She stands against a warm-toned plaster wall with soft side lighting. The print MUST be IDENTICAL to the reference image — same composition, same colors, paper texture clearly visible at the edges. Shallow depth of field f/2.0, editorial photography, warm golden grading, Hasselblad medium format detail.',
    // 5. ABOVE-DESK workspace (WFH buyer — strong WFH home-office market)
    'USE THE REFERENCE IMAGE as the framed art hanging on the wall above a sunlit home office desk in this scene. Frame: thin black gallery frame with white matting; the artwork inside IS the reference image, identical (same composition, same colors, no alteration). Below the framed art: a walnut wood desk with a small brass desk lamp, a closed leather-bound notebook, a single ceramic mug with herbal tea steam rising, and a small terracotta pot with a trailing pothos plant. Soft afternoon light from a window on the right. Editorial WFH lifestyle photography, magazine-grade finish.',
  ],
  template: [
    'This printable template design displayed on a 13-inch MacBook screen, sitting on a clean white linen-covered desk with a small terracotta plant pot, a ceramic mug, and a paperback book in soft focus. Apple Store product photo style, clean backdrop, even soft light.',
    'This printable template printed on A4 paper and held in a hand against a cream wall, with a soft drop shadow behind. Minimal editorial product photography.',
    'This template design displayed on an iPad Pro screen, the iPad resting on a marble desk next to a brass mechanical pencil and a small porcelain ramekin of paperclips. Magazine product styling, soft directional light.',
    'Flatlay overhead: this template printed on textured paper, surrounded by an open laptop showing the same design, a leather journal, a brass pen, and dried botanicals. Top-down editorial composition, warm neutral palette.',
  ],
  social_template: [
    'This Instagram post template displayed on an iPhone screen, the phone held by a woman\'s hand against a soft blurred warm-tone background. Editorial mobile product styling.',
    'This social media template shown on a phone screen, the phone resting on a marble desk next to a small ceramic vase with a dried sprig and a paper notebook. Top-down editorial product photography.',
    'This Instagram template design displayed on a phone screen, the phone held against a warm-toned plaster wall with soft natural side light. Minimalist editorial styling.',
    'Multi-mockup flatlay: this Instagram template shown on three phones at different angles, on a marble surface with dried botanicals and a porcelain cup. Editorial multi-device composition.',
  ],
};

/**
 * Generate 3 lifestyle mockups for a product, in parallel.
 *
 * Originally 4, dropped to 3 to stay under Vercel's 800s function timeout
 * (cron must finish discovery + content + hero + pdf + render + mockups +
 * video + 2× products all together — every second counts). Three premium
 * scenes still gives Etsy a strong gallery (hero + 3 mockups = 4 photos).
 *
 * @param coverImageUrl Public URL of the V-1 PDF cover render (reference)
 * @param productHint Picks the matching prompt set
 * @param opts Override model/aspect/resolution
 * @returns Up to 3 buffers, order matches MOCKUP_PROMPTS[0..2]
 */
export async function generateMockupsForProduct(
  coverImageUrl: string,
  productHint: ProductHint,
  opts?: { model?: NanoBananaModel; aspectRatio?: NanoBananaAspect; resolution?: NanoBananaResolution },
): Promise<Buffer[]> {
  // TANRILAR V-10: use all 5 editorial lifestyle scenes (was 3 for speed).
  // Banana Pro 2K each ≈ 15-25 s, parallel → wall time ~25-30 s.
  const prompts = (MOCKUP_PROMPTS[productHint] ?? MOCKUP_PROMPTS.planner).slice(0, 5);

  // Parallel: 3 × ~10s ≈ 10-15s wall time (Replicate may queue when busy).
  const results = await Promise.allSettled(
    prompts.map((prompt) =>
      nanoBananaGenerate({
        prompt,
        imageInput: [coverImageUrl],
        aspectRatio: opts?.aspectRatio ?? '1:1',
        resolution: opts?.resolution ?? '1K',
        outputFormat: 'jpg',
        model: opts?.model ?? 'nano-banana-2',
      }),
    ),
  );

  const buffers: Buffer[] = [];
  for (const [i, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      buffers.push(r.value);
    } else {
      console.error(`[nano-banana] mockup ${i + 1} for ${productHint} failed:`, r.reason);
    }
  }
  return buffers;
}
