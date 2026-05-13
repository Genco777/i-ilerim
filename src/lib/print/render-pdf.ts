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
}

interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
  provider: 'browserless';
}

export async function renderPdfViaBrowserless(
  html: string,
  opts: PdfOptions = {},
): Promise<PdfResult | null> {
  const baseUrl = process.env.BROWSERLESS_URL;
  const token = process.env.BROWSERLESS_TOKEN;

  if (!baseUrl || !token) return null;

  const format = opts.format ?? 'A4';
  const marginMm = opts.marginMm ?? 3;
  const marginPx = Math.round((marginMm / 25.4) * 96);

  const payload: Record<string, unknown> = {
    html,
    options: {
      format,
      landscape: opts.landscape === true,
      printBackground: opts.printBackground !== false,
      margin: { top: marginPx, bottom: marginPx, left: marginPx, right: marginPx },
      scale: opts.scale ?? 1,
    },
  };

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

  return { buffer, sizeBytes: buffer.length, provider: 'browserless' };
}

/**
 * Returns a Buffer directly — will never be null.
 * Tries Browserless first, then throws if unavailable.
 * Callers should catch and fall back to local bridge.
 */
export async function renderPdf(html: string, opts?: PdfOptions): Promise<PdfResult> {
  const result = await renderPdfViaBrowserless(html, opts);
  if (result) return result;
  throw new Error(
    'Browserless not configured. Set BROWSERLESS_URL and BROWSERLESS_TOKEN env vars, ' +
    'or use the local agent bridge (scripts/local-agent.ts) for PDF rendering.',
  );
}
