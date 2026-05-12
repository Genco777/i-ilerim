# Google Ads Integration — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/ads new` Telegram wizard that creates Google Ads Search campaigns with AI-generated copy/keywords, strict budget guards, and pause/resume management — matching the existing mail/invoice approval UX.

**Architecture:** New `src/lib/google-ads/` module wraps the `google-ads-api` SDK. Three new DB tables follow existing singleton + draft patterns (`email_preferences`, `mail_drafts`). A wizard state machine in `ads-drafts` advances through type→target→budget→AI generation→approval steps. Tokens persisted as encrypted rows in `secrets`.

**Tech Stack:**
- `google-ads-api` (^17.x) — community gRPC SDK
- Drizzle ORM + Neon PostgreSQL (existing)
- `@anthropic-ai/sdk` Claude Sonnet 4.6 (existing) for ad copy + keyword seeds
- Vitest (existing)
- Next.js 16 App Router (existing)

**Scope:** Phase 1 only — Search campaigns, create/pause/resume/list. Phase 2-4 (PMax/Display, edit, daily report, anomaly cron) get separate plans.

**Reference spec:** `docs/superpowers/specs/2026-05-12-google-ads-integration-design.md`

---

## File Structure

**Create:**
- `scripts/check-google-ads.ts` — one-time setup verifier
- `src/lib/google-ads/types.ts`
- `src/lib/google-ads/client.ts`
- `src/lib/google-ads/budget-guard.ts`
- `src/lib/google-ads/ads-copy.ts`
- `src/lib/google-ads/keywords.ts`
- `src/lib/google-ads/campaigns.ts`
- `src/lib/google-ads/ad-groups.ts`
- `src/lib/db/queries/ads-preferences.ts`
- `src/lib/db/queries/ads-campaigns.ts`
- `src/lib/db/queries/ads-drafts.ts`
- `src/lib/telegram/ads-keyboard.ts`
- `src/__tests__/ads-preferences.test.ts`
- `src/__tests__/ads-budget-guard.test.ts`
- `src/__tests__/ads-copy.test.ts`
- `src/__tests__/ads-keyboard.test.ts`
- `drizzle/migrations/<NNNN>_google_ads.sql` (generated)

**Modify:**
- `src/lib/db/schema.ts` — add 3 tables + 1 enum
- `src/app/api/telegram/webhook/[secret]/route.ts` — `/ads` dispatch + help text
- `package.json` — add `google-ads-api` dependency

**Conventions matched (do not reinvent):**
- Singleton table: `email_preferences` → `ads_preferences` (id=1, default-seeded)
- Draft state machine: `mail_drafts` → `ads_drafts`
- Mirror table: `invoices` cents-as-integer → `ads_campaigns.daily_budget_cents`
- Encrypted tokens: `src/lib/crypto/secrets.ts` `setSecret`/`getSecret`
- Inline keyboard pattern: `mail-keyboard.ts`
- Cron auth: `CRON_SECRET` header (deferred to Phase 3)

---

## Task 1: Install SDK and create setup verification script

**Files:**
- Modify: `package.json`
- Create: `scripts/check-google-ads.ts`
- Modify: `.env.example` (if exists; otherwise create)

- [ ] **Step 1: Add dependency**

```bash
cd C:/Users/flyfr/fly-froth-social
pnpm add google-ads-api@^17.0.0
```

Expected: `google-ads-api` appears in `dependencies` of `package.json`.

- [ ] **Step 2: Document env vars in `.env.example`**

If `.env.example` doesn't exist, create it. Append:

```bash
# Google Ads API (Phase 1)
GOOGLE_ADS_DEVELOPER_TOKEN=
GOOGLE_ADS_CLIENT_ID=
GOOGLE_ADS_CLIENT_SECRET=
GOOGLE_ADS_REFRESH_TOKEN=
GOOGLE_ADS_CUSTOMER_ID=
# Optional: MCC manager account; leave empty if not using MCC
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
```

- [ ] **Step 3: Create `scripts/check-google-ads.ts`**

```ts
import { config } from 'dotenv';
import { GoogleAdsApi } from 'google-ads-api';

config({ path: '.env.local' });
config({ path: '.env' });

const REQUIRED = [
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GOOGLE_ADS_CUSTOMER_ID',
] as const;

async function main() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    console.error('❌ Missing env vars:', missing.join(', '));
    process.exit(1);
  }

  const client = new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  });

  const customer = client.Customer({
    customer_id: process.env.GOOGLE_ADS_CUSTOMER_ID!,
    login_customer_id: process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID || undefined,
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  });

  try {
    const rows = await customer.query(`
      SELECT customer.id, customer.descriptive_name, customer.currency_code,
             customer.time_zone, customer.conversion_tracking_setting.conversion_tracking_status
      FROM customer
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      console.error('❌ No customer row returned. Check customer_id and permissions.');
      process.exit(1);
    }
    console.log('✓ Connected to Google Ads');
    console.log('  Account:', row.customer?.descriptive_name);
    console.log('  Currency:', row.customer?.currency_code);
    console.log('  Time zone:', row.customer?.time_zone);
    console.log(
      '  Conversion tracking:',
      row.customer?.conversion_tracking_setting?.conversion_tracking_status,
    );
    if (row.customer?.currency_code !== 'EUR') {
      console.warn('⚠️  Customer currency is not EUR. Budget guard assumes EUR — review before going live.');
    }
  } catch (err) {
    console.error('❌ Google Ads API call failed:', err);
    process.exit(1);
  }
}

main();
```

- [ ] **Step 4: Add npm script**

In `package.json`, add to `scripts`:

```json
"check:google-ads": "tsx scripts/check-google-ads.ts"
```

- [ ] **Step 5: Smoke test (only if env vars are populated)**

Run: `pnpm check:google-ads`
Expected (with credentials): prints account name, currency, time zone, conversion tracking status.
Expected (without): exits with `Missing env vars` message — verifies the script structure even before Google approves the developer token.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .env.example scripts/check-google-ads.ts
git commit -m "feat(ads): add google-ads SDK and setup verification script"
```

---

