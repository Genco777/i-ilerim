/**
 * compose-info-card.ts
 *
 * Programmatic compositor for the "info-card" post style.
 * Produces the clean white-background + bold-title + device-mockup + bullets
 * style seen in Fly & Froth portfolio case-study posts.
 *
 * Layout (1080 × 1080 square):
 *   ┌─────────────────────────────────┐
 *   │ BOLD TITLE (top-left, 2-3 lines)│
 *   │                                 │
 *   │    [device frame + AI screen]   │
 *   │                                 │
 *   │ • Bullet 1     Label / Caption  │
 *   │ • Bullet 2        [F&F Logo]    │
 *   │ • Bullet 3                      │
 *   └─────────────────────────────────┘
 */

import sharp from 'sharp';

const CANVAS   = 1080;
const NAVY     = '#1A2340';
const MUTED    = '#888888';
const BG_COLOR = { r: 248, g: 249, b: 252, alpha: 1 } as const; // #F8F9FC

// ─── helpers ─────────────────────────────────────────────────────────────────

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Wrap text into lines of at most `maxChars` characters. */
function wrap(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (cur.length + w.length + 1 > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ─── device frame SVGs ───────────────────────────────────────────────────────

function phoneFrameSvg(w: number, h: number): string {
  const r       = 44;
  const border  = 10;
  const notchW  = 110;
  const notchH  = 28;
  const notchX  = (w - notchW) / 2;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="${border/2}" y="${border/2}" width="${w - border}" height="${h - border}"
      rx="${r}" ry="${r}" fill="none" stroke="${NAVY}" stroke-width="${border}"/>
    <rect x="${notchX}" y="${border + 4}" width="${notchW}" height="${notchH}"
      rx="14" ry="14" fill="${NAVY}"/>
  </svg>`;
}

function desktopFrameSvg(w: number, h: number): string {
  const bar = 38;
  const r   = 10;
  return `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="${NAVY}"/>
    <rect x="0" y="${bar}" width="${w}" height="${h - bar}" fill="#FFFFFF"/>
    <rect x="0" y="${bar}" width="${w}" height="${h - bar}" rx="0" ry="0" fill="#FFFFFF"/>
    <circle cx="18" cy="${bar/2}" r="5" fill="#FFFFFF" opacity="0.35"/>
    <circle cx="34" cy="${bar/2}" r="5" fill="#FFFFFF" opacity="0.35"/>
    <circle cx="50" cy="${bar/2}" r="5" fill="#FFFFFF" opacity="0.35"/>
    <rect x="70" y="${bar/2 - 8}" width="${w - 90}" height="16" rx="4" fill="#FFFFFF" opacity="0.15"/>
  </svg>`;
}

// ─── text overlay SVG ────────────────────────────────────────────────────────

function buildTextOverlay(opts: {
  title:    string;
  bullets?: string[];
  label?:   string;
  beforeAfterLabels?: boolean;   // renders "Vorher" / "Nachher" instead of title
}): string {
  const pad = 60;

  // ── title ──
  let titleSvg = '';
  if (opts.beforeAfterLabels) {
    const fs = 100;
    titleSvg = `
      <text x="${pad}" y="${pad + fs}" font-family="'Arial Black',Helvetica,sans-serif"
        font-weight="900" font-size="${fs}" fill="${NAVY}">Vorher</text>
      <text x="${CANVAS - pad}" y="${pad + fs}" font-family="'Arial Black',Helvetica,sans-serif"
        font-weight="900" font-size="${fs}" fill="${NAVY}" text-anchor="end">Nachher</text>`;
  } else {
    const lines = wrap(opts.title, 22);
    const fs    = lines.length > 2 ? 64 : lines.length === 2 ? 72 : 80;
    const lh    = fs * 1.18;
    lines.forEach((line, i) => {
      titleSvg += `
        <text x="${pad}" y="${pad + fs + i * lh}"
          font-family="'Arial Black','Helvetica Neue',Arial,sans-serif"
          font-weight="900" font-size="${fs}" fill="${NAVY}">${esc(line)}</text>`;
    });
  }

  // ── bullets ──
  let bulletSvg = '';
  if (opts.bullets?.length) {
    const bulletY  = CANVAS - 180;
    const bulletFS = 30;
    const bulletLH = 46;
    opts.bullets.forEach((b, i) => {
      const y = bulletY + i * bulletLH;
      bulletSvg += `
        <circle cx="${pad}" cy="${y - 9}" r="5" fill="${NAVY}"/>
        <text x="${pad + 18}" y="${y}"
          font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
          font-weight="400" font-size="${bulletFS}" fill="${NAVY}">${esc(b)}</text>`;
    });
  }

  // ── label ──
  let labelSvg = '';
  if (opts.label) {
    labelSvg = `
      <text x="${CANVAS - pad}" y="${CANVAS - 40}"
        font-family="'Helvetica Neue',Helvetica,Arial,sans-serif"
        font-weight="300" font-size="24" fill="${MUTED}" text-anchor="end">${esc(opts.label)}</text>`;
  }

  return `<svg width="${CANVAS}" height="${CANVAS}" xmlns="http://www.w3.org/2000/svg">
    ${titleSvg}
    ${bulletSvg}
    ${labelSvg}
  </svg>`;
}

// ─── public interface ─────────────────────────────────────────────────────────

export interface InfoCardOptions {
  /** Bold headline rendered at top-left. */
  title:    string;
  /** Up to 3 bullet-point lines at the bottom-left. */
  bullets?: string[];
  /** Small caption label at bottom-right. */
  label?:   string;

  /** AI-generated image that fills the device screen (single-device layouts). */
  heroImage?: Buffer;

  /** Layout variant */
  deviceType: 'phone' | 'desktop' | 'split_phone';

  /** Only used when deviceType === 'split_phone' */
  beforeImage?: Buffer;
  afterImage?:  Buffer;

  /** Fly & Froth logo PNG buffer — composited bottom-right. */
  logoBuffer?: Buffer;
}

export async function composeInfoCard(opts: InfoCardOptions): Promise<Buffer> {
  const composites: sharp.OverlayOptions[] = [];

  // ── device placement ──
  if (opts.deviceType === 'phone' && opts.heroImage) {
    const phoneW   = 370;
    const phoneH   = 720;
    const border   = 10;
    const notchH   = 42;
    const screenPad= border + 4;
    const screenW  = phoneW - screenPad * 2;
    const screenH  = phoneH - notchH - screenPad - border;
    const phoneX   = (CANVAS - phoneW) / 2;
    const phoneY   = 230;

    const screen = await sharp(opts.heroImage)
      .resize(screenW, screenH, { fit: 'cover', position: 'top' })
      .toBuffer();

    composites.push({ input: screen, top: phoneY + notchH, left: Math.round(phoneX + screenPad) });
    composites.push({ input: Buffer.from(phoneFrameSvg(phoneW, phoneH)), top: phoneY, left: Math.round(phoneX) });

  } else if (opts.deviceType === 'desktop' && opts.heroImage) {
    const deskW  = 940;
    const deskH  = 520;
    const barH   = 38;
    const deskX  = (CANVAS - deskW) / 2;
    const deskY  = 240;

    const screen = await sharp(opts.heroImage)
      .resize(deskW, deskH - barH, { fit: 'cover', position: 'top' })
      .toBuffer();

    composites.push({ input: screen,                                top: Math.round(deskY + barH), left: Math.round(deskX) });
    composites.push({ input: Buffer.from(desktopFrameSvg(deskW, deskH)), top: Math.round(deskY),      left: Math.round(deskX) });

  } else if (opts.deviceType === 'split_phone' && opts.beforeImage && opts.afterImage) {
    const phoneW   = 320;
    const phoneH   = 620;
    const border   = 10;
    const notchH   = 38;
    const screenPad= border + 4;
    const screenW  = phoneW - screenPad * 2;
    const screenH  = phoneH - notchH - screenPad - border;
    const gap      = 60;
    const startX   = (CANVAS - (phoneW * 2 + gap)) / 2;
    const phoneY   = 220;

    // Before (left, desaturated)
    const beforeScreen = await sharp(opts.beforeImage)
      .resize(screenW, screenH, { fit: 'cover', position: 'top' })
      .modulate({ saturation: 0.45, brightness: 0.85 })
      .toBuffer();
    const lx = Math.round(startX);
    composites.push({ input: beforeScreen, top: phoneY + notchH, left: lx + screenPad });
    composites.push({ input: Buffer.from(phoneFrameSvg(phoneW, phoneH)), top: phoneY, left: lx });

    // After (right, full colour)
    const afterScreen = await sharp(opts.afterImage)
      .resize(screenW, screenH, { fit: 'cover', position: 'top' })
      .toBuffer();
    const rx = Math.round(startX + phoneW + gap);
    composites.push({ input: afterScreen, top: phoneY + notchH, left: rx + screenPad });
    composites.push({ input: Buffer.from(phoneFrameSvg(phoneW, phoneH)), top: phoneY, left: rx });
  }

  // ── text overlay ──
  const isBeforeAfter = opts.deviceType === 'split_phone';
  const overlaySvg = buildTextOverlay({
    title:              opts.title,
    bullets:            opts.bullets,
    label:              opts.label,
    beforeAfterLabels:  isBeforeAfter,
  });
  composites.push({ input: Buffer.from(overlaySvg), top: 0, left: 0 });

  // ── logo ──
  if (opts.logoBuffer) {
    const logoPng = await sharp(opts.logoBuffer)
      .resize(110, 110, { fit: 'contain', background: { r: 248, g: 249, b: 252, alpha: 0 } })
      .png()
      .toBuffer();
    composites.push({ input: logoPng, top: CANVAS - 135, left: CANVAS - 140 });
  }

  // ── compose onto background ──
  return sharp({
    create: {
      width:    CANVAS,
      height:   CANVAS,
      channels: 4,
      background: BG_COLOR,
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}

/** Aspect ratio expected for the hero image inside a given device type. */
export function infoCardAspectRatio(deviceType: InfoCardOptions['deviceType']): '9:16' | '16:9' {
  return deviceType === 'desktop' ? '16:9' : '9:16';
}
