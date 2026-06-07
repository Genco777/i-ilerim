/**
 * Canva Instructions PDF Builder — Sprint I, Agent 2
 *
 * Builds the "How to use your Canva template" guide PDF that ships with every
 * Editable Canva tier purchase. The buyer downloads two files from Etsy:
 *
 *   1. <product>.pdf                         ← the printable design
 *   2. <product>-canva-instructions.pdf      ← THIS file (rendered here)
 *
 * Content (max 4 pages, A4 portrait):
 *   1. Cover            — brand mark, product title, "Editable Canva Template"
 *   2. Step-by-step     — 4 numbered steps + large QR code linking to Canva
 *   3. Preview          — optional; shows the actual design the buyer will edit
 *   4. FAQ + Support    — 3-4 common Qs + info@fly-froth.com contact line
 *
 * Brand: premium-vizyon — indigo `#5B6BB0` accent on `#FCFCFC` background,
 *        editorial typography (Outfit fallback → Helvetica), generous margins,
 *        uppercase eyebrows with wide tracking. NO blur, NO emoji.
 *
 * Output: Buffer + uploaded Vercel Blob URL (public, application/pdf).
 *
 * Used by:
 *   src/lib/trend/orchestrator.ts          (when product.tier === 'editable')
 *   src/lib/trend/approval-handlers.ts     (on approve, attach to Etsy listing)
 *
 * Sister modules:
 *   src/lib/canva/generate.ts              (Canva Connect API client)
 *   src/lib/canva/share-url.ts             (Agent 1 — produces canvaShareUrl)
 */

