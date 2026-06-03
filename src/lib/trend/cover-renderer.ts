/**
 * V-6 — Deterministic cover renderer.
 *
 * The V-5 cover-from-Nano-Banana approach produced inconsistent "minimal
 * editorial" outputs (title + corner flourish + 70 % empty page). The model
 * is probabilistic; the cover layout should not be.
 *
 * V-6: use Sharp + inline SVG to render the cover with exact control over:
 *   - background colour blocks (theme-aware)
 *   - title typography (always readable, no AI typos)
 *   - subtitle, page-count meta
 *   - decorative botanical SVG ornaments
 *
 * Output: ~1024×1365 PNG (3:4 aspect, matches the rest of the V-4 pipeline).
 *
 * Hybrid step (optional, future): composite a small AI-generated decorative
 * centerpiece (Nano Banana Pro) into the empty centre region for extra warmth.
 *
 * Used by:
 *   src/lib/trend/pdf-ai-pages.ts  (replaces generateCoverImageOnly)
 *   src/lib/trend/visual.ts        (via the same code path)
 */

import sharp from 'sharp';

export type CoverTheme = 'cream' | 'noir' | 'forest' | 'rose' | 'slate';

interface ThemeColors {
  bg: string;
  accent: string;
  accentInk: string;
  ink: string;
  muted: string;
  hairline: string;
}

const THEME_COLORS: Record<CoverTheme, ThemeColors> = {
  cream: {
    bg: '#fbfaf6',
    accent: '#b8866c',
    accentInk: '#fbfaf6',
    ink: '#2d2925',
    muted: '#8b8278',
    hairline: '#e8dfd2',
  },
  noir: {
    bg: '#f5f1ed',
    accent: '#5b4670',
    accentInk: '#f5f1ed',
    ink: '#1a1a1f',
    muted: '#777078',
    hairline: '#dfdde4',
  },
  forest: {
    bg: '#f8f5ef',
    accent: '#3d5a47',
    accentInk: '#f8f5ef',
    ink: '#1a2820',
    muted: '#7a8478',
    hairline: '#dfe4dd',
  },
  rose: {
    bg: '#fbf6f3',
    accent: '#9d4d45',
    accentInk: '#fbf6f3',
    ink: '#3a2424',
    muted: '#a08a82',
    hairline: '#ead5cd',
  },
  slate: {
    bg: '#f8f8fa',
    accent: '#324063',
    accentInk: '#f8f8fa',
    ink: '#191a23',
    muted: '#7a8094',
    hairline: '#dde0ea',
  },
};

const WIDTH = 1024;
const HEIGHT = 1365;
const ACCENT_BLOCK_H = 780; // top portion (≈57 % — Anthropologie-style proportion)

/**
 * Decorative botanical sprig SVG path (single stem with leaves). Stylised
 * line-art ornament for the cover corners.
 */
const SPRIG_SVG = `
  <path d="M 0 60 Q 8 50 16 40 Q 24 30 32 22 Q 40 16 48 14 M 18 38 Q 12 30 14 22 M 22 32 Q 28 24 36 22 M 26 26 Q 22 18 24 12 M 30 22 Q 36 16 44 16"
    stroke="STROKE_COLOR" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.55"/>
`;

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&apos;',
  );
}

