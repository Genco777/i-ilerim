/**
 * PDF Generator — V-3 (premium themed redesign)
 *
 * Each PDF gets one of 5 hand-tuned themes auto-picked from the niche topic
 * (noir / rose / forest / slate / cream). Magazine-grade typography hierarchy,
 * accent-coloured ornaments, full-bleed section divider pages, and a branded
 * back cover. No empty pages. No generic Helvetica wall-of-text.
 *
 * Product types:
 *   planner          → cover + N prompt pages (accent number + ornament line)
 *                      + section divider + how-to-use + back cover
 *   poster           → 1 full-bleed poster + how-to-use + back cover
 *   sticker          → cover + 9-cell sticker sheet (themed) + how-to-use
 *                      + back cover
 *   template         → cover + section divider + sections page + back cover
 *   social_template  → as template, sized for square/portrait layouts
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

// ─── Theme system ────────────────────────────────────────────────────────────

interface Theme {
  bg: string;          // main page background
  ink: string;         // body text
  muted: string;       // secondary text
  rule: string;        // subtle separator
  accent: string;      // hero colour — used for numbers, ornaments, dividers
  accentInk: string;   // text on top of accent block (usually cream)
  softBg: string;      // section-divider full-bleed background
  hint: string;        // reflection lines, etc.
  cream: string;       // cover/back surface
}

const THEMES: Record<string, Theme> = {
  // Calm warm cream — wellness, mindfulness, soft topics, default
  cream: {
    bg: '#fbfaf6',
    ink: '#2d2925',
    muted: '#8b8278',
    rule: '#e8dfd2',
    accent: '#b8866c',
    accentInk: '#fbfaf6',
    softBg: '#f0e9dc',
    hint: '#d8cfc1',
    cream: '#fbfaf6',
  },
  // Deep moody — shadow work, dark feminine, dreams, anxious, grief
  noir: {
    bg: '#fafaf8',
    ink: '#1a1a1f',
    muted: '#777078',
    rule: '#dfdde4',
    accent: '#5b4670',
    accentInk: '#f5f1ed',
    softBg: '#2d2535',
    hint: '#cfccd5',
    cream: '#f5f1ed',
  },
  // Grounded green — deep work, focus, ADHD, planners, productivity
  forest: {
    bg: '#fbfaf6',
    ink: '#1a2820',
    muted: '#7a8478',
    rule: '#dfe4dd',
    accent: '#3d5a47',
    accentInk: '#fbfaf6',
    softBg: '#324d3a',
    hint: '#cdd5cb',
    cream: '#f8f5ef',
  },
  // Warm rose-clay — menopause, HRT, hormone, women's health, motherhood
  rose: {
    bg: '#fbf6f3',
    ink: '#3a2424',
    muted: '#a08a82',
    rule: '#ead5cd',
    accent: '#9d4d45',
    accentInk: '#fbf6f3',
    softBg: '#f5e3dd',
    hint: '#e2cbc3',
    cream: '#fbf6f3',
  },
  // Cool editorial slate — templates, business, social, brand, content
  slate: {
    bg: '#f8f8fa',
    ink: '#191a23',
    muted: '#7a8094',
    rule: '#dde0ea',
    accent: '#324063',
    accentInk: '#f8f8fa',
    softBg: '#eaecf2',
    hint: '#cfd2dc',
    cream: '#f8f8fa',
  },
};

/** Pick a theme based on niche topic keywords. */
function pickTheme(topic: string, type: NicheCandidate['productHint']): Theme {
  const t = (topic ?? '').toLowerCase();
  if (
    /shadow|dark|moon|dream|anxious|attach|trauma|grief|bound|toxic|inner child|borderline|narciss|abuse/.test(
      t,
    )
  )
    return THEMES.noir!;
  if (
    /menopau|hrt|perimeno|hormone|cycle|pcos|fertility|woman|mother|matern|pregnan|postpart/.test(
      t,
    )
  )
    return THEMES.rose!;
  if (/deep work|focus|adhd|productiv|planner|time block|work session|async/.test(t))
    return THEMES.forest!;
  if (type === 'template' || type === 'social_template') return THEMES.slate!;
  if (/template|social|instagram|content|business|brand|seo|market|launch/.test(t))
    return THEMES.slate!;
  return THEMES.cream!;
}

