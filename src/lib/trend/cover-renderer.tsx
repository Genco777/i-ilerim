/**
 * V-7 — Deterministic cover renderer via next/og (Satori-based).
 *
 * Why this rewrite: V-6 used Sharp + inline SVG <text> but Vercel Lambda's
 * librsvg has no real font installed (Liberation Serif we requested resolved
 * to "missing glyph" boxes — the output rendered "□□□□□" where the title
 * should have been).
 *
 * V-7 uses next/og's ImageResponse which is built on Satori. Satori bundles
 * Inter with full Latin coverage, renders HTML+CSS deterministically to PNG,
 * and is Vercel-native (used by @vercel/og). Output is a real PNG buffer.
 *
 * Output: 1024×1365 PNG (3:4 aspect, matches A4-ish, what Nano Banana 2
 * mockups expect as reference).
 *
 * Used by:
 *   src/lib/trend/pdf-ai-pages.ts → generateCoverImageOnly
 *   src/lib/trend/visual.ts via the same indirection
 */

import { ImageResponse } from 'next/og';
import React from 'react';

export type CoverTheme = 'cream' | 'noir' | 'forest' | 'rose' | 'slate';

interface ThemeColors {
  bg: string;
  accent: string;
  accentInk: string;
  ink: string;
  muted: string;
}

const THEME_COLORS: Record<CoverTheme, ThemeColors> = {
  cream: { bg: '#fbfaf6', accent: '#b8866c', accentInk: '#fbfaf6', ink: '#2d2925', muted: '#8b8278' },
  noir: { bg: '#f5f1ed', accent: '#5b4670', accentInk: '#f5f1ed', ink: '#1a1a1f', muted: '#777078' },
  forest: { bg: '#f8f5ef', accent: '#3d5a47', accentInk: '#f8f5ef', ink: '#1a2820', muted: '#7a8478' },
  rose: { bg: '#fbf6f3', accent: '#9d4d45', accentInk: '#fbf6f3', ink: '#3a2424', muted: '#a08a82' },
  slate: { bg: '#f8f8fa', accent: '#324063', accentInk: '#f8f8fa', ink: '#191a23', muted: '#7a8094' },
};

export interface CoverRenderOptions {
  title: string;
  subtitle: string;
  pageCount?: number;
  theme: CoverTheme;
}

const WIDTH = 1024;
const HEIGHT = 1365;

export async function renderCoverImage(opts: CoverRenderOptions): Promise<Buffer> {
  const c = THEME_COLORS[opts.theme] ?? THEME_COLORS.cream;
  const titleSize = opts.title.length > 80 ? 52 : opts.title.length > 50 ? 62 : 76;

  const pageMeta = opts.pageCount
    ? `${opts.pageCount} PAGES · A4 · PRINTABLE PDF · INSTANT DOWNLOAD`
    : 'A4 · PRINTABLE PDF · INSTANT DOWNLOAD';

  const cover = (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: c.bg,
        fontFamily: 'Inter',
      }}
    >
      {/* Top accent colour block — title + eyebrow */}
      <div
        style={{
          width: '100%',
          height: '57%',
          backgroundColor: c.accent,
          padding: '80px 80px 60px 80px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            fontSize: 16,
            letterSpacing: 6,
            color: c.accentInk,
            opacity: 0.65,
            marginBottom: 40,
            display: 'flex',
          }}
        >
          FLY &amp; FROTH STUDIO
        </div>

        {/* Title — large bold sans-serif (Satori bundles Inter; the editorial
            "wow" instead of serif here is fine — strong typography stands on
            its own without needing custom serif fonts loaded). */}
        <div
          style={{
            fontSize: titleSize,
            fontWeight: 800,
            lineHeight: 1.05,
            color: c.accentInk,
            letterSpacing: -1.5,
            marginBottom: 36,
            display: 'flex',
            maxWidth: WIDTH - 160,
          }}
        >
          {opts.title}
        </div>

        {/* Hairline accent rule */}
        <div
          style={{
            width: 80,
            height: 3,
            backgroundColor: c.accentInk,
            opacity: 0.5,
            marginBottom: 28,
            display: 'flex',
          }}
        />

        {/* Subtitle */}
        <div
          style={{
            fontSize: 22,
            fontWeight: 400,
            fontStyle: 'italic',
            lineHeight: 1.4,
            color: c.accentInk,
            opacity: 0.92,
            display: 'flex',
            maxWidth: WIDTH - 160,
          }}
        >
          {opts.subtitle.slice(0, 180)}
        </div>

        {/* Corner ornament */}
        <div
          style={{
            position: 'absolute',
            top: 60,
            right: 80,
            fontSize: 28,
            color: c.accentInk,
            opacity: 0.4,
            display: 'flex',
          }}
        >
          ❋
        </div>
      </div>

      {/* Bottom cream area — meta + monogram */}
      <div
        style={{
          width: '100%',
          flex: 1,
          padding: '70px 80px 60px 80px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Decorative ornament line */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginTop: 30,
          }}
        >
          <div style={{ width: 80, height: 1, backgroundColor: c.accent, opacity: 0.4, display: 'flex' }} />
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: c.accent,
              opacity: 0.6,
              display: 'flex',
            }}
          />
          <div style={{ width: 80, height: 1, backgroundColor: c.accent, opacity: 0.4, display: 'flex' }} />
        </div>

        {/* Spacer */}
        <div style={{ display: 'flex' }} />

        {/* Monogram + meta */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
          }}
        >
          <div
            style={{
              fontSize: 38,
              fontWeight: 700,
              color: c.accent,
              letterSpacing: 4,
              marginBottom: 18,
              display: 'flex',
            }}
          >
            F &amp; F
          </div>
          <div
            style={{
              fontSize: 13,
              letterSpacing: 4,
              color: c.muted,
              marginBottom: 8,
              display: 'flex',
            }}
          >
            {pageMeta}
          </div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: 3,
              color: c.muted,
              display: 'flex',
            }}
          >
            FLY-FROTH.COM
          </div>
        </div>
      </div>
    </div>
  );

  const response = new ImageResponse(cover, {
    width: WIDTH,
    height: HEIGHT,
  });

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
