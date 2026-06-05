/**
 * Content Generation — Faz 1
 *
 * Takes a discovered Niche + intended product type and asks Claude
 * to produce a structured, sales-ready content package:
 *   - Etsy title (≤140 chars, keyword in first 40)
 *   - Etsy SEO description
 *   - 13 tags (≤20 chars each)
 *   - Own-shop title/description (different tone — slower-burn, brand voice)
 *   - Suggested price in EUR cents
 *
 * No publishing here — output goes into `products` table with
 * status='awaiting_approval' so Faz 2 onward can pick it up.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { NicheCandidate } from './discovery';

const MODEL = 'claude-sonnet-4-6';

/**
 * Rich, type-specific content for the deliverable PDF.
 * Different product types use different fields — Claude is asked to
 * fill in only the relevant one based on `productHint`.
 */
export interface PdfBody {
  /** planner: 8-12 niche-specific reflection prompts (each 1-2 sentences) */
  prompts?: string[];
  /** sticker: 9 short phrases for the sticker sheet (each ≤22 chars) */
  stickerTexts?: string[];
  /** poster: a single evocative phrase (≤24 chars) + subline */
  posterPhrase?: string;
  posterSubline?: string;
  /** template + social_template: structured "what's inside" sections */
  templateSections?: Array<{ heading: string; items: string[] }>;
}

export interface ProductContent {
  etsyTitle: string;
  etsyDescription: string;
  tags: string[]; // exactly 13, each ≤20 chars
  shopTitle: string;
  shopDescription: string;
  priceCents: number; // Basic tier price (suggested)
  /** B1 — Plus tier (additional content/format): +66% over Basic. */
  tierBPriceCents?: number;
  /** Short paragraph describing what Plus adds vs Basic. */
  tierBDescription?: string;
  /** B1 — Pro tier (premium): +166% over Basic. */
  tierCPriceCents?: number;
  /** Short paragraph describing what Pro adds vs Plus. */
  tierCDescription?: string;
  slug: string; // url-safe slug for /shop/[slug]
  /** Turkish — operator-facing only (Telegram digest + approval UI). */
  turkishGapAngle: string;
  turkishSummary: string;
  /** Rich PDF content (type-specific, see PdfBody). */
  pdfBody: PdfBody;
}

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

const SYSTEM_PROMPT = `You are a digital-product copywriter specialising in Etsy SEO, own-shop conversion copy, AND the actual deliverable content (prompts, lists, phrases that go INSIDE the PDF the customer receives).

OUTPUT FORMAT — strict JSON only, no markdown, no preamble.

Schema:
{
  "etsy_title": "string, MAX 140 chars, primary keyword in first 40 chars, use | separators, NO emojis",
  "etsy_description": "string, 200-500 words, scannable paragraphs + bullet-style line breaks (\\n-), SEO + conversion focused, include 'instant download' / 'PDF' explicitly, end with care instructions or 'how to print'",
  "tags": ["13 tags total, each MAX 20 chars, long-tail, lower-case, no special chars except spaces"],
  "shop_title": "string, MAX 80 chars, brand-voice, more conversational than Etsy, NO emojis",
  "shop_description": "string, 80-200 words, brand-voice paragraph (NOT bullet list), why-it-matters + who-its-for + what-you-get",
  "price_cents": integer between 300 and 2500 (EUR cents), based on perceived value,
  "turkish_gap_angle": "string, 1 Turkish sentence (max 220 chars) — Türkçe olarak boşluk/farklılaşma açısını anlat. Operator (Türk satıcı) için, akıcı doğal Türkçe.",
  "turkish_summary": "string, 1 Turkish sentence (max 180 chars) — Türkçe olarak 'bu ürün neden satar' özet. Hedef kitle + temel değer önerisi.",
  "pdf_body": { ...type-specific, see below... }
}

═══ pdf_body — REAL deliverable content for the buyer's PDF ═══

Based on the product type, fill the RELEVANT field. Quality matters: the buyer paid for this, treat it like real product, not boilerplate.

If product type is "planner":
  pdf_body = {
    "prompts": [
      "10–12 deep, niche-specific reflection prompts.",
      "Each prompt is 1–2 sentences, written in second person.",
      "Each MUST be specifically about the niche topic, NOT generic 'how do you feel today'.",
      "Order them as a coherent journey from surface → deeper.",
      "Each will appear on its own page with response lines."
    ]
  }

If product type is "sticker":
  pdf_body = {
    "sticker_texts": [
      "exactly 9 short evocative phrases, each MAX 22 chars",
      "must reflect the niche tone (e.g. shadow work, focus, anxiety)",
      "punchy, quotable, designed to land — not corporate"
    ]
  }

If product type is "poster":
  pdf_body = {
    "poster_phrase": "single bold phrase, MAX 24 chars, that captures the niche essence (e.g. 'BREATHE.', 'ENOUGH.', 'SLOW.')",
    "poster_subline": "MAX 60 chars subtitle, sets context"
  }

If product type is "template" or "social_template":
  pdf_body = {
    "template_sections": [
      { "heading": "What's included", "items": ["EXACTLY 4-5 concrete deliverables, each ≤2 lines"] },
      { "heading": "How to customise", "items": ["EXACTLY 3-4 actionable steps, each ≤2 lines"] },
      { "heading": "Best for", "items": ["EXACTLY 3 audience snippets, each ≤1.5 lines"] }
    ]
  }
  HARD limit: total items across all 3 sections MUST NOT exceed 12. Quality + concision beats quantity — the entire content must fit on a single A4 page (after a half-page intro).

Constraints:
- tags array must have EXACTLY 13 items
- etsy_title and tags must not duplicate each other
- shop_title must read like a magazine headline, not an Etsy listing
- English content uses British English
- Turkish fields use natural, fluent Turkish (not direct translation)
- pdf_body MUST match the product type — only fill the relevant subfield`;

