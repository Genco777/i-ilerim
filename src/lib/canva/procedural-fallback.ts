/**
 * canva/procedural-fallback.ts
 *
 * "Canva env yok / brand-template tanımsız" durumda devreye giren
 * Sharp + SVG procedural post üretici.
 *
 * Hedef: premium-vizyon-projesi-main tasarım dilini (editorial indigo,
 * eyebrow micro-typography, generous whitespace, alt brand-mark) birebir
 * uygulayan **profesyonel, tutarlı, tek-elden-çıkmış** Instagram post.
 *
 * Çıktı: 1080×1350 PNG (IG portrait, optimum feed boyutu) veya 1080×1920 story.
 *
 * Bu modül HİÇBİR dış servise istek atmaz — sadece Sharp + SVG. Net, hızlı,
 * sıfır maliyet. Canva env'i set edilince üst-katman generate-post.ts otomatik
 * Canva yoluna geçer; bu fallback dokunulmadan kalır.
 */

import sharp from 'sharp';
import type { ContentPillar } from '@/types';
import {
  PALETTE_LIGHT,
  PILLAR_ACCENT,
  FONT_STACK,
  LAYOUT,
  BRAND_MARK,
  type PremiumPalette,
} from '@/lib/brand/premium-tokens';

export interface ProceduralPostOpts {
  /** Konu / üst-başlık (eyebrow olarak görünür) */
  topic: string;
  /** Asıl başlık — Claude'dan gelen post text'inin ilk anlamlı parçası */
  title: string;
  /** Gövde metni (özet — 2-3 cümle) */
  bodyText: string;
  /** Pillar — accent ton kayması için */
  pillar?: ContentPillar;
  /** Format: feed (4:5) veya story (9:16) */
  aspect?: 'feed' | 'story' | 'square';
  /** Karanlık varyasyon */
  dark?: boolean;
}

export interface ProceduralPostResult {
  buffer: Buffer;
  provider: 'procedural';
  width: number;
  height: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** XML/SVG metin için kaçışlı tek-satır parçalara böl */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Bir metni belli max-karakter sınırına göre satırlara böl (SVG için).
 * Kelime sınırında kırar; tek bir kelime sınırı geçerse zorla kırpar.
 */
function wrap(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';

  for (const w of words) {
    if ((cur + (cur ? ' ' : '') + w).length <= maxCharsPerLine) {
      cur = cur ? cur + ' ' + w : w;
    } else {
      if (cur) lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);

  // Son satır taşıyorsa "…" ile sonlandır
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last && words.join(' ').length > lines.join(' ').length) {
      lines[maxLines - 1] = last.replace(/[.,;:]?\s*$/, '') + '…';
    }
  }
  return lines;
}

function buildAspect(aspect: ProceduralPostOpts['aspect']): { w: number; h: number } {
  switch (aspect) {
    case 'story':  return { w: 1080, h: 1920 };
    case 'square': return { w: 1080, h: 1080 };
    case 'feed':
    default:       return { w: 1080, h: 1350 };
  }
}

// ── SVG composer ───────────────────────────────────────────────────────────────

