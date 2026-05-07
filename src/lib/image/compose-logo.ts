import sharp from 'sharp';
import fs from 'fs/promises';
import type { BrandKit } from '@/types';

async function loadLogo(url: string): Promise<Buffer> {
  if (url.startsWith('file://')) {
    return fs.readFile(url.replace('file://', ''));
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

  const positions: Record<
    BrandKit['logo_position'],
    { top: number; left: number }
  > = {
    bottom_right: { top: height - lh - padding, left: width - lw - padding },
    bottom_left: { top: height - lh - padding, left: padding },
    top_right: { top: padding, left: width - lw - padding },
    top_left: { top: padding, left: padding },
    none: { top: 0, left: 0 },
  };
  const pos = positions[brandKit.logo_position] ?? positions.bottom_right;

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
