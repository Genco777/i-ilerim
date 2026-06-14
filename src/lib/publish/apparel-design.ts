/**
 * apparel-design.ts — Sprint K Faz 3
 *
 * Apparel print için tasarım üretici (transparent PNG). Slogan tipografisi —
 * premium-vizyon brand (Inter font, indigo accent, FLY & FROTH brand mark).
 *
 * Çıktı: 3000×3600 px transparent PNG buffer (300 DPI = 10×12 inch print area).
 * Printify upload'a Buffer ya da public URL ile gider; bu modül buffer döndürür,
 * caller blob storage'a yükleyip URL'i Printify'a verir.
 *
 * Neden 3000×3600 (4500×5400 değil):
 *   - @vercel/og Satori 4500+ render'da OOM / latency yaratabiliyor lambda'da
 *   - Printify 1500+ piksel kabul ediyor, 3000 fazlasıyla yeterli (300 DPI 10")
 *   - Bella+Canvas 3001 print area 12×16 inch → ürünün ortasına merkezlenirse
 *     gömlek üzerinde ~10 inch wide görünür (ideal slogan boyu)
 *
 * Lambda performans: ilk çağrı font fetch (~500ms) + render (~1500ms) = ~2s.
 * Sonraki çağrılar fontCache modülde → render only ~1.5s.
 */

import React from 'react';
import { ImageResponse } from 'next/og';

export interface ApparelDesignOpts {
  /** Ana slogan — apparel'ın merkez metni (örn. "Just a girl who loves books"). */
  slogan: string;
  /** Alt satır — küçük tagline (opsiyonel, örn. "since 2024" ya da boş). */
  subtitle?: string;
  /** Tasarım stili — minimal (varsayılan), stamp (çerçeve içinde), serif (italic). */
  style?: 'minimal' | 'stamp' | 'serif';
  /** Slogan rengi — siyah ya da beyaz t-shirt için. 'dark' = siyah text (açık tişört için). */
  inkColor?: 'dark' | 'light' | 'indigo';
  /** Brand mark göster (alt küçük). Default: true. */
  showBrand?: boolean;
}

export interface ApparelDesignResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: 'image/png';
}

// ── Inter font (jsdelivr CDN, module-cache) ──────────────────────────────────
const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
  bold:    'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
  extra:   'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf',
} as const;

let fontCache: { regular?: ArrayBuffer; bold?: ArrayBuffer; extra?: ArrayBuffer } = {};

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`apparel-design font fetch failed ${res.status}: ${url}`);
  return res.arrayBuffer();
}

async function getFonts() {
  if (!fontCache.regular || !fontCache.bold || !fontCache.extra) {
    const [regular, bold, extra] = await Promise.all([
      fontCache.regular ? Promise.resolve(fontCache.regular) : fetchFont(FONT_URLS.regular),
      fontCache.bold    ? Promise.resolve(fontCache.bold)    : fetchFont(FONT_URLS.bold),
      fontCache.extra   ? Promise.resolve(fontCache.extra)   : fetchFont(FONT_URLS.extra),
    ]);
    fontCache = { regular, bold, extra };
  }
  return [
    { name: 'Inter', data: fontCache.regular!, weight: 400 as const, style: 'normal' as const },
    { name: 'Inter', data: fontCache.bold!,    weight: 700 as const, style: 'normal' as const },
    { name: 'Inter', data: fontCache.extra!,   weight: 900 as const, style: 'normal' as const },
  ];
}

// ── Color palette ───────────────────────────────────────────────────────────
function inkColorHex(ink: ApparelDesignOpts['inkColor']): string {
  switch (ink) {
    case 'light':  return '#FFFFFF';
    case 'indigo': return '#5B6BB0'; // premium-vizyon brand indigo
    case 'dark':
    default:       return '#0F0F12';
  }
}

// ── React layout (Satori-compatible inline styles) ──────────────────────────
function renderDesignJSX(opts: Required<ApparelDesignOpts>): React.ReactElement {
  const W = 3000;
  const H = 3600;
  const ink = inkColorHex(opts.inkColor);
  const slogan = opts.slogan.trim();

  // Slogan font size — slogan uzunluğuna göre dinamik (uzunsa küçült)
  const sloganLen = slogan.length;
  const fontSize = sloganLen < 20 ? 380
                 : sloganLen < 40 ? 280
                 : sloganLen < 70 ? 200
                 : 160;

  const layout = (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'transparent',
        padding: '300px 250px',
        fontFamily: 'Inter',
        color: ink,
        textAlign: 'center',
      }}
    >
      {/* Stamp variant: ince frame */}
      {opts.style === 'stamp' && (
        <div
          style={{
            position: 'absolute',
            top: 220,
            left: 220,
            right: 220,
            bottom: 220,
            border: `8px solid ${ink}`,
            opacity: 0.18,
            borderRadius: 12,
            display: 'flex',
          }}
        />
      )}

      {/* Main slogan */}
      <div
        style={{
          fontWeight: opts.style === 'serif' ? 700 : 900,
          fontSize,
          lineHeight: 1.05,
          letterSpacing: opts.style === 'minimal' ? '-0.04em' : '-0.02em',
          fontStyle: opts.style === 'serif' ? 'italic' : 'normal',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          maxWidth: '100%',
        }}
      >
        {slogan}
      </div>

      {/* Subtitle */}
      {opts.subtitle && opts.subtitle.trim().length > 0 && (
        <div
          style={{
            marginTop: 60,
            fontWeight: 400,
            fontSize: 90,
            letterSpacing: '0.35em',
            textTransform: 'uppercase',
            opacity: 0.78,
            display: 'flex',
          }}
        >
          {opts.subtitle.trim()}
        </div>
      )}

      {/* Brand mark — alt, küçük, hairline */}
      {opts.showBrand && (
        <div
          style={{
            position: 'absolute',
            bottom: 180,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            fontWeight: 400,
            opacity: 0.45,
          }}
        >
          <div
            style={{
              fontSize: 38,
              letterSpacing: '0.55em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            FLY · FROTH
          </div>
        </div>
      )}
    </div>
  );

  return layout;
}

// ── Public API ──────────────────────────────────────────────────────────────
export async function generateApparelDesign(
  opts: ApparelDesignOpts,
): Promise<ApparelDesignResult> {
  if (!opts.slogan || !opts.slogan.trim()) {
    throw new Error('generateApparelDesign: slogan boş olamaz');
  }

  const merged: Required<ApparelDesignOpts> = {
    slogan: opts.slogan,
    subtitle: opts.subtitle ?? '',
    style: opts.style ?? 'minimal',
    inkColor: opts.inkColor ?? 'dark',
    showBrand: opts.showBrand ?? true,
  };

  const W = 3000;
  const H = 3600;
  const fonts = await getFonts();

  const response = new ImageResponse(renderDesignJSX(merged), {
    width: W,
    height: H,
    fonts,
    // Transparent background — apparel print için kritik
    // @ts-expect-error ImageResponse options does not type emoji; runtime supports it
    debug: false,
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return {
    buffer,
    width: W,
    height: H,
    mimeType: 'image/png',
  };
}