## Task 2: Add `ads_preferences` singleton table + queries + tests

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/queries/ads-preferences.ts`
- Create: `src/__tests__/ads-preferences.test.ts`

- [ ] **Step 1: Add table to schema**

In `src/lib/db/schema.ts`, after the `emailPreferences` block, add:

```ts
// ── Ads Preferences (singleton, id=1) ──
export const adsPreferences = pgTable('ads_preferences', {
  id: integer('id').primaryKey().default(1),
  daily_limit_cents: integer('daily_limit_cents').notNull().default(5000),
  monthly_limit_cents: integer('monthly_limit_cents').notNull().default(100000),
  default_location_id: bigint('default_location_id', { mode: 'number' })
    .notNull()
    .default(2276), // Germany
  default_language_code: text('default_language_code').notNull().default('de'),
  notify_anomaly_threshold_pct: integer('notify_anomaly_threshold_pct')
    .notNull()
    .default(300),
  report_chat_id: bigint('report_chat_id', { mode: 'number' }),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

- [ ] **Step 2: Write the failing tests**

Create `src/__tests__/ads-preferences.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  getAdsPreferences,
  updateAdsPreferences,
  DEFAULT_ADS_PREFERENCES,
} from '@/lib/db/queries/ads-preferences';

describe('ads preferences', () => {
  if (process.env.CI) return;

  it('returns defaults when no row exists', async () => {
    const prefs = await getAdsPreferences();
    expect(prefs.daily_limit_cents).toBe(DEFAULT_ADS_PREFERENCES.daily_limit_cents);
    expect(prefs.monthly_limit_cents).toBe(DEFAULT_ADS_PREFERENCES.monthly_limit_cents);
    expect(prefs.default_language_code).toBe('de');
  });

  it('returns updated limit after update', async () => {
    await updateAdsPreferences({ daily_limit_cents: 7500 });
    const prefs = await getAdsPreferences();
    expect(prefs.daily_limit_cents).toBe(7500);
    // Reset
    await updateAdsPreferences({
      daily_limit_cents: DEFAULT_ADS_PREFERENCES.daily_limit_cents,
    });
  });
});
```

- [ ] **Step 3: Run tests, verify they fail**

```bash
pnpm test src/__tests__/ads-preferences.test.ts
```

Expected: FAIL — module not found `@/lib/db/queries/ads-preferences`.

- [ ] **Step 4: Implement queries**

Create `src/lib/db/queries/ads-preferences.ts`:

```ts
import { db } from '@/lib/db';
import { adsPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export const DEFAULT_ADS_PREFERENCES = {
  daily_limit_cents: 5000,
  monthly_limit_cents: 100000,
  default_location_id: 2276,
  default_language_code: 'de',
  notify_anomaly_threshold_pct: 300,
} as const;

export type AdsPreferences = {
  id: number;
  daily_limit_cents: number;
  monthly_limit_cents: number;
  default_location_id: number;
  default_language_code: string;
  notify_anomaly_threshold_pct: number;
  report_chat_id: number | null;
  updated_at: Date;
};

export async function getAdsPreferences(): Promise<AdsPreferences> {
  const rows = await db
    .select()
    .from(adsPreferences)
    .where(eq(adsPreferences.id, 1))
    .limit(1);

  const row = rows[0];
  if (row) return row;

  const [created] = await db
    .insert(adsPreferences)
    .values({ id: 1 })
    .returning();
  if (!created) throw new Error('Failed to seed ads_preferences');
  return created;
}

export async function updateAdsPreferences(
  patch: Partial<Omit<AdsPreferences, 'id' | 'updated_at'>>,
): Promise<void> {
  // Ensure row exists
  await getAdsPreferences();
  const [updated] = await db
    .update(adsPreferences)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(adsPreferences.id, 1))
    .returning();
  if (!updated) throw new Error('ads_preferences row missing after seed');
}
```

- [ ] **Step 5: Run tests, verify they pass**

```bash
pnpm test src/__tests__/ads-preferences.test.ts
```

Expected: PASS (assuming local Postgres reachable; CI guard `if (process.env.CI) return;` skips them in CI).

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/queries/ads-preferences.ts src/__tests__/ads-preferences.test.ts
git commit -m "feat(ads): add ads_preferences singleton with defaults"
```

---

## Task 3: Add `ads_campaigns` mirror table + queries

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/queries/ads-campaigns.ts`

- [ ] **Step 1: Add enum + table to schema**

In `src/lib/db/schema.ts`, after the `slotStatus` enum, add:

```ts
export const adsCampaignType = pgEnum('ads_campaign_type', [
  'search',
  'pmax',
  'display',
  'retargeting',
  'local',
]);

export const adsCampaignStatus = pgEnum('ads_campaign_status', [
  'enabled',
  'paused',
  'removed',
]);

export const adsDraftStatus = pgEnum('ads_draft_status', [
  'collecting',
  'awaiting_approval',
  'confirmed',
  'cancelled',
  'failed',
]);
```

Then, after the `adsPreferences` block (added in Task 2), append:

```ts
export const adsCampaigns = pgTable(
  'ads_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    google_campaign_id: text('google_campaign_id').unique(),
    name: text('name').notNull(),
    type: adsCampaignType('type').notNull(),
    status: adsCampaignStatus('status').notNull().default('paused'),
    daily_budget_cents: integer('daily_budget_cents').notNull(),
    target_url: text('target_url').notNull(),
    conversion_action: text('conversion_action'),
    start_date: text('start_date'),
    end_date: text('end_date'),
    created_via: text('created_via').notNull(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    chatStatusIdx: index('ads_campaigns_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);
```

- [ ] **Step 2: Implement queries**

Create `src/lib/db/queries/ads-campaigns.ts`:

```ts
import { db } from '@/lib/db';
import { adsCampaigns } from '@/lib/db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';

export type AdsCampaignType = 'search' | 'pmax' | 'display' | 'retargeting' | 'local';
export type AdsCampaignStatus = 'enabled' | 'paused' | 'removed';

export type AdsCampaign = {
  id: string;
  google_campaign_id: string | null;
  name: string;
  type: AdsCampaignType;
  status: AdsCampaignStatus;
  daily_budget_cents: number;
  target_url: string;
  conversion_action: string | null;
  start_date: string | null;
  end_date: string | null;
  created_via: string;
  telegram_chat_id: number;
  created_at: Date;
  updated_at: Date;
};

export type NewAdsCampaign = Omit<AdsCampaign, 'id' | 'created_at' | 'updated_at'>;

export async function createCampaignRow(data: NewAdsCampaign): Promise<AdsCampaign> {
  const [created] = await db.insert(adsCampaigns).values(data).returning();
  if (!created) throw new Error('Failed to insert ads_campaigns row');
  return created;
}

export async function getCampaign(id: string): Promise<AdsCampaign | null> {
  const rows = await db
    .select()
    .from(adsCampaigns)
    .where(eq(adsCampaigns.id, id))
    .limit(1);
  return rows[0] ?? null;
}

export async function getCampaignByGoogleId(googleId: string): Promise<AdsCampaign | null> {
  const rows = await db
    .select()
    .from(adsCampaigns)
    .where(eq(adsCampaigns.google_campaign_id, googleId))
    .limit(1);
  return rows[0] ?? null;
}

export async function listCampaignsByChat(
  chatId: number,
  statuses: AdsCampaignStatus[] = ['enabled', 'paused'],
): Promise<AdsCampaign[]> {
  return db
    .select()
    .from(adsCampaigns)
    .where(
      and(
        eq(adsCampaigns.telegram_chat_id, chatId),
        inArray(adsCampaigns.status, statuses),
      ),
    );
}

export async function updateCampaignRow(
  id: string,
  patch: Partial<Omit<NewAdsCampaign, 'telegram_chat_id'>>,
): Promise<AdsCampaign> {
  const [updated] = await db
    .update(adsCampaigns)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(adsCampaigns.id, id))
    .returning();
  if (!updated) throw new Error(`AdsCampaign ${id} not found`);
  return updated;
}

export async function sumActiveDailyBudgetCents(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(daily_budget_cents), 0)::int AS total
    FROM ads_campaigns
    WHERE status = 'enabled'
  `);
  const rows =
    (result as unknown as { rows: { total: number }[] }).rows ??
    (result as unknown as { total: number }[]);
  return rows[0]?.total ?? 0;
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors related to these files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/queries/ads-campaigns.ts
git commit -m "feat(ads): add ads_campaigns table and queries"
```

---

## Task 4: Add `ads_drafts` wizard-state table + queries

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/queries/ads-drafts.ts`

- [ ] **Step 1: Add table to schema**

In `src/lib/db/schema.ts`, after `adsCampaigns`, append:

```ts
export interface AdsDraftPayload {
  type?: 'search' | 'pmax' | 'display' | 'retargeting' | 'local';
  target_url?: string;
  conversion_action?: string;
  campaign_name?: string;
  daily_budget_cents?: number;
  start_date?: string;
  end_date?: string;
}

export interface AdsGeneratedCopy {
  headlines: string[];
  descriptions: string[];
}

export interface AdsGeneratedKeyword {
  keyword: string;
  match_type: 'BROAD' | 'PHRASE' | 'EXACT';
  estimated_monthly_volume?: number;
}

export const adsDrafts = pgTable(
  'ads_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: adsDraftStatus('status').notNull().default('collecting'),
    current_step: text('current_step').notNull().default('type'),
    draft_payload: jsonb('draft_payload')
      .$type<AdsDraftPayload>()
      .notNull()
      .default({}),
    generated_copy: jsonb('generated_copy').$type<AdsGeneratedCopy | null>(),
    generated_keywords: jsonb('generated_keywords')
      .$type<AdsGeneratedKeyword[] | null>(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    telegram_preview_msg_id: integer('telegram_preview_msg_id'),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    chatStatusIdx: index('ads_drafts_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);
```

- [ ] **Step 2: Implement queries**

Create `src/lib/db/queries/ads-drafts.ts`:

```ts
import { db } from '@/lib/db';
import {
  adsDrafts,
  type AdsDraftPayload,
  type AdsGeneratedCopy,
  type AdsGeneratedKeyword,
} from '@/lib/db/schema';
import { and, eq, inArray, desc } from 'drizzle-orm';

export type AdsDraftStatus =
  | 'collecting'
  | 'awaiting_approval'
  | 'confirmed'
  | 'cancelled'
  | 'failed';

export type AdsWizardStep =
  | 'type'
  | 'target'
  | 'budget'
  | 'copy_review'
  | 'approval';

export type AdsDraft = {
  id: string;
  status: AdsDraftStatus;
  current_step: AdsWizardStep;
  draft_payload: AdsDraftPayload;
  generated_copy: AdsGeneratedCopy | null;
  generated_keywords: AdsGeneratedKeyword[] | null;
  telegram_chat_id: number;
  telegram_preview_msg_id: number | null;
  error: string | null;
  created_at: Date;
  sent_at: Date | null;
};

const ACTIVE_STATUSES: AdsDraftStatus[] = ['collecting', 'awaiting_approval'];

export async function createAdsDraft(chatId: number): Promise<AdsDraft> {
  const [created] = await db
    .insert(adsDrafts)
    .values({
      telegram_chat_id: chatId,
      status: 'collecting',
      current_step: 'type',
      draft_payload: {},
    })
    .returning();
  if (!created) throw new Error('Failed to insert ads_drafts row');
  return created as AdsDraft;
}

export async function getAdsDraft(id: string): Promise<AdsDraft | null> {
  const rows = await db
    .select()
    .from(adsDrafts)
    .where(eq(adsDrafts.id, id))
    .limit(1);
  return (rows[0] as AdsDraft | undefined) ?? null;
}

export async function getActiveAdsDraft(chatId: number): Promise<AdsDraft | null> {
  const rows = await db
    .select()
    .from(adsDrafts)
    .where(
      and(
        eq(adsDrafts.telegram_chat_id, chatId),
        inArray(adsDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .orderBy(desc(adsDrafts.created_at))
    .limit(1);
  return (rows[0] as AdsDraft | undefined) ?? null;
}

export async function updateAdsDraft(
  id: string,
  patch: Partial<{
    status: AdsDraftStatus;
    current_step: AdsWizardStep;
    draft_payload: AdsDraftPayload;
    generated_copy: AdsGeneratedCopy | null;
    generated_keywords: AdsGeneratedKeyword[] | null;
    telegram_preview_msg_id: number | null;
    error: string | null;
    sent_at: Date | null;
  }>,
): Promise<AdsDraft> {
  const [updated] = await db
    .update(adsDrafts)
    .set(patch)
    .where(eq(adsDrafts.id, id))
    .returning();
  if (!updated) throw new Error(`AdsDraft ${id} not found`);
  return updated as AdsDraft;
}

export async function cancelActiveAdsDrafts(chatId: number): Promise<number> {
  const rows = await db
    .update(adsDrafts)
    .set({ status: 'cancelled' })
    .where(
      and(
        eq(adsDrafts.telegram_chat_id, chatId),
        inArray(adsDrafts.status, ACTIVE_STATUSES),
      ),
    )
    .returning({ id: adsDrafts.id });
  return rows.length;
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors in these files.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/queries/ads-drafts.ts
git commit -m "feat(ads): add ads_drafts wizard-state table and queries"
```

---

## Task 5: Generate and apply the Drizzle migration

**Files:**
- Generated: `drizzle/migrations/<NNNN>_*.sql`

- [ ] **Step 1: Generate migration**

```bash
pnpm db:generate
```

Expected: Drizzle prints a new migration file path like `drizzle/migrations/0007_*.sql` containing `CREATE TABLE ads_preferences`, `CREATE TABLE ads_campaigns`, `CREATE TABLE ads_drafts`, plus the three new enums.

- [ ] **Step 2: Inspect the generated SQL**

Open the file and confirm:
- Three `CREATE TABLE` statements
- `CREATE TYPE` for `ads_campaign_type`, `ads_campaign_status`, `ads_draft_status`
- `CREATE INDEX ads_campaigns_chat_status_idx` and `ads_drafts_chat_status_idx`
- No accidental modifications to existing tables

If anything unexpected appears, do NOT proceed — re-inspect schema.ts.

- [ ] **Step 3: Apply locally**

```bash
pnpm db:migrate
```

Expected: prints "applied" for the new migration.

- [ ] **Step 4: Verify with a quick query**

```bash
pnpm tsx -e "import { db } from './src/lib/db'; import { sql } from 'drizzle-orm'; const r = await db.execute(sql\`SELECT to_regclass('ads_campaigns'), to_regclass('ads_drafts'), to_regclass('ads_preferences')\`); console.log(r.rows ?? r);"
```

Expected: all three names appear (not `null`).

- [ ] **Step 5: Commit**

```bash
git add drizzle/migrations/
git commit -m "chore(db): migration for ads_campaigns/ads_drafts/ads_preferences"
```

---

## Task 6: Define `google-ads/types.ts`

**Files:**
- Create: `src/lib/google-ads/types.ts`

- [ ] **Step 1: Write the file**

```ts
import type {
  AdsCampaignType,
  AdsCampaignStatus,
} from '@/lib/db/queries/ads-campaigns';

export type { AdsCampaignType, AdsCampaignStatus };

export interface CampaignDraft {
  type: AdsCampaignType;
  name: string;
  target_url: string;
  conversion_action: string | null;
  daily_budget_cents: number;
  start_date: string;
  end_date: string | null;
  language_code: string;
  location_id: number;
  headlines: string[];
  descriptions: string[];
  keywords: KeywordSpec[];
}

export interface KeywordSpec {
  keyword: string;
  match_type: 'BROAD' | 'PHRASE' | 'EXACT';
}

export interface BudgetCheckOk {
  ok: true;
}

export interface BudgetCheckFail {
  ok: false;
  reason:
    | 'daily_limit_exceeded'
    | 'monthly_projection_exceeded'
    | 'currency_mismatch'
    | 'invalid_budget';
  message: string;
}

export type BudgetCheckResult = BudgetCheckOk | BudgetCheckFail;

export interface CreateCampaignResult {
  google_campaign_id: string;
  google_ad_group_id: string;
  google_ad_id: string;
}

export interface CampaignPerformance {
  google_campaign_id: string;
  impressions: number;
  clicks: number;
  ctr_pct: number;
  avg_cpc_cents: number;
  spend_cents: number;
  conversions: number;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/types.ts
git commit -m "feat(ads): add google-ads shared types"
```

---

## Task 7: Implement `google-ads/client.ts` (OAuth + Customer factory)

**Files:**
- Create: `src/lib/google-ads/client.ts`

- [ ] **Step 1: Write the client**

```ts
import { GoogleAdsApi, Customer } from 'google-ads-api';
import { getSecret } from '@/lib/crypto/secrets';

// Secret keys mirror env-var names for consistency
const SECRET_KEYS = {
  developer_token: 'google_ads.developer_token',
  client_id: 'google_ads.client_id',
  client_secret: 'google_ads.client_secret',
  refresh_token: 'google_ads.refresh_token',
  customer_id: 'google_ads.customer_id',
  login_customer_id: 'google_ads.login_customer_id',
} as const;

async function resolveCredential(envVar: string, secretKey: string): Promise<string | null> {
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return getSecret(secretKey);
}

let cachedCustomer: Customer | null = null;

export async function getCustomer(): Promise<Customer> {
  if (cachedCustomer) return cachedCustomer;

  const [developer_token, client_id, client_secret, refresh_token, customer_id, login_customer_id] =
    await Promise.all([
      resolveCredential('GOOGLE_ADS_DEVELOPER_TOKEN', SECRET_KEYS.developer_token),
      resolveCredential('GOOGLE_ADS_CLIENT_ID', SECRET_KEYS.client_id),
      resolveCredential('GOOGLE_ADS_CLIENT_SECRET', SECRET_KEYS.client_secret),
      resolveCredential('GOOGLE_ADS_REFRESH_TOKEN', SECRET_KEYS.refresh_token),
      resolveCredential('GOOGLE_ADS_CUSTOMER_ID', SECRET_KEYS.customer_id),
      resolveCredential('GOOGLE_ADS_LOGIN_CUSTOMER_ID', SECRET_KEYS.login_customer_id),
    ]);

  const required = { developer_token, client_id, client_secret, refresh_token, customer_id };
  for (const [k, v] of Object.entries(required)) {
    if (!v) throw new Error(`Google Ads credential missing: ${k}`);
  }

  const api = new GoogleAdsApi({
    client_id: client_id!,
    client_secret: client_secret!,
    developer_token: developer_token!,
  });

  cachedCustomer = api.Customer({
    customer_id: customer_id!,
    login_customer_id: login_customer_id || undefined,
    refresh_token: refresh_token!,
  });
  return cachedCustomer;
}

export async function getCustomerCurrency(): Promise<string> {
  const customer = await getCustomer();
  const rows = await customer.query(
    `SELECT customer.currency_code FROM customer LIMIT 1`,
  );
  const code = rows[0]?.customer?.currency_code;
  if (!code) throw new Error('Could not read customer currency');
  return code;
}

// For tests only: reset the cached customer
export function __resetCustomerCache(): void {
  cachedCustomer = null;
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/client.ts
git commit -m "feat(ads): Google Ads OAuth + Customer factory with env/secrets fallback"
```

---

## Task 8: Implement `budget-guard.ts` + tests

**Files:**
- Create: `src/__tests__/ads-budget-guard.test.ts`
- Create: `src/lib/google-ads/budget-guard.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkBudget } from '@/lib/google-ads/budget-guard';
import type { CampaignDraft } from '@/lib/google-ads/types';

vi.mock('@/lib/db/queries/ads-preferences', () => ({
  getAdsPreferences: vi.fn(),
}));
vi.mock('@/lib/db/queries/ads-campaigns', () => ({
  sumActiveDailyBudgetCents: vi.fn(),
}));
vi.mock('@/lib/google-ads/client', () => ({
  getCustomerCurrency: vi.fn(),
}));

const baseDraft = (overrides: Partial<CampaignDraft> = {}): CampaignDraft => ({
  type: 'search',
  name: 'Test',
  target_url: 'https://fly-froth.com',
  conversion_action: null,
  daily_budget_cents: 1000,
  start_date: '2026-05-12',
  end_date: null,
  language_code: 'de',
  location_id: 2276,
  headlines: ['h'],
  descriptions: ['d'],
  keywords: [],
  ...overrides,
});

import { getAdsPreferences } from '@/lib/db/queries/ads-preferences';
import { sumActiveDailyBudgetCents } from '@/lib/db/queries/ads-campaigns';
import { getCustomerCurrency } from '@/lib/google-ads/client';

beforeEach(() => {
  vi.mocked(getAdsPreferences).mockResolvedValue({
    id: 1,
    daily_limit_cents: 5000,
    monthly_limit_cents: 100000,
    default_location_id: 2276,
    default_language_code: 'de',
    notify_anomaly_threshold_pct: 300,
    report_chat_id: null,
    updated_at: new Date(),
  });
  vi.mocked(sumActiveDailyBudgetCents).mockResolvedValue(0);
  vi.mocked(getCustomerCurrency).mockResolvedValue('EUR');
});

describe('checkBudget', () => {
  it('accepts a draft within daily limit', async () => {
    const result = await checkBudget(baseDraft({ daily_budget_cents: 3000 }));
    expect(result.ok).toBe(true);
  });

  it('rejects daily budget over daily_limit_cents', async () => {
    const result = await checkBudget(baseDraft({ daily_budget_cents: 6000 }));
    expect(result).toMatchObject({ ok: false, reason: 'daily_limit_exceeded' });
  });

  it('rejects when monthly projection exceeds monthly_limit_cents', async () => {
    vi.mocked(sumActiveDailyBudgetCents).mockResolvedValue(3000); // €30/day already running
    // 3000 + 2000 = 5000/day * 30 = 150000 > 100000
    const result = await checkBudget(baseDraft({ daily_budget_cents: 2000 }));
    expect(result).toMatchObject({ ok: false, reason: 'monthly_projection_exceeded' });
  });

  it('rejects non-EUR customer currency', async () => {
    vi.mocked(getCustomerCurrency).mockResolvedValue('USD');
    const result = await checkBudget(baseDraft());
    expect(result).toMatchObject({ ok: false, reason: 'currency_mismatch' });
  });

  it('rejects zero or negative budget', async () => {
    const result = await checkBudget(baseDraft({ daily_budget_cents: 0 }));
    expect(result).toMatchObject({ ok: false, reason: 'invalid_budget' });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm test src/__tests__/ads-budget-guard.test.ts
```

Expected: FAIL — `@/lib/google-ads/budget-guard` not found.

- [ ] **Step 3: Implement budget-guard**

Create `src/lib/google-ads/budget-guard.ts`:

```ts
import { getAdsPreferences } from '@/lib/db/queries/ads-preferences';
import { sumActiveDailyBudgetCents } from '@/lib/db/queries/ads-campaigns';
import { getCustomerCurrency } from '@/lib/google-ads/client';
import type { BudgetCheckResult, CampaignDraft } from './types';

const DAYS_PER_MONTH_FOR_PROJECTION = 30;

export async function checkBudget(draft: CampaignDraft): Promise<BudgetCheckResult> {
  if (!draft.daily_budget_cents || draft.daily_budget_cents <= 0) {
    return {
      ok: false,
      reason: 'invalid_budget',
      message: 'Günlük bütçe sıfırdan büyük olmalı.',
    };
  }

  const prefs = await getAdsPreferences();

  if (draft.daily_budget_cents > prefs.daily_limit_cents) {
    return {
      ok: false,
      reason: 'daily_limit_exceeded',
      message: `Günlük limit €${(prefs.daily_limit_cents / 100).toFixed(2)} aşıldı.`,
    };
  }

  const activeDailySum = await sumActiveDailyBudgetCents();
  const projectedMonthly =
    (activeDailySum + draft.daily_budget_cents) * DAYS_PER_MONTH_FOR_PROJECTION;
  if (projectedMonthly > prefs.monthly_limit_cents) {
    return {
      ok: false,
      reason: 'monthly_projection_exceeded',
      message: `Aylık projeksiyon €${(projectedMonthly / 100).toFixed(2)} > limit €${(prefs.monthly_limit_cents / 100).toFixed(2)}.`,
    };
  }

  const currency = await getCustomerCurrency();
  if (currency !== 'EUR') {
    return {
      ok: false,
      reason: 'currency_mismatch',
      message: `Google Ads hesap para birimi ${currency} — sistem EUR varsayıyor.`,
    };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm test src/__tests__/ads-budget-guard.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-ads/budget-guard.ts src/__tests__/ads-budget-guard.test.ts
git commit -m "feat(ads): budget-guard with daily/monthly/currency checks"
```

---

## Task 9: Implement `ads-copy.ts` (Claude ad copy generation) + tests

**Files:**
- Create: `src/__tests__/ads-copy.test.ts`
- Create: `src/lib/google-ads/ads-copy.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@anthropic-ai/sdk', () => {
  const create = vi.fn();
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: { create },
    })),
  };
});

vi.mock('@/lib/db/queries/brand-kit', () => ({
  getBrandKit: vi.fn(),
}));

import Anthropic from '@anthropic-ai/sdk';
import { generateAdCopy } from '@/lib/google-ads/ads-copy';
import { getBrandKit } from '@/lib/db/queries/brand-kit';

beforeEach(() => {
  vi.mocked(getBrandKit).mockResolvedValue({
    id: 1,
    logo_url: null,
    logo_position: 'bottom_right',
    logo_size_pct: 18,
    logo_opacity: 0.85,
    logo_padding_px: 40,
    manual_upload_logo_default: 'ask',
    brand_colors: ['#050912', '#d4a43a'],
    visual_style_guide: 'modern',
    text_tone_guide: 'Profesyonel ama samimi, Türkçe değil Almanca yaz.',
    negative_words: ['ucuz', 'beleş'],
    updated_at: new Date(),
  });

  const anthropic = new Anthropic({ apiKey: 'test' });
  vi.mocked(anthropic.messages.create as ReturnType<typeof vi.fn>).mockResolvedValue({
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          headlines: [
            'Visitenkarten in 24h',
            'Premium Druck Frankfurt',
            'Webdesign Rhein-Main',
            'Ihr lokaler Designer',
            'Logo & Druck aus einer Hand',
          ],
          descriptions: [
            'Hochwertige Visitenkarten mit Express-Versand in Frankfurt und Umgebung.',
            'Modernes Webdesign für lokale Unternehmen im Rhein-Main-Gebiet.',
            'Kostenloses Erstgespräch — jetzt unverbindlich anfragen.',
          ],
        }),
      },
    ],
  } as unknown as Anthropic.Message);
});

describe('generateAdCopy', () => {
  it('returns 5 headlines and 3 descriptions', async () => {
    const result = await generateAdCopy({
      campaignType: 'search',
      targetUrl: 'https://fly-froth.com/visitenkarten',
      conversionGoal: 'lead_form',
    });
    expect(result.headlines).toHaveLength(5);
    expect(result.descriptions).toHaveLength(3);
  });

  it('enforces Google length limits (headlines ≤30, descriptions ≤90)', async () => {
    const result = await generateAdCopy({
      campaignType: 'search',
      targetUrl: 'https://fly-froth.com/visitenkarten',
      conversionGoal: 'lead_form',
    });
    for (const h of result.headlines) expect(h.length).toBeLessThanOrEqual(30);
    for (const d of result.descriptions) expect(d.length).toBeLessThanOrEqual(90);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm test src/__tests__/ads-copy.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement ads-copy**

Create `src/lib/google-ads/ads-copy.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import type { AdsCampaignType } from './types';

const MODEL = 'claude-sonnet-4-6';

export interface AdCopyInput {
  campaignType: AdsCampaignType;
  targetUrl: string;
  conversionGoal: string | null;
}

export interface AdCopyOutput {
  headlines: string[];
  descriptions: string[];
}

const TYPE_HINT: Record<AdsCampaignType, string> = {
  search: 'Search ads — Suchanfragen mit klarer Kaufabsicht.',
  pmax: 'Performance Max — kanalübergreifend, breite Botschaften.',
  display: 'Display ads — visuell, markenstärkend, weniger Konversionsfokus.',
  retargeting: 'Retargeting — Nutzer, die die Seite kennen, zur Konversion bringen.',
  local: 'Local ads — lokale Sichtbarkeit, Wegbeschreibung & Anruf-Fokus.',
};

export async function generateAdCopy(input: AdCopyInput): Promise<AdCopyOutput> {
  const brandKit = await getBrandKit();
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const negativeWords = brandKit.negative_words.length
    ? `Vermeide diese Wörter: ${brandKit.negative_words.join(', ')}.`
    : '';

  const prompt = `
Du bist Werbetexter für Fly & Froth, ein Design-Studio im Rhein-Main-Gebiet.

Schreibe Google Ads ${input.campaignType}-Anzeigen für: ${input.targetUrl}
Kampagnen-Kontext: ${TYPE_HINT[input.campaignType]}
Konversionsziel: ${input.conversionGoal ?? 'allgemeine Anfrage'}

Markenton: ${brandKit.text_tone_guide}
${negativeWords}

WICHTIG:
- Sprache: Deutsch
- 5 Headlines, jede MAX 30 Zeichen
- 3 Descriptions, jede MAX 90 Zeichen
- Kein Clickbait, keine Großbuchstaben-Schreierei
- Antworte nur mit JSON, kein Markdown

Schema:
{"headlines": ["...", "...", "...", "...", "..."], "descriptions": ["...", "...", "..."]}
`.trim();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text block for ad copy');
  }

  const raw = textBlock.text.trim();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not extract JSON from ad copy response');
  const parsed = JSON.parse(jsonMatch[0]) as AdCopyOutput;

  // Defensive: enforce length limits even if Claude overshot
  parsed.headlines = parsed.headlines.map((h) => h.slice(0, 30)).slice(0, 5);
  parsed.descriptions = parsed.descriptions.map((d) => d.slice(0, 90)).slice(0, 3);

  if (parsed.headlines.length < 3 || parsed.descriptions.length < 2) {
    throw new Error('Ad copy generation returned too few headlines/descriptions');
  }
  return parsed;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm test src/__tests__/ads-copy.test.ts
```

Expected: both tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/google-ads/ads-copy.ts src/__tests__/ads-copy.test.ts
git commit -m "feat(ads): AI ad copy generation with German tone and length guards"
```

---

## Task 10: Implement `keywords.ts` (AI seeds + Google Keyword Idea Service)

**Files:**
- Create: `src/lib/google-ads/keywords.ts`

- [ ] **Step 1: Write the file**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { getCustomer } from './client';
import type { KeywordSpec } from './types';

const MODEL = 'claude-sonnet-4-6';
const SEED_COUNT = 25;
const FINAL_COUNT = 15;

export interface KeywordInput {
  targetUrl: string;
  campaignContext: string;
  languageCode: string;
  locationId: number;
}

async function generateSeedKeywords(input: KeywordInput): Promise<string[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = `
Generiere ${SEED_COUNT} deutsche Google-Ads-Keywords für eine Landing Page:
URL: ${input.targetUrl}
Kontext: ${input.campaignContext}

Mische:
- Kommerziell-intent ("buchen", "anfragen", "kaufen")
- Local-intent ("Frankfurt", "Rhein-Main", "in der Nähe")
- Informational, aber kaufnah

Antworte NUR mit JSON-Array, kein Markdown:
["keyword 1", "keyword 2", ...]
`.trim();

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Claude returned no text block for keyword seeds');
  }
  const match = textBlock.text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('Could not extract JSON array from keyword response');
  const parsed = JSON.parse(match[0]) as string[];
  return parsed.filter((k) => typeof k === 'string' && k.trim().length > 0);
}