function buildSvg(opts: {
  width: number;
  height: number;
  palette: PremiumPalette;
  accent: string;
  eyebrow: string;
  titleLines: string[];
  bodyLines: string[];
}): string {
  const { width, height, palette, accent, eyebrow, titleLines, bodyLines } = opts;
  const pad = LAYOUT.pad;

  // Tipografi ölçekleri — 1080×1350 baz, story için yukarı kayar
  const isStory = height >= 1900;
  const eyebrowFs = isStory ? 28 : 26;
  const titleFs   = isStory ? 92 : 84;
  const bodyFs    = isStory ? 38 : 36;
  const brandFs   = isStory ? 26 : 24;

  // Y konumları — editorial: üstte ufak boşluk, eyebrow, başlık ortada, body altta, brand-mark en altta
  const eyebrowY = pad + 40;
  const titleStartY = eyebrowY + LAYOUT.gapEyebrowTitle + titleFs;
  const titleLineHeight = titleFs * 1.05;

  const titleEndY = titleStartY + (titleLines.length - 1) * titleLineHeight;
  const bodyStartY = titleEndY + LAYOUT.gapTitleBody + bodyFs;
  const bodyLineHeight = bodyFs * 1.4;

  const brandY = height - LAYOUT.bottomBrandOffset;
  const accentBarY = brandY - 56;
  const accentBarH = 4;
  const accentBarW = 88;

  // Eyebrow: bullet (accent dot) + uppercase label
  const eyebrowDotR = 5;
  const eyebrowDotX = pad + eyebrowDotR;
  const eyebrowTextX = pad + eyebrowDotR * 2 + 14;

  return `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${palette.background}" stop-opacity="1"/>
      <stop offset="100%" stop-color="${palette.backgroundMuted}" stop-opacity="1"/>
    </linearGradient>
    <linearGradient id="accentGlow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0.00"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" fill="url(#bgGrad)"/>

  <!-- Subtle corner accent glow (premium-vizyon shadow-glow esprisi) -->
  <circle cx="${width - 120}" cy="120" r="280" fill="url(#accentGlow)"/>

  <!-- Eyebrow: accent dot + uppercase tracking-wide label -->
  <circle cx="${eyebrowDotX}" cy="${eyebrowY - eyebrowFs / 2 + 4}" r="${eyebrowDotR}" fill="${accent}"/>
  <text x="${eyebrowTextX}" y="${eyebrowY}"
        font-family="${FONT_STACK.body}" font-size="${eyebrowFs}" font-weight="700"
        letter-spacing="4.5" fill="${palette.mutedForeground}">
    ${escapeXml(eyebrow.toUpperCase())}
  </text>

  <!-- Title — display font, tight tracking, balanced wrap -->
  ${titleLines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${titleStartY + i * titleLineHeight}"
               font-family="${FONT_STACK.display}" font-size="${titleFs}" font-weight="800"
               letter-spacing="-1.2" fill="${palette.foreground}">
          ${escapeXml(line)}
        </text>`,
    )
    .join('\n  ')}

  <!-- Body — sober body text, generous line-height -->
  ${bodyLines
    .map(
      (line, i) =>
        `<text x="${pad}" y="${bodyStartY + i * bodyLineHeight}"
               font-family="${FONT_STACK.body}" font-size="${bodyFs}" font-weight="400"
               fill="${palette.foreground}" fill-opacity="0.78">
          ${escapeXml(line)}
        </text>`,
    )
    .join('\n  ')}

  <!-- Bottom accent bar + brand mark -->
  <rect x="${pad}" y="${accentBarY}" width="${accentBarW}" height="${accentBarH}" fill="${accent}"/>
  <text x="${pad}" y="${brandY}"
        font-family="${FONT_STACK.display}" font-size="${brandFs}" font-weight="700"
        letter-spacing="-0.4" fill="${palette.foreground}">
    ${escapeXml(BRAND_MARK.name)}
  </text>
  <text x="${pad}" y="${brandY + brandFs + 6}"
        font-family="${FONT_STACK.body}" font-size="${brandFs - 6}" font-weight="500"
        letter-spacing="2.2" fill="${palette.mutedForeground}">
    ${escapeXml(BRAND_MARK.tagline.toUpperCase())}
  </text>
</svg>`.trim();
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * premium-vizyon brand'ine sadık procedural Instagram post üret.
 *
 * Bu fonksiyon Canva olmadan da çalışır — sıfır dış servis. Çıktı 1080×1350
 * PNG (feed) veya 1080×1920 (story). Aynı brand kit her sefer aynı görünüm.
 */
export async function generateProceduralPost(
  opts: ProceduralPostOpts,
): Promise<ProceduralPostResult> {
  const palette = opts.dark ? PALETTE_LIGHT /* dark mevcut tasarım yok, light default */ : PALETTE_LIGHT;
  const accent  = opts.pillar ? PILLAR_ACCENT[opts.pillar as keyof typeof PILLAR_ACCENT] ?? palette.primary : palette.primary;
  const { w, h } = buildAspect(opts.aspect);

  // Eyebrow: kısa topic (üst-konu)
  const eyebrow = (opts.topic ?? 'Fly & Froth').slice(0, 42);

  // Title — bodyText'in ilk anlamlı cümlesi ya da explicit title
  // Editorial: max ~3 satır, 22-24 karakter/satır
  const rawTitle = (opts.title ?? '').trim() || (opts.bodyText ?? '').split(/[.!?\n]/)[0] || opts.topic;
  const titleLines = wrap(rawTitle, 22, 4);

  // Body: title'dan sonraki kısa açıklama, 36-38 char/satır, max 5 satır
  let bodyRaw = opts.bodyText ?? '';
  if (rawTitle && bodyRaw.startsWith(rawTitle)) {
    bodyRaw = bodyRaw.slice(rawTitle.length).replace(/^[.!?\s]+/, '');
  }
  // Hashtag'leri body'den temizle (alt kaptan dışarıda kullanılıyor)
  bodyRaw = bodyRaw.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();
  const bodyLines = wrap(bodyRaw, 38, 5);

  const svg = buildSvg({
    width: w,
    height: h,
    palette,
    accent,
    eyebrow,
    titleLines,
    bodyLines,
  });

  const buffer = await sharp(Buffer.from(svg))
    .png({ compressionLevel: 9, quality: 92 })
    .toBuffer();

  return { buffer, provider: 'procedural', width: w, height: h };
}
