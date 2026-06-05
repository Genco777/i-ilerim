/**
 * Trend & Gap Discovery — Faz 1
 *
 * Uses Claude to perform gap analysis on a rotating subset of seed
 * topics. Each topic produces 1-3 candidate niches with score 0-100.
 * Returned list is sorted high → low and capped by `maxNiches`.
 *
 * No external trend APIs in Faz 1 — keeps the system robust and
 * avoids rate-limit/scraping fragility. Real signal sources
 * (Google Trends, Etsy search scrape, Pinterest Trends) can be
 * plugged in via the optional `signalProvider` argument later.
 */

import Anthropic from '@anthropic-ai/sdk';
import { pickSeedsForDate, type SeedTopic } from './seed-topics';

const MODEL = 'claude-sonnet-4-6';

export interface NicheCandidate {
  topic: string;
  gapAngle: string;
  score: number; // 0-100
  competition: 'low' | 'medium' | 'high';
  sourceSignals: string[];
  productHint: 'planner' | 'poster' | 'sticker' | 'template' | 'social_template';
}

export interface DiscoveryOptions {
  date?: Date;
  seedCount?: number; // how many seeds to evaluate (default 6)
  maxNiches?: number; // how many top candidates to return (default 3)
  /** Restrict seed pool to one product type (e.g. 'poster' for the poster cron). */
  productHintFilter?: 'planner' | 'poster' | 'sticker' | 'template' | 'social_template';
  /**
   * Optional async fn that returns extra evidence per seed.
   * Reserved for Faz 2+ when we wire Google Trends / Etsy scrape.
   */
  signalProvider?: (seed: SeedTopic) => Promise<string[]>;
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

const SYSTEM_PROMPT = `You are a digital-product market researcher specialising in Etsy and Pinterest printables.

Your job: given a seed topic + audience + suggested product type, identify 1–3 SPECIFIC market GAPS — concrete differentiating angles that are under-served by current top Etsy listings.

A "gap angle" is NOT just "X for Y people" — it must include a sharp differentiator that makes it stand out (visual style, audience sub-segment, format twist, etc).

For each gap, compute a validation score 0–100 using:
  score = demand_proxy × low_competition × monetizability
  - demand_proxy: how many people likely search this monthly (1=tiny, 10=mass-market)
  - low_competition: inverse of Etsy saturation (10=blue ocean, 1=red ocean)
  - monetizability: realistic price point × repeat-buyer potential (1=low, 10=high)
  Then normalize: score = round((demand_proxy + low_competition*1.5 + monetizability) / 35 * 100)

Return STRICT JSON only — no markdown, no preamble, no commentary.

Schema:
{
  "candidates": [
    {
      "topic": "short descriptive topic, 4-8 words",
      "gap_angle": "one sentence describing the specific under-served angle",
      "score": 0-100,
      "competition": "low" | "medium" | "high",
      "source_signals": ["2-4 short evidence strings explaining why this gap exists"],
      "product_hint": "planner" | "poster" | "sticker" | "template" | "social_template"
    }
  ]
}`;

function buildUserPrompt(
  seed: SeedTopic,
  extraSignals: string[],
): string {
  const signalsBlock = extraSignals.length
    ? `\n\nAdditional market signals observed:\n${extraSignals.map((s) => `- ${s}`).join('\n')}`
    : '';

  return [
    `Seed area: ${seed.area}`,
    `Target audience: ${seed.audience}`,
    `Suggested product format: ${seed.productHint}`,
    signalsBlock,
    '',
    'Return 1-3 candidates as JSON. Each candidate must be a CONCRETE, SHIPPABLE product idea — not a category.',
  ].join('\n');
}

function stripJsonFence(s: string): string {
  return s
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

async function analyzeSeed(
  seed: SeedTopic,
  signalProvider?: DiscoveryOptions['signalProvider'],
): Promise<NicheCandidate[]> {
  const extra = signalProvider ? await signalProvider(seed).catch(() => []) : [];

  const client = getClient();
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildUserPrompt(seed, extra) }],
  });

  const textBlock = resp.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text content for seed: ' + seed.area);
  }

  const raw = stripJsonFence(textBlock.text);
  let parsed: { candidates?: unknown[] };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON for "${seed.area}": ${
        err instanceof Error ? err.message : String(err)
      }\nRaw: ${raw.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(parsed.candidates)) return [];

  const validProductHints = new Set<NicheCandidate['productHint']>([
    'planner',
    'poster',
    'sticker',
    'template',
    'social_template',
  ]);

  return parsed.candidates
    .map((c): NicheCandidate | null => {
      if (typeof c !== 'object' || c === null) return null;
      const obj = c as Record<string, unknown>;
      const topic = typeof obj.topic === 'string' ? obj.topic : null;
      const gapAngle = typeof obj.gap_angle === 'string' ? obj.gap_angle : null;
      const score = typeof obj.score === 'number' ? obj.score : null;
      const competition =
        obj.competition === 'low' ||
        obj.competition === 'medium' ||
        obj.competition === 'high'
          ? obj.competition
          : 'medium';
      const signals = Array.isArray(obj.source_signals)
        ? obj.source_signals.filter((s): s is string => typeof s === 'string')
        : [];
      const productHintRaw = typeof obj.product_hint === 'string' ? obj.product_hint : seed.productHint;
      const productHint = validProductHints.has(productHintRaw as NicheCandidate['productHint'])
        ? (productHintRaw as NicheCandidate['productHint'])
        : (seed.productHint as NicheCandidate['productHint']);

      if (!topic || !gapAngle || score === null) return null;
      return {
        topic,
        gapAngle,
        score: Math.max(0, Math.min(100, Math.round(score))),
        competition,
        sourceSignals: signals.slice(0, 6),
        productHint,
      };
    })
    .filter((x): x is NicheCandidate => x !== null);
}