import {
  Document,
  Page,
  Text,
  View,
  Image as PdfImage,
  Svg,
  Path,
  Rect,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import * as React from 'react';
import { PALETTE_LIGHT, FONT_STACK, BRAND_MARK } from '@/lib/brand/premium-tokens';
import { uploadImage } from '@/lib/blob';

// ─── Public API ──────────────────────────────────────────────────────────────

export interface InstructionsPdfOpts {
  /** Product name shown on the cover (e.g. "Modern Wedding Invitation Suite"). */
  productTitle: string;
  /** Canva share URL the QR code & "Open template" step both point at. */
  canvaShareUrl: string;
  /** Optional PNG preview of the Canva design. When present a preview page is included. */
  previewImageUrl?: string;
  /** Output language. Defaults to 'en' (Etsy core market). */
  language?: 'en' | 'de';
}

export interface InstructionsPdfResult {
  /** Raw PDF bytes. */
  buffer: Buffer;
  /** Public Vercel Blob URL (application/pdf). */
  url: string;
  /** Convenience size in bytes (== buffer.byteLength). */
  sizeBytes: number;
}

/**
 * Build & upload the Canva instructions PDF.
 *
 * @throws if `canvaShareUrl` is empty/blank — caller MUST resolve a share URL
 *         (via canva/share-url.ts) before invoking this builder.
 */
export async function buildInstructionsPdf(
  opts: InstructionsPdfOpts,
): Promise<InstructionsPdfResult> {
  const shareUrl = (opts.canvaShareUrl ?? '').trim();
  if (!shareUrl) {
    throw new Error('[instructions-pdf] canvaShareUrl is required');
  }
  if (!opts.productTitle || !opts.productTitle.trim()) {
    throw new Error('[instructions-pdf] productTitle is required');
  }

  const language: 'en' | 'de' = opts.language ?? 'en';
  const copy = COPY[language];

  // 1. Generate QR as PNG buffer (qrcode package, M-margin / H error-correction).
  const qrPng = await renderQrPng(shareUrl);

  // 2. Optionally fetch & compress the preview image so PDF stays <2 MB.
  let previewBuffer: Buffer | null = null;
  if (opts.previewImageUrl) {
    try {
      previewBuffer = await fetchAndCompressPreview(opts.previewImageUrl);
    } catch (err) {
      // Non-fatal — preview page just gets skipped.
      console.warn('[instructions-pdf] preview fetch failed, skipping preview page', err);
    }
  }

  // 3. Render the react-pdf document → Buffer.
  const doc = buildDocument({
    productTitle: opts.productTitle.trim(),
    shareUrl,
    qrPng,
    previewBuffer,
    copy,
  });
  const blob = await pdf(doc).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 4. Upload to Vercel Blob (application/pdf, random suffix).
  const filename = buildFilename(opts.productTitle, language);
  const uploaded = await uploadImage(buffer, filename, 'application/pdf');

  return {
    buffer,
    url: uploaded.url,
    sizeBytes: buffer.byteLength,
  };
}

// ─── Localised copy ──────────────────────────────────────────────────────────

interface Copy {
  coverEyebrow: string;
  coverTagline: string;
  stepsEyebrow: string;
  stepsTitle: string;
  steps: Array<{ heading: string; body: string }>;
  qrCaption: string;
  previewEyebrow: string;
  previewTitle: string;
  previewSubtitle: string;
  faqEyebrow: string;
  faqTitle: string;
  faqs: Array<{ q: string; a: string }>;
  supportEyebrow: string;
  supportLine: string;
  supportEmail: string;
  pageLabelCover: string;
  pageLabelSteps: string;
  pageLabelPreview: string;
  pageLabelFaq: string;
}

const COPY: Record<'en' | 'de', Copy> = {
  en: {
    coverEyebrow: 'Editable Canva Template',
    coverTagline: 'Customise fully — print at home.',
    stepsEyebrow: 'Getting Started',
    stepsTitle: 'Four steps to your custom design',
    steps: [
      {
        heading: 'Click the link or scan the QR code',
        body: 'Tap the QR with your phone camera, or open the link printed below it on any computer.',
      },
      {
        heading: 'Sign in to Canva',
        body: 'A free Canva account is all you need. Sign up at canva.com if you do not have one yet.',
      },
      {
        heading: 'Click "Use template"',
        body: 'Canva opens an editable copy in your own account. Edit text, swap colours, replace images — everything is unlocked.',
      },
      {
        heading: 'Download as PDF (300 DPI)',
        body: 'Choose Share → Download → PDF Print. Print at home or send the file to your local print shop.',
      },
    ],
    qrCaption: 'Scan to open your template',
    previewEyebrow: 'Your Template',
    previewTitle: "This is what you'll start with",
    previewSubtitle: 'Every element — text, colours, fonts, images — is fully editable inside Canva.',
    faqEyebrow: 'Quick Answers',
    faqTitle: 'Frequently asked questions',
    faqs: [
      {
        q: 'Do I need Canva Pro?',
        a: 'No. The template works with a free Canva account. A Pro subscription is only needed if you swap in premium stock photos or elements.',
      },
      {
        q: 'Can I share the template with someone else?',
        a: 'For personal use you may print the design as many times as you wish. Re-sharing or reselling the template itself is not permitted.',
      },
      {
        q: 'Which paper size should I print on?',
        a: 'The template is set up at A4 / US Letter. You can change the page size inside Canva from Resize → Custom dimensions.',
      },
      {
        q: 'My fonts look different after editing — why?',
        a: 'Canva substitutes fonts that are not loaded in your region. Use the font picker to pick a similar Canva-bundled font if you see a mismatch.',
      },
    ],
    supportEyebrow: 'Need Help?',
    supportLine: 'Reach out and we will reply within one working day.',
    supportEmail: 'info@fly-froth.com',
    pageLabelCover: '01 — Cover',
    pageLabelSteps: '02 — Step-by-step',
    pageLabelPreview: '03 — Preview',
    pageLabelFaq: '04 — FAQ & Support',
  },
  de: {
    coverEyebrow: 'Bearbeitbare Canva-Vorlage',
    coverTagline: 'Vollständig anpassbar — zu Hause ausdrucken.',
    stepsEyebrow: 'Erste Schritte',
    stepsTitle: 'In vier Schritten zu Ihrem eigenen Design',
    steps: [
      {
        heading: 'Link anklicken oder QR-Code scannen',
        body: 'Scannen Sie den QR-Code mit Ihrer Handykamera oder öffnen Sie den darunter abgedruckten Link am Computer.',
      },
      {
        heading: 'Bei Canva anmelden',
        body: 'Ein kostenloses Canva-Konto genügt. Registrieren Sie sich bei Bedarf unter canva.com.',
      },
      {
        heading: 'Auf "Vorlage verwenden" klicken',
        body: 'Canva legt eine bearbeitbare Kopie in Ihrem Konto an. Texte, Farben und Bilder lassen sich frei anpassen.',
      },
      {
        heading: 'Als PDF herunterladen (300 dpi)',
        body: 'Wählen Sie Teilen → Herunterladen → PDF für Druck. Drucken Sie zu Hause oder bei Ihrer Druckerei vor Ort.',
      },
    ],
    qrCaption: 'Scannen Sie, um Ihre Vorlage zu öffnen',
    previewEyebrow: 'Ihre Vorlage',
    previewTitle: 'So sieht Ihre Ausgangsdatei aus',
    previewSubtitle: 'Jedes Element — Text, Farben, Schriften, Bilder — ist in Canva vollständig bearbeitbar.',
    faqEyebrow: 'Häufige Fragen',
    faqTitle: 'Antworten auf die häufigsten Fragen',
    faqs: [
      {
        q: 'Benötige ich Canva Pro?',
        a: 'Nein. Die Vorlage funktioniert mit einem kostenlosen Canva-Konto. Pro ist nur erforderlich, wenn Sie kostenpflichtige Stockfotos oder Elemente einfügen möchten.',
      },
      {
        q: 'Darf ich die Vorlage weitergeben?',
        a: 'Für den persönlichen Gebrauch dürfen Sie das Design beliebig oft ausdrucken. Eine Weitergabe oder ein Weiterverkauf der Vorlage selbst ist nicht gestattet.',
      },
      {
        q: 'Welche Papiergröße sollte ich verwenden?',
        a: 'Die Vorlage ist auf A4 / US-Letter eingerichtet. Über Größe ändern → Benutzerdefiniert können Sie das Format in Canva anpassen.',
      },
      {
        q: 'Warum sehen meine Schriften nach dem Bearbeiten anders aus?',
        a: 'Canva ersetzt Schriften, die in Ihrer Region nicht verfügbar sind. Wählen Sie über die Schriftauswahl eine ähnliche Canva-Schrift, falls Sie eine Abweichung sehen.',
      },
    ],
    supportEyebrow: 'Brauchen Sie Hilfe?',
    supportLine: 'Schreiben Sie uns — wir antworten innerhalb eines Werktags.',
    supportEmail: 'info@fly-froth.com',
    pageLabelCover: '01 — Titelseite',
    pageLabelSteps: '02 — Schritt für Schritt',
    pageLabelPreview: '03 — Vorschau',
    pageLabelFaq: '04 — FAQ & Support',
  },
};

// ─── Brand palette aliases (single source: premium-tokens.ts) ────────────────

const C = {
  bg: PALETTE_LIGHT.background,           // #FCFCFC
  bgMuted: PALETTE_LIGHT.backgroundMuted, // #F2F4F8
  ink: PALETTE_LIGHT.foreground,          // #1D2233
  muted: PALETTE_LIGHT.mutedForeground,   // #6E7488
  accent: PALETTE_LIGHT.primary,          // #5B6BB0
  accentLight: PALETTE_LIGHT.primaryLight,// #8C99CC
  accentInk: '#FFFFFF',
  card: PALETTE_LIGHT.card,               // #FFFFFF
  border: PALETTE_LIGHT.border,           // #D8DCE5
};

/**
 * react-pdf does NOT auto-load the Outfit web font, and we deliberately avoid
 * registering it here to keep this module zero-asset (no .ttf shipped, no
 * font-download cold-start). The premium tokens declare an Outfit→Inter→
 * Helvetica fallback stack; PDF rendering picks up the last safe entry,
 * which is Helvetica — the standard PDF base-14 face. Editorial hierarchy
 * is preserved via tracking, weight and case.
 */
const FONT_FAMILY = 'Helvetica';
const FONT_FAMILY_BOLD = 'Helvetica-Bold';

// FONT_STACK referenced so it remains a tracked import — used by docs / future
// switch to a TTF-registered Outfit. (Lint-safe sink.)
void FONT_STACK;

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Shared ─────────────────────────────────────────────────────────────────
  page: {
    paddingTop: 72,
    paddingBottom: 72,
    paddingHorizontal: 64,
    fontFamily: FONT_FAMILY,
    fontSize: 10.5,
    color: C.ink,
    backgroundColor: C.bg,
    lineHeight: 1.55,
  },
  eyebrow: {
    fontSize: 8,
    letterSpacing: 3,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 14,
    fontFamily: FONT_FAMILY_BOLD,
  },
  h1: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 28,
    letterSpacing: -0.6,
    lineHeight: 1.15,
    color: C.ink,
    marginBottom: 18,
    maxWidth: 420,
  },
  hairline: {
    width: 44,
    height: 1.5,
    backgroundColor: C.accent,
    marginBottom: 26,
  },
  body: {
    fontSize: 11,
    lineHeight: 1.6,
    color: C.ink,
    marginBottom: 8,
  },
  bodyMuted: {
    fontSize: 10,
    lineHeight: 1.55,
    color: C.muted,
  },
  footer: {
    position: 'absolute',
    bottom: 32,
    left: 64,
    right: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 7.5,
    letterSpacing: 2,
    color: C.muted,
    textTransform: 'uppercase',
  },

  // ── Cover ──────────────────────────────────────────────────────────────────
  coverPage: {
    backgroundColor: C.bg,
    fontFamily: FONT_FAMILY,
    color: C.ink,
  },
  coverAccentBar: {
    backgroundColor: C.accent,
    height: 8,
    width: '100%',
  },
  coverInner: {
    paddingTop: 110,
    paddingHorizontal: 64,
    paddingBottom: 72,
    flex: 1,
  },
  coverBrandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 90,
  },
  coverBrandName: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 11,
    letterSpacing: 3,
    color: C.ink,
    textTransform: 'uppercase',
  },
  coverBrandTag: {
    fontSize: 8.5,
    letterSpacing: 2,
    color: C.muted,
    textTransform: 'uppercase',
    marginTop: 4,
  },
  coverEyebrow: {
    fontSize: 9,
    letterSpacing: 4,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 22,
    fontFamily: FONT_FAMILY_BOLD,
  },
  coverTitle: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 38,
    letterSpacing: -1.2,
    lineHeight: 1.1,
    color: C.ink,
    marginBottom: 28,
    maxWidth: 440,
  },
  coverTagline: {
    fontSize: 14,
    lineHeight: 1.45,
    fontStyle: 'italic',
    color: C.muted,
    maxWidth: 380,
  },
  coverBottomRule: {
    position: 'absolute',
    bottom: 90,
    left: 64,
    right: 64,
    borderTopWidth: 0.5,
    borderTopColor: C.border,
  },
  coverFooter: {
    position: 'absolute',
    bottom: 56,
    left: 64,
    right: 64,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.muted,
    textTransform: 'uppercase',
  },

  // ── Steps ──────────────────────────────────────────────────────────────────
  stepsHeader: {
    marginBottom: 28,
  },
  stepsBody: {
    flexDirection: 'row',
    marginTop: 4,
  },
  stepsList: {
    flex: 1,
    paddingRight: 28,
  },
  stepRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  stepNumber: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 22,
    lineHeight: 1.05,
    color: C.accent,
    width: 36,
    letterSpacing: -1,
  },
  stepContent: {
    flex: 1,
    paddingTop: 2,
  },
  stepHeading: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 12,
    color: C.ink,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  stepBody: {
    fontSize: 10,
    lineHeight: 1.5,
    color: C.muted,
  },
  qrColumn: {
    width: 200,
    alignItems: 'center',
  },
  qrFrame: {
    padding: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 6,
  },
  qrImage: {
    width: 170,
    height: 170,
  },
  qrCaption: {
    fontSize: 8,
    letterSpacing: 2.5,
    color: C.muted,
    textTransform: 'uppercase',
    marginTop: 14,
    textAlign: 'center',
  },
  qrUrl: {
    fontSize: 7.5,
    color: C.accent,
    marginTop: 6,
    textAlign: 'center',
    maxWidth: 180,
  },

  // ── Preview ────────────────────────────────────────────────────────────────
  previewWrap: {
    marginTop: 14,
    padding: 16,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    maxHeight: 470,
    objectFit: 'contain',
  },
  previewCaption: {
    fontSize: 9,
    color: C.muted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 18,
    textAlign: 'center',
  },

  // ── FAQ ────────────────────────────────────────────────────────────────────
  faqItem: {
    marginBottom: 16,
    paddingBottom: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: C.border,
  },
  faqQ: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 11,
    color: C.ink,
    marginBottom: 6,
    letterSpacing: -0.1,
  },
  faqA: {
    fontSize: 10,
    lineHeight: 1.55,
    color: C.muted,
  },
  supportBlock: {
    marginTop: 22,
    padding: 22,
    backgroundColor: C.bgMuted,
    borderRadius: 8,
  },
  supportEyebrow: {
    fontSize: 8,
    letterSpacing: 3,
    color: C.accent,
    textTransform: 'uppercase',
    marginBottom: 10,
    fontFamily: FONT_FAMILY_BOLD,
  },
  supportLine: {
    fontSize: 11,
    color: C.ink,
    marginBottom: 6,
    lineHeight: 1.5,
  },
  supportEmail: {
    fontFamily: FONT_FAMILY_BOLD,
    fontSize: 13,
    color: C.accent,
    letterSpacing: -0.2,
  },
});

