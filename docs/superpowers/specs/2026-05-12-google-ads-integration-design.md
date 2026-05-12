# Google Ads Integration — Design Spec

**Date:** 2026-05-12
**Owner:** Mehmet Genco
**Status:** Approved for implementation planning

---

## 1. Purpose

Add full-lifecycle Google Ads management to the fly-froth-social Telegram bot. Mehmet must be able to create, edit, pause, and monitor Google Ads campaigns from Telegram with AI-generated ad copy and keywords, following the same approval-based UX as `/mail`, `/fatura`, and post generation.

## 2. Goals

- Support multiple campaign types: Search, Performance Max, Display, Retargeting, Local
- AI-generated ad copy (headline ≤30 chars, description ≤90 chars) and keyword suggestions via Claude Sonnet
- Strict spend guardrails — every campaign requires Telegram approval, hard daily/monthly limits in `ads_preferences`
- Daily performance reports + anomaly alerts pushed to Telegram
- Encrypted token storage via existing `secrets` table (pgcrypto)

## 3. Non-Goals (out of scope for v1)

- Autonomous bid optimization (would conflict with "approval on every campaign" preference)
- Conversion-tracking pixel installation on fly-froth.com (assumed pre-existing; will be verified during setup)
- Google Merchant Center / Shopping campaigns
- Account creation flow — if Mehmet has no account, that is a one-time manual step
- Multi-account support — single Customer ID per environment

## 4. Architecture

### 4.1 Directory layout

```
src/
├── lib/
│   ├── google-ads/
│   │   ├── client.ts          # OAuth2 + gRPC client wrapper, customer ID resolution
│   │   ├── campaigns.ts       # create/pause/resume/edit/delete campaign operations
│   │   ├── ad-groups.ts       # ad group + keyword attachment
│   │   ├── ads-copy.ts        # AI-generated headlines/descriptions (Claude Sonnet)
│   │   ├── keywords.ts        # AI keyword suggestion + Keyword Idea Service lookup
│   │   ├── reports.ts         # GAQL queries for performance reports
│   │   ├── budget-guard.ts    # validates draft against ads_preferences limits
│   │   └── types.ts           # CampaignType, CampaignDraft, AdCopy, BudgetCheck
│   ├── telegram/
│   │   └── ads-keyboard.ts    # wizard state machine + inline keyboards
│   └── db/queries/
│       ├── ads-campaigns.ts   # persisted campaigns (mirror of Google state)
│       ├── ads-drafts.ts      # in-progress wizard drafts (mail-drafts pattern)
│       └── ads-preferences.ts # singleton limits + defaults (email-preferences pattern)
└── app/api/
    ├── telegram/webhook/[secret]/route.ts  # /ads command dispatch added
    └── cron/
        ├── ads-daily-report/route.ts
        └── ads-anomaly-check/route.ts
```

### 4.2 Module boundaries

- `client.ts` owns all Google Ads API calls and token refresh. Other modules call `client.ts` and never the SDK directly.
- `campaigns.ts` / `ad-groups.ts` / `keywords.ts` / `reports.ts` are thin wrappers that compose `client.ts` requests. Each file handles one resource type.
- `ads-copy.ts` / `keywords.ts` AI helpers use the existing `src/lib/ai/text.ts` Claude wrapper for consistency.
- `budget-guard.ts` is the single source of truth for spend limits — `campaigns.ts` MUST call `budget-guard.check(draft)` before any create/edit call.
- `ads-keyboard.ts` is a state machine that mirrors `mail-keyboard.ts` — wizard step transitions and inline keyboard rendering only, no business logic.

## 5. Data Model

All tables follow existing snake_case naming and Drizzle pgTable patterns.

### 5.1 `ads_campaigns`

Mirror of Google Ads state — one row per campaign created through the bot.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `google_campaign_id` | text unique | Google Ads resource ID, populated on successful create |
| `name` | text not null | Display name shown in Telegram |
| `type` | text not null | `search` / `pmax` / `display` / `retargeting` / `local` |
| `status` | text not null | `enabled` / `paused` / `removed` (matches Google enum) |
| `daily_budget_eur` | integer not null | Stored in cents to match `invoices.total_cents` |
| `target_url` | text not null | Landing page |
| `conversion_action` | text | `lead_form` / `whatsapp` / `call` / `purchase` |
| `start_date` | text | ISO date string |
| `end_date` | text | ISO date string, nullable |
| `created_via` | text not null | `telegram` |
| `telegram_chat_id` | bigint not null | |
| `created_at` / `updated_at` | timestamp tz | |

