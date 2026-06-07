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

  const eyebrow = (opts.topic ?? 'Fly & Froth').slice(0, 42).toUpperCase();
  const rawTitle = (opts.title ?? '').trim() || stripHashtags(opts.bodyText ?? '').split(/[.!?\n]/)[0] || opts.topic;
  const title = rawTitle.slice(0, 120);

  let bodyRaw = stripHashtags(opts.bodyText ?? '');
  if (rawTitle && bodyRaw.startsWith(rawTitle)) {
    bodyRaw = bodyRaw.slice(rawTitle.length).replace(/^[.!?\s]+/, '');
  }
  const body = bodyRaw.slice(0, 400);

  const titleFs = isStory ? 92 : 84;
  const bodyFs  = isStory ? 38 : 36;
  const eyebrowFs = isStory ? 28 : 26;
  const brandFs = isStory ? 26 : 24;
  const pad = 80;

  // ── JSX tree via React.createElement (file stays .ts, no .tsx switch needed) ──

  const element = React.createElement(
    'div',
    {
      style: {
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        background: `linear-gradient(180deg, ${palette.background} 0%, ${palette.backgroundMuted} 100%)`,
        padding: `${pad}px`,
        fontFamily: 'Inter',
        position: 'relative',
        color: palette.foreground,
      },
    },
    [
      // Accent glow circle (top-right)
      React.createElement('div', {
        key: 'glow',
        style: {
          position: 'absolute',
          top: -180,
          right: -140,
          width: 560,
          height: 560,
          borderRadius: 280,
          background: accent,
          opacity: 0.06,
        },
      }),

      // Eyebrow
      React.createElement(
        'div',
        {
          key: 'eyebrow',
          style: {
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginTop: 40,
          },
        },
        [
          React.createElement('div', {
            key: 'dot',
            style: { width: 10, height: 10, borderRadius: 5, background: accent },
          }),
          React.createElement(
            'span',
            {
              key: 'label',
              style: {
                fontSize: eyebrowFs,
                fontWeight: 700,
                letterSpacing: 4.5,
                color: palette.mutedForeground,
              },
            },
            eyebrow,
          ),
        ],
      ),

      // Title
      React.createElement(
        'div',
        {
          key: 'title',
          style: {
            fontSize: titleFs,
            fontWeight: 800,
            letterSpacing: -1.6,
            lineHeight: 1.05,
            color: palette.foreground,
            marginTop: 32,
            display: 'flex',
            textWrap: 'balance',
          },
        },
        title,
      ),

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
                opacity: 0.78,
                lineHeight: 1.4,
                marginTop: 40,
                display: 'flex',
              },
            },
            body,
          )
        : null,

      // Spacer pushes brand to bottom
      React.createElement('div', { key: 'spacer', style: { flex: 1 } }),

      // Bottom: accent bar + brand mark
      React.createElement(
        'div',
        {
          key: 'brand',
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          },
        },
        [
          React.createElement('div', {
            key: 'bar',
            style: { width: 88, height: 4, background: accent, marginBottom: 14 },
          }),
          React.createElement(
            'span',
            {
              key: 'name',
              style: {
                fontSize: brandFs + 4,
                fontWeight: 700,
                letterSpacing: -0.4,
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
                letterSpacing: 2.2,
                color: palette.mutedForeground,
              },
            },
            BRAND_MARK.tagline.toUpperCase(),
          ),
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
