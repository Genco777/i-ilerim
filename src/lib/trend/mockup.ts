/**
 * Mockup Compositing — Faz 2-B
 *
 * Procedural mockup scenes built with sharp + SVG. NO external mockup PNG
 * files needed — everything is generated on-the-fly from the hero image.
 *
 * Three scenes per product:
 *   1. Wall frame  — hero centered with white matte + frame border + shadow on warm wall
 *   2. Tablet      — hero displayed inside a tablet-style dark frame on neutral surface
 *   3. Paper print — hero on white printable sheet with soft shadow on off-white desk
 *
 * Plus one composite "gallery" image (2x2 grid: hero + 3 mockups) suitable
 * for a single Telegram photo card.
 *
 * Reuses the same `sharp` library used in src/lib/image/compose-info-card.ts.
 */

import sharp from 'sharp';

const TILE = 1024; // each scene is square at this size

// ─────────────────────────────────────────────────────────────
// Scene 1 — Wall Frame
// ─────────────────────────────────────────────────────────────

export async function composeWallFrame(heroBuffer: Buffer): Promise<Buffer> {
  // Background: warm beige wall
  const bg = { r: 232, g: 224, b: 210, alpha: 1 } as const;

  // Hero target size inside frame
  const heroSize = 560;
  const matte = 40; // white matte width around hero
  const frame = 14; // dark frame border thickness

  const heroResized = await sharp(heroBuffer)
    .resize(heroSize, heroSize, { fit: 'cover' })
    .toBuffer();

  // Build SVG for matte + frame layered behind/around hero
  const outer = heroSize + matte * 2 + frame * 2;
  const frameSvg = `
    <svg width="${outer}" height="${outer}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${outer}" height="${outer}" rx="6" ry="6" fill="#2b2620"/>
      <rect x="${frame}" y="${frame}" width="${outer - frame * 2}" height="${outer - frame * 2}" fill="#fbfaf6"/>
    </svg>`;

  // Soft drop shadow as a separate SVG
  const shadowOffset = 24;
  const shadowSvg = `
    <svg width="${outer + shadowOffset * 2}" height="${outer + shadowOffset * 2}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="b" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="14"/>
        </filter>
      </defs>
      <rect x="${shadowOffset + 4}" y="${shadowOffset + 12}" width="${outer}" height="${outer}"
            fill="rgba(0,0,0,0.28)" filter="url(#b)"/>
    </svg>`;

  // Center frame within TILE
  const cx = Math.floor((TILE - outer) / 2);
  const cy = Math.floor((TILE - outer) / 2);

  return sharp({
    create: { width: TILE, height: TILE, channels: 3, background: bg },
  })
    .composite([
      { input: Buffer.from(shadowSvg), left: cx - shadowOffset, top: cy - shadowOffset },
      { input: Buffer.from(frameSvg), left: cx, top: cy },
      { input: heroResized, left: cx + frame + matte, top: cy + frame + matte },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// ─────────────────────────────────────────────────────────────
// Scene 2 — Tablet / Screen
// ─────────────────────────────────────────────────────────────

export async function composeTabletScene(heroBuffer: Buffer): Promise<Buffer> {
  const bg = { r: 224, g: 222, b: 220, alpha: 1 } as const;

  const tabletW = 780;
  const tabletH = 580;
  const bezel = 28;
  const cornerR = 30;

  // Hero scaled to fit tablet inner area
  const innerW = tabletW - bezel * 2;
  const innerH = tabletH - bezel * 2;
  const heroResized = await sharp(heroBuffer)
    .resize(innerW, innerH, { fit: 'cover' })
    .toBuffer();

  // Tablet frame: dark rounded rect
  const tabletSvg = `
    <svg width="${tabletW}" height="${tabletH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${tabletW}" height="${tabletH}" rx="${cornerR}" ry="${cornerR}" fill="#1f1d1b"/>
    </svg>`;

  // Shadow under tablet
  const shadowSvg = `
    <svg width="${tabletW + 60}" height="${tabletH + 60}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="b" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18"/>
        </filter>
      </defs>
      <rect x="30" y="36" width="${tabletW}" height="${tabletH}" rx="${cornerR}"
            fill="rgba(0,0,0,0.32)" filter="url(#b)"/>
    </svg>`;

  const cx = Math.floor((TILE - tabletW) / 2);
  const cy = Math.floor((TILE - tabletH) / 2);

  // Round the hero corners to match tablet screen
  const innerRoundMask = `
    <svg width="${innerW}" height="${innerH}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${innerW}" height="${innerH}" rx="${cornerR - 12}" ry="${cornerR - 12}" fill="#fff"/>
    </svg>`;
  const heroRounded = await sharp(heroResized)
    .composite([{ input: Buffer.from(innerRoundMask), blend: 'dest-in' }])
    .png()
    .toBuffer();

  return sharp({
    create: { width: TILE, height: TILE, channels: 3, background: bg },
  })
    .composite([
      { input: Buffer.from(shadowSvg), left: cx - 30, top: cy - 36 },
      { input: Buffer.from(tabletSvg), left: cx, top: cy },
      { input: heroRounded, left: cx + bezel, top: cy + bezel },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// ─────────────────────────────────────────────────────────────
// Scene 3 — Paper Print on Desk
// ─────────────────────────────────────────────────────────────

export async function composePaperPrint(heroBuffer: Buffer): Promise<Buffer> {
  const bg = { r: 246, g: 243, b: 237, alpha: 1 } as const;

  const paperSize = 720;
  const heroSize = 660;

  const heroResized = await sharp(heroBuffer)
    .resize(heroSize, heroSize, { fit: 'cover' })
    .toBuffer();

  // White paper rectangle (slightly larger than hero so a white margin shows)
  const paperSvg = `
    <svg width="${paperSize}" height="${paperSize}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${paperSize}" height="${paperSize}" fill="#ffffff"/>
    </svg>`;

  // Soft paper drop shadow
  const shadowSvg = `
    <svg width="${paperSize + 60}" height="${paperSize + 60}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="b" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="10"/>
        </filter>
      </defs>
      <rect x="30" y="34" width="${paperSize}" height="${paperSize}"
            fill="rgba(0,0,0,0.18)" filter="url(#b)"/>
    </svg>`;

  const cx = Math.floor((TILE - paperSize) / 2);
  const cy = Math.floor((TILE - paperSize) / 2);
  const heroOffset = Math.floor((paperSize - heroSize) / 2);

  return sharp({
    create: { width: TILE, height: TILE, channels: 3, background: bg },
  })
    .composite([
      { input: Buffer.from(shadowSvg), left: cx - 30, top: cy - 34 },
      { input: Buffer.from(paperSvg), left: cx, top: cy },
      { input: heroResized, left: cx + heroOffset, top: cy + heroOffset },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}

// ─────────────────────────────────────────────────────────────
// Gallery — 2x2 grid composite (single image for Telegram)
// ─────────────────────────────────────────────────────────────

/**
 * Combines hero + 3 mockup buffers into a 2x2 grid at TILE resolution.
 * Each tile is downsized to TILE/2 = 512px so the final is 1024x1024 —
 * within Telegram's photo size sweet spot.
 */
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
      { input: tl, left: 0,    top: 0 },
      { input: tr, left: half, top: 0 },
      { input: bl, left: 0,    top: half },
      { input: br, left: half, top: half },
    ])
    .jpeg({ quality: 86 })
    .toBuffer();
}