### 5.2 `ads_drafts`

Wizard state — at most one non-terminal row per chat (same invariant as `mail_drafts`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `status` | enum | `collecting` / `awaiting_approval` / `confirmed` / `cancelled` / `failed` |
| `current_step` | text | `type` / `target` / `budget` / `copy_review` / `approval` |
| `draft_payload` | jsonb | Partial `CampaignDraft` accumulated across steps |
| `generated_copy` | jsonb | `{ headlines: string[], descriptions: string[] }` |
| `generated_keywords` | jsonb | `{ keyword: string, match_type: string }[]` |
| `telegram_chat_id` | bigint not null | |
| `telegram_preview_msg_id` | integer | For in-place edits |
| `error` | text | |
| `created_at` / `sent_at` | timestamp tz | |

### 5.3 `ads_preferences`

Singleton at `id=1`, modeled after `email_preferences`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `id` | integer PK | 1 | |
| `daily_limit_eur` | integer not null | 5000 | Hard ceiling in cents — €50/day |
| `monthly_limit_eur` | integer not null | 100000 | Hard ceiling in cents — €1000/month |
| `default_location_id` | bigint | 2276 | Google geo target ID, defaults to Germany |
| `default_language_code` | text | `de` | |
| `notify_anomaly_threshold_pct` | integer | 300 | Trigger alert when CPC exceeds rolling 7-day avg by this % |
| `report_chat_id` | bigint | | Where daily reports get posted |
| `updated_at` | timestamp tz | | |

### 5.4 Secrets (existing table)

Encrypted tokens stored as rows in `secrets`:

- `google_ads.developer_token`
- `google_ads.client_id`
- `google_ads.client_secret`
- `google_ads.refresh_token`
- `google_ads.customer_id`
- `google_ads.login_customer_id` (MCC, optional)

## 6. UX — `/ads` Command Surface

### 6.1 Wizard flow

1. **Type select** — inline keyboard with the 5 campaign types
2. **Target** — Mehmet pastes/types landing page URL, picks conversion goal
3. **Budget** — daily EUR + duration; rejected immediately if it would breach `ads_preferences.daily_limit_eur` or projected monthly spend > `monthly_limit_eur`
4. **AI generation** — Claude produces 5 headlines + 3 descriptions + 15 keywords; shown as Telegram preview
5. **Approval** — three inline buttons: `✅ Onayla` / `✏️ Düzenle` / `❌ İptal`
   - "Düzenle" lets Mehmet regenerate or edit specific fields by text
   - "Onayla" calls Google Ads API; on success campaign goes to `ads_campaigns`, draft to `confirmed`

### 6.2 Management commands

- `/ads list` — active campaigns with status + 7-day spend
- `/ads pause <id>` — sets status `paused` via API
- `/ads resume <id>` — sets status `enabled` via API
- `/ads edit <id>` — opens wizard pre-filled with current campaign state
- `/ads report [7d|30d]` — on-demand performance pull
- `/ads limits` — view/edit `ads_preferences` values (Telegram inline edit)

### 6.3 State invariants

- At most one `ads_drafts` row per `telegram_chat_id` with status in `('collecting', 'awaiting_approval')`
- All inline keyboard buttons use callback data prefixed `ads:` to match the existing dispatcher
- Wizard timeout: 30 min idle → draft moves to `cancelled`

## 7. AI Generation

### 7.1 Ad copy (`ads-copy.ts`)

Prompt template fed Claude Sonnet:

- Brand kit pulled from `brand_kit` table (tone guide, negative words, colors not used here)
- Campaign type, target URL, conversion goal as inputs
- Output constraints enforced by the prompt: headlines ≤30 chars, descriptions ≤90 chars, no clickbait phrases, German language by default
- Returns 5 headlines + 3 descriptions; final selection done at preview step

### 7.2 Keyword suggestion (`keywords.ts`)

Two-stage process:
1. Claude produces 25 seed keywords (German, tied to campaign type + target URL semantics)
2. Google Ads Keyword Idea Service (KeywordPlanIdeaService) expands + returns search volume and competition; top 15 by volume × relevance are kept
3. Match type defaults to `BROAD` for Search; PMax doesn't use keywords

## 8. Budget Guard

`budget-guard.ts` exports a single function:

```ts
checkBudget(draft: CampaignDraft): Promise<BudgetCheckResult>
```

Returns either `{ ok: true }` or `{ ok: false, reason: string }`. Rejection reasons:

- `daily_limit_exceeded` — draft daily budget > `daily_limit_eur`
- `monthly_projection_exceeded` — sum of (this draft + all `enabled` campaigns rolling 30-day projection) > `monthly_limit_eur`
- `currency_mismatch` — Google Ads customer currency ≠ EUR (defensive)

Called by:
- `campaigns.create()` before API call
- `/ads edit` budget step
- `cron/ads-anomaly-check` (to surface limit breaches that happened despite the guard, e.g. via UI)

## 9. Cron Jobs

### 9.1 Daily report (`/api/cron/ads-daily-report`)

- Vercel cron, runs daily 09:00 Europe/Berlin
- For each `enabled` campaign in `ads_campaigns`, pulls yesterday's GAQL report (impressions, clicks, CTR, avg CPC, spend, conversions)
- Sends a single grouped message to `ads_preferences.report_chat_id`
- Auth via `CRON_SECRET` header (existing pattern from `cron/poll-comments/route.ts`)

### 9.2 Anomaly check (`/api/cron/ads-anomaly-check`)

- Vercel cron, runs every hour
- For each `enabled` campaign:
  - Compute rolling 7-day avg CPC; if current-day CPC > avg × `(notify_anomaly_threshold_pct / 100)`, send alert
  - If current-month spend > `monthly_limit_eur × 0.8`, send "yaklaşıyor" warning; > 100% → auto-pause all campaigns + alert

## 10. Setup & Onboarding (one-time)

The unknown account state means Faz 1 starts with verification:

1. Run `scripts/check-google-ads.ts` — uses dummy OAuth to list any Google Ads accounts under Mehmet's Google identity
2. Branch:
   - No account → manual step: Mehmet creates account at ads.google.com, returns to Telegram
   - Account exists, no developer token → submit developer token application (1–3 day wait)
   - Account exists, token present → populate `secrets` rows, run smoke-test campaign in `paused` state

Conversion tracking is verified by checking that a `Customer.conversion_tracking_setting.conversion_tracking_status` returns `CONVERSION_TRACKING_MANAGED_BY_THIS_CUSTOMER` or similar via API.

## 11. Error Handling

- `client.ts` catches `GoogleAdsFailure` errors; partial failures (some entities created, some not) trigger an automatic rollback attempt + entry in `failed_jobs` (existing table)
- Token refresh failures: bot posts a setup-needed alert to `report_chat_id`, draft stays in `awaiting_approval`
- Wizard input errors (e.g. invalid URL): inline keyboard re-renders the current step with a hint, no draft state change

## 12. Testing

Following existing vitest setup in `src/__tests__/`:

- `ads-copy.test.ts` — prompt produces valid char-length output for each campaign type (mock Claude)
- `budget-guard.test.ts` — limits, currency, multi-campaign projection edge cases
- `ads-keyboard.test.ts` — wizard state machine transitions, idle-timeout, cancel paths
- `ads-campaigns-query.test.ts` — DB CRUD (mirrors `email-preferences.test.ts` setup)
- Integration test deferred to staging — real Google Ads API calls against a test account would need separate CI permission

## 13. Implementation Phases

**Faz 1 (MVP, ~5–7 working days after developer token approval):**
- Setup script + secrets seeding
- DB tables + migrations
- `client.ts` + `campaigns.ts` + `ad-groups.ts` (Search type only)
- `ads-copy.ts` + `keywords.ts`
- `budget-guard.ts`
- `/ads new` wizard, `/ads list`, `/ads pause`, `/ads resume`

**Faz 2:** PMax, Display, Retargeting, Local campaign types

**Faz 3:** `/ads edit`, daily report cron

**Faz 4:** Anomaly check cron, `/ads limits` management, advanced GAQL reports

## 14. Risks & Open Questions

- **Developer token approval delay** — Faz 1 cannot ship until Google approves the application; smoke tests against test accounts work without approval but cannot serve real ads
- **Conversion tracking pre-existing on fly-froth.com?** — If not, lead/conversion-goal campaigns will have nothing to optimize toward. Verified during setup; mitigation may be a separate workstream
- **API version churn** — Google Ads API deprecates versions ~14 months after release. Pin the version in `client.ts` and add a quarterly version-review reminder

## 15. References

- Existing patterns: `mail-drafts`, `email-preferences` (singleton), `cron/poll-comments` (CRON_SECRET auth), `kleinanzeigen` (state machine in DB)
- Google Ads API docs: developers.google.com/google-ads/api/docs
