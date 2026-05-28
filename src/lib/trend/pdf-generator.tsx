/**
 * PDF Generator — Faz 2-C (content-rich rewrite)
 *
 * Renders product-type-specific PDFs using Claude-generated `pdfBody`:
 *   planner          → cover + 1 prompt-per-page (with reflection lines) + how-to-use
 *   poster           → 1 page A4 poster + how-to-use
 *   sticker          → cover + 9-cell sticker sheet + how-to-use
 *   template         → cover + "what's inside" sections + how-to-use
 *   social_template  → cover + sections + how-to-use
 *
 * No empty pages: each Page is sized to fit content. Layout is intentionally
 * generous (white space) but never blank.
 */

import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  pdf,
} from '@react-pdf/renderer';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { NicheCandidate } from './discovery';
import type { ProductContent, PdfBody } from './content';

// ─── Fly & Froth logo (cached) ───────────────────────────────────────────────

let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer | null {
  if (cachedLogo) return cachedLogo;
  try {
    cachedLogo = readFileSync(join(process.cwd(), 'public', 'branding', 'logo-navy.png'));
    return cachedLogo;
  } catch (err) {
    console.error('[trend pdf] could not load logo', err);
    return null;
  }
}

// ─── styles ─────────────────────────────────────────────────────────────────

const COLORS = {
  ink: '#1c1916',
  muted: '#6b6b6b',
  rule: '#e0d8cc',
  cream: '#fbfaf6',
  accent: '#2b2620',
  hint: '#cfcfcf',
};

const styles = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 60,
    paddingHorizontal: 60,
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    color: COLORS.ink,
    backgroundColor: '#ffffff',
    lineHeight: 1.5,
  },
  coverPage: {
    paddingTop: 70,
    paddingBottom: 80,
    paddingHorizontal: 60,
    backgroundColor: COLORS.cream,
    fontFamily: 'Helvetica',
    color: COLORS.ink,
  },
  brand: {
    fontSize: 9,
    letterSpacing: 2,
    color: COLORS.muted,
    marginBottom: 24,
  },
  coverLogo: {
    width: 110,
    height: 38,
    objectFit: 'contain',
    alignSelf: 'flex-start',
    marginBottom: 28,
  },
  coverTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    lineHeight: 1.2,
    marginBottom: 18,
  },
  coverSubtitle: {
    fontSize: 14,
    fontStyle: 'italic',
    color: COLORS.muted,
    marginBottom: 28,
  },
  heroImage: {
    width: 360,
    height: 360,
    objectFit: 'cover',
    alignSelf: 'center',
    marginVertical: 18,
  },
  coverFooter: {
    position: 'absolute',
    bottom: 36,
    left: 60,
    right: 60,
    fontSize: 8.5,
    color: COLORS.muted,
  },
  pageTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 17,
    marginBottom: 12,
  },
  pageEyebrow: {
    fontSize: 8,
    letterSpacing: 1.5,
    color: COLORS.muted,
    marginBottom: 8,
  },
  rule: { borderBottomWidth: 0.5, borderBottomColor: COLORS.rule, marginVertical: 12 },
  body: { fontSize: 10.5, lineHeight: 1.55, marginBottom: 8 },
  small: { fontSize: 8.5, color: COLORS.muted },
  footer: {
    position: 'absolute',
    bottom: 26,
    left: 60,
    right: 120,
    fontSize: 7.5,
    color: COLORS.muted,
  },
  footerLogo: {
    position: 'absolute',
    bottom: 22,
    right: 60,
    width: 50,
    height: 16,
    objectFit: 'contain',
  },
  // Prompt page
  promptNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 22,
    marginTop: 4,
  },
  promptNumber: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 48,
    lineHeight: 1.05,
    color: COLORS.accent,
    marginRight: 18,
    width: 80,
  },
  promptText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 1.4,
    fontFamily: 'Helvetica-Bold',
    color: COLORS.ink,
    paddingTop: 12,
  },
  reflectLineLabel: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 1,
    marginBottom: 10,
  },
  reflectLine: {
    borderBottomWidth: 0.4,
    borderBottomColor: COLORS.hint,
    height: 26,
  },
  // Sticker grid
  stickerHeader: {
    fontSize: 10,
    color: COLORS.muted,
    marginBottom: 14,
  },
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  stickerCell: {
    width: '32%',
    height: 150,
    marginBottom: 12,
    borderWidth: 0.6,
    borderColor: COLORS.muted,
    borderStyle: 'dashed',
    padding: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerText: {
    fontSize: 12,
    textAlign: 'center',
    fontFamily: 'Helvetica-Bold',
    color: COLORS.accent,
  },
  // Template sections — compact so all 3 sections fit one A4 page
  sectionHeading: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 12,
    marginTop: 14,
    marginBottom: 6,
    color: COLORS.accent,
  },
  sectionItem: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  sectionBullet: {
    width: 10,
    color: COLORS.muted,
  },
  sectionItemText: {
    flex: 1,
    fontSize: 10,
    lineHeight: 1.4,
  },
  templateFooterNote: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: COLORS.rule,
    fontSize: 9,
    color: COLORS.muted,
    lineHeight: 1.4,
  },
  // Poster
  posterPage: {
    paddingTop: 60,
    paddingBottom: 60,
    paddingHorizontal: 60,
    backgroundColor: COLORS.cream,
    fontFamily: 'Helvetica',
    justifyContent: 'center',
    alignItems: 'center',
  },
  posterTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 88,
    color: COLORS.accent,
    textAlign: 'center',
    letterSpacing: -3,
    lineHeight: 1,
    marginBottom: 24,
  },
  posterSubtitle: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  posterCorner: {
    position: 'absolute',
    bottom: 36,
    right: 36,
    width: 70,
    height: 24,
    objectFit: 'contain',
    opacity: 0.85,
  },
});

