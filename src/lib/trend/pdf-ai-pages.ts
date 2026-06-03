/**
 * V-4 Hybrid PDF — AI-illustrated key pages.
 *
 * The cover, section dividers, and back cover are generated as full-bleed
 * illustrated PNGs by Nano Banana Pro (Gemini 3 Pro Image). These get
 * embedded into the react-pdf document as full-page Images, so the buyer
 * opens a PDF that has magazine-grade hand-illustrated entry pages and
 * functional react-pdf interior pages (prompts with write-on lines, sticker
 * grids, etc.).
 *
 * Aspect ratio: 3:4 (closest Nano Banana ratio to A4's 0.707 ≈ 0.75).
 *
 * Cost: 3 calls × $0.10 = $0.30 per PDF. ~$18/month at 2 products/day.
 *
 * Failure handling: each generation is wrapped in try/catch; on failure,
 * the calling code in pdf-generator.tsx falls back to the V-3 themed
 * react-pdf version of that page. No partial-failure crashes.
 *
 * Used by:
 *   src/lib/trend/pdf-generator.tsx  (covers, dividers, back cover)
 */

import { nanoBananaGenerate } from '@/lib/publish/nano-banana';
import type { NicheCandidate } from './discovery';
import type { ProductContent } from './content';

// ─── Theme-aware style cues for prompts ──────────────────────────────────────

/**
 * Per-theme aesthetic cues fed to the AI. These keep illustrations consistent
 * with the V-3 react-pdf colour palette so buyer doesn't see jarring style
 * shifts between AI pages and react-pdf pages.
 */
const THEME_AESTHETIC: Record<string, string> = {
  cream:
    'warm cream and terracotta palette (creamy off-white background #fbfaf6, terracotta accents #b8866c), soft watercolor botanicals, hand-drawn line ornaments, eucalyptus + dried wheat sprigs, gentle morning light feeling',
  noir:
    'moody noir palette (deep dusty purple #5b4670 accents on cream #f5f1ed), low-key watercolor moths, minimal moon-phase ornament, hand-drawn black ink line accents, candlelit aesthetic, dark feminine mystique',
  forest:
    'grounded forest palette (deep forest green #3d5a47 on cream #fbfaf6), pressed-leaf botanical illustrations, hand-drawn wheat and fern motifs, study-room aesthetic with brass and oak undertones',
  rose:
    'warm rose palette (soft brick #9d4d45 on warm cream #fbf6f3), watercolor peonies and dried rose botanicals, hand-drawn line ornaments, feminine but understated, editorial home interior feel',
  slate:
    'cool slate palette (deep navy slate #324063 on pale cream #f8f8fa), minimal geometric line ornaments, brass-leaf accents, editorial business publication aesthetic, restrained typography',
};

function aestheticFor(theme: string): string {
  return THEME_AESTHETIC[theme] ?? THEME_AESTHETIC.cream!;
}

// ─── Prompt builders ─────────────────────────────────────────────────────────

/**
 * Cover prompt — full-bleed magazine cover illustration with the product
 * title rendered IN the image (Nano Banana Pro handles short titles well).
 */
function buildCoverPrompt(args: {
  title: string;
  subtitle: string;
  theme: string;
}): string {
  return [
    `Magazine-cover illustration for a printable planner. ${aestheticFor(args.theme)}.`,
    `The cover prominently features the title "${args.title.slice(0, 90)}" rendered in elegant serif typography across the upper third of the page, in a deep accent colour that contrasts gently with the cream background.`,
    `Beneath the title, the italic subtitle reads: "${args.subtitle.slice(0, 110)}".`,
    `At the very bottom-right corner, a small monogram "F & F" in modest sans-serif.`,
    'Composition: vertical 3:4 page, generous margins, hand-drawn ornamental flourishes around the corners, NO photos, NO product mockups, NO 3D — purely illustrated editorial cover art.',
    'Typography is paramount: must read clearly, no spelling errors, no stray letters, no extra "title-like" text fragments anywhere else on the page.',
  ].join(' ');
}

/**
 * Section divider — full-bleed colored page with single eyebrow + title line,
 * decorative ornament centered. Less text-dependent than the cover.
 */
function buildDividerPrompt(args: {
  eyebrow: string;
  title: string;
  theme: string;
}): string {
  return [
    `Full-bleed magazine section-divider illustration. ${aestheticFor(args.theme)}.`,
    `The deep accent colour fills the entire 3:4 vertical page as background.`,
    `In the upper-third, the eyebrow "${args.eyebrow}" appears in small sans-serif uppercase, letter-spaced, in cream colour with 60% opacity.`,
    `In the centre, a large editorial serif title reads: "${args.title.slice(0, 80)}" in cream colour.`,
    'Below the title, a thin cream hairline rule (44pt wide), then a small hand-drawn botanical sprig ornament (dried wheat, a single dried lavender, or a folded leaf).',
    'NO other text, NO photos, purely illustrated. Typography MUST be crisp and clearly readable — no spelling errors, no extra fragments.',
  ].join(' ');
}

