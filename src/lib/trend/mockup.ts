/**
 * Mockup Compositing — Faz 2-B + 2-E
 *
 * Hybrid approach:
 *   1. If `public/mockup-templates/<slug>.png` exists, treat it as a real
 *      photo base. Use the coordinates in `mockup-coords.json` to overlay
 *      the hero on the empty "active area" of that mockup. Photo-realistic.
 *   2. Otherwise fall back to procedural SVG-rendered scenes. Functional
 *      but synthetic-looking.
 *
 * Run `pnpm tsx scripts/generate-mockup-bases.ts` once to generate the
 * PNG bases — they are committed to the repo and reused for every product.
 *
 * Produces 3 mockup variants + 1 gallery (2x2 grid composite).
 */

import sharp from 'sharp';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TILE = 1024;
const TEMPLATES_DIR = join(process.cwd(), 'public', 'mockup-templates');
const COORDS_PATH = join(TEMPLATES_DIR, 'mockup-coords.json');

type MockupSlug = 'frame-wall' | 'tablet-desk' | 'laptop-desk' | 'paper-flatlay';
interface ActiveArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── PNG base loader (cached) ────────────────────────────────────────────────

interface MockupBase {
  buffer: Buffer;
  area: ActiveArea;
}
let _baseCache: Partial<Record<MockupSlug, MockupBase | null>> = {};
let _coordsCache: Record<string, ActiveArea> | null = null;

function loadCoords(): Record<string, ActiveArea> {
  if (_coordsCache) return _coordsCache;
  try {
    _coordsCache = JSON.parse(readFileSync(COORDS_PATH, 'utf-8'));
    return _coordsCache!;
  } catch {
    _coordsCache = {};
    return _coordsCache;
  }
}

function loadBase(slug: MockupSlug): MockupBase | null {
  if (slug in _baseCache) return _baseCache[slug] ?? null;
  const pngPath = join(TEMPLATES_DIR, `${slug}.png`);
  if (!existsSync(pngPath)) {
    _baseCache[slug] = null;
    return null;
  }
  try {
    const buffer = readFileSync(pngPath);
    const coords = loadCoords();
    const area = coords[slug] ?? {
      x: Math.floor(TILE * 0.2),
      y: Math.floor(TILE * 0.2),
      w: Math.floor(TILE * 0.6),
      h: Math.floor(TILE * 0.6),
    };
    _baseCache[slug] = { buffer, area };
    return _baseCache[slug]!;
  } catch (err) {
    console.error(`[mockup] failed to load base ${slug}`, err);
    _baseCache[slug] = null;
    return null;
  }
}

/**
 * Generic compositor: takes a real PNG base + active-area coords + hero,
 * resizes hero to fit the area, overlays onto the base.
 */
async function composeWithBase(base: MockupBase, hero: Buffer): Promise<Buffer> {
  const heroResized = await sharp(hero)
    .resize(base.area.w, base.area.h, { fit: 'cover' })
    .toBuffer();

  return sharp(base.buffer)
    .composite([{ input: heroResized, left: base.area.x, top: base.area.y }])
    .jpeg({ quality: 90 })
    .toBuffer();
}

// ─── Scene 1 — Wall Frame ────────────────────────────────────────────────────

