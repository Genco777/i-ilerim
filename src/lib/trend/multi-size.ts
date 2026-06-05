/**
 * Sprint C — Multi-size print ratios for poster Plus/Pro tiers
 *
 * Standard print sizes group into 3 aspect ratios:
 *   • A-series (A2 / A3 / A4)        — 1:1.414  (ISO 216)
 *   • Imperial standard (8×10, 16×20) — 1:1.25
 *   • Mid-imperial (11×14)            — 1:1.272
 *
 * A buyer wanting an 8×10 print uses the 1:1.25 file. An A3 buyer uses the
 * 1:1.414 file. The art prints at the chosen physical size.
 *
 * Our source art from Banana Pro is 3:4 (1:1.333). We re-crop it to each
 * aspect group using Sharp's cover-fit (centred crop, no distortion).
 */

import sharp from 'sharp';

export interface SizeVariant {
  /** Human-readable label: "A4/A3/A2 (ISO)", "8×10 / 16×20", "11×14". */
  label: string;
  /** Target aspect ratio width / height. */
  aspectW: number;
  aspectH: number;
  /** Width in pixels at 300 DPI for the LARGEST size in the group. */
  pixelW: number;
  pixelH: number;
}

export const PRINT_SIZE_VARIANTS: SizeVariant[] = [
  {
    label: 'A4 / A3 / A2 (ISO 216)',
    aspectW: 1,
    aspectH: 1.414,
    // A2 @ 300dpi = 4961 × 7016 (vertical) — covers A3 + A4 by scaling down
    pixelW: 4961,
    pixelH: 7016,
  },
  {
    label: '8×10 / 16×20 (US standard)',
    aspectW: 1,
    aspectH: 1.25,
    // 16×20 @ 300dpi = 4800 × 6000 (vertical) — covers 8×10 by scaling down
    pixelW: 4800,
    pixelH: 6000,
  },
  {
    label: '11×14 (US mid)',
    aspectW: 1,
    aspectH: 1.2727,
    // 11×14 @ 300dpi = 3300 × 4200 (vertical)
    pixelW: 3300,
    pixelH: 4200,
  },
];

/**
 * Crop+resize the source poster art into one buffer per aspect group.
 * Source should be vertical 3:4 (1:1.333) at 2K or higher (from Banana Pro).
 *
 * Returns array of `{ variant, buffer }`. Buffers are JPEG @ quality 90,
 * suitable for direct PDF embed.
 */
export async function buildPosterSizeVariants(
  sourceBuffer: Buffer,
): Promise<Array<{ variant: SizeVariant; buffer: Buffer }>> {
  const results: Array<{ variant: SizeVariant; buffer: Buffer }> = [];

  for (const variant of PRINT_SIZE_VARIANTS) {
    try {
      const buf = await sharp(sourceBuffer)
        .resize(variant.pixelW, variant.pixelH, {
          fit: 'cover',
          position: 'centre',
        })
        .jpeg({ quality: 90, progressive: true })
        .toBuffer();
      results.push({ variant, buffer: buf });
    } catch (err) {
      console.warn(`[multi-size] variant "${variant.label}" failed`, err);
    }
  }

  return results;
}