// ─── Document builder ────────────────────────────────────────────────────────

interface BuildArgs {
  productTitle: string;
  shareUrl: string;
  qrPng: Buffer;
  previewBuffer: Buffer | null;
  copy: Copy;
}

function buildDocument(args: BuildArgs): React.ReactElement {
  const { productTitle, shareUrl, qrPng, previewBuffer, copy } = args;

  return React.createElement(
    Document,
    {
      title: `${productTitle} — Canva Instructions`,
      author: BRAND_MARK.name,
      subject: 'Editable Canva template — buyer instructions',
      creator: BRAND_MARK.name,
    },
    [
      renderCoverPage(productTitle, copy),
      renderStepsPage(qrPng, shareUrl, copy),
      previewBuffer ? renderPreviewPage(previewBuffer, copy) : null,
      renderFaqPage(copy),
    ].filter(Boolean) as React.ReactElement[],
  );
}

// ─── Pages ───────────────────────────────────────────────────────────────────

function renderCoverPage(productTitle: string, copy: Copy): React.ReactElement {
  // Long-title soft wrap: react-pdf wraps automatically inside maxWidth, so we
  // only collapse extreme whitespace runs here.
  const safeTitle = productTitle.replace(/\s+/g, ' ').trim();

  return React.createElement(
    Page,
    { key: 'cover', size: 'A4', style: styles.coverPage },
    React.createElement(View, { style: styles.coverAccentBar }),
    React.createElement(
      View,
      { style: styles.coverInner },
      React.createElement(
        View,
        { style: styles.coverBrandRow },
        React.createElement(
          View,
          {},
          React.createElement(Text, { style: styles.coverBrandName }, BRAND_MARK.name),
          React.createElement(Text, { style: styles.coverBrandTag }, BRAND_MARK.tagline),
        ),
        React.createElement(BrandMonogram, { size: 28 }),
      ),
      React.createElement(Text, { style: styles.coverEyebrow }, copy.coverEyebrow),
      React.createElement(Text, { style: styles.coverTitle }, safeTitle),
      React.createElement(Text, { style: styles.coverTagline }, copy.coverTagline),
    ),
    React.createElement(View, { style: styles.coverBottomRule }),
    React.createElement(
      View,
      { style: styles.coverFooter },
      React.createElement(Text, {}, copy.pageLabelCover),
      React.createElement(Text, {}, 'fly-froth.com'),
    ),
  );
}

