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

export interface ProductContent {
  etsyTitle: string;
  etsyDescription: string;
  tags: string[]; // exactly 13, each ≤20 chars
  shopTitle: string;
  shopDescription: string;
  priceCents: number; // suggested price
  slug: string; // url-safe slug for /shop/[slug]
  /** Turkish — operator-facing only (Telegram digest + approval UI). */
  turkishGapAngle: string;
  turkishSummary: string;
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

const SYSTEM_PROMPT = `You are a digital-product copywriter specialising in Etsy SEO and own-shop conversion copy.

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
  "turkish_summary": "string, 1 Turkish sentence (max 180 chars) — Türkçe olarak 'bu ürün neden satar' özet. Hedef kitle + temel değer önerisi."
}

Constraints:
- tags array must have EXACTLY 13 items
- etsy_title and tags must not duplicate each other
- shop_title must read like a magazine headline, not an Etsy listing
- English content uses British English
- Turkish fields use natural, fluent Turkish (not direct translation) — they help a Turkish-speaking operator evaluate the product quickly`;

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

  return {
    etsyTitle,
    etsyDescription,
    tags,
    shopTitle,
    shopDescription,
    priceCents,
    slug: slugify(`${niche.topic}-${shopTitle}`).slice(0, 80),
    turkishGapAngle,
    turkishSummary,
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