// ─── Style builder (per-theme) ───────────────────────────────────────────────

function buildStyles(t: Theme) {
  return StyleSheet.create({
    // Inner content pages
    page: {
      paddingTop: 58,
      paddingBottom: 64,
      paddingHorizontal: 56,
      fontFamily: 'Helvetica',
      fontSize: 10.5,
      color: t.ink,
      backgroundColor: t.bg,
      lineHeight: 1.5,
    },

    // ─── Cover page ───
    coverPage: {
      fontFamily: 'Helvetica',
      backgroundColor: t.cream,
      color: t.ink,
    },
    coverAccentBlock: {
      backgroundColor: t.accent,
      paddingTop: 76,
      paddingBottom: 60,
      paddingHorizontal: 56,
      // Top-half coloured block
      height: 440,
      position: 'relative',
    },
    coverEyebrow: {
      fontSize: 9,
      letterSpacing: 3,
      color: t.accentInk,
      opacity: 0.7,
      marginBottom: 18,
    },
    coverTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 36,
      lineHeight: 1.1,
      letterSpacing: -1,
      color: t.accentInk,
      marginBottom: 28,
    },
    coverLogoLight: {
      width: 96,
      height: 32,
      objectFit: 'contain',
      position: 'absolute',
      top: 56,
      right: 56,
      opacity: 0.85,
    },
    // Decorative geometry on the accent block
    coverOrnament: {
      position: 'absolute',
      bottom: 40,
      left: 56,
      width: 60,
      height: 2,
      backgroundColor: t.accentInk,
      opacity: 0.4,
    },
    // Bottom area on cover
    coverBottom: {
      paddingTop: 36,
      paddingHorizontal: 56,
      paddingBottom: 52,
      flex: 1,
    },
    coverSubtitle: {
      fontSize: 14,
      lineHeight: 1.4,
      fontStyle: 'italic',
      color: t.ink,
      marginBottom: 24,
      maxWidth: 380,
    },
    coverMeta: {
      fontSize: 9,
      letterSpacing: 2,
      color: t.muted,
      textTransform: 'uppercase',
    },
    coverFooterRule: {
      position: 'absolute',
      bottom: 52,
      left: 56,
      right: 56,
      borderTopWidth: 0.5,
      borderTopColor: t.rule,
    },

    // ─── Section divider page (full bleed) ───
    dividerPage: {
      backgroundColor: t.softBg,
      paddingTop: 200,
      paddingBottom: 200,
      paddingHorizontal: 60,
      fontFamily: 'Helvetica',
      justifyContent: 'center',
      alignItems: 'center',
    },
    dividerEyebrow: {
      fontSize: 9,
      letterSpacing: 4,
      color: t.cream,
      opacity: 0.7,
      marginBottom: 22,
      textTransform: 'uppercase',
    },
    dividerTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 32,
      letterSpacing: -1,
      lineHeight: 1.15,
      color: t.cream,
      textAlign: 'center',
      marginBottom: 22,
      maxWidth: 360,
    },
    dividerHairline: {
      width: 44,
      height: 1.5,
      backgroundColor: t.cream,
      opacity: 0.5,
    },

    // ─── Prompt page ───
    pageEyebrow: {
      fontSize: 8,
      letterSpacing: 2.5,
      color: t.muted,
      marginBottom: 8,
      textTransform: 'uppercase',
    },
    promptHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 24,
      marginTop: 6,
    },
    promptNumber: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 64,
      lineHeight: 0.95,
      color: t.accent,
      marginRight: 22,
      width: 96,
      letterSpacing: -3,
    },
    promptText: {
      flex: 1,
      fontSize: 15.5,
      lineHeight: 1.42,
      fontFamily: 'Helvetica-Bold',
      color: t.ink,
      paddingTop: 14,
    },
    promptAccentLine: {
      height: 2,
      backgroundColor: t.accent,
      width: 38,
      marginBottom: 26,
    },
    reflectLineLabel: {
      fontSize: 7.5,
      color: t.muted,
      letterSpacing: 2,
      marginBottom: 12,
      textTransform: 'uppercase',
    },
    reflectLine: {
      borderBottomWidth: 0.4,
      borderBottomColor: t.hint,
      height: 26,
    },

    // Generic page elements
    pageTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 18,
      marginBottom: 12,
      color: t.ink,
    },
    rule: { borderBottomWidth: 0.5, borderBottomColor: t.rule, marginVertical: 14 },
    body: { fontSize: 10.5, lineHeight: 1.55, marginBottom: 8, color: t.ink },
    small: { fontSize: 8.5, color: t.muted },
    footer: {
      position: 'absolute',
      bottom: 28,
      left: 56,
      right: 120,
      fontSize: 7.5,
      letterSpacing: 1,
      color: t.muted,
      textTransform: 'uppercase',
    },
    footerLogo: {
      position: 'absolute',
      bottom: 24,
      right: 56,
      width: 50,
      height: 16,
      objectFit: 'contain',
      opacity: 0.7,
    },

    // ─── Sticker sheet ───
    stickerHeader: {
      fontSize: 9,
      color: t.muted,
      marginBottom: 16,
      letterSpacing: 1,
    },
    stickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
    },
    stickerCell: {
      width: '32%',
      height: 150,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: t.accent,
      borderStyle: 'dashed',
      padding: 14,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: t.cream,
    },
    stickerText: {
      fontSize: 13,
      textAlign: 'center',
      fontFamily: 'Helvetica-Bold',
      color: t.accent,
      letterSpacing: 0.5,
    },

    // ─── Template sections ───
    sectionHeading: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 13,
      marginTop: 18,
      marginBottom: 8,
      color: t.accent,
      letterSpacing: -0.2,
    },
    sectionItem: { flexDirection: 'row', marginBottom: 5 },
    sectionBullet: { width: 12, color: t.accent, fontFamily: 'Helvetica-Bold' },
    sectionItemText: { flex: 1, fontSize: 10.5, lineHeight: 1.5, color: t.ink },
    templateFooterNote: {
      marginTop: 22,
      paddingTop: 12,
      borderTopWidth: 0.5,
      borderTopColor: t.rule,
      fontSize: 9,
      color: t.muted,
      lineHeight: 1.4,
      fontStyle: 'italic',
    },

    // ─── Poster ───
    posterPage: {
      paddingTop: 60,
      paddingBottom: 60,
      paddingHorizontal: 60,
      backgroundColor: t.cream,
      fontFamily: 'Helvetica',
      justifyContent: 'center',
      alignItems: 'center',
    },
    posterAccentFrame: {
      position: 'absolute',
      top: 56,
      left: 56,
      right: 56,
      bottom: 56,
      borderWidth: 1,
      borderColor: t.accent,
    },
    posterTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 96,
      color: t.accent,
      textAlign: 'center',
      letterSpacing: -3.5,
      lineHeight: 0.95,
      marginBottom: 26,
    },
    posterSubtitle: {
      fontSize: 11,
      color: t.muted,
      textAlign: 'center',
      letterSpacing: 5,
      textTransform: 'uppercase',
    },
    posterCorner: {
      position: 'absolute',
      bottom: 36,
      right: 36,
      width: 64,
      height: 22,
      objectFit: 'contain',
      opacity: 0.7,
    },

    // ─── Back cover ───
    backCover: {
      backgroundColor: t.cream,
      paddingTop: 120,
      paddingBottom: 80,
      paddingHorizontal: 60,
      fontFamily: 'Helvetica',
    },
    backAccentBlock: {
      backgroundColor: t.accent,
      height: 6,
      width: 60,
      marginBottom: 36,
    },
    backTitle: {
      fontFamily: 'Helvetica-Bold',
      fontSize: 22,
      letterSpacing: -0.5,
      lineHeight: 1.25,
      color: t.ink,
      marginBottom: 16,
      maxWidth: 380,
    },
    backBody: {
      fontSize: 11,
      lineHeight: 1.55,
      color: t.muted,
      marginBottom: 18,
      maxWidth: 380,
    },
    backCreditLine: {
      fontSize: 8,
      letterSpacing: 2,
      color: t.muted,
      textTransform: 'uppercase',
      marginTop: 38,
    },
    backLogo: {
      width: 100,
      height: 34,
      objectFit: 'contain',
      marginBottom: 14,
    },
  });
}

