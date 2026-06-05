/**
 * C3 — A/B Title Test
 *
 * Strategy:
 *   1. At product creation, Claude generates 2 alternative Etsy titles
 *      (variants B + C) with different keyword emphasis vs the original
 *      (variant A).
 *   2. Variants stored in products row at insert time.
 *   3. Weekly cron `/api/cron/title-rotate` rotates the active variant on
 *      Etsy (updates listing title via Etsy v3 API), tracks views per
 *      variant, and after 4 weeks picks the winner.
 *
 * Why 3 variants:
 *   - Variant A (Claude+C1 optimized): "primary keyword | format | benefit"
 *   - Variant B (alternative keyword emphasis): different lead phrase
 *   - Variant C (occasion/buyer-emphasis): gift / use-case framing
 *
 * Hooks: called from orchestrator.ts AFTER C1 optimizer, BEFORE DB insert.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { NicheCandidate } from './discovery';
import type { ProductContent } from './content';

const MODEL = 'claude-sonnet-4-6';

export interface TitleVariants {
  /** Variant A — already in content.etsyTitle, just here for completeness. */
  a: string;
  /** Variant B — alternative keyword emphasis. */
  b: string;
  /** Variant C — occasion / buyer-emphasis framing. */
  c: string;
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

const SYSTEM_PROMPT = `You are an Etsy SEO copywriter generating ALTERNATIVE
title variants for A/B testing.

Given an existing optimized title (Variant A), produce TWO distinctly
different alternatives:

  Variant B — Lead with a DIFFERENT primary keyword from Variant A. Same
  product, different search query angle. (Example: if A leads with
  "Boho Mountain Print", B might lead with "Minimalist Wall Art" or
  "Printable Landscape Art".)

  Variant C — OCCASION / BUYER framing. Lead with the use case (gift,
  housewarming, nursery, office, back-to-school, etc.) before the product
  type. This catches gift-buyer searches.

Rules per variant:
- ≤140 chars, NO emojis, use | (pipe) separators
- Primary keyword in first 40 chars
- Variants B + C must be MEANINGFULLY different from A AND from each other
- Same niche/product as A

Output STRICT JSON: { "b": "...", "c": "..." }`;

function buildUserMessage(
  niche: NicheCandidate,
  content: ProductContent,
): string {
  return [
    `Niche: ${niche.topic}`,
    `Product type: ${niche.productHint}`,
    ``,
    `Variant A (current optimized title):`,
    content.etsyTitle,
    ``,
    `Description excerpt for context:`,
    (content.shopDescription ?? '').slice(0, 300),
    ``,
    `Generate Variant B (different primary keyword angle) and Variant C`,
    `(occasion / gift-buyer framing). Return STRICT JSON.`,
  ].join('\n');
}

function tryParseJson(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
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
 * Generate B + C title variants. Best-effort: returns the original title for
 * both if Claude fails, so the pipeline never breaks.
 */
export async function generateTitleVariants(
  niche: NicheCandidate,
  content: ProductContent,
): Promise<TitleVariants> {
  try {
    const client = getClient();
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserMessage(niche, content) }],
    });
    const textBlock = resp.content.find((b) => b.type === 'text');
    const raw = textBlock && textBlock.type === 'text' ? textBlock.text : '';
    const parsed = tryParseJson(raw) as { b?: unknown; c?: unknown } | null;

    const b =
      parsed && typeof parsed.b === 'string' && parsed.b.length > 10
        ? parsed.b.slice(0, 140)
        : content.etsyTitle;
    const c =
      parsed && typeof parsed.c === 'string' && parsed.c.length > 10
        ? parsed.c.slice(0, 140)
        : content.etsyTitle;

    return { a: content.etsyTitle, b, c };
  } catch (err) {
    console.warn('[title-ab] generation failed, using original for B and C', err);
    return {
      a: content.etsyTitle,
      b: content.etsyTitle,
      c: content.etsyTitle,
    };
  }
}