async function composeWallFrameProcedural(heroBuffer: Buffer): Promise<Buffer> {
  const bg = { r: 232, g: 224, b: 210, alpha: 1 } as const;
  const heroSize = 560;
  const matte = 40;
  const frame = 14;
  const heroResized = await sharp(heroBuffer)
    .resize(heroSize, heroSize, { fit: 'cover' })
    .toBuffer();
  const outer = heroSize + matte * 2 + frame * 2;
  const frameSvg = `
    <svg width="${outer}" height="${outer}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${outer}" height="${outer}" rx="6" ry="6" fill="#2b2620"/>
      <rect x="${frame}" y="${frame}" width="${outer - frame * 2}" height="${outer - frame * 2}" fill="#fbfaf6"/>
    </svg>`;
  const shadowOffset = 24;
  const shadowSvg = `
    <svg width="${outer + shadowOffset * 2}" height="${outer + shadowOffset * 2}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="14"/></filter></defs>
      <rect x="${shadowOffset + 4}" y="${shadowOffset + 12}" width="${outer}" height="${outer}" fill="rgba(0,0,0,0.28)" filter="url(#b)"/>
    </svg>`;
  const cx = Math.floor((TILE - outer) / 2);
  const cy = Math.floor((TILE - outer) / 2);
  return sharp({ create: { width: TILE, height: TILE, channels: 3, background: bg } })
    .composite([
      { input: Buffer.from(shadowSvg), left: cx - shadowOffset, top: cy - shadowOffset },
      { input: Buffer.from(frameSvg), left: cx, top: cy },
      { input: heroResized, left: cx + frame + matte, top: cy + frame + matte },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function composeWallFrame(heroBuffer: Buffer): Promise<Buffer> {
  const base = loadBase('frame-wall');
  if (base) return composeWithBase(base, heroBuffer);
  return composeWallFrameProcedural(heroBuffer);
}

// ─── Scene 2 — Tablet / Screen ───────────────────────────────────────────────

async function composeTabletProcedural(heroBuffer: Buffer): Promise<Buffer> {
  const bg = { r: 224, g: 222, b: 220, alpha: 1 } as const;
  const tabletW = 780;
  const tabletH = 580;
  const bezel = 28;
  const cornerR = 30;
  const innerW = tabletW - bezel * 2;
  const innerH = tabletH - bezel * 2;
  const heroResized = await sharp(heroBuffer)
    .resize(innerW, innerH, { fit: 'cover' })
    .toBuffer();
  const tabletSvg = `
    <svg width="${tabletW}" height="${tabletH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${tabletW}" height="${tabletH}" rx="${cornerR}" ry="${cornerR}" fill="#1f1d1b"/>
    </svg>`;
  const shadowSvg = `
    <svg width="${tabletW + 60}" height="${tabletH + 60}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="18"/></filter></defs>
      <rect x="30" y="36" width="${tabletW}" height="${tabletH}" rx="${cornerR}" fill="rgba(0,0,0,0.32)" filter="url(#b)"/>
    </svg>`;
  const cx = Math.floor((TILE - tabletW) / 2);
  const cy = Math.floor((TILE - tabletH) / 2);
  const innerRoundMask = `
    <svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${innerW}" height="${innerH}" rx="${cornerR - 12}" ry="${cornerR - 12}" fill="#fff"/>
    </svg>`;
  const heroRounded = await sharp(heroResized)
    .composite([{ input: Buffer.from(innerRoundMask), blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp({ create: { width: TILE, height: TILE, channels: 3, background: bg } })
    .composite([
      { input: Buffer.from(shadowSvg), left: cx - 30, top: cy - 36 },
      { input: Buffer.from(tabletSvg), left: cx, top: cy },
      { input: heroRounded, left: cx + bezel, top: cy + bezel },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function composeTabletScene(heroBuffer: Buffer): Promise<Buffer> {
  // Prefer tablet-desk base, fall back to laptop-desk if no tablet present
  const base = loadBase('tablet-desk') ?? loadBase('laptop-desk');
  if (base) return composeWithBase(base, heroBuffer);
  return composeTabletProcedural(heroBuffer);
}

// ─── Scene 3 — Paper Print ───────────────────────────────────────────────────

async function composePaperProcedural(heroBuffer: Buffer): Promise<Buffer> {
  const bg = { r: 246, g: 243, b: 237, alpha: 1 } as const;
  const paperSize = 720;
  const heroSize = 660;
  const heroResized = await sharp(heroBuffer)
    .resize(heroSize, heroSize, { fit: 'cover' })
    .toBuffer();
  const paperSvg = `
    <svg width="${paperSize}" height="${paperSize}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${paperSize}" height="${paperSize}" fill="#ffffff"/>
    </svg>`;
  const shadowSvg = `
    <svg width="${paperSize + 60}" height="${paperSize + 60}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="b" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter></defs>
      <rect x="30" y="34" width="${paperSize}" height="${paperSize}" fill="rgba(0,0,0,0.18)" filter="url(#b)"/>
    </svg>`;
  const cx = Math.floor((TILE - paperSize) / 2);
  const cy = Math.floor((TILE - paperSize) / 2);
  const heroOffset = Math.floor((paperSize - heroSize) / 2);
  return sharp({ create: { width: TILE, height: TILE, channels: 3, background: bg } })
    .composite([
      { input: Buffer.from(shadowSvg), left: cx - 30, top: cy - 34 },
      { input: Buffer.from(paperSvg), left: cx, top: cy },
      { input: heroResized, left: cx + heroOffset, top: cy + heroOffset },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function composePaperPrint(heroBuffer: Buffer): Promise<Buffer> {
  const base = loadBase('paper-flatlay');
  if (base) return composeWithBase(base, heroBuffer);
  return composePaperProcedural(heroBuffer);
}

// ─── Scene 4 — Laptop / Desktop Screen ───────────────────────────────────────

export async function composeLaptopScene(heroBuffer: Buffer): Promise<Buffer> {
  // No procedural fallback for laptop — if no base PNG, return null-equivalent
  // (caller should skip this variant). For now, fall back to tablet.
  const base = loadBase('laptop-desk');
  if (base) return composeWithBase(base, heroBuffer);
  return composeTabletProcedural(heroBuffer);
}

// ─── Per-type variant selection ──────────────────────────────────────────────

type ProductType = 'planner' | 'poster' | 'sticker' | 'template' | 'social_template';

/**
 * Returns the 3 most contextually-appropriate mockup composers for a product
 * type. Examples:
 *   planner → paper flatlay (primary) + frame on wall + tablet preview
 *   poster  → frame on wall (primary) + paper proof + tablet preview
 *   template → laptop (primary digital context) + tablet + frame
 */
function pickMockupComposers(
  type: ProductType,
): Array<(hero: Buffer) => Promise<Buffer>> {
  switch (type) {
    case 'planner':
    case 'sticker':
      // Print-first products: paper proof is most authentic, then framed, then tablet preview
      return [composePaperPrint, composeWallFrame, composeTabletScene];
    case 'poster':
      // Wall art: framed is the natural sale image
      return [composeWallFrame, composePaperPrint, composeTabletScene];
    case 'template':
    case 'social_template':
      // Digital templates live on screens: laptop primary, then tablet, then framed
      return [composeLaptopScene, composeTabletScene, composeWallFrame];
    default:
      return [composeWallFrame, composeTabletScene, composePaperPrint];
  }
}

/**
 * Convenience: compose 3 type-appropriate mockup variants in parallel and
 * return them ready to feed into composeGallery.
 */
export async function composeProductMockups(
  heroBuffer: Buffer,
  type: ProductType,
): Promise<[Buffer, Buffer, Buffer]> {
  const composers = pickMockupComposers(type);
  const [a, b, c] = await Promise.all(composers.map((fn) => fn(heroBuffer)));
  return [a!, b!, c!];
}

// ─── Gallery — 2x2 grid composite ────────────────────────────────────────────

export async function composeGallery(
  hero: Buffer,
  mockups: [Buffer, Buffer, Buffer],
): Promise<Buffer> {
  const half = Math.floor(TILE / 2);
  const [tl, tr, bl, br] = await Promise.all([
    sharp(hero).resize(half, half, { fit: 'cover' }).toBuffer(),
    sharp(mockups[0]).resize(half, half, { fit: 'cover' }).toBuffer(),
    sharp(mockups[1]).resize(half, half, { fit: 'cover' }).toBuffer(),
    sharp(mockups[2]).resize(half, half, { fit: 'cover' }).toBuffer(),
  ]);
  return sharp({
    create: { width: TILE, height: TILE, channels: 3, background: { r: 255, g: 255, b: 255 } },
  })
    .composite([
      { input: tl, left: 0, top: 0 },
      { input: tr, left: half, top: 0 },
      { input: bl, left: 0, top: half },
      { input: br, left: half, top: half },
    ])
    .jpeg({ quality: 86 })
    .toBuffer();
}