// ─── How-to-use copy (used by multiple types) ────────────────────────────────

function howToTips(type: NicheCandidate['productHint']): string[] {
  const tipsByType: Record<NicheCandidate['productHint'], string[]> = {
    planner: [
      'Print at 100 % scale on A4 paper, single-sided. Re-print prompt pages as needed.',
      'Use 100–120 gsm paper for a substantial, journal-like feel.',
      'Work through prompts in order or jump to whichever calls to you — both work.',
      'Keep finished sheets in a binder, or scan for a digital archive.',
    ],
    poster: [
      'Print on quality matte paper at 100 % scale; A4 frame works perfectly.',
      'For framed art, choose a thin oak, walnut, or black frame.',
      'Pair with a small ornament — a single flower stem, a candle — for editorial styling.',
    ],
    sticker: [
      'Print on A4 sticker paper. Vinyl + laminate sheet for waterproof.',
      'Cut along dashed lines with a paper trimmer or sharp scissors.',
      'Use sparingly — single statement stickers carry more weight than many.',
    ],
    template: [
      'Recreate the structure in Notion, Google Docs, or your preferred tool.',
      'Adapt headings to your context — the framework is the value, not the literal layout.',
    ],
    social_template: [
      'Recreate the layout in Canva or Figma at 1080×1080 (feed) or 1080×1350 (reels).',
      'Keep the hierarchy: hook → body → soft CTA.',
      'Maintain colour palette across the whole series for brand recognition.',
    ],
  };
  return tipsByType[type] ?? [];
}

