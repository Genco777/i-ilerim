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

import sharp from 'sharp';
import { nanoBananaGenerate } from './nano-banana';
import { removeBackgroundML } from './remove-bg';

export interface ApparelAIOpts {
  /** Ana slogan — tasarımın merkez yazısı. Örn: "Just a girl who loves books" */
  slogan: string;
  /**
   * Tema kelimeleri — illustration'ın görsel yönü.
   * Örn: "books, vintage library", "coffee, morning ritual", "yoga, lotus flower"
   * Boşsa otomatik slogan'dan tahmin edilir (basit keyword extract).
   */
  theme?: string;
  /** İlüstrasyon stili — varsayılan: "modern-flat" (clean, bg removal-friendly) */
  style?: 'modern-flat' | 'vintage-stamp' | 'line-art' | 'retro-poster' | 'botanical' | 'minimal-graphic';
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
  /** Hangi bg removal yöntemi kullanıldı */
  bgRemoveMethod?: 'sharp-negate' | 'rembg-ml' | 'sharp-threshold';
  /** rembg fail olursa hata mesajı (debug için, sharp-negate'te null) */
  rembgError?: string | null;
}

// ── Style → prompt prefix mapping ────────────────────────────────────────────
const STYLE_PROMPTS: Record<NonNullable<ApparelAIOpts['style']>, string> = {
  'modern-flat':     'clean modern flat vector illustration, bold solid black silhouette, NO texture, NO grain, NO distressing, pure crisp edges',
  'vintage-stamp':   'vintage stamp illustration style but CLEAN edges, solid black ink, NO paper texture, NO grain — pure flat vector look',
  'line-art':        'minimalist single-line continuous line art illustration, fine clean black ink lines, NO texture, modern editorial style',
  'retro-poster':    'retro 70s poster art, bold solid black shapes, NO grain, NO texture — pure flat vector style',
  'botanical':       'delicate botanical line drawing, clean thin black ink, NO texture, NO shading — pure vector flat style',
  'minimal-graphic': 'modern minimalist graphic, bold geometric shapes, single solid black, scandinavian flat design, NO texture',
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
    `Below the illustration, the text "${opts.slogan}" in clean bold sans-serif typography,`,
    `letter-spacing slightly wide, ALL elements in PURE SOLID BLACK ink (RGB 0,0,0) only.`,
    `CRITICAL: PURE WHITE SOLID BACKGROUND (RGB 255,255,255 exactly), NO texture, NO paper, NO grain,`,
    `NO gradients, NO shadows, NO photographic elements, NO 3D rendering — flat 2D vector illustration ONLY.`,
    `Background must be 100% pure white #FFFFFF — no off-white, no cream, no beige.`,
    `Composition: vertically centered, generous margins, entire design in 4:5 portrait frame.`,
    `Style: modern Etsy bestseller t-shirt graphic suitable for direct-to-garment printing.`,
  ].join(' ');
}

// ── White background → alpha (transparent PNG) ──────────────────────────────
/**
 * Banana 2 her zaman solid white background veriyor (transparent_background
 * destekli değil). T-shirt göğsünde beyaz kare gözükmesin diye Sharp ile
 * threshold-based bg removal yapıyoruz.
 *
 * Strateji:
 *   - Grayscale → her pixel için lightness (0-255)
 *   - >= 245: alpha 0 (transparent — white bg)
 *   - <= 200: alpha 255 (opaque — illustration/text)
 *   - 200-244: linear smooth transition (no jagged edges)
 *
 * Sonuç: transparent PNG, t-shirt kumaşı görünür, sadece siyah ink kalır.
 */
