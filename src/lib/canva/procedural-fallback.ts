/**
 * canva/procedural-fallback.ts — v2 (Vercel/og refactor)
 *
 * Sharp+SVG yaklaşımı Vercel lambda'da font sorunu yapıyordu (libvips fontconfig
 * font bulamayınca tofu □ render ediyor). Yeni implementation: Next.js
 * `next/og` (Satori altyapılı) — font'u fetch edip embed ediyor, Vercel-native.
 *
 * Hedef: premium-vizyon-projesi-main brand'ı (indigo accent, editorial layout,
 * eyebrow micro-typography, generous whitespace, alt brand-mark) sadık şekilde
 * uygula. 1080×1350 PNG feed post veya 1080×1920 story.
 */

import React from 'react';
import { ImageResponse } from 'next/og';
import type { ContentPillar } from '@/types';
import { PALETTE_LIGHT, PILLAR_ACCENT, BRAND_MARK } from '@/lib/brand/premium-tokens';

export interface ProceduralPostOpts {
  topic: string;
  title: string;
  bodyText: string;
  pillar?: ContentPillar;
  aspect?: 'feed' | 'story' | 'square';
  dark?: boolean;
  /** Brand logo URL — alt-sağda overlay olarak gösterilir. Yoksa text-only brand mark. */
  logoUrl?: string;
}

export interface ProceduralPostResult {
  buffer: Buffer;
  provider: 'procedural';
  width: number;
  height: number;
}

// ── Font fetch with module-level cache ────────────────────────────────────────
// Inter — yaygın, latin-ext destekli, jsdelivr CDN'den TTF. İlk çağrıda fetch,
// sonraki lambda call'larında module cache'inden döner.

const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
  bold:    'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
  extra:   'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-800-normal.ttf',
} as const;

let fontCache: { regular?: ArrayBuffer; bold?: ArrayBuffer; extra?: ArrayBuffer } = {};

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`font fetch failed ${res.status}: ${url}`);
  return res.arrayBuffer();
}