// ─── shared components ──────────────────────────────────────────────────────

function CoverPage({
  styles,
  theme,
  title,
  subtitle,
  pageCount,
}: {
  styles: ReturnType<typeof buildStyles>;
  theme: Theme;
  title: string;
  subtitle: string;
  pageCount: number;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.coverPage}>
      {/* Top half — accent colour block with title and logo */}
      <View style={styles.coverAccentBlock}>
        {logo ? <Image src={logo} style={styles.coverLogoLight} /> : null}
        <Text style={styles.coverEyebrow}>FLY &amp; FROTH STUDIO</Text>
        <Text style={styles.coverTitle}>{title}</Text>
        <View style={styles.coverOrnament} />
      </View>

      {/* Bottom half — subtitle + metadata */}
      <View style={styles.coverBottom}>
        <Text style={styles.coverSubtitle}>{subtitle}</Text>
        <Text style={styles.coverMeta}>
          {pageCount} pages · A4 · Printable · Instant download
        </Text>
        <View style={styles.coverFooterRule} />
      </View>
    </Page>
  );
}

function SectionDividerPage({
  styles,
  eyebrow,
  title,
}: {
  styles: ReturnType<typeof buildStyles>;
  eyebrow: string;
  title: string;
}) {
  return (
    <Page size="A4" style={styles.dividerPage}>
      <Text style={styles.dividerEyebrow}>{eyebrow}</Text>
      <Text style={styles.dividerTitle}>{title}</Text>
      <View style={styles.dividerHairline} />
    </Page>
  );
}