export async function discoverNiches(
  opts: DiscoveryOptions = {},
): Promise<NicheCandidate[]> {
  const date = opts.date ?? new Date();
  const seedCount = opts.seedCount ?? 6;
  const maxNiches = opts.maxNiches ?? 3;

  const seeds = pickSeedsForDate(date, seedCount, opts.productHintFilter);
  if (seeds.length === 0) {
    throw new Error(
      `[discovery] no seed topics matched productHintFilter="${opts.productHintFilter}". ` +
        `Check seed-topics.ts pool.`,
    );
  }

  // Analyse seeds in small batches (Anthropic concurrency-friendly).
  const allCandidates: NicheCandidate[] = [];
  const errors: string[] = [];

  for (const seed of seeds) {
    try {
      const cands = await analyzeSeed(seed, opts.signalProvider);
      allCandidates.push(...cands);
    } catch (err) {
      errors.push(`${seed.area}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (allCandidates.length === 0 && errors.length > 0) {
    throw new Error('Discovery failed for all seeds:\n' + errors.join('\n'));
  }

  // Dedup by topic (case-insensitive), keep highest score per topic.
  const dedup = new Map<string, NicheCandidate>();
  for (const c of allCandidates) {
    const key = c.topic.toLowerCase().trim();
    const existing = dedup.get(key);
    if (!existing || c.score > existing.score) {
      dedup.set(key, c);
    }
  }

  // P1.4 — Sales-driven feedback loop. Boost niches whose keywords appear in
  // products that actually sold in the last 60 days. Penalise rejected niches.
  // The boosting is "soft": ±20 points max, capped to [0, 100].
  try {
    const adjustments = await getSalesAdjustments();
    for (const niche of dedup.values()) {
      const delta = scoreDelta(niche.topic, adjustments);
      niche.score = Math.max(0, Math.min(100, niche.score + delta));
    }
  } catch (err) {
    // Non-fatal: scoring still works without the feedback signal.
    console.warn('[discovery] sales feedback unavailable, using raw scores', err);
  }

  return Array.from(dedup.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxNiches);
}

// ─────────────────────────────────────────────────────────────
// P1.4 — Sales-driven feedback loop
// ─────────────────────────────────────────────────────────────

interface SalesAdjustments {
  /** Keywords from sold products (lowercase tokens, last 60d). */
  sellerKeywords: Map<string, number>; // keyword → sales count
  /** Keywords from rejected/zero-sale niches (last 60d). */
  rejectedKeywords: Set<string>;
}

async function getSalesAdjustments(): Promise<SalesAdjustments> {
  const { db } = await import('@/lib/db');
  const { sql } = await import('drizzle-orm');

  // Last 60 days of sales — pull product topic via join.
  const salesQ = await db.execute(sql`
    SELECT n.topic
    FROM product_sales ps
    JOIN products p ON p.id = ps.product_id
    JOIN niches n ON n.id = p.niche_id
    WHERE ps.sold_at > NOW() - INTERVAL '60 days'
  `);
  const sales = ((salesQ as unknown as { rows?: { topic: string }[] }).rows
    ?? (salesQ as unknown as { topic: string }[])) ?? [];

  const sellerKeywords = new Map<string, number>();
  for (const row of sales) {
    for (const tok of tokenize(row.topic)) {
      sellerKeywords.set(tok, (sellerKeywords.get(tok) ?? 0) + 1);
    }
  }

  // Rejected niches in last 60 days
  const rejectedQ = await db.execute(sql`
    SELECT n.topic
    FROM products p
    JOIN niches n ON n.id = p.niche_id
    WHERE p.status = 'rejected' AND p.created_at > NOW() - INTERVAL '60 days'
  `);
  const rejected = ((rejectedQ as unknown as { rows?: { topic: string }[] }).rows
    ?? (rejectedQ as unknown as { topic: string }[])) ?? [];
  const rejectedKeywords = new Set<string>();
  for (const row of rejected) {
    for (const tok of tokenize(row.topic)) rejectedKeywords.add(tok);
  }

  return { sellerKeywords, rejectedKeywords };
}

function scoreDelta(topic: string, adj: SalesAdjustments): number {
  const toks = tokenize(topic);
  let delta = 0;
  for (const t of toks) {
    const salesHits = adj.sellerKeywords.get(t) ?? 0;
    if (salesHits > 0) delta += Math.min(8, 3 + salesHits * 2); // +5 first hit, capped
    if (adj.rejectedKeywords.has(t)) delta -= 4;
  }
  // Clamp to ±20 so the LLM score still dominates
  return Math.max(-20, Math.min(20, delta));
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'for', 'with', 'in', 'on', 'of', 'to',
  'is', 'it', 'be', 'are', 'this', 'that', 'your', 'my', 'i', 'you', 'we',
  'planner', 'tracker', 'template', 'journal', 'guide', 'pdf', 'printable',
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 4 && !STOPWORDS.has(t));
}