interface KeywordIdea {
  text: string;
  avg_monthly_searches: number;
  competition: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN';
}

async function expandWithGoogle(
  seeds: string[],
  languageCode: string,
  locationId: number,
): Promise<KeywordIdea[]> {
  const customer = await getCustomer();
  // KeywordPlanIdeaService.generate_keyword_ideas
  const ideas = await customer.keywordPlanIdeas.generateKeywordIdeas({
    language: `languageConstants/${langCodeToId(languageCode)}`,
    geo_target_constants: [`geoTargetConstants/${locationId}`],
    keyword_plan_network: 'GOOGLE_SEARCH',
    keyword_seed: { keywords: seeds },
  });

  return ideas.map((idea: { text?: string; keyword_idea_metrics?: { avg_monthly_searches?: number; competition?: string } }) => ({
    text: idea.text ?? '',
    avg_monthly_searches: idea.keyword_idea_metrics?.avg_monthly_searches ?? 0,
    competition:
      (idea.keyword_idea_metrics?.competition as KeywordIdea['competition']) ?? 'UNKNOWN',
  })).filter((i: KeywordIdea) => i.text.length > 0);
}

// Minimal language-code → Google language-constant ID map (extend as needed)
function langCodeToId(code: string): number {
  const map: Record<string, number> = {
    de: 1001,
    en: 1000,
    tr: 1037,
  };
  const id = map[code];
  if (!id) throw new Error(`Unsupported language_code: ${code}`);
  return id;
}