function HowToUsePage({
  styles,
  type,
}: {
  styles: ReturnType<typeof buildStyles>;
  type: NicheCandidate['productHint'];
}) {
  const tips = howToTips(type);
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>HOW TO USE</Text>
      <Text style={styles.pageTitle}>A short note from the studio</Text>
      <View style={styles.rule} />
      {tips.map((tip, i) => (
        <View key={i} style={styles.sectionItem}>
          <Text style={styles.sectionBullet}>·</Text>
          <Text style={styles.sectionItemText}>{tip}</Text>
        </View>
      ))}
      <Text style={styles.footer} fixed>
        Fly &amp; Froth · How to use
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

function PromptPage({
  styles,
  number,
  total,
  prompt,
}: {
  styles: ReturnType<typeof buildStyles>;
  number: number;
  total: number;
  prompt: string;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>
        Prompt {number} of {total}
      </Text>
      <View style={styles.promptHeader}>
        <Text style={styles.promptNumber}>{String(number).padStart(2, '0')}</Text>
        <Text style={styles.promptText}>{prompt}</Text>
      </View>
      <View style={styles.promptAccentLine} />
      <Text style={styles.reflectLineLabel}>Write here</Text>
      {Array.from({ length: 14 }).map((_, i) => (
        <View key={i} style={styles.reflectLine} />
      ))}
      <Text style={styles.footer} fixed>
        Fly &amp; Froth · Prompt {number}/{total}
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

function StickerSheet({
  styles,
  phrases,
}: {
  styles: ReturnType<typeof buildStyles>;
  phrases: string[];
}) {
  const cells = phrases.slice(0, 9);
  while (cells.length < 9) cells.push(' ');
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.page}>
      <Text style={styles.pageEyebrow}>STICKER SHEET</Text>
      <Text style={styles.pageTitle}>Cut along the dashed lines</Text>
      <Text style={styles.stickerHeader}>
        3 × 3 grid · A4 sticker paper recommended · Vinyl + laminate for waterproof
      </Text>
      <View style={styles.stickerGrid}>
        {cells.map((p, i) => (
          <View key={i} style={styles.stickerCell}>
            <Text style={styles.stickerText}>{p.toUpperCase().slice(0, 22)}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.footer} fixed>
        Fly &amp; Froth · Sticker sheet
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

function TemplateSectionsPage({
  styles,
  sections,
  niche,
  content,
  isSocial,
}: {
  styles: ReturnType<typeof buildStyles>;
  sections: NonNullable<PdfBody['templateSections']>;
  niche: NicheCandidate;
  content: ProductContent;
  isSocial: boolean;
}) {
  const logo = loadLogo();
  const footerNote = isSocial
    ? 'Recreate this layout in Canva or Figma at 1080 × 1080 (feed) or 1080 × 1350 (reels). Keep the hierarchy: hook → body → soft CTA. Maintain colour palette across the series for brand recognition.'
    : 'Print at 100 % scale on A4. For repeated handling use 100–120 gsm paper. To rebuild in Notion or Google Docs, follow the section headings above as your top-level structure.';
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
        Fly &amp; Froth · Template overview
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

function PosterPage({
  styles,
  phrase,
  subline,
}: {
  styles: ReturnType<typeof buildStyles>;
  phrase: string;
  subline: string;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.posterPage}>
      <View style={styles.posterAccentFrame} />
      <Text style={styles.posterTitle}>{phrase.toUpperCase()}</Text>
      <Text style={styles.posterSubtitle}>{subline.slice(0, 60)}</Text>
      {logo ? <Image src={logo} style={styles.posterCorner} /> : null}
    </Page>
  );
}

function BackCoverPage({
  styles,
  niche,
}: {
  styles: ReturnType<typeof buildStyles>;
  niche: NicheCandidate;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.backCover}>
      <View style={styles.backAccentBlock} />
      <Text style={styles.backTitle}>
        Made for the specific question the generic version never quite answers.
      </Text>
      <Text style={styles.backBody}>
        Fly &amp; Froth is a small editorial studio in Karben, Germany. We design
        considered printables for the people generic templates never quite fit —
        the specific topic, the specific person, the specific reason.
      </Text>
      <Text style={styles.backBody}>
        If something here landed: tell us. If something missed: tell us. Real
        humans reply within 12 hours, weekends included.
      </Text>
      <Text style={styles.backCreditLine}>
        Originated from a study on “{niche.topic}”
      </Text>
      {logo ? <Image src={logo} style={styles.backLogo} /> : null}
      <Text style={styles.coverMeta}>fly-froth.com · info@fly-froth.com</Text>
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
  _content: ProductContent,
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

function buildDocument(niche: NicheCandidate, content: ProductContent) {
  const theme = pickTheme(niche.topic, niche.productHint);
  const styles = buildStyles(theme);
  const subtitle = niche.gapAngle.slice(0, 200);
  const body = content.pdfBody ?? {};

  switch (niche.productHint) {
    case 'planner': {
      const prompts =
        body.prompts && body.prompts.length > 0 ? body.prompts : fallbackPrompts(niche);
      const totalPages = 1 + 1 + prompts.length + 1 + 1; // cover + divider + N prompts + how-to + back
      return (
        <Document title={content.shopTitle}>
          <CoverPage styles={styles} theme={theme} title={content.shopTitle} subtitle={subtitle} pageCount={totalPages} />
          <SectionDividerPage styles={styles} eyebrow="Part one" title="The prompts that surface the pattern." />
          {prompts.map((p, i) => (
            <PromptPage key={i} styles={styles} number={i + 1} total={prompts.length} prompt={p} />
          ))}
          <HowToUsePage styles={styles} type="planner" />
          <BackCoverPage styles={styles} niche={niche} />
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
          <PosterPage styles={styles} phrase={phrase} subline={subline} />
          <HowToUsePage styles={styles} type="poster" />
          <BackCoverPage styles={styles} niche={niche} />
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
          <CoverPage styles={styles} theme={theme} title={content.shopTitle} subtitle={subtitle} pageCount={4} />
          <StickerSheet styles={styles} phrases={phrases} />
          <HowToUsePage styles={styles} type="sticker" />
          <BackCoverPage styles={styles} niche={niche} />
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
      return (
        <Document title={content.shopTitle}>
          <CoverPage styles={styles} theme={theme} title={content.shopTitle} subtitle={subtitle} pageCount={3} />
          <SectionDividerPage styles={styles} eyebrow="Overview" title="What's inside, and how to use it." />
          <TemplateSectionsPage
            styles={styles}
            sections={sections}
            niche={niche}
            content={content}
            isSocial={isSocial}
          />
          <BackCoverPage styles={styles} niche={niche} />
        </Document>
      );
    }
  }
}

export interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
}

/**
 * V-3: heroUrl no longer embedded in cover (cover is now a designed colour-block
 * page that doesn't need a product photo). Argument kept for backward-compat
 * with orchestrator + regen flow — value ignored.
 */
export async function generateProductPdf(
  niche: NicheCandidate,
  content: ProductContent,
  _heroUrl?: string | null,
): Promise<PdfResult> {
  const doc = buildDocument(niche, content);
  const blob = await pdf(doc).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, sizeBytes: buffer.byteLength };
}
eCandidate;
  content: ProductContent;
  isSocial: boolean;
}) {
  const logo = loadLogo();
  const footerNote = isSocial
    ? 'Recreate this layout in Canva or Figma at 1080×1080 (feed) or 1080×1350 (reels). Keep the hierarchy: hook → body → soft CTA. Maintain colour palette across the series for brand recognition.'
    : 'Print at 100 % scale on A4. For repeated handling use 100–120 gsm paper. To rebuild in Notion or Google Docs, follow the section headings above as your top-level structure.';
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
        Fly &amp; Froth · Template overview
      </Text>
      {logo ? <Image src={logo} style={styles.footerLogo} fixed /> : null}
    </Page>
  );
}

function PosterPage({
  styles,
  phrase,
  subline,
}: {
  styles: ReturnType<typeof buildStyles>;
  phrase: string;
  subline: string;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={styles.posterPage}>
      <View style={styles.posterAccentFrame} />
      <Text style={styles.posterTitle}>{phrase.toUpperCase()}</Text>
      <Text style={styles.posterSubtitle}>{subline.slice(0, 60)}</Text>
      {logo ? <Image src={logo} style={styles.posterCorner} /> : null}
    </Page>
  );
}

// ─── V-4 AI full-bleed pages ────────────────────────────────────────────────

const fullBleedPageStyle = { padding: 0, margin: 0 };
const fullBleedImageStyle = { width: '100%', height: '100%', objectFit: 'cover' as const };

function AiCoverPage({ buffer }: { buffer: Buffer }) {
  return (
    <Page size="A4" style={fullBleedPageStyle}>
      <Image src={buffer} style={fullBleedImageStyle} />
    </Page>
  );
}

function AiDividerPage({ buffer }: { buffer: Buffer }) {
  return (
    <Page size="A4" style={fullBleedPageStyle}>
      <Image src={buffer} style={fullBleedImageStyle} />
    </Page>
  );
}

function AiBackCoverPage({
  styles,
  buffer,
  niche,
}: {
  styles: ReturnType<typeof buildStyles>;
  buffer: Buffer;
  niche: NicheCandidate;
}) {
  const logo = loadLogo();
  return (
    <Page size="A4" style={fullBleedPageStyle}>
      {/* AI illustration as full-bleed background */}
      <Image src={buffer} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {/* react-pdf overlay so the text remains selectable + crisp */}
      <View style={{ padding: 60, paddingTop: 120, position: 'relative' }}>
        <View style={styles.backAccentBlock} />
        <Text style={styles.backTitle}>
          Made for the specific question the generic version never quite answers.
        </Text>
        <Text style={styles.backBody}>
          Fly &amp; Froth is a small editorial studio in Karben, Germany.
          We design considered printables for the people generic templates never quite fit.
        </Text>
        <Text style={styles.backBody}>
          If something here landed: tell us. If something missed: tell us.
          Real humans reply within 12 hours, weekends included.
        </Text>
        <Text style={styles.backCreditLine}>
          Originated from a study on “{niche.topic}”
        </Text>
        {logo ? <Image src={logo} style={styles.backLogo} /> : null}
        <Text style={styles.coverMeta}>fly-froth.com · info@fly-froth.com</Text>
      </View>
    </Page>
  );
}

// ─── fallback content extractors ────────────────────────────────────────────

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
  return ['one thing','soft start','enough','pause','this is fine','breathe','slow down','reset','still here'];
}

function fallbackPosterPhrase(niche: NicheCandidate): { phrase: string; subline: string } {
  const word = niche.topic.split(/[\s,]+/)[0]?.toUpperCase().slice(0, 24) ?? 'FOCUS';
  return { phrase: word, subline: niche.topic.slice(0, 60) };
}

function fallbackTemplateSections(
  niche: NicheCandidate,
  _content: ProductContent,
): NonNullable<PdfBody['templateSections']> {
  return [
    { heading: "What's included", items: ['Structured layout you can adapt to your workflow','Section headings + suggested fields','Guidance on customisation'] },
    { heading: 'Best for', items: [niche.gapAngle.slice(0, 160)] },
    { heading: 'How to use', items: ['Recreate the structure in Notion, Google Docs, or your tool of choice','Adjust headings + items to your context'] },
  ];
}

// ─── main document builder (V-4 hybrid) ─────────────────────────────────────

import type { AiPageBuffers } from './pdf-ai-pages';

function buildDocument(
  niche: NicheCandidate,
  content: ProductContent,
  ai: AiPageBuffers,
) {
  const theme = pickTheme(niche.topic, niche.productHint);
  const styles = buildStyles(theme);
  const subtitle = niche.gapAngle.slice(0, 200);
  const body = content.pdfBody ?? {};

  // Choose AI cover if available, fall back to V-3 themed cover
  const Cover = (pageCount: number) =>
    ai.cover
      ? <AiCoverPage buffer={ai.cover} />
      : <CoverPage styles={styles} theme={theme} title={content.shopTitle} subtitle={subtitle} pageCount={pageCount} />;
  const Divider = (eyebrow: string, title: string) =>
    ai.divider
      ? <AiDividerPage buffer={ai.divider} />
      : <SectionDividerPage styles={styles} eyebrow={eyebrow} title={title} />;
  const BackCover = () =>
    ai.backCover
      ? <AiBackCoverPage styles={styles} buffer={ai.backCover} niche={niche} />
      : <SectionDividerPage styles={styles} eyebrow="Thank you" title="Fly & Froth · Karben, DE" />;

  switch (niche.productHint) {
    case 'planner': {
      const prompts = body.prompts && body.prompts.length > 0 ? body.prompts : fallbackPrompts(niche);
      const totalPages = 1 + 1 + prompts.length + 1 + 1;
      return (
        <Document title={content.shopTitle}>
          {Cover(totalPages)}
          {Divider('Part one', 'The prompts that surface the pattern.')}
          {prompts.map((p, i) => (
            <PromptPage key={i} styles={styles} number={i + 1} total={prompts.length} prompt={p} />
          ))}
          <HowToUsePage styles={styles} type="planner" />
          {BackCover()}
        </Document>
      );
    }
    case 'poster': {
      const { phrase, subline } = body.posterPhrase
        ? { phrase: body.posterPhrase, subline: body.posterSubline ?? niche.topic }
        : fallbackPosterPhrase(niche);
      return (
        <Document title={content.shopTitle}>
          <PosterPage styles={styles} phrase={phrase} subline={subline} />
          <HowToUsePage styles={styles} type="poster" />
          {BackCover()}
        </Document>
      );
    }
    case 'sticker': {
      const phrases = body.stickerTexts && body.stickerTexts.length > 0 ? body.stickerTexts : fallbackStickers();
      return (
        <Document title={content.shopTitle}>
          {Cover(4)}
          <StickerSheet styles={styles} phrases={phrases} />
          <HowToUsePage styles={styles} type="sticker" />
          {BackCover()}
        </Document>
      );
    }
    case 'template':
    case 'social_template': {
      const sections = body.templateSections && body.templateSections.length > 0
        ? body.templateSections
        : fallbackTemplateSections(niche, content);
      const isSocial = niche.productHint === 'social_template';
      return (
        <Document title={content.shopTitle}>
          {Cover(3)}
          {Divider('Overview', "What's inside, and how to use it.")}
          <TemplateSectionsPage
            styles={styles}
            sections={sections}
            niche={niche}
            content={content}
            isSocial={isSocial}
          />
          {BackCover()}
        </Document>
      );
    }
  }
}

export interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
}

