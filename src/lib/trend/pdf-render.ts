/**
 * PDF page → PNG rasterizer.
 *
 * Why we need this (V-1 architecture):
 *   Before: AI hero (gpt-image-2) showed an IMAGINED planner cover; the actual
 *   PDF the customer downloads has a different cover. Mockups composited the AI
 *   image into laptops/tablets → buyer expected one thing, received another.
 *
 *   After: we render the ACTUAL PDF's first page to a PNG and use that as the
 *   marketing hero. Mockups now show literally what the buyer gets.
 *
 * Stack: pdfjs-dist (Mozilla, pure JS, server-safe) + @napi-rs/canvas
 * (prebuilt Lambda binaries, no Cairo dependency). Both bundle cleanly into
 * Vercel's Node.js 22 runtime.
 *
 * Used by:
 *   src/lib/trend/orchestrator.ts   (replace AI hero with PDF cover render)
 *   src/lib/trend/visual.ts         (compose mockups around real PDF)
 */

import { createCanvas, type Canvas } from '@napi-rs/canvas';
// Use the legacy build — pure ES modules without DOM globals, works in Node 22.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// pdfjs needs a worker; in Node we run synchronous (no Web Worker).
// The .mjs build supports `disableWorker: true`.
// We do this lazily inside renderPdfPagesToPng to avoid top-level side effects.

export interface PageRender {
  /** 1-indexed page number rendered */
  page: number;
  /** PNG-encoded image */
  buffer: Buffer;
  /** Pixel dimensions of the render */
  width: number;
  height: number;
}

export interface RenderOptions {
  /**
   * Pages to render (1-indexed). Default: [1] (cover only).
   * Pass [1, 2, 3, 4] for a 4-page preview gallery.
   */
  pages?: number[];
  /**
   * Render scale factor. 1.0 = native PDF pixels (~72dpi). For high-res hero
   * images use 3.0–4.0 (≈216–288dpi). Default: 3.0 (≈ 1750×2475 for A4).
   */
  scale?: number;
}

/**
 * Render selected pages of a PDF to PNG buffers.
 *
 * @throws if a requested page number is out of range, or pdfjs fails to parse
 *         (e.g. corrupted buffer). Caller should catch and fall back gracefully.
 */
export async function renderPdfPagesToPng(
  pdfBuffer: Buffer,
  opts: RenderOptions = {},
): Promise<PageRender[]> {
  const scale = opts.scale ?? 3.0;
  const pagesRequested = opts.pages ?? [1];

  // pdfjs accepts Uint8Array.
  const data = new Uint8Array(pdfBuffer);

  // Disable worker — we're on Node, synchronous is fine. Setting workerPort to
  // null is the documented way for Node usage of pdfjs-dist legacy build.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loadingTask = (pdfjs as any).getDocument({
    data,
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: false,
    // Default fonts shipped with pdfjs — needed for built-in PDF fonts like
    // Helvetica, which react-pdf uses by default for our PDFs.
    standardFontDataUrl: undefined,
  });
  const doc = await loadingTask.promise;

  const out: PageRender[] = [];
  try {
    for (const pageNum of pagesRequested) {
      if (pageNum < 1 || pageNum > doc.numPages) {
        throw new Error(
          `Page ${pageNum} out of range (PDF has ${doc.numPages} pages)`,
        );
      }
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);

      const canvas: Canvas = createCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // White background — PDFs are transparent by default which renders as
      // black in PNG. Most planners/templates assume white paper.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // pdfjs renderTask types CanvasRenderingContext2D from DOM; @napi-rs/canvas
      // provides the same interface but its types don't align perfectly.
      const renderTask = page.render({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        canvasContext: ctx as any,
        viewport,
      });
      await renderTask.promise;

      const buffer = canvas.toBuffer('image/png');
      out.push({ page: pageNum, buffer, width, height });

      page.cleanup();
    }
  } finally {
    await doc.cleanup();
    await doc.destroy();
  }

  return out;
}

/**
 * Convenience: render only page 1 at high res. Used as the marketing hero.
 *
 * @param pdfBuffer Generated PDF
 * @param scale Pixel scale (default 3.0 → ~1750×2475 for A4)
 */
export async function renderPdfCoverToPng(
  pdfBuffer: Buffer,
  scale = 3.0,
): Promise<Buffer> {
  const renders = await renderPdfPagesToPng(pdfBuffer, { pages: [1], scale });
  if (renders.length === 0) {
    throw new Error('PDF cover render produced no pages');
  }
  return renders[0].buffer;
}
