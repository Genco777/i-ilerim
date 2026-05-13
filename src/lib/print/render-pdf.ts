/**
 * Serverless PDF rendering via Browserless.io.
 * Falls back gracefully if Browserless is not configured.
 *
 * Env vars:
 *   BROWSERLESS_URL  — e.g. https://chrome.browserless.io
 *   BROWSERLESS_TOKEN — API token
 *
 * Without these, returns null — caller should use local bridge fallback.
 */

interface PdfOptions {
  format?: 'A4' | 'A5' | 'A6' | 'Letter' | 'DL';
  landscape?: boolean;
  printBackground?: boolean;
  marginMm?: number;
  scale?: number;
  /** Enable CMYK color profile conversion for professional print */
  cmyk?: boolean;
  /** Add crop/bleed/registration marks */
  cropMarks?: boolean;
  bleedMm?: number;
  /** PDF metadata */
  title?: string;
  author?: string;
  subject?: string;
}

interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
  provider: 'browserless';
  cmykEnabled: boolean;
  cropMarksEnabled: boolean;
}

/** Crop marks CSS injected before </head> */
function cropMarksCSS(bleedMm: number, pageW: number, pageH: number): string {
  const bleedPx = Math.round((bleedMm / 25.4) * 96);
  const dpi = 96;
  const wPx = Math.round((pageW / 25.4) * dpi);
  const hPx = Math.round((pageH / 25.4) * dpi);
  return `
  /* ── Crop & Registration Marks (auto-generated) ── */
  @page { size: ${pageW}mm ${pageH}mm; margin: ${bleedMm}mm; }
  body::after {
    content: '';
    position: fixed;
    pointer-events: none;
    z-index: 99999;
    top: 0; left: 0; right: 0; bottom: 0;
    border: ${bleedPx}px solid rgba(255,0,0,0.08);
  }
  @media print {
    @page {
      marks: crop cross;
      bleed: ${bleedMm}mm;
    }
  }
  .crop-mark { display: none; }
  @media screen {
    .crop-mark {
      display: block;
      position: absolute;
      width: 12px;
      height: 12px;
      border-color: #000000;
      border-style: solid;
      opacity: 0.3;
      z-index: 100000;
    }
    .crop-mark.tl { top: ${bleedPx}px; left: ${bleedPx}px; border-width: 1px 0 0 1px; }
    .crop-mark.tr { top: ${bleedPx}px; right: ${bleedPx}px; border-width: 1px 1px 0 0; }
    .crop-mark.bl { bottom: ${bleedPx}px; left: ${bleedPx}px; border-width: 0 0 1px 1px; }
    .crop-mark.br { bottom: ${bleedPx}px; right: ${bleedPx}px; border-width: 0 1px 1px 0; }
    .reg-mark { display: block; position: absolute; z-index: 100000; opacity: 0.3; }
    .reg-mark.top-center { top: ${bleedPx - 6}px; left: 50%; width: 20px; height: 10px; border-left: 0.5px solid #000; border-right: 0.5px solid #000; transform: translateX(-50%); }
    .reg-mark.bottom-center { bottom: ${bleedPx - 6}px; left: 50%; width: 20px; height: 10px; border-left: 0.5px solid #000; border-right: 0.5px solid #000; transform: translateX(-50%); }
  }`;
}

/** CMYK color profile CSS — injects printer-friendly color adjustments */
function cmykCSS(): string {
  return `
  /* ── CMYK Color Profile (print optimization) ── */
  @media print {
    * {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    /* Boost contrast for CMYK conversion */
    img { color-profile: sRGB; rendering-intent: relative-colorimetric; }
  }`;
}