async function getFonts(): Promise<Array<{ name: string; data: ArrayBuffer; weight: 400 | 700 | 800; style: 'normal' }>> {
  if (!fontCache.regular || !fontCache.bold || !fontCache.extra) {
    const [regular, bold, extra] = await Promise.all([
      fontCache.regular ? Promise.resolve(fontCache.regular) : fetchFont(FONT_URLS.regular),
      fontCache.bold    ? Promise.resolve(fontCache.bold)    : fetchFont(FONT_URLS.bold),
      fontCache.extra   ? Promise.resolve(fontCache.extra)   : fetchFont(FONT_URLS.extra),
    ]);
    fontCache = { regular, bold, extra };
  }
  return [
    { name: 'Inter', data: fontCache.regular!, weight: 400, style: 'normal' },
    { name: 'Inter', data: fontCache.bold!,    weight: 700, style: 'normal' },
    { name: 'Inter', data: fontCache.extra!,   weight: 800, style: 'normal' },
  ];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function buildAspect(aspect: ProceduralPostOpts['aspect']): { w: number; h: number } {
  switch (aspect) {
    case 'story':  return { w: 1080, h: 1920 };
    case 'square': return { w: 1080, h: 1080 };
    case 'feed':
    default:       return { w: 1080, h: 1350 };
  }
}

function stripHashtags(s: string): string {
  return s.replace(/#\w+/g, '').replace(/\s{2,}/g, ' ').trim();
}

// ── Public API ─────────────────────────────────────────────────────────────────

/** Relative URL'i absolute'a çevir (@vercel/og absolute URL zorunlu). */
function toAbsoluteUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://shop.fly-froth.com';
  return base.replace(/\/+$/, '') + (url.startsWith('/') ? url : '/' + url);
}

export async function generateProceduralPost(
  opts: ProceduralPostOpts,
): Promise<ProceduralPostResult> {
  const palette = PALETTE_LIGHT;
  const accent =
    opts.pillar && (PILLAR_ACCENT[opts.pillar as keyof typeof PILLAR_ACCENT])
      ? PILLAR_ACCENT[opts.pillar as keyof typeof PILLAR_ACCENT]
      : palette.primary;
  const { w, h } = buildAspect(opts.aspect);
  const isStory = h >= 1900;
  const logoUrlAbs = toAbsoluteUrl(opts.logoUrl);

  const eyebrow = (opts.topic ?? 'Fly & Froth').slice(0, 42).toUpperCase();
  const rawTitle = (opts.title ?? '').trim() || stripHashtags(opts.bodyText ?? '').split(/[.!?\n]/)[0] || opts.topic;
  const title = rawTitle.slice(0, 120);

  let bodyRaw = stripHashtags(opts.bodyText ?? '');
  if (rawTitle && bodyRaw.startsWith(rawTitle)) {
    bodyRaw = bodyRaw.slice(rawTitle.length).replace(/^[.!?\s]+/, '');
  }
  const body = bodyRaw.slice(0, 400);

  // Elegant scaling — daha rafine, daha az "loud", daha çok premium-magazine feel
  const titleFs = isStory ? 78 : 72;     // ↓ küçüldü, daha narin
  const bodyFs  = isStory ? 32 : 28;     // ↓ ince
  const eyebrowFs = isStory ? 22 : 20;   // ↓ ince eyebrow
  const brandFs = isStory ? 22 : 20;
  const pad = 96;                        // ↑ daha geniş margin (elegant whitespace)

  // ── Elegant JSX tree ──
  // Layout: ince accent hairline (sol), eyebrow (üst), title (orta), body (alt orta),
  // alt-sağda logo overlay + sol-alt'ta minimal brand text. Magazine editorial feel.

  const element = React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: palette.background, // solid, gradient yerine — daha clean
        padding: `${pad}px`,
        fontFamily: 'Inter',
        position: 'relative',
        color: palette.foreground,
      },
    },
    [
      // Sol kenarda ince dikey accent stripe (magazine editorial vurgu)
      React.createElement('div', {
        key: 'side-stripe',
        style: {
          position: 'absolute',
          top: pad,
          left: pad / 2,
          width: 2,
          height: h - pad * 2,
          background: accent,
          opacity: 0.6,
        },
      }),

      // Eyebrow — ince, accent dot ufak
      React.createElement(
        'div',
        {
          key: 'eyebrow',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 8,
          },
        },
        [
          React.createElement('div', {
            key: 'dot',
            style: { width: 6, height: 6, borderRadius: 3, background: accent },
          }),
          React.createElement(
            'span',
            {
              key: 'label',
              style: {
                fontSize: eyebrowFs,
                fontWeight: 700,
                letterSpacing: 5,
                color: palette.mutedForeground,
              },
            },
            eyebrow,
          ),
        ],
      ),

      // Title — ince ama bold, daha narin tracking
      React.createElement(
        'div',
        {
          key: 'title',
          style: {
            fontSize: titleFs,
            fontWeight: 700, // 800 → 700 (daha rafine)
            letterSpacing: -1.4,
            lineHeight: 1.08,
            color: palette.foreground,
            marginTop: 48,
            display: 'flex',
            textWrap: 'balance',
            maxWidth: '85%',
          },
        },
        title,
      ),

      // Title-body arası ince hairline rule (editorial element)
      body
        ? React.createElement('div', {
            key: 'rule',
            style: {
              width: 48,
              height: 1,
              background: palette.foreground,
              opacity: 0.25,
              marginTop: 48,
            },
          })
        : null,

      // Body
      body
        ? React.createElement(
            'div',
            {
              key: 'body',
              style: {
                fontSize: bodyFs,
                fontWeight: 400,
                color: palette.foreground,
                opacity: 0.72,
                lineHeight: 1.5,
                marginTop: 28,
                display: 'flex',
                maxWidth: '78%',
              },
            },
            body,
          )
        : null,

      // Spacer
      React.createElement('div', { key: 'spacer', style: { flex: 1 } }),

      // Bottom row: SOL brand text + SAĞ logo
      React.createElement(
        'div',
        {
          key: 'bottom',
          style: {
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            width: '100%',
          },
        },
        [
          // Sol: brand text (ince, minimal)
          React.createElement(
            'div',
            {
              key: 'brand-text',
              style: {
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              },
            },
            [
              React.createElement('div', {
                key: 'bar',
                style: { width: 32, height: 1, background: accent, marginBottom: 12 },
              }),
              React.createElement(
                'span',
                {
                  key: 'name',
                  style: {
                    fontSize: brandFs + 2,
                    fontWeight: 600,
                    letterSpacing: -0.3,
                    color: palette.foreground,
                  },
                },
                BRAND_MARK.name,
              ),
              React.createElement(
                'span',
                {
                  key: 'tag',
                  style: {
                    fontSize: brandFs - 6,
                    fontWeight: 500,
                    letterSpacing: 2.5,
                    color: palette.mutedForeground,
                    marginTop: 2,
                  },
                },
                BRAND_MARK.tagline.toUpperCase(),
              ),
            ],
          ),
          // Sağ: logo overlay (varsa, absolute URL'e dönüştürüldü)
          logoUrlAbs
            ? React.createElement('img', {
                key: 'logo',
                src: logoUrlAbs,
                style: {
                  width: isStory ? 88 : 76,
                  height: isStory ? 88 : 76,
                  objectFit: 'contain',
                  display: 'flex',
                },
              })
            : null,
        ],
      ),
    ],
  );

  const fonts = await getFonts();
  const response = new ImageResponse(element, {
    width: w,
    height: h,
    fonts,
  });

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  return { buffer, provider: 'procedural', width: w, height: h };
}