async function removeWhiteBackground(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const W = meta.width;
  const H = meta.height;
  if (!W || !H) {
    throw new Error('removeWhiteBackground: image meta width/height eksik');
  }

  // MANUEL RGBA BUFFER YAKLAŞIMI (deterministik, garanti çalışır):
  //
  // ÖNEMLI: Sharp 0.35.x'in `.joinChannel()` API'si PNG encode'da alpha
  // kanalını siliyor (sandbox testinde kanıtlandı: output 3 channel, alpha
  // kayboluyor). Çözüm: pixel pixel manuel RGBA buffer oluştur, raw input
  // olarak Sharp'a ver → PNG encode alpha'yı koruyor.
  //
  // Algoritma:
  //   alpha[i] = 255 - grayscale(RGB[i])
  //   - White (R=G=B=255) → gray 255 → alpha 0 (tam transparent)
  //   - Black (R=G=B=0)   → gray 0   → alpha 255 (tam opaque)
  //   - Gri tonlar        → smooth alpha geçiş (anti-aliasing edges)
  //
  // Threshold yok, ML yok, parametre yok. Sharp + matematik.

  const rgb = await sharp(input).removeAlpha().raw().toBuffer(); // W*H*3
  const totalPixels = W * H;
  const rgba = Buffer.alloc(totalPixels * 4);

  for (let i = 0; i < totalPixels; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    rgba[i * 4]     = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    // alpha = 255 - average(R,G,B). White → 0, black → 255.
    rgba[i * 4 + 3] = 255 - Math.round((r + g + b) / 3);
  }

  return await sharp(rgba, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png()
    .toBuffer();
}

/**
 * Sprint L Faz 2 — Banana çıktısını "dark variant" olarak dönüştür.
 *
 * Banana ham çıktı: bg=white, ink=black.
 * Dark variant (siyah tişört için): bg=transparent, ink=WHITE.
 *
 * Algoritma:
 *   1. RGB invert (255-R, 255-G, 255-B):
 *      - bg pixel was white(255) → now black(0) — ama görünmeyecek (transparent)
 *      - ink pixel was black(0) → now white(255) — koyu shirt'te beyaz görünür
 *   2. alpha = 255 - grayscale(ORIGINAL) — light variant'la aynı maskleme:
 *      - Original bg (gray=255) → alpha 0 (transparent)
 *      - Original ink (gray=0)  → alpha 255 (opaque)
 *
 * Sonuç: koyu kumaş üstünde beyaz illustration görünür, beyaz kare yok.
 */
async function convertToDarkVariant(input: Buffer): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const W = meta.width;
  const H = meta.height;
  if (!W || !H) {
    throw new Error('convertToDarkVariant: image meta width/height eksik');
  }

  const rgb = await sharp(input).removeAlpha().raw().toBuffer();
  const totalPixels = W * H;
  const rgba = Buffer.alloc(totalPixels * 4);

  for (let i = 0; i < totalPixels; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    // RGB invert
    rgba[i * 4]     = 255 - r;
    rgba[i * 4 + 1] = 255 - g;
    rgba[i * 4 + 2] = 255 - b;
    // alpha = 255 - original grayscale (light variant ile aynı maskleme)
    rgba[i * 4 + 3] = 255 - Math.round((r + g + b) / 3);
  }

  return await sharp(rgba, {
    raw: { width: W, height: H, channels: 4 },
  })
    .png()
    .toBuffer();
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function generateApparelDesignAI(opts: ApparelAIOpts): Promise<ApparelAIResult> {
  const slogan = opts.slogan?.trim();
  if (!slogan) {
    throw new Error('generateApparelDesignAI: slogan boş olamaz');
  }

  const style = opts.style ?? 'modern-flat';
  const theme = (opts.theme && opts.theme.trim()) || autoTheme(slogan);
  const aspectRatio = opts.aspectRatio ?? '4:5';
  const resolution = opts.resolution ?? '2K';

  const prompt = buildPrompt({ slogan, style, theme });

  // output_format: 'png' kaldırıldı — nano-banana-2 default jpg kabul ediyor,
  // 'png' parametresi 422 schema fail yapabiliyor. JPG t-shirt mockup için sorun
  // değil (white bg, beyaz/açık tişört üstünde görsel olarak transparent gibi).
  // Timeout 45s + maxRetries 1 → toplam max 90s, Vercel Hobby 60s limiti için
  // ilk attempt'ta dönmeli. Pro plan'da retry'a şans verilir.
  const rawBuffer = await nanoBananaGenerate({
    prompt,
    model: 'nano-banana-2',
    aspectRatio,
    resolution,
    timeoutMs: 45_000,
    maxRetries: 1,
  });

  // DETERMINIST BG REMOVAL — Sharp negate (math-based).
  // White (R=G=B=255) → grayscale 255 → negate 0 → alpha 0 (transparent)
  // Black (R=G=B=0)   → grayscale 0   → negate 255 → alpha 255 (opaque)
  // Anti-aliased edges → smooth alpha transition.
  //
  // Threshold + ML yaklaşımları başarısız oldu — bu deterministik matematik
  // garanti çalışır. Banana ne kadar pure black çizdiyse pixel o kadar opaque.
  const transparentBuffer = await removeWhiteBackground(rawBuffer);

  return {
    buffer: transparentBuffer,
    prompt,
    model: 'google/nano-banana-2',
    mimeType: 'image/png',
    costEstimateUsd: 0.04,
    bgRemoveMethod: 'sharp-negate',
    rembgError: null,
  };
}

// Sharp threshold helper (fallback) — bilinçli olarak duruyor, rembg fail
// durumunda Banana çıktısı en azından kısmen mask'lensin diye.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _sharpThresholdFallback(buf: Buffer): Promise<Buffer> {
  return removeWhiteBackground(buf);
}

// ── Sprint L Faz 2 — Both variants (light + dark) ────────────────────────────
export interface ApparelAIBothResult {
  lightBuffer: Buffer;
  darkBuffer: Buffer;
  prompt: string;
  model: string;
  mimeType: 'image/png';
  costEstimateUsd: number;
}

/**
 * Tek Banana çağrı, iki transparent variant döndür:
 *   - lightBuffer: siyah ink (White, Heather, Natural gibi açık renk shirt'ler için)
 *   - darkBuffer: beyaz ink (Black, Navy gibi koyu shirt'ler için)
 *
 * Maliyet aynı $0.04 (Banana 1 call, Sharp post-process 2×).
 */
export async function generateApparelDesignAIBothVariants(opts: ApparelAIOpts): Promise<ApparelAIBothResult> {
  const slogan = opts.slogan?.trim();
  if (!slogan) throw new Error('generateApparelDesignAIBothVariants: slogan boş olamaz');

  const style = opts.style ?? 'modern-flat';
  const theme = (opts.theme && opts.theme.trim()) || autoTheme(slogan);
  const aspectRatio = opts.aspectRatio ?? '4:5';
  const resolution = opts.resolution ?? '2K';

  const prompt = buildPrompt({ slogan, style, theme });

  const rawBuffer = await nanoBananaGenerate({
    prompt,
    model: 'nano-banana-2',
    aspectRatio,
    resolution,
    timeoutMs: 45_000,
    maxRetries: 1,
  });

  const [lightBuffer, darkBuffer] = await Promise.all([
    removeWhiteBackground(rawBuffer),
    convertToDarkVariant(rawBuffer),
  ]);

  return {
    lightBuffer,
    darkBuffer,
    prompt,
    model: 'google/nano-banana-2',
    mimeType: 'image/png',
    costEstimateUsd: 0.04,
  };
}