export async function generateKeywords(input: KeywordInput): Promise<KeywordSpec[]> {
  const seeds = await generateSeedKeywords(input);

  let ideas: KeywordIdea[];
  try {
    ideas = await expandWithGoogle(seeds, input.languageCode, input.locationId);
  } catch (err) {
    // Fall back to raw seeds if Keyword Idea Service unavailable
    console.warn('[ads/keywords] Keyword Idea Service failed, using seeds only:', err);
    return seeds.slice(0, FINAL_COUNT).map((k) => ({ keyword: k, match_type: 'BROAD' }));
  }

  // Sort by avg_monthly_searches desc, dedupe by lowercased text
  const seen = new Set<string>();
  const sorted = ideas
    .filter((i) => {
      const key = i.text.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.avg_monthly_searches - a.avg_monthly_searches);

  return sorted.slice(0, FINAL_COUNT).map((i) => ({
    keyword: i.text,
    match_type: 'BROAD',
  }));
}
```

- [ ] **Step 2: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If the `google-ads-api` types complain about `keywordPlanIdeas.generateKeywordIdeas` parameter shape, adjust to match the installed SDK version's signature (the structure here matches `google-ads-api@^17`).

- [ ] **Step 3: Commit**

```bash
git add src/lib/google-ads/keywords.ts
git commit -m "feat(ads): AI keyword seeds + Google Keyword Idea Service expansion"
```

---

## Task 11: Implement `campaigns.ts` and `ad-groups.ts` (Search-only creation flow)

**Files:**
- Create: `src/lib/google-ads/ad-groups.ts`
- Create: `src/lib/google-ads/campaigns.ts`

- [ ] **Step 1: Implement `ad-groups.ts`**

```ts
import { getCustomer } from './client';
import { enums, resources } from 'google-ads-api';
import type { KeywordSpec } from './types';

const MATCH_TYPE_MAP: Record<KeywordSpec['match_type'], number> = {
  BROAD: enums.KeywordMatchType.BROAD,
  PHRASE: enums.KeywordMatchType.PHRASE,
  EXACT: enums.KeywordMatchType.EXACT,
};

export async function createSearchAdGroupWithKeywords(args: {
  campaignResourceName: string;
  adGroupName: string;
  defaultBidCents: number;
  keywords: KeywordSpec[];
}): Promise<{ adGroupResourceName: string }> {
  const customer = await getCustomer();

  const [adGroupOp] = await customer.adGroups.create([
    {
      name: args.adGroupName,
      campaign: args.campaignResourceName,
      type: enums.AdGroupType.SEARCH_STANDARD,
      status: enums.AdGroupStatus.PAUSED,
      cpc_bid_micros: args.defaultBidCents * 10_000, // cents → micros (1 EUR = 1_000_000 micros)
    } as resources.AdGroup,
  ]);

  const adGroupResourceName = adGroupOp.resource_name!;

  if (args.keywords.length > 0) {
    await customer.adGroupCriteria.create(
      args.keywords.map((kw) => ({
        ad_group: adGroupResourceName,
        status: enums.AdGroupCriterionStatus.ENABLED,
        keyword: {
          text: kw.keyword,
          match_type: MATCH_TYPE_MAP[kw.match_type],
        },
      })) as resources.AdGroupCriterion[],
    );
  }

  return { adGroupResourceName };
}

export async function createResponsiveSearchAd(args: {
  adGroupResourceName: string;
  finalUrl: string;
  headlines: string[];
  descriptions: string[];
}): Promise<{ adResourceName: string }> {
  const customer = await getCustomer();
  const [op] = await customer.adGroupAds.create([
    {
      ad_group: args.adGroupResourceName,
      status: enums.AdGroupAdStatus.ENABLED,
      ad: {
        final_urls: [args.finalUrl],
        responsive_search_ad: {
          headlines: args.headlines.map((t) => ({ text: t })),
          descriptions: args.descriptions.map((t) => ({ text: t })),
        },
      },
    } as resources.AdGroupAd,
  ]);
  return { adResourceName: op.resource_name! };
}
```

- [ ] **Step 2: Implement `campaigns.ts`**

```ts
import { getCustomer } from './client';
import { enums, resources } from 'google-ads-api';
import { checkBudget } from './budget-guard';
import {
  createSearchAdGroupWithKeywords,
  createResponsiveSearchAd,
} from './ad-groups';
import {
  createCampaignRow,
  updateCampaignRow,
  getCampaign,
  type AdsCampaign,
} from '@/lib/db/queries/ads-campaigns';
import type { CampaignDraft, CreateCampaignResult } from './types';

function parseGoogleId(resourceName: string): string {
  const parts = resourceName.split('/');
  return parts[parts.length - 1]!;
}

async function createBudgetResource(name: string, dailyCents: number): Promise<string> {
  const customer = await getCustomer();
  const [op] = await customer.campaignBudgets.create([
    {
      name,
      amount_micros: dailyCents * 10_000,
      delivery_method: enums.BudgetDeliveryMethod.STANDARD,
      explicitly_shared: false,
    } as resources.CampaignBudget,
  ]);
  return op.resource_name!;
}

export async function createSearchCampaign(
  draft: CampaignDraft,
  telegramChatId: number,
): Promise<CreateCampaignResult> {
  if (draft.type !== 'search') {
    throw new Error(`createSearchCampaign called with non-search type: ${draft.type}`);
  }

  const guard = await checkBudget(draft);
  if (!guard.ok) {
    throw new Error(`Budget guard rejected: ${guard.reason} — ${guard.message}`);
  }

  const customer = await getCustomer();

  // 1. Insert DB row first (status=paused) so we can rollback in mirror
  const row = await createCampaignRow({
    google_campaign_id: null,
    name: draft.name,
    type: 'search',
    status: 'paused',
    daily_budget_cents: draft.daily_budget_cents,
    target_url: draft.target_url,
    conversion_action: draft.conversion_action,
    start_date: draft.start_date,
    end_date: draft.end_date,
    created_via: 'telegram',
    telegram_chat_id: telegramChatId,
  });

  try {
    // 2. Create budget
    const budgetResourceName = await createBudgetResource(
      `${draft.name} - Budget`,
      draft.daily_budget_cents,
    );

    // 3. Create campaign (paused on creation, Mehmet enables explicitly)
    const [campaignOp] = await customer.campaigns.create([
      {
        name: draft.name,
        advertising_channel_type: enums.AdvertisingChannelType.SEARCH,
        status: enums.CampaignStatus.PAUSED,
        manual_cpc: { enhanced_cpc_enabled: false },
        campaign_budget: budgetResourceName,
        start_date: draft.start_date.replace(/-/g, ''),
        end_date: draft.end_date ? draft.end_date.replace(/-/g, '') : undefined,
        network_settings: {
          target_google_search: true,
          target_search_network: true,
          target_content_network: false,
          target_partner_search_network: false,
        },
        geo_target_type_setting: {
          positive_geo_target_type: enums.PositiveGeoTargetType.PRESENCE_OR_INTEREST,
          negative_geo_target_type: enums.NegativeGeoTargetType.PRESENCE,
        },
      } as resources.Campaign,
    ]);
    const campaignResourceName = campaignOp.resource_name!;
    const googleCampaignId = parseGoogleId(campaignResourceName);

    // 4. Geo-target (Germany default)
    await customer.campaignCriteria.create([
      {
        campaign: campaignResourceName,
        location: { geo_target_constant: `geoTargetConstants/${draft.location_id}` },
      } as resources.CampaignCriterion,
    ]);

    // 5. Ad group + keywords (default bid: half of daily budget per click as a safe upper bound)
    const defaultBidCents = Math.max(20, Math.floor(draft.daily_budget_cents / 10));
    const { adGroupResourceName } = await createSearchAdGroupWithKeywords({
      campaignResourceName,
      adGroupName: `${draft.name} - Ad Group`,
      defaultBidCents,
      keywords: draft.keywords,
    });

    // 6. Responsive search ad
    const { adResourceName } = await createResponsiveSearchAd({
      adGroupResourceName,
      finalUrl: draft.target_url,
      headlines: draft.headlines,
      descriptions: draft.descriptions,
    });

    // 7. Update mirror row
    await updateCampaignRow(row.id, { google_campaign_id: googleCampaignId });

    return {
      google_campaign_id: googleCampaignId,
      google_ad_group_id: parseGoogleId(adGroupResourceName),
      google_ad_id: parseGoogleId(adResourceName),
    };
  } catch (err) {
    // Best-effort: mark mirror row as removed so it doesn't appear in /ads list
    await updateCampaignRow(row.id, { status: 'removed' });
    throw err;
  }
}

async function setCampaignStatus(
  campaignId: string,
  googleStatus: number,
  mirrorStatus: 'enabled' | 'paused' | 'removed',
): Promise<AdsCampaign> {
  const row = await getCampaign(campaignId);
  if (!row) throw new Error(`Campaign ${campaignId} not in DB`);
  if (!row.google_campaign_id) throw new Error('Campaign has no google_campaign_id yet');

  const customer = await getCustomer();
  await customer.campaigns.update([
    {
      resource_name: `customers/${process.env.GOOGLE_ADS_CUSTOMER_ID}/campaigns/${row.google_campaign_id}`,
      status: googleStatus,
    } as resources.Campaign,
  ]);

  return updateCampaignRow(campaignId, { status: mirrorStatus });
}

export async function pauseCampaign(campaignId: string): Promise<AdsCampaign> {
  return setCampaignStatus(campaignId, enums.CampaignStatus.PAUSED, 'paused');
}

export async function resumeCampaign(campaignId: string): Promise<AdsCampaign> {
  return setCampaignStatus(campaignId, enums.CampaignStatus.ENABLED, 'enabled');
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If the SDK shapes for `resources.*` differ in the installed version, adjust the cast types — keep the logic identical.

- [ ] **Step 4: Commit**

```bash
git add src/lib/google-ads/ad-groups.ts src/lib/google-ads/campaigns.ts
git commit -m "feat(ads): create Search campaigns end-to-end (budget+campaign+ad group+RSA)"
```

---

## Task 12: Implement `ads-keyboard.ts` (wizard state machine) + tests

**Files:**
- Create: `src/__tests__/ads-keyboard.test.ts`
- Create: `src/lib/telegram/ads-keyboard.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  campaignTypeKeyboard,
  conversionGoalKeyboard,
  adsPreviewKeyboard,
  adsCancelKeyboard,
  nextStep,
} from '@/lib/telegram/ads-keyboard';

describe('ads-keyboard', () => {
  it('exposes 5 campaign types in the type keyboard', () => {
    const kb = campaignTypeKeyboard('draft-1');
    const buttons = kb.inline_keyboard.flat();
    const callbacks = buttons.map((b) => b.callback_data!);
    expect(callbacks).toContain('ads_type:draft-1:search');
    expect(callbacks).toContain('ads_type:draft-1:pmax');
    expect(callbacks).toContain('ads_type:draft-1:display');
    expect(callbacks).toContain('ads_type:draft-1:retargeting');
    expect(callbacks).toContain('ads_type:draft-1:local');
  });

  it('conversion goal keyboard exposes 4 goals + skip', () => {
    const kb = conversionGoalKeyboard('draft-1');
    const callbacks = kb.inline_keyboard.flat().map((b) => b.callback_data!);
    expect(callbacks).toEqual(
      expect.arrayContaining([
        'ads_goal:draft-1:lead_form',
        'ads_goal:draft-1:whatsapp',
        'ads_goal:draft-1:call',
        'ads_goal:draft-1:purchase',
        'ads_goal:draft-1:none',
      ]),
    );
  });

  it('preview keyboard has approve/regenerate/cancel', () => {
    const kb = adsPreviewKeyboard('draft-1');
    const callbacks = kb.inline_keyboard.flat().map((b) => b.callback_data!);
    expect(callbacks).toEqual(
      expect.arrayContaining([
        'ads_approve:draft-1',
        'ads_regen:draft-1',
        'ads_cancel:draft-1',
      ]),
    );
  });

  it('nextStep returns correct transitions', () => {
    expect(nextStep('type')).toBe('target');
    expect(nextStep('target')).toBe('budget');
    expect(nextStep('budget')).toBe('copy_review');
    expect(nextStep('copy_review')).toBe('approval');
    expect(nextStep('approval')).toBe(null);
  });

  it('cancel keyboard renders a single cancel button', () => {
    const kb = adsCancelKeyboard('draft-1');
    expect(kb.inline_keyboard).toHaveLength(1);
    expect(kb.inline_keyboard[0]).toHaveLength(1);
    expect(kb.inline_keyboard[0]![0]!.callback_data).toBe('ads_cancel:draft-1');
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

```bash
pnpm test src/__tests__/ads-keyboard.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the keyboard**

```ts
import type { InlineKeyboardMarkup } from './bot';
import type { AdsWizardStep } from '@/lib/db/queries/ads-drafts';

export function campaignTypeKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🔎 Search', callback_data: `ads_type:${draftId}:search` },
        { text: '⚡ Performance Max', callback_data: `ads_type:${draftId}:pmax` },
      ],
      [
        { text: '🖼️ Display', callback_data: `ads_type:${draftId}:display` },
        { text: '🔁 Retargeting', callback_data: `ads_type:${draftId}:retargeting` },
      ],
      [
        { text: '📍 Local', callback_data: `ads_type:${draftId}:local` },
      ],
      [{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }],
    ],
  };
}

export function conversionGoalKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '📝 Lead form', callback_data: `ads_goal:${draftId}:lead_form` },
        { text: '💬 WhatsApp', callback_data: `ads_goal:${draftId}:whatsapp` },
      ],
      [
        { text: '📞 Arama', callback_data: `ads_goal:${draftId}:call` },
        { text: '🛒 Satın alma', callback_data: `ads_goal:${draftId}:purchase` },
      ],
      [{ text: '— Hedef seçme', callback_data: `ads_goal:${draftId}:none` }],
      [{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }],
    ],
  };
}

export function adsPreviewKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Onayla & oluştur', callback_data: `ads_approve:${draftId}` },
        { text: '🔄 Yeniden üret', callback_data: `ads_regen:${draftId}` },
      ],
      [{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }],
    ],
  };
}

export function adsCancelKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[{ text: '✗ İptal', callback_data: `ads_cancel:${draftId}` }]],
  };
}

const STEP_ORDER: AdsWizardStep[] = ['type', 'target', 'budget', 'copy_review', 'approval'];

export function nextStep(current: AdsWizardStep): AdsWizardStep | null {
  const idx = STEP_ORDER.indexOf(current);
  if (idx === -1 || idx === STEP_ORDER.length - 1) return null;
  return STEP_ORDER[idx + 1]!;
}
```

- [ ] **Step 4: Run tests, verify they pass**

```bash
pnpm test src/__tests__/ads-keyboard.test.ts
```

Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram/ads-keyboard.ts src/__tests__/ads-keyboard.test.ts
git commit -m "feat(ads): Telegram wizard keyboards + step transitions"
```

---

## Task 13: Wire `/ads` command into webhook (start + state machine)

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Add imports**

At the top of the imports block in `src/app/api/telegram/webhook/[secret]/route.ts`, add:

```ts
import {
  createAdsDraft,
  getActiveAdsDraft,
  getAdsDraft,
  updateAdsDraft,
  cancelActiveAdsDrafts,
  type AdsDraft,
} from '@/lib/db/queries/ads-drafts';
import {
  campaignTypeKeyboard,
  conversionGoalKeyboard,
  adsPreviewKeyboard,
  adsCancelKeyboard,
} from '@/lib/telegram/ads-keyboard';
import { generateAdCopy } from '@/lib/google-ads/ads-copy';
import { generateKeywords } from '@/lib/google-ads/keywords';
import { checkBudget } from '@/lib/google-ads/budget-guard';
import {
  createSearchCampaign,
  pauseCampaign as pauseGoogleCampaign,
  resumeCampaign as resumeGoogleCampaign,
} from '@/lib/google-ads/campaigns';
import {
  listCampaignsByChat,
  getCampaign as getAdsCampaign,
} from '@/lib/db/queries/ads-campaigns';
import { getAdsPreferences } from '@/lib/db/queries/ads-preferences';
import type { AdsCampaignType } from '@/lib/db/queries/ads-campaigns';
```

- [ ] **Step 2: Add helper `formatAdsPreview` near the existing `formatMailPreview`**

Find `formatMailPreview` (around line 1135 in current file) and add right after it:

```ts
function formatAdsPreview(draft: AdsDraft): string {
  const p = draft.draft_payload;
  const copy = draft.generated_copy;
  const keywords = draft.generated_keywords ?? [];
  return [
    `🎯 Google Ads — ${p.type ?? '?'}`,
    `🔗 Hedef: ${p.target_url ?? '-'}`,
    `🎯 Goal: ${p.conversion_action ?? '-'}`,
    `💶 Günlük: €${((p.daily_budget_cents ?? 0) / 100).toFixed(2)}`,
    `📅 ${p.start_date ?? '?'} → ${p.end_date ?? 'açık uçlu'}`,
    '',
    '📝 Başlıklar:',
    ...(copy?.headlines ?? []).map((h, i) => `  ${i + 1}. ${h}`),
    '',
    '📄 Açıklamalar:',
    ...(copy?.descriptions ?? []).map((d, i) => `  ${i + 1}. ${d}`),
    '',
    `🔑 ${keywords.length} anahtar kelime: ${keywords
      .slice(0, 5)
      .map((k) => k.keyword)
      .join(', ')}${keywords.length > 5 ? '…' : ''}`,
  ]
    .join('\n')
    .slice(0, 4000);
}
```

- [ ] **Step 3: Add `handleAdsCommand` after `handleMailCommand`**

Append after the `handleMailCommand` block:

```ts
async function handleAdsCommand(chatId: number, text: string): Promise<void> {
  const rest = text.replace(/^\/ads(@\w+)?\s*/, '').trim();
  const subcommand = rest.split(/\s+/)[0] || 'new';

  if (subcommand === 'new' || subcommand === '') {
    await cancelActiveAdsDrafts(chatId);
    const draft = await createAdsDraft(chatId);
    await sendMessage({
      chatId,
      text:
        '🎯 Google Ads kampanya sihirbazı.\nAdım 1/4: Kampanya tipini seç.',
      replyMarkup: campaignTypeKeyboard(draft.id),
    });
    return;
  }

  if (subcommand === 'list') {
    await handleAdsList(chatId);
    return;
  }

  if (subcommand === 'pause' || subcommand === 'resume') {
    const idArg = rest.split(/\s+/)[1];
    if (!idArg) {
      await sendMessage({
        chatId,
        text: `Kullanım: /ads ${subcommand} <id>`,
      });
      return;
    }
    await handleAdsStatusChange(chatId, idArg, subcommand);
    return;
  }

  await sendMessage({
    chatId,
    text:
      'Kullanım:\n  /ads new              — yeni kampanya sihirbazı\n  /ads list             — aktif kampanyalar\n  /ads pause <id>       — durdur\n  /ads resume <id>      — devam ettir',
  });
}

async function handleAdsList(chatId: number): Promise<void> {
  const rows = await listCampaignsByChat(chatId, ['enabled', 'paused']);
  if (rows.length === 0) {
    await sendMessage({ chatId, text: '📭 Aktif kampanya yok. /ads new ile başla.' });
    return;
  }
  const lines = rows.map((r) => {
    const flag = r.status === 'enabled' ? '🟢' : '⏸️';
    const budget = `€${(r.daily_budget_cents / 100).toFixed(2)}/gün`;
    const shortId = r.id.slice(0, 8);
    return `${flag} ${shortId}  ${r.name}  ${budget}`;
  });
  await sendMessage({
    chatId,
    text: ['📋 Kampanyalar:', ...lines, '', '/ads pause <id> ile durdur'].join('\n'),
  });
}

async function handleAdsStatusChange(
  chatId: number,
  idArg: string,
  action: 'pause' | 'resume',
): Promise<void> {
  // Allow short-prefix matching (first 8 chars displayed in /ads list)
  let campaign = await getAdsCampaign(idArg);
  if (!campaign) {
    const all = await listCampaignsByChat(chatId, ['enabled', 'paused']);
    campaign = all.find((c) => c.id.startsWith(idArg)) ?? null;
  }
  if (!campaign) {
    await sendMessage({ chatId, text: `❌ Kampanya bulunamadı: ${idArg}` });
    return;
  }
  try {
    if (action === 'pause') await pauseGoogleCampaign(campaign.id);
    else await resumeGoogleCampaign(campaign.id);
    await sendMessage({
      chatId,
      text: `${action === 'pause' ? '⏸️ Durduruldu' : '▶️ Yeniden başladı'}: ${campaign.name}`,
    });
  } catch (err) {
    await notifyError(chatId, err);
  }
}
```

- [ ] **Step 4: Commit checkpoint (before wiring dispatch)**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat(ads): handleAdsCommand entry points and list/pause/resume handlers"
```

---

## Task 14: Wire `/ads` text-command dispatch + step input handlers

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Locate the text-command dispatch**

Find where existing commands are dispatched. Grep for `text.startsWith('/mail')` or similar:

```bash
grep -n "startsWith('/" src/app/api/telegram/webhook/\[secret\]/route.ts | head -20
```

Note the line where `/mail` is dispatched (e.g. `text.startsWith('/mail')`).

- [ ] **Step 2: Add `/ads` dispatch beside `/mail`**

Immediately after the `/mail` dispatch branch, add:

```ts
if (text.startsWith('/ads')) {
  await handleAdsCommand(chatId, text);
  return NextResponse.json({ ok: true });
}
```

(If the existing pattern uses a different return shape, mirror it exactly.)

- [ ] **Step 3: Add free-text handler for active drafts (URL + budget steps)**

Find the spot in the webhook where free-text messages are routed (after command dispatch but before the catch-all). Add:

```ts
{
  const activeAdsDraft = await getActiveAdsDraft(chatId);
  if (activeAdsDraft && activeAdsDraft.status === 'collecting') {
    await handleAdsTextInput(chatId, activeAdsDraft, text);
    return NextResponse.json({ ok: true });
  }
}
```

- [ ] **Step 4: Add `handleAdsTextInput` near `handleAdsCommand`**

```ts
async function handleAdsTextInput(
  chatId: number,
  draft: AdsDraft,
  text: string,
): Promise<void> {
  if (draft.current_step === 'target') {
    const url = text.trim();
    if (!/^https?:\/\//.test(url)) {
      await sendMessage({
        chatId,
        text: '🔗 Geçerli bir URL gönder (https:// ile başlamalı).',
        replyMarkup: adsCancelKeyboard(draft.id),
      });
      return;
    }
    await updateAdsDraft(draft.id, {
      draft_payload: { ...draft.draft_payload, target_url: url },
      current_step: 'budget',
    });
    await sendMessage({
      chatId,
      text:
        '💶 Adım 3/4: Günlük bütçeyi yaz (EUR, örn. `15` veya `15.50`).\nKısa süreli kampanya istiyorsan bütçe satırında bitiş tarihi de yazabilirsin: `15 / 2026-06-15`',
      replyMarkup: adsCancelKeyboard(draft.id),
    });
    return;
  }

  if (draft.current_step === 'budget') {
    const match = text.trim().match(/^(\d+(?:[.,]\d{1,2})?)(?:\s*\/\s*(\d{4}-\d{2}-\d{2}))?$/);
    if (!match) {
      await sendMessage({
        chatId,
        text: '❌ Format: `15` veya `15.50` veya `15 / 2026-06-15`',
        replyMarkup: adsCancelKeyboard(draft.id),
      });
      return;
    }
    const dailyEur = parseFloat(match[1]!.replace(',', '.'));
    const endDate = match[2] ?? null;
    const dailyCents = Math.round(dailyEur * 100);

    const prefs = await getAdsPreferences();
    if (dailyCents > prefs.daily_limit_cents) {
      await sendMessage({
        chatId,
        text: `❌ Günlük limit €${(prefs.daily_limit_cents / 100).toFixed(2)} aşıldı. /ads limits ile değiştir.`,
        replyMarkup: adsCancelKeyboard(draft.id),
      });
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    await updateAdsDraft(draft.id, {
      draft_payload: {
        ...draft.draft_payload,
        daily_budget_cents: dailyCents,
        start_date: today,
        end_date: endDate,
        campaign_name:
          draft.draft_payload.campaign_name ??
          `${draft.draft_payload.type ?? 'ads'} - ${today}`,
      },
      current_step: 'copy_review',
    });

    await sendMessage({ chatId, text: '🤖 Adım 4/4: AI metin + anahtar kelime üretiliyor…' });
    await runAdsGeneration(chatId, draft.id);
    return;
  }
}

async function runAdsGeneration(chatId: number, draftId: string): Promise<void> {
  const draft = await getAdsDraft(draftId);
  if (!draft) return;
  const p = draft.draft_payload;
  if (!p.type || !p.target_url) {
    await sendMessage({ chatId, text: '❌ Taslakta tip veya URL eksik.' });
    return;
  }
  try {
    const prefs = await getAdsPreferences();
    const [copy, keywords] = await Promise.all([
      generateAdCopy({
        campaignType: p.type,
        targetUrl: p.target_url,
        conversionGoal: p.conversion_action ?? null,
      }),
      generateKeywords({
        targetUrl: p.target_url,
        campaignContext: p.conversion_action ?? 'general',
        languageCode: prefs.default_language_code,
        locationId: prefs.default_location_id,
      }),
    ]);

    const updated = await updateAdsDraft(draftId, {
      generated_copy: copy,
      generated_keywords: keywords,
      status: 'awaiting_approval',
      current_step: 'approval',
    });

    const sent = await sendMessage({
      chatId,
      text: formatAdsPreview(updated),
      replyMarkup: adsPreviewKeyboard(draftId),
    });
    await updateAdsDraft(draftId, { telegram_preview_msg_id: sent.message_id });
  } catch (err) {
    await updateAdsDraft(draftId, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    await notifyError(chatId, err);
  }
}
```

- [ ] **Step 5: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors. If `AdsCampaignType` import is unused, remove it.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat(ads): /ads command dispatch + URL/budget step handlers + AI generation"
```

---

## Task 15: Wire callback-query handlers (type, goal, approve, regen, cancel)

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Find the callback_data dispatcher**

Grep for `callback_data` handling in the same file. Existing entries like `mail_send:`, `mail_regen:` show the pattern (split on `:` and switch on prefix).

- [ ] **Step 2: Add new callback handlers**

Inside the callback-query branch, before the catch-all, add:

```ts
if (data.startsWith('ads_type:')) {
  const [, draftId, typeStr] = data.split(':');
  const draft = await getAdsDraft(draftId!);
  if (!draft || draft.status !== 'collecting') {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Taslak aktif değil.' });
    return NextResponse.json({ ok: true });
  }
  await updateAdsDraft(draftId!, {
    draft_payload: { ...draft.draft_payload, type: typeStr as AdsCampaignType },
    current_step: 'target',
  });
  await answerCallbackQuery({ callbackQueryId: callback.id });
  await sendMessage({
    chatId,
    text: '🔗 Adım 2/4: Hedef URL gönder (örn. https://fly-froth.com/visitenkarten).',
    replyMarkup: adsCancelKeyboard(draftId!),
  });
  await sendMessage({
    chatId,
    text: '🎯 Dönüşüm hedefini de seç:',
    replyMarkup: conversionGoalKeyboard(draftId!),
  });
  return NextResponse.json({ ok: true });
}

if (data.startsWith('ads_goal:')) {
  const [, draftId, goal] = data.split(':');
  const draft = await getAdsDraft(draftId!);
  if (!draft) {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Taslak yok.' });
    return NextResponse.json({ ok: true });
  }
  await updateAdsDraft(draftId!, {
    draft_payload: {
      ...draft.draft_payload,
      conversion_action: goal === 'none' ? null : goal!,
    },
  });
  await answerCallbackQuery({ callbackQueryId: callback.id, text: `Hedef: ${goal}` });
  return NextResponse.json({ ok: true });
}

if (data.startsWith('ads_cancel:')) {
  const [, draftId] = data.split(':');
  await updateAdsDraft(draftId!, { status: 'cancelled' });
  await answerCallbackQuery({ callbackQueryId: callback.id, text: 'İptal edildi.' });
  await sendMessage({ chatId, text: '🛑 Kampanya sihirbazı iptal edildi.' });
  return NextResponse.json({ ok: true });
}

if (data.startsWith('ads_regen:')) {
  const [, draftId] = data.split(':');
  await answerCallbackQuery({ callbackQueryId: callback.id });
  await sendMessage({ chatId, text: '🔄 Yeniden üretiyorum…' });
  await runAdsGeneration(chatId, draftId!);
  return NextResponse.json({ ok: true });
}

if (data.startsWith('ads_approve:')) {
  const [, draftId] = data.split(':');
  const draft = await getAdsDraft(draftId!);
  if (!draft || draft.status !== 'awaiting_approval') {
    await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Onay için uygun durumda değil.' });
    return NextResponse.json({ ok: true });
  }
  await answerCallbackQuery({ callbackQueryId: callback.id, text: 'Oluşturuluyor…' });
  const p = draft.draft_payload;
  if (
    !p.type ||
    !p.target_url ||
    !p.daily_budget_cents ||
    !p.start_date ||
    !draft.generated_copy ||
    !draft.generated_keywords
  ) {
    await sendMessage({ chatId, text: '❌ Taslak eksik. /ads new ile yeniden başla.' });
    return NextResponse.json({ ok: true });
  }
  if (p.type !== 'search') {
    await sendMessage({ chatId, text: `❌ Phase 1 yalnız Search destekliyor. Tip: ${p.type}` });
    return NextResponse.json({ ok: true });
  }

  const prefs = await getAdsPreferences();
  try {
    const result = await createSearchCampaign(
      {
        type: 'search',
        name: p.campaign_name ?? `${p.type} - ${p.start_date}`,
        target_url: p.target_url,
        conversion_action: p.conversion_action ?? null,
        daily_budget_cents: p.daily_budget_cents,
        start_date: p.start_date,
        end_date: p.end_date ?? null,
        language_code: prefs.default_language_code,
        location_id: prefs.default_location_id,
        headlines: draft.generated_copy.headlines,
        descriptions: draft.generated_copy.descriptions,
        keywords: draft.generated_keywords.map((k) => ({
          keyword: k.keyword,
          match_type: k.match_type,
        })),
      },
      chatId,
    );
    await updateAdsDraft(draftId!, { status: 'confirmed', sent_at: new Date() });
    await sendMessage({
      chatId,
      text: `✅ Kampanya oluşturuldu (paused).\nGoogle ID: ${result.google_campaign_id}\n/ads resume <id> ile başlat.`,
    });
  } catch (err) {
    await updateAdsDraft(draftId!, {
      status: 'failed',
      error: err instanceof Error ? err.message : String(err),
    });
    await notifyError(chatId, err);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat(ads): callback-query handlers for type/goal/approve/regen/cancel"
```

---

## Task 16: Update HELP_TEXT

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Insert Ads commands in HELP_TEXT**

In the `HELP_TEXT` array (around line 226), insert after the `/email-lists` line:

```ts
  '',
  '🎯 Google Ads:',
  '  /ads new                — kampanya sihirbazı (AI metin + onay)',
  '  /ads list               — kampanyaları listele',
  '  /ads pause <id>         — kampanyayı durdur',
  '  /ads resume <id>        — kampanyayı devam ettir',
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "docs(ads): add /ads commands to help text"
```

---

## Task 17: Full test run + smoke check

**Files:**
- (Verification only — no edits unless something fails)

- [ ] **Step 1: Full test suite**

```bash
pnpm test
```

Expected: all tests pass; specifically `ads-preferences`, `ads-budget-guard`, `ads-copy`, `ads-keyboard` are present and green.

- [ ] **Step 2: TypeScript check**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
pnpm lint
```

Expected: no new errors. Address any unused-import warnings introduced by Tasks 13-15.

- [ ] **Step 4: Build**

```bash
pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Verify setup script structure (without live credentials)**

```bash
pnpm check:google-ads
```

Expected: if env vars are missing, prints `Missing env vars` and exits 1. This proves the script wired up correctly even pre-credentials.

- [ ] **Step 6: Final commit (no edits, but tag the merge point)**

```bash
git log --oneline -20
```

Confirm all Phase 1 commits are present. No commit needed if all green.

---

## Task 18: Smoke test against Google Ads test account (when developer token available)

**Files:**
- (Operator-only — no code changes)

- [ ] **Step 1: Apply for Google Ads developer token**

Operator action: log in to ads.google.com → API Center → request **Basic Access** developer token. 1-3 day approval window.

- [ ] **Step 2: Populate `.env.local` with credentials**

Fill in all 6 `GOOGLE_ADS_*` vars (5 required, 1 optional) in `.env.local`. The `client.ts` `resolveCredential` helper prefers env vars over `secrets` rows, so env-only is enough for local dev. For production (Vercel), use the existing Vercel env-var UI — no secret-table seeding required for Phase 1.

- [ ] **Step 3: Smoke-test connection**

```bash
pnpm check:google-ads
```

Expected: prints account name, currency=EUR, conversion-tracking status.

- [ ] **Step 4: End-to-end /ads new in Telegram**

From Telegram, send `/ads new`. Walk through: type=Search → URL=fly-froth.com/test → goal=lead_form → budget=`5` (€5/day). Verify AI generates copy + keywords, preview renders, approve creates a `paused` campaign in Google Ads UI. Confirm the row appears in `ads_campaigns`.

- [ ] **Step 5: Verify /ads list and /ads pause work**

- `/ads list` shows the campaign with paused indicator.
- `/ads resume <short-id>` flips it to enabled in Google Ads UI.
- `/ads pause <short-id>` flips back.

- [ ] **Step 6: Cleanup**

In Google Ads UI: remove the smoke-test campaign. Verify `ads_campaigns.status` mirror does NOT auto-sync to `removed` (that's Phase 3 work — note as known gap).

---

## Known Gaps vs. Spec (deferred to later phases)

- **`failed_jobs` retry queue integration** (spec §11): Phase 1 only logs to `ads_drafts.error` and marks mirror row `removed`. No background retry. Deferred to Phase 3 (cron infrastructure).
- **Reports module** (`src/lib/google-ads/reports.ts`): not built — Phase 3 adds it alongside the daily-report cron.
- **`/ads edit` and `/ads limits`**: Phase 3 / Phase 4.
- **Mirror auto-sync** when a campaign is removed/edited in Google Ads UI directly: not handled. Phase 4 reconciliation cron.

## Phase 1 Done

All Phase 1 deliverables shipped:
- Setup script verified
- 3 DB tables + queries
- Full `google-ads/` module (client, budget-guard, ads-copy, keywords, campaigns, ad-groups, types)
- Wizard + callback handlers in webhook
- `/ads new`, `/ads list`, `/ads pause`, `/ads resume`

Next plan (Phase 2): Performance Max + Display + Retargeting + Local campaign creation paths.
