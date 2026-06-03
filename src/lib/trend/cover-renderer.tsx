/**
 * TANRILAR V-10 — Premium editorial cover renderer.
 *
 * Layers (Sharp composite):
 *   1. Watercolor botanical background (Nano Banana Pro, cached per theme)
 *   2. Translucent accent overlay (via Sharp, theme-aware tint)
 *   3. Typography layer (Satori + Cormorant Garamond + Inter, fetched at
 *      runtime from Google Fonts mirror, cached in memory)
 *
 * Result: Anthropologie/Magnolia magazine-cover-grade output. Editorial
 * typography (real serif), warm illustrated background, branded composition.
 *
 * Cost per cover: $0.10 (one Nano Banana Pro illustration call). BG is cached
 * by theme so repeat renders within the same Lambda warm period cost $0.
 *
 * Used by:
 *   src/lib/trend/pdf-ai-pages.ts → generateCoverImageOnly
 *   src/lib/trend/visual.ts via the same indirection
 */

import { ImageResponse } from 'next/og';
import React from 'react';
import sharp from 'sharp';

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

// ─── Font loading (Cormorant Garamond + Inter) ───────────────────────────────

let cachedFonts: { name: string; data: ArrayBuffer; weight: number; style: 'normal' | 'italic' }[] | null = null;

async function loadFonts() {
  if (cachedFonts) return cachedFonts;
  const fetchTtf = async (url: string): Promise<ArrayBuffer> => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Font fetch ${url} → ${r.status}`);
    return r.arrayBuffer();
  };
  const [cormorantBold, cormorantItalic, inter] = await Promise.all([
    fetchTtf('https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Bold.ttf'),
    fetchTtf('https://github.com/google/fonts/raw/main/ofl/cormorantgaramond/CormorantGaramond-Italic.ttf'),
    fetchTtf('https://github.com/google/fonts/raw/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf'),
  ]);
  cachedFonts = [
    { name: 'Cormorant', data: cormorantBold, weight: 700, style: 'normal' },
    { name: 'Cormorant', data: cormorantItalic, weight: 400, style: 'italic' },
    { name: 'Inter', data: inter, weight: 400, style: 'normal' },
  ];
  return cachedFonts;
}

// ─── Banana Pro watercolor background (cached per theme) ─────────────────────

const bgCache = new Map<CoverTheme, Buffer>();

async function fetchWatercolorBackground(theme: CoverTheme): Promise<Buffer | null> {
  if (bgCache.has(theme)) return bgCache.get(theme)!;
  try {
    const { nanoBananaGenerate } = await import('@/lib/publish/nano-banana');
    const c = THEME_COLORS[theme];
    const prompt = [
      `Editorial watercolour botanical illustration page background.`,
      `Soft warm cream (#fbfaf6) background with delicate hand-painted watercolour`,
      `dried lavender, eucalyptus sprig, dried wheat, and one folded olive leaf`,
      `clustered in the upper-left and lower-right corners only — the centre`,
      `and upper-right MUST remain mostly empty cream space for typography overlay.`,
      `Soft warm tones harmonising with accent colour ${c.accent}.`,
      `Subtle paper texture. Anthropologie magazine cover background art.`,
      `NO text, NO photos, NO 3D, NO objects — purely painted illustration with empty negative space.`,
    ].join(' ');
    const buf = await nanoBananaGenerate({
      prompt,
      aspectRatio: '3:4',
      resolution: '2K',
      outputFormat: 'jpg',
      model: 'nano-banana-pro',
    });
    bgCache.set(theme, buf);
    return buf;
  } catch (e) {
    console.warn('[cover-renderer] Banana watercolour BG failed (using solid fill)', e);
    return null;
  }
}

// ─── Typography layer via Satori (next/og) ───────────────────────────────────