/** Word-wrap helper — splits text into N <= maxLines lines of approx maxChars. */
function wrapTitle(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (trial.length > maxCharsPerLine && cur) {
      lines.push(cur);
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = trial;
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines.slice(0, maxLines);
}

export interface CoverRenderOptions {
  title: string;
  subtitle: string;
  pageCount?: number;
  theme: CoverTheme;
  /** Optional centerpiece illustration buffer (PNG/JPG) to composite into centre. */
  centerpieceBuffer?: Buffer | null;
}

/**
 * Render a cover PNG via Sharp + inline SVG. Deterministic, ~600ms.
 */
export async function renderCoverImage(opts: CoverRenderOptions): Promise<Buffer> {
  const c = THEME_COLORS[opts.theme] ?? THEME_COLORS.cream;
  const titleLines = wrapTitle(opts.title, 26, 4);
  const subtitleLines = wrapTitle(opts.subtitle, 70, 2);

  // Title typography — large editorial serif (uses Vercel-Lambda Liberation Serif
  // which is a free Garamond-style serif metric-compatible with Adobe Garamond).
  const titleFontSize = titleLines.length >= 4 ? 56 : titleLines.length === 3 ? 64 : 76;
  const titleLineHeight = titleFontSize * 1.05;
  const titleStartY = 180;
  const titleX = 80;

  // Subtitle
  const subtitleFontSize = 22;
  const subtitleStartY = titleStartY + titleLines.length * titleLineHeight + 60;

  // Eyebrow
  const eyebrowY = 110;

  const pageCountStr = opts.pageCount
    ? `${opts.pageCount} PAGES · A4 · PRINTABLE PDF · INSTANT DOWNLOAD`
    : 'A4 · PRINTABLE PDF · INSTANT DOWNLOAD';

  const sprigTop = SPRIG_SVG.replace('STROKE_COLOR', c.accentInk);
  const sprigBottom = SPRIG_SVG.replace('STROKE_COLOR', c.accent);

  // Build the full SVG. Layered: bg → accent block → ornaments → text.
  const svg = `<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <!-- Cream background (whole page) -->
    <rect width="${WIDTH}" height="${HEIGHT}" fill="${c.bg}"/>

    <!-- Top accent colour block -->
    <rect x="0" y="0" width="${WIDTH}" height="${ACCENT_BLOCK_H}" fill="${c.accent}"/>

    <!-- Top-right botanical sprig (cream coloured on accent bg) -->
    <g transform="translate(${WIDTH - 130}, 70) scale(1.6)">${sprigTop}</g>

    <!-- Bottom-left botanical sprig (accent coloured on cream bg) -->
    <g transform="translate(60, ${HEIGHT - 180}) rotate(180) scale(1.4)">${sprigBottom}</g>

    <!-- Bottom-right botanical sprig (accent coloured) -->
    <g transform="translate(${WIDTH - 140}, ${HEIGHT - 80}) rotate(90) scale(1.2)">${sprigBottom}</g>

    <!-- Eyebrow "FLY & FROTH STUDIO" -->
    <text x="${titleX}" y="${eyebrowY}"
      font-family="Liberation Sans, DejaVu Sans, sans-serif"
      font-size="14" font-weight="400" letter-spacing="4"
      fill="${c.accentInk}" opacity="0.7">FLY &amp; FROTH STUDIO</text>

    <!-- Title (large serif) -->
    ${titleLines
      .map(
        (line, i) =>
          `<text x="${titleX}" y="${titleStartY + i * titleLineHeight}"
            font-family="Liberation Serif, DejaVu Serif, serif"
            font-size="${titleFontSize}" font-weight="700"
            fill="${c.accentInk}">${escapeXml(line)}</text>`,
      )
      .join('\n    ')}

    <!-- Hairline ornament between title and subtitle -->
    <rect x="${titleX}" y="${subtitleStartY - 30}" width="60" height="2" fill="${c.accentInk}" opacity="0.5"/>

    <!-- Subtitle (italic serif) -->
    ${subtitleLines
      .map(
        (line, i) =>
          `<text x="${titleX}" y="${subtitleStartY + i * 30}"
            font-family="Liberation Serif, DejaVu Serif, serif"
            font-size="${subtitleFontSize}" font-style="italic"
            fill="${c.accentInk}" opacity="0.92">${escapeXml(line)}</text>`,
      )
      .join('\n    ')}

    <!-- Bottom area decoration: centred ornament -->
    <g transform="translate(${WIDTH / 2 - 30}, ${ACCENT_BLOCK_H + 120})">
      <circle cx="30" cy="0" r="3" fill="${c.accent}" opacity="0.6"/>
      <line x1="-60" y1="0" x2="20" y2="0" stroke="${c.accent}" stroke-width="0.8" opacity="0.4"/>
      <line x1="40" y1="0" x2="120" y2="0" stroke="${c.accent}" stroke-width="0.8" opacity="0.4"/>
    </g>

    <!-- Page count + meta (centre, bottom) -->
    <text x="${WIDTH / 2}" y="${ACCENT_BLOCK_H + 220}" text-anchor="middle"
      font-family="Liberation Sans, DejaVu Sans, sans-serif"
      font-size="14" font-weight="400" letter-spacing="3"
      fill="${c.muted}">${pageCountStr}</text>

    <!-- F&F monogram at bottom -->
    <text x="${WIDTH / 2}" y="${HEIGHT - 110}" text-anchor="middle"
      font-family="Liberation Serif, DejaVu Serif, serif"
      font-size="32" font-weight="700"
      fill="${c.accent}" opacity="0.9">F &amp; F</text>
    <text x="${WIDTH / 2}" y="${HEIGHT - 80}" text-anchor="middle"
      font-family="Liberation Sans, DejaVu Sans, sans-serif"
      font-size="10" letter-spacing="3"
      fill="${c.muted}">fly-froth.com</text>
  </svg>`;

  // Render SVG → PNG via Sharp. Sharp on Vercel Lambda includes librsvg, which
  // handles the font fallback chain we specified above.
  let img = sharp(Buffer.from(svg)).png({ quality: 92 });

  // Optional V-6 hybrid step: composite an AI-generated decorative centerpiece
  // into the centre of the cream zone.
  if (opts.centerpieceBuffer) {
    try {
      const cpSize = 220;
      const cpResized = await sharp(opts.centerpieceBuffer)
        .resize(cpSize, cpSize, { fit: 'inside' })
        .png()
        .toBuffer();
      img = sharp(await img.toBuffer()).composite([
        {
          input: cpResized,
          top: ACCENT_BLOCK_H + 60,
          left: Math.round((WIDTH - cpSize) / 2),
        },
      ]).png({ quality: 92 });
    } catch (e) {
      console.warn('[cover-renderer] centerpiece composite failed (continuing without)', e);
    }
  }

  return img.toBuffer();
}
