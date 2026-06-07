/**
 * pinterest/generate-pin.ts
 *
 * Pinterest pin görsel üretici — 1000×1500 (2:3 vertical) premium-vizyon
 * brand'lı, hero ürün görseli + üst eyebrow + büyük başlık + alt CTA.
 *
 * Strateji: her ürün için 3 farklı pin "angle":
 *   1. Hero-focused — büyük ürün mockup'ı + ufak başlık (visual scroll-stopper)
 *   2. Text-focused — büyük başlık + ufak hero (keyword-rich pin)
 *   3. Benefit-focused — "5 reasons you need this" listemsi (educational)
 *
 * Sharp + SVG ile üretilir — sıfır external API, sıfır maliyet.
 */

import sharp from 'sharp';
import { PALETTE_LIGHT, FONT_STACK, BRAND_MARK, PILLAR_ACCENT } from '@/lib/brand/premium-tokens';
import type { ContentPillar } from '@/types';

export type PinAngle = 'hero' | 'text' | 'benefit';

export interface GeneratePinOpts {
  /** Ürün başlığı (Etsy/shop title) */
  title: string;
  /** Ürün kategorisi (planner/poster/sticker/template) */
  productType?: string;
  /** Ürün hero görselinin URL'i — fetch edilip pin'e gömülür */
  heroImageUrl?: string;
  /** 3 madde benefit listesi (benefit angle için) */
  benefits?: string[];
  /** Hangi açı */
  angle: PinAngle;
  /** Pillar — accent için */
  pillar?: ContentPillar;
  /** Fiyat (opsiyonel — pin'e "€2.99" rozeti olarak basar) */
  priceLabel?: string;
}

export interface GeneratePinResult {
  buffer: Buffer;
  width: 1000;
  height: 1500;
  angle: PinAngle;
}

const W = 1000;
const H = 1500;

// ── Helpers ────────────────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + (cur ? ' ' : '') + w).length <= maxChars) {
      cur = cur ? cur + ' ' + w : w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  if (lines.length === maxLines && words.join(' ').length > lines.join(' ').length) {
    const last = lines[maxLines - 1];
    if (last) lines[maxLines - 1] = last.replace(/[.,;:]?\s*$/, '') + '…';
  }
  return lines;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Layout builders ────────────────────────────────────────────────────────────

/**
 * Angle 1 — HERO: üst %60'ı büyük hero görseli, alt %40'ı başlık + CTA.
 */
