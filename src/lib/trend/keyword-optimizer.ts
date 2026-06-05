/**
 * C1 — Keyword Optimizer (eRank-style refinement pass)
 *
 * Runs as a SECOND Claude pass over the initial Etsy listing content. While
 * the initial pass focuses on "interesting copy that converts", this pass
 * focuses on DISCOVERABILITY:
 *
 *   - Primary keyword anchored in the first 40 chars of the Etsy title
 *     (Etsy weighs this heavily for search match)
 *   - 13 long-tail tags that buyers actually TYPE to find this product
 *   - Tag de-saturation: avoid single-word generic tags that compete with
 *     millions of listings ("planner", "printable", "art") — favour 2-4 word
 *     phrases ("adhd habit tracker", "printable boho wall art")
 *   - Diversification: tags cover 3 axes — niche topic, format/type, and
 *     buyer-occasion (gift/personal/seasonal)
 *
 * Hooks: called from orchestrator.ts AFTER generateProductContent and BEFORE
 * the products row insert, so the DB row already has the optimized strings.
 * Also exposed as `optimizeKeywordsForExistingProduct(productId)` so the
 * backfill cron can sweep older approved products.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { NicheCandidate } from './discovery';
import type { ProductContent } from './content';

const MODEL = 'claude-sonnet-4-6';

export interface OptimizedKeywords {
  /** Refined Etsy title — primary keyword in first 40 chars. Max 140 chars. */
  etsyTitle: string;
  /** Exactly 13 long-tail tags, each ≤20 chars, sorted by search potential. */
  tags: string[];
  /** Claude's reasoning (operator-visible in Telegram digest). */
  reasoning: string;
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

const SYSTEM_PROMPT = `You are an Etsy SEO expert specializing in printable digital products.
Your job: refine an Etsy listing's TITLE + 13 TAGS for maximum search
discoverability while avoiding over-saturated generic terms.

Rules:
- Etsy weighs the FIRST 40 CHARACTERS of the title heavily — put the primary
  high-search keyword right at the start.
- Use | (pipe) as separator in title, not commas or dashes.
- Title max 140 chars, NO emojis.
- Tags: exactly 13, each ≤20 chars, lowercase, no punctuation except spaces.
- Tag strategy:
  - 5-6 long-tail niche-specific (2-4 words: "boho mountain print", "adhd habit tracker")
  - 2-3 format/format ("printable wall art", "digital download", "instant pdf")
  - 2-3 buyer-occasion ("gift for her", "housewarming gift", "back to school")
  - 1-2 visual/style descriptors ("watercolor art", "minimalist decor")
- AVOID generic single-word tags ("planner", "art", "printable" alone — these
  saturate). Always pair with a qualifier.
- Diversify: no two tags should share more than ONE word.

Output STRICT JSON: { "etsyTitle": "...", "tags": [...13...], "reasoning": "1-2 sentences" }`;

function buildUserMessage(
  niche: NicheCandidate,
  content: ProductContent,
): string {
  return [
    `Niche topic: ${niche.topic}`,
    `Gap angle: ${niche.gapAngle}`,
    `Product type: ${niche.productHint}`,
    ``,
    `Current draft Etsy title:`,
    content.etsyTitle,
    ``,
    `Current draft tags:`,
    content.tags.join(', '),
    ``,
    `Current shop description excerpt:`,
    (content.shopDescription ?? '').slice(0, 400),
    ``,
    `Optimize the title + 13 tags for maximum Etsy search discoverability.`,
    `Return STRICT JSON.`,
  ].join('\n');
}

function tryParseJson(raw: string): unknown {
  // Claude sometimes wraps JSON in code fences. Strip them.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find the first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/**
 * Pad/trim a tag array to exactly 13 entries, enforce length limits.
 */
function normalizeTags(input: unknown, fallback: string[]): string[] {
  const arr = Array.isArray(input) ? input : [];
  const cleaned = arr
    .map((t) => (typeof t === 'string' ? t.toLowerCase().trim() : ''))
    .filter((t) => t.length > 0 && t.length <= 20)
    .slice(0, 13);
  while (cleaned.length < 13 && fallback.length > 0) {
    const candidate = fallback.shift();
    if (candidate && !cleaned.includes(candidate)) cleaned.push(candidate);
  }
  while (cleaned.length < 13) {
    cleaned.push('printable');
  }
  return cleaned;
}

/**
 * Run the C1 optimizer.
 *
 * Best-effort: if Claude fails or returns malformed JSON, we fall back to
 * the existing content untouched (so the pipeline never breaks because of
 * SEO refinement).
 */
export async function optimizeKeywords(
  niche: NicheCandidate,
  content: ProductContent,
): Promise<OptimizedKeywords> {
  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(niche, content) }],
    });

    const textBlock = resp.content.find((b) => b.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';

    const parsed = tryParseJson(raw) as
      | { etsyTitle?: unknown; tags?: unknown; reasoning?: unknown }
      | null;

    if (!parsed) {
      console.warn('[keyword-optimizer] could not parse Claude response, using original');
      return {
        etsyTitle: content.etsyTitle,
        tags: content.tags,
        reasoning: 'optimizer-skipped (parse fail)',
      };
    }

    const etsyTitle =
      typeof parsed.etsyTitle === 'string' && parsed.etsyTitle.length > 0
        ? parsed.etsyTitle.slice(0, 140)
        : content.etsyTitle;

    const tags = normalizeTags(parsed.tags, [...content.tags]);

    const reasoning =
      typeof parsed.reasoning === 'string'
        ? parsed.reasoning.slice(0, 400)
        : 'optimized';

    return { etsyTitle, tags, reasoning };
  } catch (err) {
    console.warn('[keyword-optimizer] failed (using original content)', err);
    return {
      etsyTitle: content.etsyTitle,
      tags: content.tags,
      reasoning: `optimizer-error: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`,
    };
  }
}

/**
 * Backfill helper: rewrite ONE existing product's title + tags.
 *
 * Used by the optional backfill cron (`/api/cron/keyword-backfill`) to sweep
 * older approved products without breaking the live cron flow.
 */
export async function optimizeKeywordsForExistingProduct(
  productId: string,
): Promise<OptimizedKeywords | null> {
  const { db } = await import('@/lib/db');
  const { products, niches } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');

  const rows = await db
    .select()
    .from(products)
    .leftJoin(niches, eq(niches.id, products.niche_id))
    .where(eq(products.id, productId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const p = row.products;
  const n = row.niches;
  if (!n) return null;

  const niche: NicheCandidate = {
    topic: n.topic,
    gapAngle: (n.gap_angle ?? '').slice(0, 400),
    score: n.score ?? 0,
    competition: (n.competition_level ?? 'medium') as 'low' | 'medium' | 'high',
    productHint: p.type as NicheCandidate['productHint'],
  };

  const content: ProductContent = {
    etsyTitle: p.etsy_title ?? '',
    etsyDescription: p.etsy_description ?? '',
    tags: (p.tags as string[] | null) ?? [],
    shopTitle: p.shop_title ?? '',
    shopDescription: p.shop_description ?? '',
    priceCents: p.price_cents,
    slug: p.slug ?? '',
    turkishGapAngle: '',
    turkishSummary: '',
    pdfBody: {},
  };

  const optimized = await optimizeKeywords(niche, content);

  await db
    .update(products)
    .set({
      etsy_title: optimized.etsyTitle,
      tags: optimized.tags,
      updated_at: new Date(),
    })
    .where(eq(products.id, productId));

  return optimized;
}
