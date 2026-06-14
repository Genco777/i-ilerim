/**
 * color-grid.ts — Sprint M3 Faz 3
 *
 * Sharp ile multi-color variant grid composite.
 *
 * Bestseller pattern: top listing'lerin %100'ü "all colors available" tarzı
 * grid photo gösteriyor. Etsy customer renk seçimini tek bakışta görmek istiyor.
 *
 * Input: Printify product'ın mockup URL'leri (farklı color variant)
 * Output: 3×2 ya da 3×3 grid PNG, "Available in N colors" overlay
 *
 * Maliyet: $0 (sadece Sharp + fetch).
 */

import sharp from 'sharp';

export interface ColorGridOpts {
  /** Printify mockup URL listesi (her biri farklı color variant). */
  mockupUrls: string[];
  /** Grid columns (default 3). */
  cols?: 2 | 3;
  /** Her tile boyutu (px). Default 600. */
  tileSize?: number;
  /** Alt overlay text. Default "Available in {N} colors". */
  caption?: string;
}

export interface ColorGridResult {
  buffer: Buffer;
  mimeType: 'image/png';
  width: number;
  height: number;
  tileCount: number;
}

const DEFAULT_CAPTION_TEMPLATE = (n: number): string => `Available in ${n} colors`;

/**
 * Sharp ile renk variant grid composite üret.
 * Mockup URL'lerini paralel indirir, resize eder, grid'e yerleştirir.
 */
export async function createColorVariantGrid(opts: ColorGridOpts): Promise<ColorGridResult> {
  const urls = opts.mockupUrls.slice(0, 9); // max 9 (3×3)
  if (urls.length === 0) {
    throw new Error('createColorVariantGrid: mockupUrls boş');
  }

  const cols = opts.cols ?? 3;
  const TILE = opts.tileSize ?? 600;
  const rows = Math.ceil(urls.length / cols);

  // İndir ve resize
  const tiles = await Promise.all(
    urls.map(async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`color-grid mockup fetch ${res.status}: ${url}`);
      const buf = Buffer.from(await res.arrayBuffer());
      return sharp(buf).resize(TILE, TILE, { fit: 'cover' }).toBuffer();
    }),
  );

  const resolved = await Promise.all(tiles);

  // Grid boyutu + alt caption stripi (60px)
  const CAPTION_HEIGHT = 80;
  const W = cols * TILE;
  const H = rows * TILE + CAPTION_HEIGHT;

  const composites = resolved.map((buf, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { input: buf, top: row * TILE, left: col * TILE };
  });

  // Caption SVG (alt strip)
  const captionText = opts.caption ?? DEFAULT_CAPTION_TEMPLATE(urls.length);
  const captionSvg = `<svg width="${W}" height="${CAPTION_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${CAPTION_HEIGHT}" fill="#1a1a1a"/>
    <text x="${W / 2}" y="${CAPTION_HEIGHT / 2 + 8}" font-family="Arial, sans-serif" font-size="32" font-weight="700"
          fill="white" text-anchor="middle" letter-spacing="3">${captionText.toUpperCase()}</text>
  </svg>`;
  const captionBuffer = await sharp(Buffer.from(captionSvg)).png().toBuffer();

  composites.push({
    input: captionBuffer,
    top: rows * TILE,
    left: 0,
  });

  const grid = await sharp({
    create: {
      width: W,
      height: H,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .composite(composites)
    .png({ quality: 90 })
    .toBuffer();

  return {
    buffer: grid,
    mimeType: 'image/png',
    width: W,
    height: H,
    tileCount: urls.length,
  };
}
