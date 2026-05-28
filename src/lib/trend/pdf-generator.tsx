/**
 * PDF Generator — Faz 2-C MVP
 *
 * Per-product-type printable PDF templates rendered with @react-pdf/renderer.
 * Returns a Buffer ready to upload to Vercel Blob.
 *
 * Templates:
 *   planner          → cover + 2 weekly spread pages + "how to use"
 *   poster           → 1 A4 page, large typography, niche-derived phrase
 *   sticker          → 1 A4 sheet, 6-cell grid with dotted cut lines
 *   template         → cover + 2 instruction pages
 *   social_template  → cover + 1 instructions page
 *
 * Hero image (from Vercel Blob URL) is embedded in cover pages where the
 * product type benefits from showing it. react-pdf can fetch HTTPS images.
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
import type { ProductContent } from './content';

// ─── Fly & Froth logo (cached read from public/branding) ─────────────────────

let cachedLogo: Buffer | null = null;
function loadLogo(): Buffer | null {
  if (cachedLogo) return cachedLogo;
  try {
    const path = join(process.cwd(), 'public', 'branding', 'logo-navy.png');
    cachedLogo = readFileSync(path);
    return cachedLogo;
  } catch (err) {
    console.error('[trend pdf] could not load logo', err);
    return null;
  }
}

// ─── shared styles ───────────────────────────────────────────────────────────

const COLORS = {
  ink: '#1c1916',
  muted: '#6b6b6b',
  rule: '#e0d8cc',
  cream: '#fbfaf6',
  accent: '#2b2620',
};

const sharedStyles = StyleSheet.create({
  page: {
    paddingTop: 50,
    paddingBottom: 50,
    paddingHorizontal: 56,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: COLORS.ink,
    backgroundColor: '#ffffff',
    lineHeight: 1.45,
  },
  coverPage: {
    paddingTop: 80,
    paddingBottom: 80,
    paddingHorizontal: 56,
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
  coverTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 28,
    lineHeight: 1.2,
    marginBottom: 20,
  },
  coverSubtitle: {
    fontSize: 14,
    fontStyle: 'italic',
    color: COLORS.muted,
    marginBottom: 32,
  },
  heroImage: {
    width: 380,
    height: 380,
    objectFit: 'cover',
    alignSelf: 'center',
    marginVertical: 24,
  },
  coverLogo: {
    width: 110,
    height: 38,
    objectFit: 'contain',
    alignSelf: 'flex-start',
    marginBottom: 28,
  },
  footerLogo: {
    position: 'absolute',
    bottom: 22,
    right: 56,
    width: 56,
    height: 18,
    objectFit: 'contain',
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
  pageTitle: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 18,
    marginBottom: 16,
  },
  body: { fontSize: 10.5, lineHeight: 1.6, marginBottom: 10 },
  small: { fontSize: 8.5, color: COLORS.muted },
  rule: {
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.rule,
    marginVertical: 14,
  },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 56,
    right: 56,
    textAlign: 'center',
    fontSize: 8,
    color: COLORS.muted,
  },
  // Planner weekly grid
  weekRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.rule,
    minHeight: 64,
    paddingVertical: 8,
  },
  weekDayCol: {
    width: 70,
    paddingRight: 8,
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  weekContentCol: { flex: 1, paddingLeft: 8 },
  weekLineHint: {
    borderBottomWidth: 0.25,
    borderBottomColor: '#cfcfcf',
    height: 18,
    marginBottom: 4,
  },
  // Sticker grid
  stickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  stickerCell: {
    width: '32%',
    aspectRatio: 1,
    marginBottom: 14,
    borderWidth: 0.5,
    borderColor: COLORS.muted,
    borderStyle: 'dashed',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stickerText: { fontSize: 11, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
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
    fontSize: 72,
    color: COLORS.accent,
    textAlign: 'center',
    letterSpacing: -2,
    lineHeight: 1.05,
    marginBottom: 24,
  },
  posterSubtitle: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: 'center',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});

// ─── shared components ──────────────────────────────────────────────────────

function CoverPage({
  title,
  subtitle,
  heroUrl,
}: {
  title: string;
  subtitle: string;
  heroUrl?: string | null;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={sharedStyles.coverPage}>
      {logo ? (
        <Image src={logo} style={sharedStyles.coverLogo} />
      ) : (
        <Text style={sharedStyles.brand}>FLY & FROTH</Text>
      )}
      <Text style={sharedStyles.coverTitle}>{title}</Text>
      <Text style={sharedStyles.coverSubtitle}>{subtitle}</Text>
      {heroUrl ? <Image src={heroUrl} style={sharedStyles.heroImage} /> : null}
      <View style={{ marginTop: 'auto' }}>
        <Text style={sharedStyles.small}>
          Printable PDF • A4 • Instant download • For personal use
        </Text>
      </View>
    </Page>
  );
}

function HowToUsePage({ type }: { type: NicheCandidate['productHint'] }) {
  const tipsByType: Record<NicheCandidate['productHint'], string[]> = {
    planner: [
      'Print at 100% scale on A4 paper, single-sided.',
      'Use a sturdy paper (100-120 gsm) for repeated handling.',
      'Re-print weekly sheets as needed — they are designed to be consumable.',
      'Pair with a clipboard or thin binder for portable use.',
    ],
    poster: [
      'Print on matte or satin photo paper (A4 or A3).',
      'For larger sizes use a local print shop with the original PDF — quality stays sharp.',
      'Frame in a simple frame with a 2-3 cm matte border for an editorial look.',
    ],
    sticker: [
      'Print on sticker paper (vinyl or paper sticker sheets, A4).',
      'Cut along the dashed lines with a craft knife or scissors.',
      'For waterproof stickers use vinyl + a clear laminate sheet on top.',
    ],
    template: [
      'Open the PDF for reference, then re-create the structure in your tool of choice.',
      'A digital version (Notion / Google Docs) may be sent in a follow-up email.',
      'Adjust headings to fit your workflow — this is a starting framework.',
    ],
    social_template: [
      'Use the layout in Canva, Figma or your editor of choice.',
      'Keep the typography hierarchy: bold hook, supporting body, small CTA.',
      'Maintain the colour palette across the series for brand consistency.',
    ],
  };

  const tips = tipsByType[type] ?? tipsByType.planner;
  const logo = loadLogo();
  return (
    <Page size="A4" style={sharedStyles.page}>
      <Text style={sharedStyles.pageTitle}>How to use this download</Text>
      <View style={sharedStyles.rule} />
      {tips.map((t, i) => (
        <View key={i} style={{ flexDirection: 'row', marginBottom: 10 }}>
          <Text style={{ width: 18 }}>{i + 1}.</Text>
          <Text style={[sharedStyles.body, { flex: 1 }]}>{t}</Text>
        </View>
      ))}
      <View style={sharedStyles.rule} />
      <Text style={sharedStyles.small}>
        Need help or want a variant? Reply to the order email.
      </Text>
      <Text style={sharedStyles.footer} fixed>
        Karben, Germany • www.fly-froth.com
      </Text>
      {logo ? <Image src={logo} style={sharedStyles.footerLogo} fixed /> : null}
    </Page>
  );
}

// ─── type-specific body pages ───────────────────────────────────────────────

function PlannerWeeklySpread({ weekNumber }: { weekNumber: number }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return (
    <Page size="A4" style={sharedStyles.page}>
      <Text style={sharedStyles.pageTitle}>Week {weekNumber} — Focus & flow</Text>
      <Text style={[sharedStyles.small, { marginBottom: 12 }]}>
        Date: ___________ • Theme of the week: ___________________________________
      </Text>
      <View style={sharedStyles.rule} />
      {days.map((d) => (
        <View key={d} style={sharedStyles.weekRow} wrap={false}>
          <Text style={sharedStyles.weekDayCol}>{d}</Text>
          <View style={sharedStyles.weekContentCol}>
            <View style={sharedStyles.weekLineHint} />
            <View style={sharedStyles.weekLineHint} />
            <View style={sharedStyles.weekLineHint} />
          </View>
        </View>
      ))}
      <View style={{ marginTop: 14 }}>
        <Text style={[sharedStyles.body, { fontFamily: 'Helvetica-Bold' }]}>
          End-of-week reflection
        </Text>
        <View style={sharedStyles.weekLineHint} />
        <View style={sharedStyles.weekLineHint} />
        <View style={sharedStyles.weekLineHint} />
      </View>
      <Text style={sharedStyles.footer} fixed>
        Fly & Froth • Week {weekNumber}
      </Text>
    </Page>
  );
}

function StickerSheetPage({ phrases }: { phrases: string[] }) {
  // Take up to 9 phrases for a 3x3 visual grid
  const cells = phrases.slice(0, 9);
  while (cells.length < 9) cells.push(' ');
  return (
    <Page size="A4" style={sharedStyles.page}>
      <Text style={sharedStyles.pageTitle}>Sticker sheet — cut along dashed lines</Text>
      <View style={sharedStyles.stickerGrid}>
        {cells.map((p, i) => (
          <View key={i} style={sharedStyles.stickerCell}>
            <Text style={sharedStyles.stickerText}>{p.toUpperCase().slice(0, 22)}</Text>
          </View>
        ))}
      </View>
      <Text style={sharedStyles.footer} fixed>
        Fly & Froth • Sticker sheet • A4
      </Text>
    </Page>
  );
}

function TemplateOverviewPage({
  niche,
  content,
}: {
  niche: NicheCandidate;
  content: ProductContent;
}) {
  return (
    <Page size="A4" style={sharedStyles.page}>
      <Text style={sharedStyles.pageTitle}>What's included</Text>
      <View style={sharedStyles.rule} />
      <Text style={sharedStyles.body}>{content.shopDescription}</Text>
      <View style={sharedStyles.rule} />
      <Text style={[sharedStyles.body, { fontFamily: 'Helvetica-Bold' }]}>
        Designed for
      </Text>
      <Text style={sharedStyles.body}>{niche.gapAngle}</Text>
      <Text style={sharedStyles.footer} fixed>
        Fly & Froth • Template overview
      </Text>
    </Page>
  );
}

function SocialTemplateMockPage({ content }: { content: ProductContent }) {
  return (
    <Page size="A4" style={sharedStyles.page}>
      <Text style={sharedStyles.pageTitle}>Social post template</Text>
      <View style={sharedStyles.rule} />
      <View
        style={{
          borderWidth: 1,
          borderColor: COLORS.rule,
          padding: 24,
          marginTop: 12,
          minHeight: 340,
        }}
      >
        <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 22, marginBottom: 12 }}>
          {content.shopTitle.slice(0, 70)}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.muted, marginBottom: 8 }}>
          Hook · body · soft CTA
        </Text>
        <Text style={sharedStyles.body}>
          {content.shopDescription.slice(0, 320)}…
        </Text>
      </View>
      <Text style={[sharedStyles.small, { marginTop: 16 }]}>
        Replicate this layout in Canva at 1080×1080 or 1080×1350 (Instagram).
      </Text>
      <Text style={sharedStyles.footer} fixed>
        Fly & Froth • Social template mock
      </Text>
    </Page>
  );
}

function PosterPage({ phrase, subline }: { phrase: string; subline: string }) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={sharedStyles.posterPage}>
      <Text style={sharedStyles.posterTitle}>{phrase.toUpperCase()}</Text>
      <Text style={sharedStyles.posterSubtitle}>{subline.slice(0, 60)}</Text>
      {logo ? <Image src={logo} style={sharedStyles.posterCorner} /> : null}
    </Page>
  );
}

// ─── helpers for type-specific content extraction ───────────────────────────

function extractPosterPhrase(content: ProductContent, niche: NicheCandidate): string {
  // Use the shop_title's most evocative phrase (often after "The ... for ...")
  // or fall back to the niche topic in 1-3 words.
  const t = content.shopTitle;
  const match = t.match(/for (.+?)(?:$|,|\.)/);
  if (match && match[1]) return match[1].slice(0, 24);
  return niche.topic.split(/[\s,]+/).slice(0, 3).join(' ').slice(0, 24);
}

function extractStickerPhrases(content: ProductContent): string[] {
  // Pull short evocative fragments from tags + key noun phrases
  const fromTags = content.tags
    .filter((t) => t.length >= 6 && t.length <= 18)
    .slice(0, 6);
  const extra = [
    'focus',
    'breathe',
    'pause',
    'reset',
    'one thing',
    'soft start',
    'enough',
    'this is fine',
    'slow down',
  ];
  const combined: string[] = [...fromTags, ...extra];
  // dedupe + cap to 9
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of combined) {
    if (out.length >= 9) break;
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

// ─── main entry: build full Document per type ───────────────────────────────

function buildDocument(
  niche: NicheCandidate,
  content: ProductContent,
  heroUrl?: string | null,
) {
  const subtitle = `For ${niche.topic}`;

  switch (niche.productHint) {
    case 'planner':
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} />
          <PlannerWeeklySpread weekNumber={1} />
          <PlannerWeeklySpread weekNumber={2} />
          <HowToUsePage type="planner" />
        </Document>
      );

    case 'poster':
      return (
        <Document title={content.shopTitle}>
          <PosterPage
            phrase={extractPosterPhrase(content, niche)}
            subline={niche.topic}
          />
          <HowToUsePage type="poster" />
        </Document>
      );

    case 'sticker':
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} />
          <StickerSheetPage phrases={extractStickerPhrases(content)} />
          <HowToUsePage type="sticker" />
        </Document>
      );

    case 'template':
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} />
          <TemplateOverviewPage niche={niche} content={content} />
          <HowToUsePage type="template" />
        </Document>
      );

    case 'social_template':
      return (
        <Document title={content.shopTitle}>
          <CoverPage title={content.shopTitle} subtitle={subtitle} heroUrl={heroUrl} />
          <SocialTemplateMockPage content={content} />
          <HowToUsePage type="social_template" />
        </Document>
      );
  }
}

export interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
}

/**
 * Render the product-specific PDF to a Buffer.
 * Hero URL is fetched + embedded by react-pdf if provided.
 */
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
