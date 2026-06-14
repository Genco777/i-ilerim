/**
 * size-chart.ts — Sprint M3 Faz 4
 *
 * Standart Adult Unisex T-Shirt Size Chart + Tote Bag spec.
 * SVG → PNG render (Sharp). Etsy listing'e ek photo olarak yüklenir.
 *
 * Bestseller pattern: ölçü tablosu olan ürünler %20+ daha az return alır
 * + müşteri size sorusu olmadan satın alır.
 */

import sharp from 'sharp';

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
    ['M',   '38-40', '29', '8½'],
    ['L',   '42-44', '30', '9'],
    ['XL',  '46-48', '31', '9½'],
    ['2XL', '50-52', '32', '10'],
    ['3XL', '54-56', '33', '10½'],
  ],
  footnote: 'Measurements in inches. Soft cotton, true to size. EU/cm chart in product description.',
};

const TOTE_CHART: SizeChartData = {
  title: 'TOTE SPECS',
  subtitle: 'Canvas Tote Bag — Liberty Bags 8502',
  headers: ['Dimension', 'Imperial', 'Metric'],
  rows: [
    ['Width',        '15"',    '38 cm'],
    ['Height',       '16"',    '40 cm'],
    ['Handle Drop',  '11"',    '28 cm'],
    ['Material',     '12 oz',  '100% cotton canvas'],
  ],
  footnote: 'Sturdy canvas, machine washable. Ships flat.',
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildSizeChartSvg(data: SizeChartData): { svg: string; W: number; H: number } {
  const W = 1200;
  const H = 1500;
  const PAD = 80;
  const TITLE_H = 100;
  const SUBTITLE_H = 60;
  const HEADER_H = 80;
  const ROW_H = 90;
  const FOOTER_H = 60;

  const numCols = data.headers.length;
  const tableWidth = W - 2 * PAD;
  const colWidth = tableWidth / numCols;
  const tableTop = PAD + TITLE_H + SUBTITLE_H + 40;

  // Renkler
  const BG = '#FAFAFA';
  const TEXT = '#1a1a1a';
  const ACCENT = '#5B6BB0'; // brand indigo
  const BORDER = '#d0d0d0';
  const ROW_ALT = '#f0f0f0';

  let svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;

  // Background
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="${BG}"/>`;

  // Title
  svg += `<text x="${W / 2}" y="${PAD + 60}" font-family="Arial, sans-serif" font-size="64" font-weight="900" fill="${TEXT}" text-anchor="middle" letter-spacing="6">${escapeXml(data.title)}</text>`;
  svg += `<text x="${W / 2}" y="${PAD + 60 + SUBTITLE_H}" font-family="Arial, sans-serif" font-size="28" font-weight="400" fill="#666" text-anchor="middle">${escapeXml(data.subtitle)}</text>`;

  // Accent line under title
  svg += `<rect x="${PAD + tableWidth / 2 - 60}" y="${PAD + 110}" width="120" height="3" fill="${ACCENT}"/>`;

  // Header row
  let y = tableTop;
  svg += `<rect x="${PAD}" y="${y}" width="${tableWidth}" height="${HEADER_H}" fill="${ACCENT}"/>`;
  for (let i = 0; i < numCols; i++) {
    const cx = PAD + i * colWidth + colWidth / 2;
    svg += `<text x="${cx}" y="${y + HEADER_H / 2 + 12}" font-family="Arial, sans-serif" font-size="32" font-weight="700" fill="white" text-anchor="middle">${escapeXml(data.headers[i])}</text>`;
  }

  // Data rows
  y += HEADER_H;
  for (let r = 0; r < data.rows.length; r++) {
    const row = data.rows[r];
    if (r % 2 === 1) {
      svg += `<rect x="${PAD}" y="${y}" width="${tableWidth}" height="${ROW_H}" fill="${ROW_ALT}"/>`;
    }
    for (let c = 0; c < numCols; c++) {
      const cx = PAD + c * colWidth + colWidth / 2;
      const fontWeight = c === 0 ? '700' : '400';
      svg += `<text x="${cx}" y="${y + ROW_H / 2 + 10}" font-family="Arial, sans-serif" font-size="34" font-weight="${fontWeight}" fill="${TEXT}" text-anchor="middle">${escapeXml(row[c] ?? '')}</text>`;
    }
    svg += `<line x1="${PAD}" y1="${y + ROW_H}" x2="${W - PAD}" y2="${y + ROW_H}" stroke="${BORDER}" stroke-width="1"/>`;
    y += ROW_H;
  }

  // Table border
  const tableHeight = HEADER_H + data.rows.length * ROW_H;
  svg += `<rect x="${PAD}" y="${tableTop}" width="${tableWidth}" height="${tableHeight}" fill="none" stroke="${BORDER}" stroke-width="2"/>`;

  // Footnote
  const footY = tableTop + tableHeight + 80;
  svg += `<text x="${W / 2}" y="${footY}" font-family="Arial, sans-serif" font-size="22" font-style="italic" fill="#777" text-anchor="middle">${escapeXml(data.footnote)}</text>`;

  // Brand mark
  svg += `<text x="${W / 2}" y="${H - 60}" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#999" text-anchor="middle" letter-spacing="8">FLY · FROTH</text>`;

  svg += `</svg>`;
  return { svg, W, H };
}

export interface SizeChartResult {
  buffer: Buffer;
  mimeType: 'image/png';
  width: number;
  height: number;
}

export async function generateSizeChart(productType: 'tshirt' | 'tote'): Promise<SizeChartResult> {
  const data = productType === 'tote' ? TOTE_CHART : TSHIRT_CHART;
  const { svg, W, H } = buildSizeChartSvg(data);

  const buffer = await sharp(Buffer.from(svg)).png({ quality: 95 }).toBuffer();
  return {
    buffer,
    mimeType: 'image/png',
    width: W,
    height: H,
  };
}
