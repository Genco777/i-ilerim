/**
 * apparel-design-ai.ts — Sprint K Faz 4
 *
 * AI illustration + slogan combo apparel tasarım üretici (Nano Banana 2).
 *
 * Mehmet feedback (14.06.2026):
 *   "tipografili işi sevmedim, nano ile illüstrasyonla karışık olmalı"
 *   "siyah model tshirtte yazı da siyahtı o yüzden görünmüyordu"
 *
 * Bu modül Banana 2'ye prompt atar, dönen PNG buffer'ı döndürür.
 * Tasarım: minimalist line illustration + slogan, BEYAZ background + SIYAH ink
 * → Printify'a yüklenir → SADECE AÇIK RENK t-shirt variant'larına atanır
 * (printify.ts APPAREL_PRESETS.tshirt.colors güncellendi).
 *
 * Maliyet: $0.04 per design (nano-banana-2 Flash tier).
 */

import { nanoBananaGenerate } from './nano-banana';

export interface ApparelAIOpts {
  /** Ana slogan — tasarımın merkez yazısı. Örn: "Just a girl who loves books" */
  slogan: string;
  /**
   * Tema kelimeleri — illustration'ın görsel yönü.
   * Örn: "books, vintage library", "coffee, morning ritual", "yoga, lotus flower"
   * Boşsa otomatik slogan'dan tahmin edilir (basit keyword extract).
   */
  theme?: string;
  /** İlüstrasyon stili — varsayılan: "vintage stamp" */
  style?: 'vintage-stamp' | 'line-art' | 'retro-poster' | 'botanical' | 'minimal-graphic';
  /** Aspect ratio — varsayılan 4:5 (portrait, apparel print için ideal) */
  aspectRatio?: '1:1' | '4:5' | '3:4';
  /** Resolution — varsayılan 2K (sharp print için) */
  resolution?: '1K' | '2K';
}

export interface ApparelAIResult {
  buffer: Buffer;
  prompt: string;
  model: string;
  mimeType: 'image/png';
  costEstimateUsd: number;
}

// ── Style → prompt prefix mapping ────────────────────────────────────────────
const STYLE_PROMPTS: Record<NonNullable<ApparelAIOpts['style']>, string> = {
  'vintage-stamp':   'vintage stamp illustration, thick black ink, distressed texture, hand-drawn feel, 1970s aesthetic',
  'line-art':        'minimalist single-line continuous line art illustration, fine black ink lines, modern editorial style',
  'retro-poster':    'retro 70s poster art style, bold black line illustration, slight grain texture, vintage advertising aesthetic',
  'botanical':       'delicate botanical line drawing, thin black ink, hand-illustrated flora and foliage, vintage botanical guide style',
  'minimal-graphic': 'modern minimalist graphic illustration, bold geometric shapes, single color black ink, scandinavian design',
};

// ── Auto-theme extraction from slogan ────────────────────────────────────────
function autoTheme(slogan: string): string {
  const s = slogan.toLowerCase();
  if (/\bbook|read|library|novel|chapter|page\b/.test(s))    return 'open book, vintage library, stacked books';
  if (/\bcoffee|caffeine|espresso|latte|brew\b/.test(s))     return 'coffee cup with steam, coffee beans, vintage cafe';
  if (/\bdog|puppy|pup|paw\b/.test(s))                       return 'cute dog silhouette, paw prints, dog face';
  if (/\bcat|kitten|kitty|meow\b/.test(s))                   return 'cat silhouette, lazy cat, cat face';
  if (/\byoga|meditat|namaste|zen|chakra\b/.test(s))         return 'lotus flower, yoga pose silhouette, om symbol';
  if (/\bplant|garden|botan|leaf\b/.test(s))                 return 'monstera leaf, plant in pot, botanical foliage';
  if (/\bmom|mama|mother\b/.test(s))                         return 'flowers, hearts, decorative wreath, motherhood symbols';
  if (/\bteach|class|school|student\b/.test(s))              return 'open book, apple, pencil, blackboard';
  if (/\bnurse|medic|health\b/.test(s))                      return 'stethoscope, heart, medical cross, caduceus';
  if (/\bsun|moon|star|cosmic|celest\b/.test(s))             return 'crescent moon, sun rays, stars, celestial bodies';
  if (/\btravel|adventur|wander|journey\b/.test(s))          return 'compass, mountain silhouette, paper plane, suitcase';
  if (/\bmusic|guitar|song|melod\b/.test(s))                 return 'guitar silhouette, music notes, vintage microphone';
  if (/\bfit|gym|workout|run\b/.test(s))                     return 'dumbbell, runner silhouette, lightning bolt';
  // Generic fallback
  return 'minimalist abstract decorative ornament, vintage flourish, decorative frame';
}

// ── Build full Banana prompt ────────────────────────────────────────────────
function buildPrompt(opts: Required<Pick<ApparelAIOpts, 'slogan' | 'style'>> & { theme: string }): string {
  const styleDesc = STYLE_PROMPTS[opts.style];
  return [
    `T-shirt apparel design, ${styleDesc}.`,
    `Central illustration: ${opts.theme}.`,
    `Below the illustration, the text "${opts.slogan}" rendered in clean uppercase serif typography,`,
    `letter-spacing slightly wide, all elements in BLACK INK only.`,
    `Pure white solid background, NO photographic elements, NO 3D rendering,`,
    `no gradients, no soft shadows — flat 2D vector-style illustration only.`,
    `Composition: vertically centered, plenty of negative space around the design,`,
    `entire design fits within a 4:5 portrait frame with generous margins.`,
    `Style reference: modern Etsy bestseller t-shirt graphic, vintage editorial aesthetic.`,
  ].join(' ');
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function generateApparelDesignAI(opts: ApparelAIOpts): Promise<ApparelAIResult> {
  const slogan = opts.slogan?.trim();
  if (!slogan) {
    throw new Error('generateApparelDesignAI: slogan boş olamaz');
  }

  const style = opts.style ?? 'vintage-stamp';
  const theme = (opts.theme && opts.theme.trim()) || autoTheme(slogan);
  const aspectRatio = opts.aspectRatio ?? '4:5';
  const resolution = opts.resolution ?? '2K';

  const prompt = buildPrompt({ slogan, style, theme });

  const buffer = await nanoBananaGenerate({
    prompt,
    model: 'nano-banana-2',
    aspectRatio,
    resolution,
    outputFormat: 'png',
    timeoutMs: 90_000,
    maxRetries: 2,
  });

  return {
    buffer,
    prompt,
    model: 'google/nano-banana-2',
    mimeType: 'image/png',
    costEstimateUsd: 0.04,
  };
}