function renderStepsPage(
  qrPng: Buffer,
  shareUrl: string,
  copy: Copy,
): React.ReactElement {
  return React.createElement(
    Page,
    { key: 'steps', size: 'A4', style: styles.page },
    React.createElement(
      View,
      { style: styles.stepsHeader },
      React.createElement(Text, { style: styles.eyebrow }, copy.stepsEyebrow),
      React.createElement(Text, { style: styles.h1 }, copy.stepsTitle),
      React.createElement(View, { style: styles.hairline }),
    ),
    React.createElement(
      View,
      { style: styles.stepsBody },
      React.createElement(
        View,
        { style: styles.stepsList },
        ...copy.steps.map((step, i) =>
          React.createElement(
            View,
            { key: `step-${i}`, style: styles.stepRow },
            React.createElement(Text, { style: styles.stepNumber }, String(i + 1).padStart(2, '0')),
            React.createElement(
              View,
              { style: styles.stepContent },
              React.createElement(Text, { style: styles.stepHeading }, step.heading),
              React.createElement(Text, { style: styles.stepBody }, step.body),
            ),
          ),
        ),
      ),
      React.createElement(
        View,
        { style: styles.qrColumn },
        React.createElement(
          View,
          { style: styles.qrFrame },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          React.createElement(PdfImage as any, {
            src: qrPng,
            style: styles.qrImage,
          }),
        ),
        React.createElement(Text, { style: styles.qrCaption }, copy.qrCaption),
        React.createElement(Text, { style: styles.qrUrl }, truncateUrl(shareUrl, 60)),
      ),
    ),
    React.createElement(
      View,
      { style: styles.footer },
      React.createElement(Text, {}, copy.pageLabelSteps),
      React.createElement(Text, {}, BRAND_MARK.name.toUpperCase()),
    ),
  );
}