function buildHeroSvgOverlay(opts: {
  title: string;
  productType: string;
  priceLabel?: string;
  accent: string;
}): string {
  const { title, productType, priceLabel, accent } = opts;
  const titleLines = wrap(title, 26, 3);
  const titleFs = 64;
  const lineHeight = titleFs * 1.05;

  // Alt %40 = y >= 900
  const textY0 = 950;
  const eyebrowY = textY0;
  const titleStartY = eyebrowY + 60 + titleFs;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <!-- Alt yarı için solid background (hero image üstüne overlay) -->
  <rect x="0" y="900" width="${W}" height="600" fill="${PALETTE_LIGHT.background}"/>

  <!-- Eyebrow: kategori -->
  <circle cx="65" cy="${eyebrowY - 8}" r="5" fill="${accent}"/>
  <text x="85" y="${eyebrowY}"
        font-family="${FONT_STACK.body}" font-size="22" font-weight="700"
        letter-spacing="4.5" fill="${PALETTE_LIGHT.mutedForeground}">
    ${escapeXml(productType.toUpperCase())} · PRINTABLE
  </text>

  <!-- Başlık -->
  ${titleLines.map((line, i) => `
    <text x="60" y="${titleStartY + i * lineHeight}"
          font-family="${FONT_STACK.display}" font-size="${titleFs}" font-weight="800"
          letter-spacing="-1.2" fill="${PALETTE_LIGHT.foreground}">
      ${escapeXml(line)}
    </text>`).join('')}

  <!-- Fiyat rozeti (opsiyonel) -->
  ${priceLabel ? `
    <rect x="${W - 220}" y="40" width="180" height="60" rx="30" fill="${accent}"/>
    <text x="${W - 130}" y="80" text-anchor="middle"
          font-family="${FONT_STACK.display}" font-size="28" font-weight="800"
          fill="#FFFFFF">${escapeXml(priceLabel)}</text>
  ` : ''}

  <!-- CTA bar -->
  <rect x="60" y="${H - 100}" width="120" height="4" fill="${accent}"/>
  <text x="60" y="${H - 50}"
        font-family="${FONT_STACK.display}" font-size="28" font-weight="700"
        letter-spacing="-0.4" fill="${PALETTE_LIGHT.foreground}">
    ${escapeXml(BRAND_MARK.name)} ·
  </text>
  <text x="240" y="${H - 50}"
        font-family="${FONT_STACK.body}" font-size="22" font-weight="500"
        letter-spacing="2.2" fill="${PALETTE_LIGHT.mutedForeground}">
    INSTANT DOWNLOAD
  </text>
</svg>`.trim();
}

/**
 * Angle 2 — TEXT: büyük başlık üstte, ufak hero (sağ alt köşede ufak preview)
 */
function buildTextSvg(opts: {
  title: string;
  productType: string;
  priceLabel?: string;
  accent: string;
}): string {
  const { title, productType, priceLabel, accent } = opts;
  const titleLines = wrap(title, 18, 5);
  const titleFs = 96;
  const lineHeight = titleFs * 1.02;
  const titleStartY = 280;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${PALETTE_LIGHT.background}"/>
      <stop offset="100%" stop-color="${PALETTE_LIGHT.backgroundMuted}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="20%" r="50%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <!-- Eyebrow -->
  <circle cx="65" cy="180" r="6" fill="${accent}"/>
  <text x="88" y="190"
        font-family="${FONT_STACK.body}" font-size="26" font-weight="700"
        letter-spacing="5" fill="${PALETTE_LIGHT.mutedForeground}">
    ${escapeXml(productType.toUpperCase())} · DIGITAL DOWNLOAD
  </text>

  <!-- BÜYÜK başlık (text-focused) -->
  ${titleLines.map((line, i) => `
    <text x="60" y="${titleStartY + i * lineHeight}"
          font-family="${FONT_STACK.display}" font-size="${titleFs}" font-weight="900"
          letter-spacing="-2" fill="${PALETTE_LIGHT.foreground}">
      ${escapeXml(line)}
    </text>`).join('')}

  <!-- Fiyat rozeti -->
  ${priceLabel ? `
    <rect x="60" y="${H - 220}" width="260" height="80" rx="40" fill="${accent}"/>
    <text x="190" y="${H - 165}" text-anchor="middle"
          font-family="${FONT_STACK.display}" font-size="34" font-weight="800"
          fill="#FFFFFF">FROM ${escapeXml(priceLabel)}</text>
  ` : ''}

  <!-- Alt brand bar -->
  <rect x="60" y="${H - 100}" width="120" height="4" fill="${accent}"/>
  <text x="60" y="${H - 50}"
        font-family="${FONT_STACK.display}" font-size="32" font-weight="700"
        letter-spacing="-0.4" fill="${PALETTE_LIGHT.foreground}">
    ${escapeXml(BRAND_MARK.name)} · SHOP.FLY-FROTH.COM
  </text>
</svg>`.trim();
}

/**
 * Angle 3 — BENEFIT: liste formatlı, "5 reasons" stil pin
 */
function buildBenefitSvg(opts: {
  title: string;
  productType: string;
  benefits: string[];
  accent: string;
}): string {
  const { title, productType, benefits, accent } = opts;
  const titleLines = wrap(title, 22, 3);
  const titleFs = 60;

  const benefitsStart = 700;
  const benefitGap = 110;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bgB" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${PALETTE_LIGHT.background}"/>
      <stop offset="100%" stop-color="${PALETTE_LIGHT.backgroundMuted}"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bgB)"/>

  <!-- Eyebrow -->
  <circle cx="65" cy="180" r="6" fill="${accent}"/>
  <text x="88" y="190"
        font-family="${FONT_STACK.body}" font-size="24" font-weight="700"
        letter-spacing="5" fill="${PALETTE_LIGHT.mutedForeground}">
    WHY YOU'LL LOVE THIS ${escapeXml(productType.toUpperCase())}
  </text>

  <!-- Başlık -->
  ${titleLines.map((line, i) => `
    <text x="60" y="${320 + i * titleFs * 1.05}"
          font-family="${FONT_STACK.display}" font-size="${titleFs}" font-weight="800"
          letter-spacing="-1.2" fill="${PALETTE_LIGHT.foreground}">
      ${escapeXml(line)}
    </text>`).join('')}

  <!-- Benefit listesi (max 5) -->
  ${benefits.slice(0, 5).map((b, i) => {
    const y = benefitsStart + i * benefitGap;
    const wrapped = wrap(b, 30, 2);
    return `
    <circle cx="80" cy="${y - 12}" r="14" fill="${accent}"/>
    <text x="80" y="${y - 5}" text-anchor="middle"
          font-family="${FONT_STACK.display}" font-size="20" font-weight="800"
          fill="#FFFFFF">${i + 1}</text>
    ${wrapped.map((line, li) => `
      <text x="120" y="${y + li * 36}"
            font-family="${FONT_STACK.body}" font-size="30" font-weight="500"
            fill="${PALETTE_LIGHT.foreground}">
        ${escapeXml(line)}
      </text>`).join('')}`;
  }).join('')}

  <!-- Alt brand bar -->
  <rect x="60" y="${H - 100}" width="120" height="4" fill="${accent}"/>
  <text x="60" y="${H - 50}"
        font-family="${FONT_STACK.display}" font-size="28" font-weight="700"
        letter-spacing="-0.4" fill="${PALETTE_LIGHT.foreground}">
    ${escapeXml(BRAND_MARK.name)} · SHOP NOW
  </text>