function buildUserPrompt(niche: NicheCandidate, productType: string): string {
  return [
    `Niche topic: ${niche.topic}`,
    `Gap angle (what makes this special): ${niche.gapAngle}`,
    `Product type: ${productType}`,
    `Competition level: ${niche.competition}`,
    niche.sourceSignals.length
      ? `Market signals supporting demand:\n${niche.sourceSignals.map((s) => `- ${s}`).join('\n')}`
      : '',
    '',
    `IMPORTANT — fill pdf_body for the "${productType}" type only. The buyer will receive this PDF — make the deliverable content concrete and niche-specific, not generic. This is what they paid for.`,
    '',
    'Write the full sales-ready content package as JSON. The product is a DIGITAL DOWNLOAD (PDF / printable), no physical shipping.',
  ]
    .filter(Boolean)
    .join('\n');
}

function stripJsonFence(s: string): string {
  return s
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

/**
 * Best-effort JSON repair for Claude's occasional output glitches:
 *  - unescaped newlines inside string values
 *  - smart quotes Claude likes to use in copy
 *  - trailing commas
 * Returns the parsed object or throws.
 */
function tolerantParse(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw);
  } catch (firstErr) {
    // Attempt repair pass
    let s = raw;
    // Replace smart quotes with straight quotes
    s = s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    // Remove trailing commas before } or ]
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Escape stray newlines inside string values (best-effort: only between
    // matched quotes on the same logical key). This is intentionally simple.
    s = s.replace(/("(?:\\.|[^"\\])*")|[\n\r]+/g, (m, str) => str ?? '\\n');
    try {
      return JSON.parse(s);
    } catch {
      throw firstErr;
    }
  }
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining marks
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

// Common fallback tags for printable digital products on Etsy.
// Used when Claude returns fewer than 13 — we top up rather than fail.
const COMMON_PRINTABLE_TAGS = [
  'printable pdf',
  'instant download',
  'digital download',
  'minimalist design',
  'modern aesthetic',
  'a4 letter size',
  'printable wall art',
  'home office',
  'self improvement',
  'gift idea',
];

/**
 * Tags from Claude come in unpredictably (8-15). We want EXACTLY 13.
 * Strategy: dedupe, drop empty/too-long, then top up with niche-derived
 * tags + common printable defaults until we hit 13. Trim if over.
 */
function normalizeTags(
  fromClaude: string[],
  niche: NicheCandidate,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const push = (raw: string) => {
    const t = raw.trim().toLowerCase().slice(0, 20);
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };

  // 1) Take Claude's tags first
  for (const t of fromClaude) {
    if (out.length >= 13) break;
    push(t);
  }

  // 2) If short, derive tags from the niche topic itself
  if (out.length < 13) {
    const topicWords = niche.topic
      .toLowerCase()
      .split(/[\s,/-]+/)
      .filter((w) => w.length >= 3 && w.length <= 18);

    // Single words from topic
    for (const w of topicWords) {
      if (out.length >= 13) break;
      push(w);
    }

    // Two-word combinations from topic
    for (let i = 0; i < topicWords.length - 1; i++) {
      if (out.length >= 13) break;
      const combo = `${topicWords[i]} ${topicWords[i + 1]}`;
      if (combo.length <= 20) push(combo);
    }
  }

  // 3) Still short? Top up with common printable tags
  if (out.length < 13) {
    for (const t of COMMON_PRINTABLE_TAGS) {
      if (out.length >= 13) break;
      push(t);
    }
  }

  // 4) Guarantee exactly 13 — if we somehow still have fewer (very unlikely),
  //    pad with numbered fallback. This keeps the contract.
  while (out.length < 13) {
    push(`printable ${out.length + 1}`);
  }

  return out.slice(0, 13);
}

function validateAndNormalize(
  raw: Record<string, unknown>,
  niche: NicheCandidate,
): ProductContent {
  let etsyTitle = typeof raw.etsy_title === 'string' ? raw.etsy_title.trim() : '';
  if (etsyTitle.length === 0) throw new Error('etsy_title missing');
  // Be tolerant: Claude sometimes overshoots by 1-3 chars. Trim at word
  // boundary if possible, then hard-cut. 140 is Etsy's actual limit.
  if (etsyTitle.length > 140) {
    const head = etsyTitle.slice(0, 140);
    const lastPipe = head.lastIndexOf(' | ');
    const lastSpace = head.lastIndexOf(' ');
    // Prefer cutting at a section break (|), else at last word
    if (lastPipe > 100) etsyTitle = head.slice(0, lastPipe).trim();
    else if (lastSpace > 100) etsyTitle = head.slice(0, lastSpace).trim();
    else etsyTitle = head.trim();
  }

  const etsyDescription = typeof raw.etsy_description === 'string' ? raw.etsy_description.trim() : '';
  if (etsyDescription.length < 100) throw new Error('etsy_description too short');

  const tagsRaw = Array.isArray(raw.tags) ? raw.tags : [];
  const tagsFromClaude = tagsRaw.filter((t): t is string => typeof t === 'string');
  const tags = normalizeTags(tagsFromClaude, niche);
  if (tags.length !== 13) {
    // Should never happen given normalizeTags guarantees 13, but keep guard.
    throw new Error(`expected 13 tags after normalization, got ${tags.length}`);
  }

  const shopTitle = typeof raw.shop_title === 'string' ? raw.shop_title.trim() : etsyTitle;
  const shopDescription =
    typeof raw.shop_description === 'string' ? raw.shop_description.trim() : etsyDescription;

  const priceCents = typeof raw.price_cents === 'number' ? Math.round(raw.price_cents) : 750;
  if (priceCents < 100 || priceCents > 10000) {
    throw new Error(`price_cents out of range: ${priceCents}`);
  }

  // Turkish fields — soft requirements (don't fail if Claude omits, fall back).
  const turkishGapAngle =
    typeof raw.turkish_gap_angle === 'string' && raw.turkish_gap_angle.trim().length > 0
      ? raw.turkish_gap_angle.trim().slice(0, 400)
      : `(Türkçe çeviri yok — orijinal: ${niche.gapAngle.slice(0, 200)})`;

  const turkishSummary =
    typeof raw.turkish_summary === 'string' && raw.turkish_summary.trim().length > 0
      ? raw.turkish_summary.trim().slice(0, 300)
      : `${niche.topic} — pazar boşluğunu hedef alan dijital ürün önerisi.`;

  // ── pdf_body — type-specific validation + sensible fallbacks ──
  const pdfBodyRaw = (raw.pdf_body && typeof raw.pdf_body === 'object'
    ? (raw.pdf_body as Record<string, unknown>)
    : {});

  const pdfBody: PdfBody = {};

  // planner: prompts
  if (Array.isArray(pdfBodyRaw.prompts)) {
    pdfBody.prompts = pdfBodyRaw.prompts
      .filter((p): p is string => typeof p === 'string' && p.trim().length > 8)
      .map((p) => p.trim())
      .slice(0, 14);
  }

  // sticker: stickerTexts
  if (Array.isArray(pdfBodyRaw.sticker_texts)) {
    pdfBody.stickerTexts = pdfBodyRaw.sticker_texts
      .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      .map((s) => s.trim().slice(0, 22))
      .slice(0, 9);
  }

  // poster
  if (typeof pdfBodyRaw.poster_phrase === 'string') {
    pdfBody.posterPhrase = pdfBodyRaw.poster_phrase.trim().slice(0, 24);
  }
  if (typeof pdfBodyRaw.poster_subline === 'string') {
    pdfBody.posterSubline = pdfBodyRaw.poster_subline.trim().slice(0, 60);
  }

  // template / social_template: structured sections
  // Hard caps: max 3 sections, max 5 items per section, max 12 items total
  // → guarantees the page fits on a single A4 after the half-page intro.
  if (Array.isArray(pdfBodyRaw.template_sections)) {
    let totalItems = 0;
    pdfBody.templateSections = pdfBodyRaw.template_sections
      .filter((s): s is Record<string, unknown> => typeof s === 'object' && s !== null)
      .map((s) => ({
        heading:
          typeof s.heading === 'string' ? s.heading.trim().slice(0, 80) : 'Section',
        items: Array.isArray(s.items)
          ? s.items
              .filter((i): i is string => typeof i === 'string')
              .map((i) => i.trim())
              .slice(0, 5)
          : [],
      }))
      .filter((s) => s.items.length > 0)
      .slice(0, 3)
      .map((s) => {
        const remaining = Math.max(0, 12 - totalItems);
        const trimmed = { ...s, items: s.items.slice(0, remaining) };
        totalItems += trimmed.items.length;
        return trimmed;
      })
      .filter((s) => s.items.length > 0);
  }

  // B1 — Tier pricing variations (FIXED prices, decided by operator).
  // Mehmet'in kararı: tüm ürünler için sabit ladder — Basic €2.99 / Plus €4.99
  // / Pro €6.99. Claude'un önerdiği price_cents yok sayılır.
  const FIXED_BASIC_CENTS = 299;
  const FIXED_PLUS_CENTS = 499;
  const FIXED_PRO_CENTS = 699;
  const tierBPriceCents = FIXED_PLUS_CENTS;
  const tierCPriceCents = FIXED_PRO_CENTS;
  const tierBDescription =
    'PLUS includes the printable PDF · plus an editable Canva template ' +
    '(swap text, colours, and brand it your way) · plus 3 bonus pages we ' +
    'don\'t include in Basic.';
  const tierCDescription =
    'PRO includes everything in PLUS · plus a 30-day direct-email support ' +
    'window with the Karben studio (we answer within 12 hours, weekends too) ' +
    '· plus quarterly content drops for the same niche (free updates for life).';

  return {
    etsyTitle,
    etsyDescription,
    tags,
    shopTitle,
    shopDescription,
    priceCents: FIXED_BASIC_CENTS,
    tierBPriceCents,
    tierBDescription,
    tierCPriceCents,
    tierCDescription,
    slug: slugify(`${niche.topic}-${shopTitle}`).slice(0, 80),
    turkishGapAngle,
    turkishSummary,
    pdfBody,
  };
}

export async function generateProductContent(
  niche: NicheCandidate,
  productType: NicheCandidate['productHint'],
): Promise<ProductContent> {
  const client = getClient();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(niche, productType) }],
  });

  const textBlock = resp.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for niche: ' + niche.topic);
  }

  const raw = stripJsonFence(textBlock.text);
  let parsed: Record<string, unknown>;
  try {
    parsed = tolerantParse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse content JSON for "${niche.topic}": ${
        err instanceof Error ? err.message : String(err)
      }\nRaw: ${raw.slice(0, 300)}`,
    );
  }

  return validateAndNormalize(parsed, niche);
}