function renderPreviewPage(previewBuffer: Buffer, copy: Copy): React.ReactElement {
  return React.createElement(
    Page,
    { key: 'preview', size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.eyebrow }, copy.previewEyebrow),
    React.createElement(Text, { style: styles.h1 }, copy.previewTitle),
    React.createElement(View, { style: styles.hairline }),
    React.createElement(Text, { style: styles.bodyMuted }, copy.previewSubtitle),
    React.createElement(
      View,
      { style: styles.previewWrap },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(PdfImage as any, {
        src: previewBuffer,
        style: styles.previewImage,
      }),
    ),
    React.createElement(
      View,
      { style: styles.footer },
      React.createElement(Text, {}, copy.pageLabelPreview),
      React.createElement(Text, {}, BRAND_MARK.name.toUpperCase()),
    ),
  );
}

function renderFaqPage(copy: Copy): React.ReactElement {
  return React.createElement(
    Page,
    { key: 'faq', size: 'A4', style: styles.page },
    React.createElement(Text, { style: styles.eyebrow }, copy.faqEyebrow),
    React.createElement(Text, { style: styles.h1 }, copy.faqTitle),
    React.createElement(View, { style: styles.hairline }),
    ...copy.faqs.map((faq, i) =>
      React.createElement(
        View,
        { key: `faq-${i}`, style: styles.faqItem },
        React.createElement(Text, { style: styles.faqQ }, faq.q),
        React.createElement(Text, { style: styles.faqA }, faq.a),
      ),
    ),
    React.createElement(
      View,
      { style: styles.supportBlock },
      React.createElement(Text, { style: styles.supportEyebrow }, copy.supportEyebrow),
      React.createElement(Text, { style: styles.supportLine }, copy.supportLine),
      React.createElement(Text, { style: styles.supportEmail }, copy.supportEmail),
    ),
    React.createElement(
      View,
      { style: styles.footer },
      React.createElement(Text, {}, copy.pageLabelFaq),
      React.createElement(Text, {}, BRAND_MARK.name.toUpperCase()),
    ),
  );
}