</svg>`.trim();
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Tek pin üret (verilen angle için).
 */
export async function generatePin(opts: GeneratePinOpts): Promise<GeneratePinResult> {
  const accent = opts.pillar
    ? PILLAR_ACCENT[opts.pillar as keyof typeof PILLAR_ACCENT] ?? PALETTE_LIGHT.primary
    : PALETTE_LIGHT.primary;
  const productType = opts.productType ?? 'printable';

  if (opts.angle === 'hero') {
    // Hero pin: alt %40 text overlay, üst %60 ürün hero
    const heroBuf = opts.heroImageUrl ? await fetchImageBuffer(opts.heroImageUrl) : null;

    // Base: full-canvas background + hero image (üst 900px)
    const base = sharp({
      create: {
        width: W,
        height: H,
        channels: 4,
        background: PALETTE_LIGHT.background,
      },
    });

    let composedHero: Buffer;
    if (heroBuf) {
      // Hero görselini 1000×900 olarak cover-resize et
      composedHero = await sharp(heroBuf)
        .resize(W, 900, { fit: 'cover', position: 'center' })
        .toBuffer();
    } else {
      // Hero yoksa accent gradient
      composedHero = await sharp({
        create: { width: W, height: 900, channels: 4, background: accent },
      }).png().toBuffer();
    }

    const overlay = Buffer.from(buildHeroSvgOverlay({
      title: opts.title,
      productType,
      priceLabel: opts.priceLabel,
      accent,
    }));

    const buffer = await base
      .composite([
        { input: composedHero, top: 0, left: 0 },
        { input: overlay, top: 0, left: 0 },
      ])
      .png({ compressionLevel: 9, quality: 92 })
      .toBuffer();

    return { buffer, width: W, height: H, angle: 'hero' };
  }

  if (opts.angle === 'text') {
    const svg = buildTextSvg({
      title: opts.title,
      productType,
      priceLabel: opts.priceLabel,
      accent,
    });
    const buffer = await sharp(Buffer.from(svg))
      .png({ compressionLevel: 9, quality: 92 })
      .toBuffer();
    return { buffer, width: W, height: H, angle: 'text' };
  }

  // BENEFIT angle
  const benefits = opts.benefits && opts.benefits.length > 0
    ? opts.benefits
    : ['Instant download — no waiting', 'Print at home or local print shop', 'Personalize before printing', 'High-res PDF & PNG included', 'One-time payment, lifetime access'];

  const svg = buildBenefitSvg({
    title: opts.title,
    productType,
    benefits,
    accent,
  });
  const buffer = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 92 })
    .toBuffer();
  return { buffer, width: W, height: H, angle: 'benefit' };
}

/**
 * Her ürün için 3 farklı angle pin üret (Telegram approval'a düşmek üzere).
 */
export async function generatePinBatch(opts: Omit<GeneratePinOpts, 'angle'>): Promise<GeneratePinResult[]> {
  const angles: PinAngle[] = ['hero', 'text', 'benefit'];
  const results = await Promise.allSettled(
    angles.map((angle) => generatePin({ ...opts, angle })),
  );

  return results
    .filter((r): r is PromiseFulfilledResult<GeneratePinResult> => r.status === 'fulfilled')
    .map((r) => r.value);
}
