/**
 * Sprint G — Personalization (Pro Tier)
 *
 * When a Pro tier buyer provides a custom name + optional date, we generate
 * a personalised version of the PDF by:
 *   1. Fetching the original PDF from Blob.
 *   2. Loading the cover image (already stored on products.hero_image_url).
 *   3. Sharp-overlaying "For {Name}" + optional date in the bottom-right
 *      corner of the cover.
 *   4. Building a fresh PDF where page 1 is the personalised cover, the
 *      remaining pages are pulled from the original PDF as-is.
 *   5. Uploading to Blob → returning the new URL.
 *
 * Why Sharp instead of regenerating the whole PDF via react-pdf?
 *   - Cheap: ~200ms per personalisation, no Banana / Pixverse cost
 *   - Reliable: deterministic Sharp text overlay never fails
 *   - Sufficient: most buyers just want "For Sarah" on the cover, not a
 *     full content rewrite
 *
 * Future: actual content rewrite (planner pages addressed to the buyer)
 * is its own sprint — needs Claude pass + react-pdf re-render.
 */

import { db } from '@/lib/db';
import { products } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { uploadImage } from '@/lib/blob';

interface PersonalizeResult {
  url: string;
  pathname: string;
}

/**
 * Build a personalised PDF for a sale. Returns the URL of the regenerated
 * PDF, or null if personalisation failed (caller falls back to original).
 */
export async function personalizeProductPdf(
  productId: string,
  saleId: string,
  customName: string,
  customDate: string | null,
): Promise<PersonalizeResult | null> {
  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const product = productRows[0];
  if (!product) return null;
  if (!product.hero_image_url || !product.digital_file_url) {
    console.warn('[personalize] product missing hero or digital file — skip', productId);
    return null;
  }

  try {
    const sharpMod = (await import('sharp')).default;

    // 1. Fetch original cover image
    const coverRes = await fetch(product.hero_image_url);
    if (!coverRes.ok) throw new Error(`cover fetch ${coverRes.status}`);
    const coverBuf = Buffer.from(await coverRes.arrayBuffer());

    // 2. Build the overlay SVG — corner text "For {Name} · {Date}"
    const cleanName = customName.trim().slice(0, 40);
    const cleanDate = customDate ? customDate.trim().slice(0, 30) : '';
    const overlayLine = cleanDate ? `For ${cleanName}  ·  ${cleanDate}` : `For ${cleanName}`;

    const meta = await sharpMod(coverBuf).metadata();
    const w = meta.width ?? 1600;
    const h = meta.height ?? 2000;

    // Position the text in bottom-right corner with a translucent rounded
    // background so it stays readable on busy artwork.
    const fontSize = Math.round(w * 0.025); // ~40px on 1600px image
    const padX = Math.round(w * 0.04);
    const padY = Math.round(h * 0.04);

    const overlaySvg = Buffer.from(`
      <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
        <text
          x="${w - padX}"
          y="${h - padY}"
          text-anchor="end"
          font-family="Georgia, 'Times New Roman', serif"
          font-size="${fontSize}"
          font-style="italic"
          fill="#1a1a1a"
          opacity="0.85"
        >${escapeXml(overlayLine)}</text>
      </svg>
    `);

    // 3. Composite overlay over cover (PNG so quality stays crisp)
    const personalizedCover = await sharpMod(coverBuf)
      .composite([{ input: overlaySvg, top: 0, left: 0 }])
      .png({ quality: 92 })
      .toBuffer();

    // 4. For MVP, we replace the cover image in a fresh PDF.
    // Build a minimal one-page PDF that holds the personalised cover, then
    // merge with the original PDF (cover skipped) via pdf-lib.
    const pdfLib = await import('pdf-lib');
    const { PDFDocument } = pdfLib;

    // Fetch original PDF
    const origPdfRes = await fetch(product.digital_file_url);
    if (!origPdfRes.ok) throw new Error(`pdf fetch ${origPdfRes.status}`);
    const origPdfBytes = new Uint8Array(await origPdfRes.arrayBuffer());
    const origPdf = await PDFDocument.load(origPdfBytes);

    // Build the personalised PDF: page 1 = personalised cover, pages 2..N = original pages 2..N
    const newPdf = await PDFDocument.create();
    const pngImage = await newPdf.embedPng(personalizedCover);

    // First page sized to original first page
    const origPages = origPdf.getPages();
    if (origPages.length === 0) throw new Error('original pdf empty');
    const firstPage = origPages[0]!;
    const firstSize = firstPage.getSize();

    const coverPage = newPdf.addPage([firstSize.width, firstSize.height]);
    coverPage.drawImage(pngImage, {
      x: 0,
      y: 0,
      width: firstSize.width,
      height: firstSize.height,
    });

    // Copy pages 2..N from original
    if (origPages.length > 1) {
      const remaining = await newPdf.copyPages(
        origPdf,
        Array.from({ length: origPages.length - 1 }, (_, i) => i + 1),
      );
      for (const p of remaining) newPdf.addPage(p);
    }

    const newPdfBytes = await newPdf.save();
    const newPdfBuf = Buffer.from(newPdfBytes);

    // 5. Upload to Blob
    const ts = Date.now();
    const filename = `trend/${productId}/personalized-${saleId}-${ts}.pdf`;
    const uploaded = await uploadImage(newPdfBuf, filename, 'application/pdf');

    return { url: uploaded.url, pathname: uploaded.pathname };
  } catch (err) {
    console.error('[personalize] failed', err);
    return null;
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