// ─── Brand monogram (vector, no asset dependency) ───────────────────────────

/**
 * Renders the "F & F" monogram as inline SVG inside react-pdf — avoids the
 * cold-start cost of a file read and keeps this module self-contained.
 */
function BrandMonogram({ size = 28 }: { size?: number }): React.ReactElement {
  return React.createElement(
    Svg,
    { width: size, height: size, viewBox: '0 0 32 32' },
    React.createElement(Rect, {
      x: '0',
      y: '0',
      width: '32',
      height: '32',
      rx: '6',
      fill: C.accent,
    }),
    // Stylised "F" — two horizontals, single vertical
    React.createElement(Path, {
      d: 'M9 9 L23 9 M9 9 L9 23 M9 15.5 L19 15.5',
      stroke: C.accentInk,
      strokeWidth: 2.2,
      strokeLinecap: 'square',
      fill: 'none',
    }),
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncateUrl(url: string, max: number): string {
  if (url.length <= max) return url;
  // Keep schema + start, trail with ellipsis-friendly dots.
  return `${url.slice(0, max - 3)}...`;
}

function buildFilename(productTitle: string, language: 'en' | 'de'): string {
  const slug = productTitle
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
  const base = slug || 'product';
  return `canva-instructions/${base}-${language}.pdf`;
}

// ─── QR code rendering (qrcode package, dynamic import) ─────────────────────

/**
 * Generates a high-contrast PNG QR code for the share URL.
 *
 * Sized for ~170×170pt at 300 dpi (≈ 700 px) and configured with H-level
 * error correction so the code stays scannable even when printed small or
 * partially obscured.
 *
 * NOTE: requires the `qrcode` npm package — see installation note in the
 * `__qrcodeUnavailableError` fallback message below. Until `pnpm install
 * qrcode` is run, calling buildInstructionsPdf will throw a descriptive error.
 */
async function renderQrPng(url: string): Promise<Buffer> {
  let QRCode: typeof import('qrcode');
  try {
    // Dynamic import so the package can be added in a follow-up PR without
    // blocking the rest of the canva module from compiling.
    QRCode = await import('qrcode');
  } catch {
    throw new Error(
      '[instructions-pdf] missing dependency `qrcode` — run `pnpm add qrcode && pnpm add -D @types/qrcode` in fly-froth-social',
    );
  }

  return await QRCode.toBuffer(url, {
    type: 'png',
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 700,
    color: {
      dark: C.ink,
      light: '#FFFFFF',
    },
  });
}

// ─── Preview image fetch + compression ──────────────────────────────────────

const MAX_PREVIEW_BYTES = 900 * 1024; // 900 KB hard ceiling — keeps full PDF under 2 MB

/**
 * Downloads the preview, downsamples & re-encodes via Sharp so the embedded
 * image stays under MAX_PREVIEW_BYTES. JPEG is preferred over PNG for the
 * preview because Canva designs are visually rich (gradients/photos).
 */
async function fetchAndCompressPreview(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    // 8 s — Canva CDN is usually <500 ms; the timeout exists to guarantee the
    // pipeline keeps moving if Canva is slow.
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) {
    throw new Error(`preview fetch HTTP ${res.status}`);
  }
  const raw = Buffer.from(await res.arrayBuffer());

  // Sharp is already a hard dependency (image pipeline). Resize to 1400 px
  // wide (more than enough for an A4 preview at 200 dpi) and JPEG-encode.
  const { default: sharp } = await import('sharp');
  let out = await sharp(raw)
    .rotate() // honour EXIF
    .resize({ width: 1400, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  if (out.byteLength > MAX_PREVIEW_BYTES) {
    // Second pass — drop quality further if we're still over budget.
    out = await sharp(out).jpeg({ quality: 68, mozjpeg: true }).toBuffer();
  }
  return out;
}
