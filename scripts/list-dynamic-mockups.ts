#!/usr/bin/env tsx
/**
 * List all mockups added to "My Templates" in Dynamic Mockups.
 *
 * Usage:
 *   pnpm tsx scripts/list-dynamic-mockups.ts
 *
 * Reads DYNAMIC_MOCKUPS_API_KEY from .env.local.
 * Prints each mockup's UUID, name, thumbnail URL, and inferred category
 * (so we can hardcode the right UUIDs for each product type in mockup.ts).
 */

import 'dotenv/config';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

// Load .env.local explicitly (dotenv/config loads .env by default).
loadEnv({ path: resolve(process.cwd(), '.env.local') });

const API_KEY = process.env.DYNAMIC_MOCKUPS_API_KEY;
if (!API_KEY) {
  console.error('❌ DYNAMIC_MOCKUPS_API_KEY not found in .env.local');
  process.exit(1);
}

interface Mockup {
  uuid: string;
  name: string;
  thumbnail: string;
  smart_objects: Array<{
    uuid: string;
    name: string;
    size?: { width: number; height: number };
  }>;
}

interface MockupsResponse {
  data: Mockup[];
  success: boolean;
  message: string;
}

// Naive keyword classifier — used to suggest which product type each mockup
// is best suited for. Mehmet/Claude can override after seeing the list.
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  planner: ['planner', 'notebook', 'journal', 'organizer', 'cafe', 'desk notebook'],
  sticker: ['sticker', 'washi', 'sheet of stickers'],
  poster: ['frame', 'wall art', 'framed', 'gallery wall', 'print on wall', 'poster'],
  template: ['laptop', 'desktop', 'macbook', 'tablet', 'ipad', 'magazine', 'a4', 'letter'],
  social_template: ['phone', 'iphone', 'social', 'instagram', 'mobile mockup'],
};

function suggestCategory(name: string): string[] {
  const lower = name.toLowerCase();
  const matched: string[] = [];
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) matched.push(category);
  }
  return matched;
}

async function main() {
  const res = await fetch('https://app.dynamicmockups.com/api/v1/mockups?include_all_catalogs=true', {
    headers: {
      'x-api-key': API_KEY!,
      accept: 'application/json',
    },
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`❌ API error: HTTP ${res.status}`);
    console.error(text.slice(0, 500));
    process.exit(1);
  }

  const json = (await res.json()) as MockupsResponse;
  const mockups = json.data ?? [];

  console.log(`\n✅ Found ${mockups.length} mockups in "My Templates":\n`);

  // Group by suggested category for easier picking
  const grouped: Record<string, Mockup[]> = {
    planner: [],
    sticker: [],
    poster: [],
    template: [],
    social_template: [],
    uncategorized: [],
  };

  for (const m of mockups) {
    const cats = suggestCategory(m.name);
    if (cats.length === 0) {
      grouped.uncategorized!.push(m);
    } else {
      for (const c of cats) grouped[c]!.push(m);
    }
  }

  for (const [category, items] of Object.entries(grouped)) {
    if (items.length === 0) continue;
    console.log(`\n══ ${category.toUpperCase()} (${items.length}) ══`);
    for (const m of items) {
      const firstSoUuid = m.smart_objects[0]?.uuid ?? '(no smart objects!)';
      console.log(`  • ${m.name}`);
      console.log(`    mockup_uuid:       ${m.uuid}`);
      console.log(`    smart_object_uuid: ${firstSoUuid}`);
      console.log(`    thumbnail:         ${m.thumbnail}`);
    }
  }

  // JSON export for programmatic use
  console.log('\n\n══ RAW JSON (copy this) ══');
  console.log(
    JSON.stringify(
      mockups.map((m) => ({
        uuid: m.uuid,
        name: m.name,
        thumbnail: m.thumbnail,
        smart_object_uuid: m.smart_objects[0]?.uuid ?? null,
        suggested_categories: suggestCategory(m.name),
      })),
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
