/**
 * flat-lay-generator.ts — Sprint M3 Faz 2
 *
 * AI-generated styled flat lay (Etsy bestseller hero photo strategy).
 *
 * Mehmet'in Etsy bestseller competitor research (14.06.2026):
 *   PineSpiceBooks (5K reviews) hero = sage green sweatshirt folded on denim,
 *   dried wheat stalks, vintage round glasses, golden chain necklace.
 *   Cottagecore aesthetic + premium framing = +30% CTR.
 *
 * Bu generator:
 *   1. Nano Banana 2 → niche-specific cottagecore flat lay scene (boş t-shirt)
 *   2. Sharp → transparent design'ı sahnedeki t-shirt'ün üstüne composite
 *   3. Hero photo döner (4:5 portrait, ideal Etsy listing primary image)
 *
 * Maliyet: $0.04 per flat lay (1 Banana call).
 */

import sharp from 'sharp';
import { nanoBananaGenerate } from './nano-banana';

export interface FlatLayOpts {
  /** Niche key — books, romantasy, coffee, cat-books, vs. */
  niche: string;
  /** Tişört rengi (sahne ile uyumlu). */
  shirtColor?: 'sage green' | 'cream' | 'heather grey' | 'natural' | 'soft white' | 'dusty pink';
  /** Üzerine basılan transparent PNG (light variant tercih edilir). */
  designBuffer: Buffer;
  /** Aspect ratio. Default 4:5 (Etsy ideal). */
  aspectRatio?: '4:5' | '1:1';
}

export interface FlatLayResult {
  buffer: Buffer;
  mimeType: 'image/png';
  prompt: string;
  costEstimateUsd: number;
  width: number;
  height: number;
}

// Niche-specific styling — bestseller pattern audit'inden
const FLAT_LAY_PROPS: Record<string, string> = {
  books: 'dried wheat stalks, vintage round reading glasses, leather-bound book, small dried wildflowers, golden chain necklace',
  romantasy: 'dark dried roses, vintage leather-bound book with gold accents, tarot cards, small amber-colored candle, dragon-shaped ring',
  coffee: 'ceramic coffee cup with steam rising, scattered coffee beans, small saucer with shortbread cookie, kraft paper, brass spoon',
  'cat-books': 'small ceramic cat figurine, dried lavender, vintage book with bookmark ribbon, soft knit blanket corner, copper mug',
  teacher: 'vintage red apple, no. 2 pencil, brass paper clips, leather notebook with bookmark, dried autumn leaves',
  booktrovert: 'cozy knit blanket corner, hot mug of tea, open book, eyeglasses, warm hand-knit scarf',
  cottagecore: 'wildflowers in a small jar, vintage book, mushroom figurine, dried orange slices, linen napkin, brass key',
  cat: 'small ceramic cat figurine, dried catnip, ball of yarn, paw print patterned cushion',
  dog: 'small dog toy, leather leash, paw print bandana, dog tag, dried dandelions',
  mom: 'fresh peonies, sentimental locket necklace, vintage children\'s book, lace handkerchief, polaroid frame',
  yoga: 'mala beads, dried sage bundle, small brass om symbol, river stones, eucalyptus sprig',
};

const DEFAULT_PROPS = 'dried wildflowers, vintage book, brass-rimmed glasses, neutral linen napkin';

function getPropsForNiche(niche: string): string {
  return FLAT_LAY_PROPS[niche.toLowerCase()] ?? DEFAULT_PROPS;
}

function buildFlatLayPrompt(opts: Required<Pick<FlatLayOpts, 'niche' | 'shirtColor' | 'aspectRatio'>>): string {
  const props = getPropsForNiche(opts.niche);
  return [
    `Editorial flat lay product photograph from directly above, top-down 90 degree angle.`,
    `Centered: a single folded ${opts.shirtColor} premium cotton t-shirt, neatly folded showing front panel, perfectly flat.`,
    `T-shirt front is COMPLETELY BLANK and EMPTY — no graphics, no text, no print, no design — pure solid ${opts.shirtColor} fabric only.`,
    `Background: weathered light blue denim fabric texture or warm natural linen.`,
    `Styled around the t-shirt: ${props}.`,
    `Soft natural daylight from upper left, gentle shadows, muted neutral color palette.`,
    `Magazine-quality cottagecore aesthetic, Etsy bestseller editorial style.`,
    `${opts.aspectRatio === '1:1' ? 'Square 1:1' : 'Vertical 4:5 portrait'} composition.`,
    `NO model, NO person, NO mannequin — pure flat lay product styling only.`,
  ].join(' ');
}

/**
 * Banana scene + Sharp composite ile styled flat lay üret.
 * Design'ı sahnenin merkez %30-35'ine yerleştir (t-shirt göğüs bölgesine).
 */
export async function generateStyledFlatLay(opts: FlatLayOpts): Promise<FlatLayResult> {
  const merged = {
    niche: opts.niche,
    shirtColor: opts.shirtColor ?? 'cream',
    aspectRatio: opts.aspectRatio ?? '4:5' as const,
  };

  const prompt = buildFlatLayPrompt(merged);

  const sceneBuffer = await nanoBananaGenerate({
    prompt,
    model: 'nano-banana-2',
    aspectRatio: merged.aspectRatio,
    resolution: '2K',
    timeoutMs: 60_000,
    maxRetries: 1,
  });

  const sceneMeta = await sharp(sceneBuffer).metadata();
  const W = sceneMeta.width;
  const H = sceneMeta.height;
  if (!W || !H) {
    throw new Error('flat-lay scene meta width/height eksik');
  }

  // Design'ı boyutlandır: t-shirt'ün ~30%'u kadar (yatay)
  const targetDesignWidth = Math.round(W * 0.32);
  const designResized = await sharp(opts.designBuffer)
    .resize({ width: targetDesignWidth, withoutEnlargement: false })
    .png()
    .toBuffer();

  const designMeta = await sharp(designResized).metadata();
  const designW = designMeta.width ?? 0;
  const designH = designMeta.height ?? 0;

  // Konum: yatay merkez, dikey orta-üst (t-shirt göğüs noktası ≈ %45 dikey)
  const top = Math.max(0, Math.round(H * 0.45) - Math.round(designH / 2));
  const left = Math.max(0, Math.round(W * 0.5) - Math.round(designW / 2));

  const finalBuffer = await sharp(sceneBuffer)
    .composite([
      {
        input: designResized,
        top,
        left,
        // Hafif blend (design tişörtün dokusuna oturmuş gibi)
        blend: 'multiply',
      },
    ])
    .png({ quality: 90 })
    .toBuffer();

  return {
    buffer: finalBuffer,
    mimeType: 'image/png',
    prompt,
    costEstimateUsd: 0.04,
    width: W,
    height: H,
  };
}

// Niche'a göre default shirt color (renk uyumu)
export function defaultShirtColorForNiche(niche: string): FlatLayOpts['shirtColor'] {
  const n = niche.toLowerCase();
  if (n.includes('romantasy')) return 'cream'; // sıcak ton, fantasy mood
  if (n.includes('coffee')) return 'natural'; // off-white, kahve teması
  if (n.includes('cat')) return 'sage green'; // cottagecore
  if (n.includes('teacher')) return 'soft white';
  if (n.includes('mom')) return 'dusty pink';
  if (n.includes('cottagecore')) return 'sage green';
  if (n.includes('booktrovert')) return 'heather grey';
  return 'cream'; // güvenli default
}
