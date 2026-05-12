import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import type { BrandKit } from '@/types';

/**
 * Crop image to 9:16 portrait aspect ratio (center crop).
 * Stories require vertical format. For landscape images this crops
 * from the center; for portrait it trims the sides proportionally.
 */
export async function cropToStoryAspect(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1080;
  const h = meta.height ?? 1920;

  const targetRatio = 9 / 16;
  const currentRatio = w / h;

  let cropWidth: number;
  let cropHeight: number;

  if (currentRatio > targetRatio) {
    // Image is wider than 9:16 — crop width from center
    cropHeight = h;
    cropWidth = Math.round(h * targetRatio);
  } else {
    // Image is taller than 9:16 — crop height from center
    cropWidth = w;
    cropHeight = Math.round(w / targetRatio);
  }

  const left = Math.max(0, Math.round((w - cropWidth) / 2));
  const top = Math.max(0, Math.round((h - cropHeight) / 2));

  return sharp(imageBuffer)
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(1080, 1920, { fit: 'fill' })
    .png()
    .toBuffer();
}

/**
 * Crop image to 1:1 square (center crop) for Instagram feed compatibility.
 * IG feed supports: 1:1, 4:5, 1.91:1. Square is the safest default.
 */
export async function cropToSquare(imageBuffer: Buffer): Promise<Buffer> {
  const meta = await sharp(imageBuffer).metadata();
  const w = meta.width ?? 1080;
  const h = meta.height ?? 1080;

  const size = Math.min(w, h);
  const left = Math.max(0, Math.round((w - size) / 2));
  const top = Math.max(0, Math.round((h - size) / 2));

  return sharp(imageBuffer)
    .extract({ left, top, width: size, height: size })
    .resize(1080, 1080, { fit: 'fill' })
    .png()
    .toBuffer();
}

const PILLAR_GOLD_HEX: Record<string, string> = {
  vitrine: '#d4a43a',
  prozess: '#d4a43a',
  insight: '#d4a43a',
  lokal: '#d4a43a',
  reel: '#d4a43a',
  logodesign: '#c9a96e',
  flyerdesign: '#b8943a',
  druckdesign: '#a08040',
  webdesign: '#d4a43a',
};

/**
 * Apply a subtle warm gold wash to any image.
 * Uses Sharp composite with low-opacity gold tint.
 */
export async function applyGoldTint(
  imageBuffer: Buffer,
  pillar?: string | null,
): Promise<Buffer> {
  const hex = (pillar && PILLAR_GOLD_HEX[pillar]) ? PILLAR_GOLD_HEX[pillar]! : '#d4a43a';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);

  return sharp(imageBuffer)
    .composite([
      {
        input: Buffer.from([r, g, b, 28]), // ~11% opacity warm gold
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'over',
      },
    ])
    .png()
    .toBuffer();
}

async function loadLogo(url: string): Promise<Buffer> {
  if (url.startsWith('file://')) {
    return fs.readFile(url.replace('file://', ''));
  }
  // Local filesystem paths (public/ directory) — works on Vercel and locally
  if (url.startsWith('/branding/') || url.startsWith('/logo/') || url.startsWith('/public/')) {
    const relPath = url.startsWith('/public/') ? url : `/public${url}`;
    const fullPath = path.join(process.cwd(), relPath);
    return fs.readFile(fullPath);
  }
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Logo fetch failed (${res.status})`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function composeLogo(
  rawImageBuffer: Buffer,
  brandKit: BrandKit,
): Promise<Buffer> {
  // No logo, no overlay — just normalize to PNG.
  if (brandKit.logo_position === 'none' || !brandKit.logo_url) {
    return sharp(rawImageBuffer).png().toBuffer();
  }

  const image = sharp(rawImageBuffer);
  const meta = await image.metadata();
  const width = meta.width ?? 1024;
  const height = meta.height ?? 1024;
  const shortEdge = Math.min(width, height);
  const logoSize = Math.max(
    1,
    Math.round((shortEdge * brandKit.logo_size_pct) / 100),
  );
  const padding = brandKit.logo_padding_px;

  // Resize logo to target size + apply opacity using a uniform alpha multiplier.
  const logoRaw = await loadLogo(brandKit.logo_url);
  const opacity = Math.max(0, Math.min(1, brandKit.logo_opacity));
  const resizedLogo = await sharp(logoRaw)
    .resize(logoSize, logoSize, { fit: 'inside' })
    .ensureAlpha()
    .composite([
      {
        input: Buffer.from([
          255,
          255,
          255,
          Math.round(opacity * 255),
        ]),
        raw: { width: 1, height: 1, channels: 4 },
        tile: true,
        blend: 'dest-in',
      },
    ])
    .png()
    .toBuffer();

  // Compute absolute top/left for the chosen corner so we can pass exact
  // pixel coordinates instead of relying on Sharp's gravity (which doesn't
  // mix with explicit padding).
  const logoMeta = await sharp(resizedLogo).metadata();
  const lw = logoMeta.width ?? logoSize;
  const lh = logoMeta.height ?? logoSize;

  const positions: Record<string, { top: number; left: number }> = {
    bottom_right: { top: height - lh - padding, left: width - lw - padding },
    bottom_left: { top: height - lh - padding, left: padding },
    top_right: { top: padding, left: width - lw - padding },
    top_left: { top: padding, left: padding },
  };
  const pos = positions[brandKit.logo_position] ?? {
    top: height - lh - padding,
    left: width - lw - padding,
  };

  return image
    .composite([
      {
        input: resizedLogo,
        top: pos.top,
        left: pos.left,
      },
    ])
    .png()
    .toBuffer();
}