/** CMYK-aware Browserless payload preparation */
function prepareBrowserlessPayload(
  html: string,
  opts: PdfOptions,
): { html: string; payload: Record<string, unknown> } {
  const format = opts.format ?? 'A4';
  const marginMm = opts.marginMm ?? 3;
  const marginPx = Math.round((marginMm / 25.4) * 96);
  const bleedMm = opts.bleedMm ?? marginMm;

  let enhancedHtml = html;

  // Inject CMYK profile CSS if enabled
  if (opts.cmyk) {
    enhancedHtml = enhancedHtml.replace('</head>', `${cmykCSS()}</head>`);
  }

  // Inject crop marks if enabled
  if (opts.cropMarks) {
    const formats: Record<string, [number, number]> = {
      'A4': [210, 297], 'A5': [148, 210], 'A6': [105, 148],
      'Letter': [216, 279], 'DL': [99, 210],
    };
    const [w, h] = formats[format] ?? [210, 297];
    const cropCSS = cropMarksCSS(bleedMm, w!, h!);
    enhancedHtml = enhancedHtml.replace('</head>', `${cropCSS}</head>`);
    // Add crop mark elements before </body>
    const marks = `
    <div class="crop-mark tl" aria-hidden="true"></div>
    <div class="crop-mark tr" aria-hidden="true"></div>
    <div class="crop-mark bl" aria-hidden="true"></div>
    <div class="crop-mark br" aria-hidden="true"></div>
    <div class="reg-mark top-center" aria-hidden="true"></div>
    <div class="reg-mark bottom-center" aria-hidden="true"></div>`;
    enhancedHtml = enhancedHtml.replace('</body>', `${marks}</body>`);
  }

  const payload: Record<string, unknown> = {
    html: enhancedHtml,
    options: {
      format,
      landscape: opts.landscape === true,
      printBackground: opts.printBackground !== false,
      margin: { top: marginPx, bottom: marginPx, left: marginPx, right: marginPx },
      scale: opts.scale ?? 1,
      displayHeaderFooter: false,
      preferCSSPageSize: true,
    },
  };

  return { html: enhancedHtml, payload };
}

export async function renderPdfViaBrowserless(
  html: string,
  opts: PdfOptions = {},
): Promise<PdfResult | null> {
  const baseUrl = process.env.BROWSERLESS_URL;
  const token = process.env.BROWSERLESS_TOKEN;

  if (!baseUrl || !token) return null;

  const { payload } = prepareBrowserlessPayload(html, opts);

  const url = `${baseUrl}/pdf?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Browserless PDF failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  return {
    buffer,
    sizeBytes: buffer.length,
    provider: 'browserless',
    cmykEnabled: opts.cmyk === true,
    cropMarksEnabled: opts.cropMarks === true,
  };
}

/**
 * Merge multiple HTML pages into a single PDF-friendly HTML document.
 * Each page uses page-break-after to produce one PDF file from multiple sources.
 */
export function mergeHtmlForPdf(pages: Array<{ html: string; title?: string }>): string {
  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${pages[0]?.title ?? 'Print Document'}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  .page { page-break-after: always; page-break-inside: avoid; }
  .page:last-child { page-break-after: auto; }
  @media print {
    .page { width: 100%; height: auto; }
  }
</style>
</head>
<body>
${pages.map((p, i) => `<div class="page" data-page="${i + 1}">${p.html}</div>`).join('\n')}
</body>
</html>`;
}

/**
 * Returns a Buffer directly — will never be null.
 * Tries Browserless first, then throws if unavailable.
 */
export async function renderPdf(html: string, opts?: PdfOptions): Promise<PdfResult> {
  const result = await renderPdfViaBrowserless(html, opts);
  if (result) return result;
  throw new Error(
    'Browserless not configured. Set BROWSERLESS_URL and BROWSERLESS_TOKEN env vars, ' +
    'or use the local agent bridge (scripts/local-agent.ts) for PDF rendering.',
  );
}

/**
 * Render HTML to PNG screenshot via Browserless.io.
 * Used for instant design preview in Telegram.
 */
export async function renderPngViaBrowserless(
  html: string,
  opts?: { viewportWidth?: number; viewportHeight?: number; fullPage?: boolean },
): Promise<{ buffer: Buffer; sizeBytes: number } | null> {
  const baseUrl = process.env.BROWSERLESS_URL;
  const token = process.env.BROWSERLESS_TOKEN;
  if (!baseUrl || !token) return null;

  const vpW = opts?.viewportWidth ?? 800;
  const vpH = opts?.viewportHeight ?? 1132;

  const payload = {
    html,
    options: {
      type: 'png' as const,
      fullPage: opts?.fullPage !== false,
      viewport: { width: vpW, height: vpH, deviceScaleFactor: 2 },
    },
  };

  const url = `${baseUrl}/screenshot?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Browserless screenshot failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const arrayBuf = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuf);

  return { buffer, sizeBytes: buffer.length };
}

/**
 * Upload a buffer to Vercel Blob and return the public URL.
 * Returns null if Blob is not configured or upload fails.
 */
export async function uploadToBlob(
  buffer: Buffer | Uint8Array,
  filename: string,
  contentType: string = 'image/png',
): Promise<string | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://blob.vercel-storage.com/${filename}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'X-Cache-Control-Max-Age': '31536000',
      },
      body: new Uint8Array(buffer),
    });
    if (res.ok) {
      const data = await res.json() as { url?: string };
      return data.url ?? null;
    }
    return null;
  } catch {
    return null;
  }
}