async function renderTypographyLayer(opts: CoverRenderOptions): Promise<Buffer> {
  const c = THEME_COLORS[opts.theme] ?? THEME_COLORS.cream;
  const fonts = await loadFonts().catch((e) => {
    console.warn('[cover-renderer] font fetch failed, falling back to defaults', e);
    return undefined;
  });

  const titleSize = opts.title.length > 80 ? 56 : opts.title.length > 50 ? 68 : 84;
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
        backgroundColor: 'transparent',
        fontFamily: 'Inter',
      }}
    >
      {/* Top translucent accent block — title + eyebrow */}
      <div
        style={{
          width: '100%',
          height: '57%',
          backgroundColor: c.accent + 'F2', // 95% opacity over watercolour BG
          padding: '90px 90px 70px 90px',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        <div
          style={{
            fontFamily: 'Inter',
            fontSize: 15,
            letterSpacing: 7,
            color: c.accentInk,
            opacity: 0.7,
            marginBottom: 50,
            display: 'flex',
          }}
        >
          FLY &amp; FROTH STUDIO
        </div>

        <div
          style={{
            fontFamily: 'Cormorant',
            fontWeight: 700,
            fontSize: titleSize,
            lineHeight: 1.05,
            color: c.accentInk,
            letterSpacing: -1.5,
            marginBottom: 38,
            display: 'flex',
            maxWidth: WIDTH - 180,
          }}
        >
          {opts.title}
        </div>

        <div
          style={{
            width: 80,
            height: 2,
            backgroundColor: c.accentInk,
            opacity: 0.55,
            marginBottom: 32,
            display: 'flex',
          }}
        />

        <div
          style={{
            fontFamily: 'Cormorant',
            fontStyle: 'italic',
            fontWeight: 400,
            fontSize: 28,
            lineHeight: 1.4,
            color: c.accentInk,
            opacity: 0.94,
            display: 'flex',
            maxWidth: WIDTH - 180,
          }}
        >
          {opts.subtitle.slice(0, 200)}
        </div>
      </div>

      {/* Bottom cream area (transparent, lets watercolour show through) */}
      <div
        style={{
          width: '100%',
          flex: 1,
          padding: '70px 90px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 30 }}>
          <div style={{ width: 90, height: 1, backgroundColor: c.accent, opacity: 0.45, display: 'flex' }} />
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: c.accent,
              opacity: 0.65,
              display: 'flex',
            }}
          />
          <div style={{ width: 90, height: 1, backgroundColor: c.accent, opacity: 0.45, display: 'flex' }} />
        </div>

        <div style={{ display: 'flex' }} />

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              fontFamily: 'Cormorant',
              fontWeight: 700,
              fontSize: 44,
              color: c.accent,
              letterSpacing: 6,
              marginBottom: 22,
              display: 'flex',
            }}
          >
            F &amp; F
          </div>
          <div
            style={{
              fontFamily: 'Inter',
              fontSize: 13,
              letterSpacing: 4,
              color: c.muted,
              marginBottom: 10,
              display: 'flex',
            }}
          >
            {pageMeta}
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: 3, color: c.muted, display: 'flex' }}>
            FLY-FROTH.COM
          </div>
        </div>
      </div>
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const responseOpts: any = { width: WIDTH, height: HEIGHT };
  if (fonts) responseOpts.fonts = fonts;
  const response = new ImageResponse(cover, responseOpts);
  return Buffer.from(await response.arrayBuffer());
}

// ─── Public: composite watercolor BG + typography overlay ────────────────────

export async function renderCoverImage(opts: CoverRenderOptions): Promise<Buffer> {
  // Phase 1: watercolour BG (Banana Pro, best-effort)
  const bgBuffer = await fetchWatercolorBackground(opts.theme);

  // Phase 2: typography layer (Satori with Cormorant)
  const typographyPng = await renderTypographyLayer(opts);

  // Phase 3: composite
  if (!bgBuffer) {
    // BG failed — typography layer already has accent fill so it stands alone.
    return typographyPng;
  }

  // Resize BG to cover dimensions, then composite typography on top.
  const bgResized = await sharp(bgBuffer)
    .resize(WIDTH, HEIGHT, { fit: 'cover', position: 'center' })
    .toBuffer();

  return sharp(bgResized)
    .composite([{ input: typographyPng, top: 0, left: 0 }])
    .png({ quality: 92 })
    .toBuffer();
}
