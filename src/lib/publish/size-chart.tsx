/**
 * size-chart.tsx — Sprint M3 Faz 4 (v2 — @vercel/og refactor)
 *
 * Eski SVG yaklaşımı Vercel lambda'da Unicode glyph (½ vs.) ve font fallback
 * sorunu yapıyordu. Yeni: @vercel/og (Satori) + Inter font embed → temiz
 * karakter render, no font fallback issue.
 *
 * Pattern: apparel-design.tsx ile aynı (Inter weight 400/700/900 jsdelivr CDN).
 */

import React from 'react';
import { ImageResponse } from 'next/og';

// ── Inter font (jsdelivr CDN, module cache) ──────────────────────────────────
const FONT_URLS = {
  regular: 'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-400-normal.ttf',
  bold:    'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-700-normal.ttf',
  extra:   'https://cdn.jsdelivr.net/fontsource/fonts/inter@latest/latin-900-normal.ttf',
} as const;

let fontCache: { regular?: ArrayBuffer; bold?: ArrayBuffer; extra?: ArrayBuffer } = {};

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`size-chart font fetch failed ${res.status}: ${url}`);
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

// ── Chart data ───────────────────────────────────────────────────────────────
interface SizeChartData {
  title: string;
  subtitle: string;
  headers: string[];
  rows: string[][];
  footnote: string;
}

const TSHIRT_CHART: SizeChartData = {
  title: 'SIZE CHART',
  subtitle: 'Adult Unisex T-Shirt — Bella+Canvas 3001',
  headers: ['Size', 'Chest (in)', 'Length (in)', 'Sleeve (in)'],
  rows: [
    ['S',   '34-36', '28', '8'],
    ['M',   '38-40', '29', '8.5'],
    ['L',   '42-44', '30', '9'],
    ['XL',  '46-48', '31', '9.5'],
    ['2XL', '50-52', '32', '10'],
    ['3XL', '54-56', '33', '10.5'],
  ],
  footnote: 'Measurements in inches. Soft cotton, true to size.',
};

const TOTE_CHART: SizeChartData = {
  title: 'TOTE SPECS',
  subtitle: 'Canvas Tote Bag — Liberty Bags 8502',
  headers: ['Dimension', 'Imperial', 'Metric'],
  rows: [
    ['Width',        '15 in',  '38 cm'],
    ['Height',       '16 in',  '40 cm'],
    ['Handle Drop',  '11 in',  '28 cm'],
    ['Material',     '12 oz',  '100% cotton'],
  ],
  footnote: 'Sturdy canvas, machine washable. Ships flat.',
};

// ── Colors (premium-vizyon brand) ───────────────────────────────────────────
const COLORS = {
  bg:       '#FAFAFA',
  text:     '#1a1a1a',
  muted:    '#666666',
  accent:   '#5B6BB0',
  border:   '#D0D0D0',
  rowAlt:   '#F0F0F0',
  headerBg: '#5B6BB0',
  headerFg: '#FFFFFF',
} as const;

// ── React layout (Satori-compatible) ────────────────────────────────────────
function renderSizeChart(data: SizeChartData): React.ReactElement {
  const numCols = data.headers.length;

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: COLORS.bg,
        fontFamily: 'Inter',
        padding: '80px 80px 60px 80px',
      }}
    >
      {/* Title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <div
          style={{
            fontSize: 72,
            fontWeight: 900,
            color: COLORS.text,
            letterSpacing: '0.18em',
            display: 'flex',
          }}
        >
          {data.title}
        </div>
        <div
          style={{
            width: 120,
            height: 3,
            background: COLORS.accent,
            marginTop: 18,
            marginBottom: 22,
            display: 'flex',
          }}
        />
        <div
          style={{
            fontSize: 30,
            fontWeight: 400,
            color: COLORS.muted,
            display: 'flex',
          }}
        >
          {data.subtitle}
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          marginTop: 36,
          border: `2px solid ${COLORS.border}`,
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: 'flex',
            background: COLORS.headerBg,
            padding: '24px 0',
          }}
        >
          {data.headers.map((h, i) => (
            <div
              key={`h${i}`}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: 34,
                fontWeight: 700,
                color: COLORS.headerFg,
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Data rows */}
        {data.rows.map((row, r) => (
          <div
            key={`r${r}`}
            style={{
              display: 'flex',
              background: r % 2 === 1 ? COLORS.rowAlt : 'transparent',
              padding: '22px 0',
              borderTop: r === 0 ? 'none' : `1px solid ${COLORS.border}`,
            }}
          >
            {row.map((cell, c) => (
              <div
                key={`r${r}c${c}`}
                style={{
                  flex: 1,
                  textAlign: 'center',
                  fontSize: 36,
                  fontWeight: c === 0 ? 700 : 400,
                  color: COLORS.text,
                  display: 'flex',
                  justifyContent: 'center',
                }}
              >
                {cell}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Footnote */}
      <div
        style={{
          marginTop: 56,
          fontSize: 22,
          fontStyle: 'italic',
          color: COLORS.muted,
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        {data.footnote}
      </div>

      {/* Brand mark */}
      <div
        style={{
          marginTop: 'auto',
          fontSize: 22,
          fontWeight: 700,
          color: '#999',
          letterSpacing: '0.55em',
          textAlign: 'center',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        FLY · FROTH
      </div>
    </div>
  );
}

// ── Public API ──────────────────────────────────────────────────────────────
export interface SizeChartResult {
  buffer: Buffer;
  mimeType: 'image/png';
  width: number;
  height: number;
}

export async function generateSizeChart(productType: 'tshirt' | 'tote'): Promise<SizeChartResult> {
  const data = productType === 'tote' ? TOTE_CHART : TSHIRT_CHART;
  const W = 1200;
  const H = 1500;

  const fonts = await getFonts();

  const response = new ImageResponse(renderSizeChart(data), {
    width: W,
    height: H,
    fonts,
  });

  const arrayBuffer = await response.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: 'image/png',
    width: W,
    height: H,
  };
}