/**
 * Back cover — illustrated full-bleed background, the brand block (longer
 * text) will be overlaid by react-pdf, so the AI image SHOULD NOT include
 * any text. Just a beautiful decorative background.
 */
function buildBackCoverPrompt(args: { theme: string }): string {
  return [
    `Full-bleed magazine back-cover illustration. ${aestheticFor(args.theme)}.`,
    'Vertical 3:4 page. A cream-textured background with hand-drawn watercolor and ink decorative elements clustered in the corners, leaving the centre and upper-half mostly empty (for text overlay).',
    'Botanical sprigs in two opposite corners, a thin hand-drawn frame border just inside the page edge, a small monogram "F & F" rendered subtly at the very bottom-centre.',
    'NO other text, NO sentences, NO body copy — text will be overlaid by the document. Just decorative composition.',
  ].join(' ');
}

// ─── Public generators ───────────────────────────────────────────────────────

export interface AiPageBuffers {
  cover: Buffer | null;
  divider: Buffer | null;
  backCover: Buffer | null;
}

/**
 * V-6: standalone cover image — Sharp-rendered deterministic layout. Same
 * cover ends up as: marketing hero · Nano Banana mockup reference image ·
 * Higgsfield video input · PDF embedded cover.
 *
 * Single source of truth → 100 % consistent between what the customer sees
 * in mockups, in the video, on the listing, and what they download. AND
 * the cover composition is GUARANTEED — no "minimal/empty" probabilistic
 * outputs from a creative model.
 *
 * Hybrid: an optional Nano Banana centerpiece can be composited into the
 * cream lower half for added warmth (opt-in via env or future param).
 */
export async function generateCoverImageOnly(args: {
  niche: NicheCandidate;
  content: ProductContent;
  theme: string;
}): Promise<Buffer> {
  const { renderCoverImage } = await import('./cover-renderer.tsx');
  return renderCoverImage({
    title: args.content.shopTitle ?? args.niche.topic,
    subtitle: args.niche.gapAngle,
    pageCount: undefined, // could be derived from PDF body once known
    theme: (args.theme as 'cream' | 'noir' | 'forest' | 'rose' | 'slate') ?? 'cream',
  });
}

/**
 * Generate the three illustrated pages in parallel. Each returns null on
 * failure so the caller can fall back to V-3 themed react-pdf pages.
 *
 * V-5 mode: if `presetCover` is passed, skip the cover gen (cover already
 * created earlier in the pipeline as the marketing hero).
 *
 * Resolution: 2K (2048×2560) for crisp print at A4 200dpi.
 * Aspect: 3:4 (closest Nano Banana ratio to A4's 1:1.414).
 */
export async function generateAiPages(args: {
  niche: NicheCandidate;
  content: ProductContent;
  theme: string;
  dividerEyebrow: string;
  dividerTitle: string;
  presetCover?: Buffer | null;
}): Promise<AiPageBuffers> {
  const dividerPrompt = buildDividerPrompt({
    eyebrow: args.dividerEyebrow,
    title: args.dividerTitle,
    theme: args.theme,
  });
  const backPrompt = buildBackCoverPrompt({ theme: args.theme });

  // V-5: if the cover was generated upstream as the marketing hero, reuse it
  // instead of paying for another Nano Banana call.
  const coverPromise: Promise<Buffer> = args.presetCover
    ? Promise.resolve(args.presetCover)
    : nanoBananaGenerate({
        prompt: buildCoverPrompt({
          title: args.content.shopTitle ?? args.niche.topic,
          subtitle: args.niche.gapAngle,
          theme: args.theme,
        }),
        aspectRatio: '3:4',
        resolution: '2K',
        outputFormat: 'jpg',
        model: 'nano-banana-pro',
      });

  const [coverR, dividerR, backR] = await Promise.allSettled([
    coverPromise,
    nanoBananaGenerate({
      prompt: dividerPrompt,
      aspectRatio: '3:4',
      resolution: '2K',
      outputFormat: 'jpg',
      model: 'nano-banana-pro',
    }),
    nanoBananaGenerate({
      prompt: backPrompt,
      aspectRatio: '3:4',
      resolution: '2K',
      outputFormat: 'jpg',
      model: 'nano-banana-pro',
    }),
  ]);

  const log = (label: string, r: PromiseSettledResult<Buffer>) => {
    if (r.status === 'rejected') {
      console.warn(`[pdf-ai-pages] ${label} failed (V-3 fallback will render)`, r.reason);
    }
  };
  log('cover', coverR);
  log('divider', dividerR);
  log('back-cover', backR);

  return {
    cover: coverR.status === 'fulfilled' ? coverR.value : null,
    divider: dividerR.status === 'fulfilled' ? dividerR.value : null,
    backCover: backR.status === 'fulfilled' ? backR.value : null,
  };
}