/**
 * V-4: generates AI cover + divider + back cover in parallel, then builds
 * the document with those buffers. If AI gen fails for a page, the V-3
 * themed react-pdf version is used as fallback for that specific page.
 */
export async function generateProductPdf(
  niche: NicheCandidate,
  content: ProductContent,
  _heroUrl?: string | null,
): Promise<PdfResult> {
  const theme = pickTheme(niche.topic, niche.productHint);

  // Pick a divider title that fits the product type
  const dividerCfg = niche.productHint === 'planner'
    ? { eyebrow: 'Part one', title: 'The prompts that surface the pattern.' }
    : { eyebrow: 'Overview', title: "What's inside, and how to use it." };

  // V-4 AI pages — best-effort, falls back per-page
  let ai: AiPageBuffers = { cover: null, divider: null, backCover: null };
  try {
    const { generateAiPages } = await import('./pdf-ai-pages');
    ai = await generateAiPages({
      niche,
      content,
      theme: themeKeyFromTheme(theme),
      dividerEyebrow: dividerCfg.eyebrow,
      dividerTitle: dividerCfg.title,
    });
  } catch (err) {
    console.warn('[trend pdf] V-4 AI pages unavailable, V-3 fallback rendering', err);
  }

  const doc = buildDocument(niche, content, ai);
  const blob = await pdf(doc).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return { buffer, sizeBytes: buffer.byteLength };
}

/** Reverse-lookup the theme key from a Theme object (uses background colour). */
function themeKeyFromTheme(t: Theme): string {
  for (const [k, v] of Object.entries(THEMES)) {
    if (v === t) return k;
  }
  return 'cream';
}