// ─── shared components ──────────────────────────────────────────────────────

function CoverPage({
  title,
  subtitle,
  heroUrl,
  pageCount,
}: {
  title: string;
  subtitle: string;
  heroUrl?: string | null;
  pageCount: number;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.coverPage}>
      {logo ? (
        <Image src={logo} style={styles.coverLogo} />
      ) : (
        <Text style={styles.brand}>FLY & FROTH</Text>
      )}
      <Text style={styles.coverTitle}>{title}</Text>
      <Text style={styles.coverSubtitle}>{subtitle}</Text>
      {heroUrl ? <Image src={heroUrl} style={styles.heroImage} /> : null}
      <Text style={styles.coverFooter}>
        {pageCount} pages • A4 • Printable PDF • Instant download • For personal use
      </Text>
    </Page>
  );
}

function HowToUsePage({ type }: { type: NicheCandidate['productHint'] }) {
  const tipsByType: Record<NicheCandidate['productHint'], string[]> = {
    planner: [
      'Print at 100 % scale on A4 paper, single-sided. Re-print prompt pages as needed.',
      'Use 100-120 gsm paper for a substantial, journal-like feel.',
      'Work through prompts in order or jump to whichever calls to you — both work.',
      'Keep finished sheets in a binder or scan for digital archive.',
    ],
    poster: [
      'Print on matte or satin photo paper, A4 or A3.',
      'For larger sizes send the original PDF to a print shop — quality stays sharp.',
      'Frame with a 2-3 cm matte border for an editorial feel.',
    ],
    sticker: [
      'Print on A4 sticker paper (vinyl for waterproof, paper for indoor use).',
      'Cut along the dashed lines with a craft knife or sharp scissors.',
      'Add a clear laminate sheet on top for vinyl + water resistance.',
    ],
    template: [
      'Read through each section to understand the structure.',
      'Re-create the layout in Notion, Google Docs, or your tool of choice.',
      'Adjust headings and items to fit your specific workflow.',
    ],
    social_template: [
      'Open your editor of choice — Canva, Figma, or Adobe Express.',
      'Recreate the layout: keep the hierarchy of hook → body → CTA.',
      'Maintain the colour palette across your series for brand consistency.',
    ],
  };

  const tips = tipsByType[type] ?? tipsByType.planner;
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>USING THIS DOWNLOAD</Text>
      <Text style={styles.pageTitle}>How to get the most out of it</Text>
      <View style={styles.rule} />
      {tips.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 12 }}>
          <Text style={{ width: 22, fontFamily: 'Helvetica-Bold' }}>{i + 1}.</Text>
          <Text style={[styles.body, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
      <View style={styles.rule} />
      <Text style={styles.small}>
        Need help or want a variant? Reply to the order email.
      </Text>
      <Text style={styles.footer} fixed>
        Karben, Germany • www.fly-froth.com
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

// ─── planner: prompt page ───────────────────────────────────────────────────

function PromptPage({
  number,
  total,
  prompt,
}: {
  number: number;
  total: number;
  prompt: string;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>PROMPT {number} OF {total}</Text>
      <View style={styles.promptNumberRow}>
        <Text style={styles.promptNumber}>{String(number).padStart(2, '0')}</Text>
        <Text style={styles.promptText}>{prompt}</Text>
      </View>
      <Text style={styles.reflectLineLabel}>WRITE HERE</Text>
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={i} style={styles.reflectLine} />
      ))}
      <Text style={styles.footer} fixed>
        Fly & Froth • Prompt {number}/{total}
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

// ─── sticker sheet ──────────────────────────────────────────────────────────

function StickerSheet({ phrases }: { phrases: string[] }) {
  const cells = phrases.slice(0, 9);
  while (cells.length < 9) cells.push(' ');
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>STICKER SHEET</Text>
      <Text style={styles.pageTitle}>Cut along the dashed lines</Text>
      <Text style={styles.stickerHeader}>
        3×3 grid • A4 sticker paper recommended • Vinyl + laminate for waterproof
      </Text>
      <View style={styles.stickerGrid}>
        {cells.map((p, i) => (
          <View key={i} style={styles.stickerCell}>
            <Text style={styles.stickerText}>{p.toUpperCase().slice(0, 22)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.footer} fixed>
        Fly & Froth • Sticker sheet
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

// ─── template "what's inside" ───────────────────────────────────────────────

function TemplateSectionsPage({
  sections,
  niche,
  content,
  isSocial,
}: {
  sections: NonNullable<PdfBody['templateSections']>;
  niche: NicheCandidate;
  content: ProductContent;
  isSocial: boolean;
}) {
  const logo = loadLogo();
  const footerNote = isSocial
    ? 'Recreate this layout in Canva or Figma at 1080×1080 (feed) or 1080×1350 (reels). Keep the hierarchy: hook → body → soft CTA. Maintain colour palette across the series.'
    : 'Print at 100 % scale on A4. For repeated handling use 100-120 gsm paper. To rebuild in Notion or Google Docs, follow the section headings above as your top-level structure.';
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>OVERVIEW</Text>
      <Text style={styles.pageTitle}>{content.shopTitle}</Text>
      <View style={styles.rule} />
      <Text style={styles.body}>{niche.gapAngle}</Text>
      {sections.map((s, i) => (
        <View key={i} wrap={false}>
          <Text style={styles.sectionHeading}>{s.heading}</Text>
          {s.items.map((item, j) => (
            <View key={j} style={styles.sectionItem}>
              <Text style={styles.sectionBullet}>·</Text>
              <Text style={styles.sectionItemText}>{item}</Text>
            </View>
          ))}
        </View>
      ))}
      <Text style={styles.templateFooterNote}>{footerNote}</Text>
      <Text style={styles.footer} fixed>
        Fly & Froth • Template overview
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

// ─── poster page ────────────────────────────────────────────────────────────

function PosterPage({ phrase, subline }: { phrase: string; subline: string }) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.posterPage}>
      <Text style={styles.posterTitle}>{phrase.toUpperCase()}</Text>
      <Text style={styles.posterSubtitle}>{subline.slice(0, 60)}</Text>
      {logo ? <Image src={logo} style={styles.posterCorner} /> : null}
    </Page>
  );
}

// ─── fallback content extractors (when Claude's pdfBody is empty) ───────────

function fallbackPrompts(niche: NicheCandidate): string[] {
  return [
    `What does ${niche.topic.toLowerCase()} look like in your life right now? Be specific.`,
    `Which belief about ${niche.topic.toLowerCase()} did you inherit, and from whom?`,
    `When was the last time this pattern showed up? Describe the situation in detail.`,
    `What story do you tell yourself when this comes up? Whose voice is it really?`,
    `If a close friend brought this to you, what would you tell them?`,
    `What is one small experiment you could try this week?`,
    `What support do you need — and from whom — to make a shift?`,
    `Imagine 12 months from now: what has changed?`,
  ];
}

function fallbackStickers(): string[] {
  return [
    'one thing',
    'soft start',
    'enough',
    'pause',
    'this is fine',
    'breathe',
    'slow down',
    'reset',
    'still here',
  ];
}

function fallbackPosterPhrase(niche: NicheCandidate): { phrase: string; subline: string } {
  const word = niche.topic.split(/[\s,]+/)[0]?.toUpperCase().slice(0, 24) ?? 'FOCUS';
  return { phrase: word, subline: niche.topic.slice(0, 60) };
}

function fallbackTemplateSections(
  niche: NicheCandidate,
  content: ProductContent,
): NonNullable<PdfBody['templateSections']> {
  return [
    {
      heading: "What's included",
      items: [
        'Structured layout you can adapt to your workflow',
        'Section headings + suggested fields',
        'Guidance on customisation',
      ],
    },
    {
      heading: 'Best for',
      items: [niche.gapAngle.slice(0, 160)],
    },
    {
      heading: 'How to use',
      items: [
        'Recreate the structure in Notion, Google Docs, or your tool of choice',
        'Adjust headings + items to your context',
      ],
    },
  ];
}

// ─── main document builder ──────────────────────────────────────────────────

function buildDocument(
  niche: NicheCandidate,
  content: ProductContent,
  heroUrl?: string | null,
) {
  const subtitle = `For ${niche.topic}`;
  const body = content.pdfBody ?? {};

  switch (niche.productHint) {
    case 'planner': {
      const prompts =
        body.prompts && body.prompts.length > 0 ? body.prompts : fallbackPrompts(niche);
      const totalPages = 1 + prompts.length + 1; // cover + N prompts + how-to-use
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} pageCount={totalPages} />
          {prompts.map((p, i) => (
            <PromptPage key={i} number={i + 1} total={prompts.length} prompt={p} />
          ))}
          <HowToUsePage type="planner" />
        </Document>
      );
    }

    case 'poster': {
      const { phrase, subline } =
        body.posterPhrase
          ? { phrase: body.posterPhrase, subline: body.posterSubline ?? niche.topic }
          : fallbackPosterPhrase(niche);
      return (
        <Document title={content.shopTitle}>
          <PosterPage phrase={phrase} subline={subline} />
          <HowToUsePage type="poster" />
        </Document>
      );
    }

    case 'sticker': {
      const phrases =
        body.stickerTexts && body.stickerTexts.length > 0
          ? body.stickerTexts
          : fallbackStickers();
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} pageCount={3} />
          <StickerSheet phrases={phrases} />
          <HowToUsePage type="sticker" />
        </Document>
      );
    }

    case 'template':
    case 'social_template': {
      const sections =
        body.templateSections && body.templateSections.length > 0
          ? body.templateSections
          : fallbackTemplateSections(niche, content);
      const isSocial = niche.productHint === 'social_template';
      // Template type: cover + 1 sections page (printing note inline, no separate How-To page).
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} pageCount={2} />
          <TemplateSectionsPage
            sections={sections}
            niche={niche}
            content={content}
            isSocial={isSocial}
          />
        </Document>
      );
    }
  }
}

export interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
}

export async function generateProductPdf(
  niche: NicheCandidate,
  content: ProductContent,
  heroUrl?: string | null,
): Promise<PdfResult> {
  const doc = buildDocument(niche, content, heroUrl);
  const blob = await pdf(doc).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, sizeBytes: buffer.byteLength };
}
