# Kleinanzeigen Auto-Reply Handler — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Zoho IMAP inbox notifier so that Kleinanzeigen lead emails trigger an AI-assisted reply workflow in Telegram — action menu, knowledge-gap detection, iterative refinement, optional image attachments — and reply through Zoho SMTP using the Kleinanzeigen routing token.

**Architecture:** A new module under `src/lib/kleinanzeigen/` branches off the existing inbox poll route. Pre-analysis (Claude) flags topic / language / tone / knowledge gaps. Telegram callbacks drive reply generation, alternatives, custom-typed replies, gap resolution, and image attachments. Business context is fetched from `https://fly-froth.com/llms.txt` (1h cache) and merged with a DB override layer.

**Tech Stack:** Next.js 16 (app router), TypeScript, Drizzle ORM, Neon Postgres, vitest, `@anthropic-ai/sdk` (model `claude-sonnet-4-6`), nodemailer (Zoho SMTP), ImapFlow + mailparser.

**Spec:** `docs/superpowers/specs/2026-05-11-kleinanzeigen-handler-design.md`

---

## File Structure

**New files:**
```
src/lib/kleinanzeigen/
  detector.ts         # sender check + body parsing (buyer, listing, routing token)
  profile.ts          # llms.txt fetch + cache + override merge
  prompts.ts          # prompt template builders
  analyzer.ts         # pre-analysis Claude call
  reply.ts            # single + 3-alternatives + refinement reply generators
  send.ts             # SMTP reply with routing token + attachments
  telegram-ui.ts      # message text builders
  index.ts            # public entry: handleKleinanzeigenMail()

src/lib/telegram/
  kleinanzeigen-keyboard.ts

src/lib/db/queries/
  kleinanzeigen.ts

drizzle/migrations/
  0006_kleinanzeigen.sql

scripts/
  migrate-kleinanzeigen.ts

tests/lib/kleinanzeigen/
  detector.test.ts
  profile.test.ts
  analyzer.test.ts
  reply.test.ts
  prompts.test.ts
  queries.test.ts
```

**Modified files:**
```
src/lib/mail/imap-client.ts                          # add bodyText to NormalizedIncomingMail
src/lib/db/schema.ts                                  # add enums + 2 tables
src/types/index.ts                                    # add type exports
src/app/api/mail/poll-inbox/route.ts                  # branch on Kleinanzeigen sender
src/app/api/telegram/webhook/[secret]/route.ts        # add callback + state + photo handlers
drizzle/migrations/meta/_journal.json                 # register 0006
```

---

## Task 1: Database migration — `kleinanzeigen_threads` + `business_profile_overrides`

**Files:**
- Create: `drizzle/migrations/0006_kleinanzeigen.sql`
- Create: `scripts/migrate-kleinanzeigen.ts`
- Modify: `drizzle/migrations/meta/_journal.json`
- Modify: `src/lib/db/schema.ts`
- Modify: `src/types/index.ts`

- [ ] **Step 1: Write the SQL migration**

Create `drizzle/migrations/0006_kleinanzeigen.sql`:

```sql
DO $$ BEGIN
 CREATE TYPE "kleinanzeigen_thread_status" AS ENUM ('new', 'awaiting_action', 'awaiting_custom', 'awaiting_refinement', 'awaiting_gap_info', 'awaiting_image', 'drafting', 'sent', 'rejected');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "business_override_kind" AS ENUM ('offered', 'not_offered', 'note', 'tone', 'signature');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kleinanzeigen_threads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email_message_id" text,
	"routing_token" text NOT NULL,
	"sender_address" text NOT NULL,
	"buyer_name" text,
	"listing_title" text,
	"raw_body" text NOT NULL,
	"ai_analysis" jsonb,
	"status" "kleinanzeigen_thread_status" NOT NULL DEFAULT 'new',
	"draft_reply" text,
	"final_reply" text,
	"pending_gap_topic" text,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"telegram_chat_id" bigint NOT NULL,
	"telegram_message_id" integer,
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	"sent_at" timestamp with time zone,
	CONSTRAINT "kleinanzeigen_threads_email_message_id_unique" UNIQUE("email_message_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kleinanzeigen_threads_chat_status_idx" ON "kleinanzeigen_threads" ("telegram_chat_id","status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "business_profile_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"topic" text NOT NULL,
	"content" text NOT NULL,
	"kind" "business_override_kind" NOT NULL DEFAULT 'note',
	"origin" text NOT NULL DEFAULT 'telegram',
	"created_at" timestamp with time zone NOT NULL DEFAULT now(),
	"updated_at" timestamp with time zone NOT NULL DEFAULT now(),
	CONSTRAINT "business_profile_overrides_topic_kind_unique" UNIQUE("topic","kind")
);
```

- [ ] **Step 2: Create the migration runner script**

Create `scripts/migrate-kleinanzeigen.ts`, modeled on `scripts/migrate-invoices.ts`:

```ts
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local', override: true });

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.DATABASE_URL_NON_POOLING ?? process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL_NON_POOLING / DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(url);

const file = join(process.cwd(), 'drizzle', 'migrations', '0006_kleinanzeigen.sql');
const raw = readFileSync(file, 'utf8');

const statements = raw
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

(async () => {
  for (const stmt of statements) {
    console.log('Running:', stmt.split('\n')[0], '…');
    await sql.query(stmt);
  }
  console.log('kleinanzeigen migration applied.');
  process.exit(0);
})().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Register migration in the Drizzle journal**

Open `drizzle/migrations/meta/_journal.json`, append a new entry to the `entries` array using the next available `idx` / `when` value after 0005 and `tag: "0006_kleinanzeigen"`.

- [ ] **Step 4: Add Drizzle schema definitions**

Append to `src/lib/db/schema.ts` after the `invoices` table:

```ts
// ───── Kleinanzeigen ─────
export const kleinanzeigenThreadStatus = pgEnum('kleinanzeigen_thread_status', [
  'new',
  'awaiting_action',
  'awaiting_custom',
  'awaiting_refinement',
  'awaiting_gap_info',
  'awaiting_image',
  'drafting',
  'sent',
  'rejected',
]);

export const businessOverrideKind = pgEnum('business_override_kind', [
  'offered',
  'not_offered',
  'note',
  'tone',
  'signature',
]);

export interface KleinanzeigenAnalysis {
  subject: string;
  lang: string;
  tone_detected: 'du' | 'Sie' | 'unknown';
  knowledge_gaps: string[];
}

export const kleinanzeigenThreads = pgTable(
  'kleinanzeigen_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email_message_id: text('email_message_id').unique(),
    routing_token: text('routing_token').notNull(),
    sender_address: text('sender_address').notNull(),
    buyer_name: text('buyer_name'),
    listing_title: text('listing_title'),
    raw_body: text('raw_body').notNull(),
    ai_analysis: jsonb('ai_analysis').$type<KleinanzeigenAnalysis | null>(),
    status: kleinanzeigenThreadStatus('status').notNull().default('new'),
    draft_reply: text('draft_reply'),
    final_reply: text('final_reply'),
    pending_gap_topic: text('pending_gap_topic'),
    attachments: jsonb('attachments').$type<MailAttachment[]>().default([]).notNull(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    telegram_message_id: integer('telegram_message_id'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    chatStatusIdx: index('kleinanzeigen_threads_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);

export const businessProfileOverrides = pgTable(
  'business_profile_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    content: text('content').notNull(),
    kind: businessOverrideKind('kind').notNull().default('note'),
    origin: text('origin').notNull().default('telegram'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    topicKindIdx: uniqueIndex('business_profile_overrides_topic_kind_idx').on(t.topic, t.kind),
  }),
);
```

`MailAttachment` is already exported earlier in the same file (mail_drafts section); no new import is required.

- [ ] **Step 5: Export types**

Edit `src/types/index.ts`. Add to the imports list near `mailDrafts`:

```ts
  kleinanzeigenThreads,
  businessProfileOverrides,
```

Then add the type exports after the existing `Invoice` / `NewInvoice` lines:

```ts
export type KleinanzeigenThread = InferSelectModel<typeof kleinanzeigenThreads>;
export type NewKleinanzeigenThread = InferInsertModel<typeof kleinanzeigenThreads>;
export type BusinessProfileOverride = InferSelectModel<typeof businessProfileOverrides>;
export type NewBusinessProfileOverride = InferInsertModel<typeof businessProfileOverrides>;
export type { KleinanzeigenAnalysis } from '@/lib/db/schema';
```

- [ ] **Step 6: Run the migration**

Run: `npx tsx scripts/migrate-kleinanzeigen.ts`
Expected output: `Running:` lines followed by `kleinanzeigen migration applied.`

- [ ] **Step 7: Verify build & typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add drizzle/migrations/0006_kleinanzeigen.sql drizzle/migrations/meta/_journal.json scripts/migrate-kleinanzeigen.ts src/lib/db/schema.ts src/types/index.ts
git commit -m "feat(db): add kleinanzeigen_threads and business_profile_overrides tables"
```

---

## Task 2: DB queries for kleinanzeigen module

**Files:**
- Create: `src/lib/db/queries/kleinanzeigen.ts`
- Test: `tests/lib/kleinanzeigen/queries.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/kleinanzeigen/queries.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { kleinanzeigenThreads, businessProfileOverrides } from '@/lib/db/schema';
import { inArray, eq } from 'drizzle-orm';
import {
  createThread,
  getThread,
  updateThread,
  upsertOverride,
  listOverrides,
  deleteOverride,
} from '@/lib/db/queries/kleinanzeigen';

const createdThreadIds: string[] = [];
const createdTopics: string[] = [];

afterAll(async () => {
  if (createdThreadIds.length > 0) {
    await db.delete(kleinanzeigenThreads).where(inArray(kleinanzeigenThreads.id, createdThreadIds));
  }
  if (createdTopics.length > 0) {
    await db.delete(businessProfileOverrides).where(inArray(businessProfileOverrides.topic, createdTopics));
  }
});

describe('kleinanzeigen queries — threads', () => {
  it('creates and fetches a thread', async () => {
    const token = `tok_${Date.now()}`;
    const t = await createThread({
      email_message_id: `<m_${Date.now()}@example>`,
      routing_token: token,
      sender_address: `${token}@mail.kleinanzeigen.de`,
      buyer_name: 'Jessy',
      listing_title: 'Logo-Vektorisierung',
      raw_body: 'Hi, kannst du mir das vektorisieren?',
      ai_analysis: null,
      telegram_chat_id: 1,
    });
    createdThreadIds.push(t.id);
    expect(t.status).toBe('new');
    const got = await getThread(t.id);
    expect(got?.routing_token).toBe(token);
  });

  it('updates thread status and draft_reply', async () => {
    const token = `tok2_${Date.now()}`;
    const t = await createThread({
      routing_token: token,
      sender_address: `${token}@mail.kleinanzeigen.de`,
      raw_body: 'msg',
      telegram_chat_id: 1,
    });
    createdThreadIds.push(t.id);
    const updated = await updateThread(t.id, { status: 'drafting', draft_reply: 'Hi Jessy …' });
    expect(updated.status).toBe('drafting');
    expect(updated.draft_reply).toBe('Hi Jessy …');
  });

  it('rejects duplicate email_message_id', async () => {
    const messageId = `<dup_${Date.now()}@example>`;
    const token = `dup_${Date.now()}`;
    const first = await createThread({
      email_message_id: messageId,
      routing_token: token,
      sender_address: `${token}@mail.kleinanzeigen.de`,
      raw_body: 'msg',
      telegram_chat_id: 1,
    });
    createdThreadIds.push(first.id);
    await expect(
      createThread({
        email_message_id: messageId,
        routing_token: 'tok_other',
        sender_address: 'tok_other@mail.kleinanzeigen.de',
        raw_body: 'msg',
        telegram_chat_id: 1,
      }),
    ).rejects.toThrow();
  });
});

describe('kleinanzeigen queries — overrides', () => {
  it('upserts and lists overrides', async () => {
    const topic = `topic_${Date.now()}`;
    createdTopics.push(topic);
    const a = await upsertOverride({ topic, kind: 'offered', content: 'Yes, ab 50€' });
    expect(a.content).toBe('Yes, ab 50€');
    const b = await upsertOverride({ topic, kind: 'offered', content: 'Yes, ab 60€' });
    expect(b.id).toBe(a.id);
    expect(b.content).toBe('Yes, ab 60€');
    const list = await listOverrides();
    const found = list.find((o) => o.topic === topic);
    expect(found?.content).toBe('Yes, ab 60€');
  });

  it('deletes overrides by id', async () => {
    const topic = `del_${Date.now()}`;
    createdTopics.push(topic);
    const o = await upsertOverride({ topic, kind: 'note', content: 'todo remove' });
    await deleteOverride(o.id);
    const remaining = await db.select().from(businessProfileOverrides).where(eq(businessProfileOverrides.id, o.id));
    expect(remaining.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kleinanzeigen/queries.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the queries**

Create `src/lib/db/queries/kleinanzeigen.ts`:

```ts
import { db } from '@/lib/db';
import { kleinanzeigenThreads, businessProfileOverrides } from '@/lib/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
import type {
  KleinanzeigenThread,
  NewKleinanzeigenThread,
  BusinessProfileOverride,
} from '@/types';

export async function createThread(data: NewKleinanzeigenThread): Promise<KleinanzeigenThread> {
  const [row] = await db.insert(kleinanzeigenThreads).values(data).returning();
  if (!row) throw new Error('Failed to insert kleinanzeigen_threads row');
  return row;
}

export async function getThread(id: string): Promise<KleinanzeigenThread | null> {
  const rows = await db.select().from(kleinanzeigenThreads).where(eq(kleinanzeigenThreads.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function updateThread(
  id: string,
  patch: Partial<KleinanzeigenThread>,
): Promise<KleinanzeigenThread> {
  const [row] = await db
    .update(kleinanzeigenThreads)
    .set({ ...patch, updated_at: new Date() })
    .where(eq(kleinanzeigenThreads.id, id))
    .returning();
  if (!row) throw new Error(`Thread ${id} not found`);
  return row;
}

export async function getActiveThreadAwaitingText(chatId: number): Promise<KleinanzeigenThread | null> {
  const rows = await db
    .select()
    .from(kleinanzeigenThreads)
    .where(
      and(
        eq(kleinanzeigenThreads.telegram_chat_id, chatId),
        sql`${kleinanzeigenThreads.status} IN ('awaiting_custom','awaiting_refinement','awaiting_gap_info')`,
      ),
    )
    .orderBy(desc(kleinanzeigenThreads.updated_at))
    .limit(1);
  return rows[0] ?? null;
}

export async function getActiveThreadAwaitingImage(chatId: number): Promise<KleinanzeigenThread | null> {
  const rows = await db
    .select()
    .from(kleinanzeigenThreads)
    .where(
      and(
        eq(kleinanzeigenThreads.telegram_chat_id, chatId),
        eq(kleinanzeigenThreads.status, 'awaiting_image'),
      ),
    )
    .orderBy(desc(kleinanzeigenThreads.updated_at))
    .limit(1);
  return rows[0] ?? null;
}

export interface UpsertOverrideInput {
  topic: string;
  kind: 'offered' | 'not_offered' | 'note' | 'tone' | 'signature';
  content: string;
  origin?: string;
}

export async function upsertOverride(data: UpsertOverrideInput): Promise<BusinessProfileOverride> {
  const [row] = await db
    .insert(businessProfileOverrides)
    .values({
      topic: data.topic,
      kind: data.kind,
      content: data.content,
      origin: data.origin ?? 'telegram',
    })
    .onConflictDoUpdate({
      target: [businessProfileOverrides.topic, businessProfileOverrides.kind],
      set: { content: data.content, updated_at: new Date() },
    })
    .returning();
  if (!row) throw new Error('Failed to upsert business_profile_overrides row');
  return row;
}

export async function listOverrides(): Promise<BusinessProfileOverride[]> {
  return db.select().from(businessProfileOverrides).orderBy(desc(businessProfileOverrides.updated_at));
}

export async function deleteOverride(id: string): Promise<void> {
  await db.delete(businessProfileOverrides).where(eq(businessProfileOverrides.id, id));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kleinanzeigen/queries.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/queries/kleinanzeigen.ts tests/lib/kleinanzeigen/queries.test.ts
git commit -m "feat(db): add kleinanzeigen queries (threads + overrides)"
```

---

## Task 3: Detector — sender check + body parser

**Files:**
- Create: `src/lib/kleinanzeigen/detector.ts`
- Test: `tests/lib/kleinanzeigen/detector.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/kleinanzeigen/detector.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  isKleinanzeigenSender,
  extractRoutingToken,
  parseKleinanzeigenBody,
} from '@/lib/kleinanzeigen/detector';

const SAMPLE_FROM = '7hh14s6jg562j-4c732689b1cd43bcdc7e20861be57c4d3b1dd3e-ek-ek@mail.kleinanzeigen.de';
const NON_KA = 'newsletter@randomshop.de';

describe('isKleinanzeigenSender', () => {
  it('matches a Kleinanzeigen routing address', () => {
    expect(isKleinanzeigenSender(SAMPLE_FROM)).toBe(true);
  });
  it('matches mixed case', () => {
    expect(isKleinanzeigenSender(SAMPLE_FROM.toUpperCase())).toBe(true);
  });
  it('does not match other senders', () => {
    expect(isKleinanzeigenSender(NON_KA)).toBe(false);
  });
  it('does not match empty string', () => {
    expect(isKleinanzeigenSender('')).toBe(false);
  });
});

describe('extractRoutingToken', () => {
  it('returns the local-part of a Kleinanzeigen address', () => {
    expect(extractRoutingToken(SAMPLE_FROM)).toBe(
      '7hh14s6jg562j-4c732689b1cd43bcdc7e20861be57c4d3b1dd3e-ek-ek',
    );
  });
  it('returns null for non-Kleinanzeigen senders', () => {
    expect(extractRoutingToken(NON_KA)).toBeNull();
  });
});

describe('parseKleinanzeigenBody', () => {
  it('extracts buyer name and listing title from a typical notification body', () => {
    const body = `Hallo Mehmet,

du hast eine Nachricht von Jessy zu deiner Anzeige "Logo-Vektorisierung & Animation" erhalten:

---
Hi, kannst du mir mein JPG vektorisieren? Wie lange dauert das? Und kannst du auch Animation dazu machen?
---

Antworte dieser E-Mail direkt, um Jessy zu antworten.`;
    const parsed = parseKleinanzeigenBody(body);
    expect(parsed.buyerName).toBe('Jessy');
    expect(parsed.listingTitle).toBe('Logo-Vektorisierung & Animation');
    expect(parsed.message).toContain('JPG vektorisieren');
    expect(parsed.message).not.toContain('---');
    expect(parsed.message).not.toContain('Antworte dieser E-Mail');
  });

  it('falls back to full body when delimiters are missing', () => {
    const body = 'Some arbitrary email body without the usual template.';
    const parsed = parseKleinanzeigenBody(body);
    expect(parsed.buyerName).toBeNull();
    expect(parsed.listingTitle).toBeNull();
    expect(parsed.message).toBe(body);
  });

  it('handles empty body gracefully', () => {
    const parsed = parseKleinanzeigenBody('');
    expect(parsed.message).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kleinanzeigen/detector.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the detector**

Create `src/lib/kleinanzeigen/detector.ts`:

```ts
const KA_DOMAIN_RE = /@mail\.kleinanzeigen\.de\s*$/i;

export function isKleinanzeigenSender(from: string | null | undefined): boolean {
  if (!from) return false;
  return KA_DOMAIN_RE.test(from);
}

export function extractRoutingToken(from: string): string | null {
  if (!isKleinanzeigenSender(from)) return null;
  const at = from.indexOf('@');
  if (at <= 0) return null;
  return from.slice(0, at).trim();
}

export interface ParsedKleinanzeigenBody {
  buyerName: string | null;
  listingTitle: string | null;
  message: string;
}

const BUYER_RE = /Nachricht\s+von\s+(.+?)\s+zu\s+deiner\s+Anzeige/iu;
const LISTING_RE = /Anzeige\s+"([^"]+)"/u;
const DELIM_RE = /\n-{3,}\n([\s\S]*?)\n-{3,}\n/;

export function parseKleinanzeigenBody(body: string): ParsedKleinanzeigenBody {
  const trimmed = (body ?? '').trim();
  if (trimmed.length === 0) {
    return { buyerName: null, listingTitle: null, message: '' };
  }
  const buyerMatch = BUYER_RE.exec(trimmed);
  const listingMatch = LISTING_RE.exec(trimmed);
  const delimMatch = DELIM_RE.exec('\n' + trimmed + '\n');
  const message = delimMatch?.[1]?.trim() ?? trimmed;
  return {
    buyerName: buyerMatch?.[1]?.trim() ?? null,
    listingTitle: listingMatch?.[1]?.trim() ?? null,
    message,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kleinanzeigen/detector.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kleinanzeigen/detector.ts tests/lib/kleinanzeigen/detector.test.ts
git commit -m "feat(kleinanzeigen): add sender detector and body parser"
```

---

## Task 4: Profile fetcher — llms.txt + override merge with 1h cache

**Files:**
- Create: `src/lib/kleinanzeigen/profile.ts`
- Test: `tests/lib/kleinanzeigen/profile.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/kleinanzeigen/profile.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  fetchLlmsTxt,
  buildMergedProfile,
  clearProfileCache,
} from '@/lib/kleinanzeigen/profile';

const SAMPLE = `# Fly & Froth

> Strategisches Grafikdesign.

## Leistungen

- Logodesign: ab 79 €.
`;

describe('fetchLlmsTxt', () => {
  beforeEach(() => {
    clearProfileCache();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches llms.txt and returns its text', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SAMPLE, { status: 200 })));
    const text = await fetchLlmsTxt();
    expect(text).toBe(SAMPLE);
  });

  it('uses cached value on second call within TTL', async () => {
    const f = vi.fn(async () => new Response(SAMPLE, { status: 200 }));
    vi.stubGlobal('fetch', f);
    await fetchLlmsTxt();
    await fetchLlmsTxt();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws on non-2xx response when no cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    await expect(fetchLlmsTxt()).rejects.toThrow(/404/);
  });
});

describe('buildMergedProfile', () => {
  it('includes llms.txt body and override entries', () => {
    const merged = buildMergedProfile(SAMPLE, [
      {
        id: 'a',
        topic: 'animation',
        kind: 'offered',
        content: 'Animation ab 60€, +3-5 Tage Lieferzeit.',
        origin: 'telegram',
        created_at: new Date(),
        updated_at: new Date(),
      },
      {
        id: 'b',
        topic: 'signature',
        kind: 'signature',
        content: 'Liebe Grüße,\nMehmet',
        origin: 'telegram',
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);
    expect(merged).toContain(SAMPLE);
    expect(merged).toContain('animation');
    expect(merged).toContain('Liebe Grüße');
    expect(merged.toLowerCase()).toContain('zusätzliche');
  });

  it('omits the override block when there are no overrides', () => {
    const merged = buildMergedProfile(SAMPLE, []);
    expect(merged).toBe(SAMPLE);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kleinanzeigen/profile.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the profile fetcher**

Create `src/lib/kleinanzeigen/profile.ts`:

```ts
import type { BusinessProfileOverride } from '@/types';
import { listOverrides } from '@/lib/db/queries/kleinanzeigen';

const LLMS_URL = process.env.KLEINANZEIGEN_PROFILE_URL ?? 'https://fly-froth.com/llms.txt';
const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  text: string;
  fetchedAt: number;
}

let _cache: CacheEntry | null = null;

export function clearProfileCache(): void {
  _cache = null;
}

export async function fetchLlmsTxt(): Promise<string> {
  if (_cache && Date.now() - _cache.fetchedAt < TTL_MS) {
    return _cache.text;
  }
  const res = await fetch(LLMS_URL, { cache: 'no-store' });
  if (!res.ok) {
    if (_cache) return _cache.text;
    throw new Error(`llms.txt fetch failed: ${res.status} ${res.statusText}`);
  }
  const text = await res.text();
  _cache = { text, fetchedAt: Date.now() };
  return text;
}

export function buildMergedProfile(
  llmsTxt: string,
  overrides: BusinessProfileOverride[],
): string {
  if (overrides.length === 0) return llmsTxt;
  const lines: string[] = [
    llmsTxt.trimEnd(),
    '',
    '## Zusätzliche Hinweise (interne Overrides)',
    '',
  ];
  for (const o of overrides) {
    const label =
      o.kind === 'not_offered' ? `[NICHT ANGEBOTEN] ${o.topic}`
      : o.kind === 'tone' ? `[TON] ${o.topic}`
      : o.kind === 'signature' ? `[SIGNATUR]`
      : `[${o.topic}]`;
    lines.push(`- ${label}: ${o.content.replace(/\n/g, ' ')}`);
  }
  return lines.join('\n');
}

export async function loadMergedProfile(): Promise<string> {
  const [text, overrides] = await Promise.all([fetchLlmsTxt(), listOverrides()]);
  return buildMergedProfile(text, overrides);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kleinanzeigen/profile.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kleinanzeigen/profile.ts tests/lib/kleinanzeigen/profile.test.ts
git commit -m "feat(kleinanzeigen): add llms.txt fetcher with override merge and 1h cache"
```

---

## Task 5: Prompt templates

**Files:**
- Create: `src/lib/kleinanzeigen/prompts.ts`
- Test: `tests/lib/kleinanzeigen/prompts.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/kleinanzeigen/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  analysisSystemPrompt,
  analysisUserPrompt,
  replySystemPrompt,
  replyUserPrompt,
  alternativesUserPrompt,
} from '@/lib/kleinanzeigen/prompts';

const PROFILE = '# Fly & Froth\n- Logodesign ab 79€';

describe('analysis prompts', () => {
  it('system prompt embeds profile + JSON output requirement', () => {
    const p = analysisSystemPrompt(PROFILE);
    expect(p).toContain('Fly & Froth');
    expect(p).toContain(PROFILE);
    expect(p.toLowerCase()).toContain('json');
    expect(p).toContain('knowledge_gaps');
  });

  it('user prompt embeds the buyer message', () => {
    const u = analysisUserPrompt('Hi, was kostet ein Logo?');
    expect(u).toContain('Hi, was kostet ein Logo?');
  });
});

describe('reply prompts', () => {
  it('system prompt embeds profile and tone rules', () => {
    const p = replySystemPrompt(PROFILE);
    expect(p).toContain(PROFILE);
    expect(p).toContain('du');
    expect(p).toContain('Sie');
  });

  it('user prompt embeds context fields', () => {
    const u = replyUserPrompt({
      buyerName: 'Jessy',
      listingTitle: 'Logodesign',
      buyerMessage: 'Was kostet das?',
      analysis: { subject: 'Logo Preisanfrage', lang: 'de', tone_detected: 'du', knowledge_gaps: [] },
    });
    expect(u).toContain('Jessy');
    expect(u).toContain('Logodesign');
    expect(u).toContain('Was kostet das?');
    expect(u).toContain('"tone_detected": "du"');
  });

  it('alternatives prompt requests JSON array', () => {
    const u = alternativesUserPrompt({
      buyerName: 'Jessy',
      listingTitle: 'Logodesign',
      buyerMessage: 'Was kostet das?',
      analysis: { subject: 'x', lang: 'de', tone_detected: 'du', knowledge_gaps: [] },
    });
    expect(u.toLowerCase()).toContain('json');
    expect(u).toContain('array');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kleinanzeigen/prompts.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the prompts**

Create `src/lib/kleinanzeigen/prompts.ts`:

```ts
import type { KleinanzeigenAnalysis } from '@/types';

export function analysisSystemPrompt(profile: string): string {
  return [
    'Sen Fly & Froth (Grafik & Webdesign, Karben/DE) için',
    'Kleinanzeigen alıcı mesajlarını analiz eden bir asistansın.',
    '',
    'GÖREVİN: alıcının mesajını oku, JSON ile özetle.',
    '',
    'İŞLETME PROFİLİ (Almanca, otoritedir):',
    '---',
    profile,
    '---',
    '',
    'OUTPUT formatı (sadece JSON, açıklama yok):',
    '{',
    '  "subject": "kısa konu etiketi, max 6 kelime, Türkçe",',
    '  "lang": "de|en|tr|other",',
    '  "tone_detected": "du|Sie|unknown",',
    '  "knowledge_gaps": ["slug-1", "slug-2"]',
    '}',
    '',
    'knowledge_gaps: profilde TANIMLI OLMAYAN ve alıcının açıkça',
    'sorduğu hizmet/konu varsa slug-isimleri (lowercase, tireli).',
    'Profilde varsa BOŞ array dön. Tahmine değil; net eksiklik olmalı.',
  ].join('\n');
}

export function analysisUserPrompt(buyerMessage: string): string {
  return ['ALICI MESAJI:', '"""', buyerMessage, '"""', '', 'JSON output:'].join('\n');
}

export function replySystemPrompt(profile: string): string {
  return [
    'Sen Fly & Froth (Mehmet Genco) adına Kleinanzeigen alıcılarına',
    'kısa cevap yazıyorsun.',
    '',
    'KURALLAR:',
    '- Cevabı alıcının diliyle yaz (genelde Almanca).',
    '- tone_detected "du" ise du, "Sie" ise Sie. "unknown" ise du.',
    '- Stil: rahat, samimi, kurumsal değil — Kleinanzeigen tonu.',
    '- 2-5 cümle, kısa tut. Hashtag yok.',
    '- Profilde varsa kesin fiyat/süre kullan; yoksa UYDURMA.',
    '- Profilde olmayan bir hizmet sorulduysa nazikçe bilgi iste',
    '  veya yönlendir. Bir bilgi varsa override\'tan kullan.',
    '- İmzayı override\'taki "signature" girdisinden kullan; yoksa',
    '  "Liebe Grüße, Mehmet".',
    '- SADECE cevap metnini yaz, açıklama veya JSON yok.',
    '',
    'İŞLETME PROFİLİ:',
    '---',
    profile,
    '---',
  ].join('\n');
}

export interface ReplyContext {
  buyerName: string | null;
  listingTitle: string | null;
  buyerMessage: string;
  analysis: KleinanzeigenAnalysis;
}

export function replyUserPrompt(ctx: ReplyContext): string {
  return [
    `ALICI: ${ctx.buyerName ?? '(bilinmiyor)'}`,
    `İLAN: ${ctx.listingTitle ?? '(bilinmiyor)'}`,
    '',
    'PRE-ANALİZ:',
    JSON.stringify(ctx.analysis, null, 2),
    '',
    'ALICI MESAJI:',
    '"""',
    ctx.buyerMessage,
    '"""',
    '',
    'Cevabı yaz:',
  ].join('\n');
}

export function alternativesUserPrompt(ctx: ReplyContext): string {
  return [
    replyUserPrompt(ctx),
    '',
    'Bu sefer 3 FARKLI varyasyon üret. Output JSON array:',
    '[',
    '  {"label": "Kısa & rahat", "text": "..."},',
    '  {"label": "Detaylı + fiyat", "text": "..."},',
    '  {"label": "Önce soru sor", "text": "..."}',
    ']',
    '',
    'Sadece JSON, başka hiçbir şey yazma.',
  ].join('\n');
}

export function refinementUserPrompt(args: {
  ctx: ReplyContext;
  previousReply: string;
  feedback: string;
}): string {
  return [
    replyUserPrompt(args.ctx),
    '',
    'ÖNCEKİ CEVAP TASLAĞIN:',
    '"""',
    args.previousReply,
    '"""',
    '',
    'KULLANICI GERİBİLDİRİMİ:',
    args.feedback,
    '',
    'Bu geribildirime göre cevabı yeniden yaz:',
  ].join('\n');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kleinanzeigen/prompts.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kleinanzeigen/prompts.ts tests/lib/kleinanzeigen/prompts.test.ts
git commit -m "feat(kleinanzeigen): add prompt templates (analysis, reply, alternatives, refinement)"
```

---

## Task 6: Analyzer (pre-analysis Claude call)

**Files:**
- Create: `src/lib/kleinanzeigen/analyzer.ts`
- Test: `tests/lib/kleinanzeigen/analyzer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/kleinanzeigen/analyzer.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAnalysisResponse } from '@/lib/kleinanzeigen/analyzer';

describe('parseAnalysisResponse', () => {
  it('parses a clean JSON response', () => {
    const raw = JSON.stringify({ subject: 'Logo Anfrage', lang: 'de', tone_detected: 'du', knowledge_gaps: [] });
    const out = parseAnalysisResponse(raw);
    expect(out.subject).toBe('Logo Anfrage');
    expect(out.lang).toBe('de');
    expect(out.tone_detected).toBe('du');
    expect(out.knowledge_gaps).toEqual([]);
  });

  it('strips markdown code fences', () => {
    const raw = '```json\n{"subject":"x","lang":"de","tone_detected":"Sie","knowledge_gaps":["animation"]}\n```';
    const out = parseAnalysisResponse(raw);
    expect(out.knowledge_gaps).toEqual(['animation']);
    expect(out.tone_detected).toBe('Sie');
  });

  it('coerces tone_detected to "unknown" on unexpected value', () => {
    const raw = JSON.stringify({ subject: 'x', lang: 'de', tone_detected: 'casual', knowledge_gaps: [] });
    expect(parseAnalysisResponse(raw).tone_detected).toBe('unknown');
  });

  it('returns a safe fallback when JSON is malformed', () => {
    const out = parseAnalysisResponse('not json at all');
    expect(out.subject).toBe('Kleinanzeigen Nachricht');
    expect(out.lang).toBe('de');
    expect(out.tone_detected).toBe('unknown');
    expect(out.knowledge_gaps).toEqual([]);
  });

  it('coerces knowledge_gaps to an array of trimmed strings', () => {
    const raw = JSON.stringify({
      subject: 'x',
      lang: 'de',
      tone_detected: 'du',
      knowledge_gaps: ['  animation  ', 42, ''],
    });
    const out = parseAnalysisResponse(raw);
    expect(out.knowledge_gaps).toEqual(['animation']);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kleinanzeigen/analyzer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the analyzer**

Create `src/lib/kleinanzeigen/analyzer.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import type { KleinanzeigenAnalysis } from '@/types';
import { analysisSystemPrompt, analysisUserPrompt } from './prompts';
import { loadMergedProfile } from './profile';

const MODEL = 'claude-sonnet-4-6';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

function stripCodeFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

export function parseAnalysisResponse(raw: string): KleinanzeigenAnalysis {
  const fallback: KleinanzeigenAnalysis = {
    subject: 'Kleinanzeigen Nachricht',
    lang: 'de',
    tone_detected: 'unknown',
    knowledge_gaps: [],
  };
  try {
    const stripped = stripCodeFences(raw);
    const obj = JSON.parse(stripped) as Record<string, unknown>;
    const tone = obj.tone_detected;
    const toneNorm: 'du' | 'Sie' | 'unknown' = tone === 'du' || tone === 'Sie' ? tone : 'unknown';
    return {
      subject:
        typeof obj.subject === 'string' && obj.subject.trim().length > 0
          ? obj.subject.trim().slice(0, 80)
          : fallback.subject,
      lang:
        typeof obj.lang === 'string' && obj.lang.trim().length > 0
          ? obj.lang.trim().slice(0, 10)
          : fallback.lang,
      tone_detected: toneNorm,
      knowledge_gaps: toStringArray(obj.knowledge_gaps),
    };
  } catch {
    return fallback;
  }
}

export async function analyzeKleinanzeigenMessage(
  buyerMessage: string,
): Promise<KleinanzeigenAnalysis> {
  const profile = await loadMergedProfile();
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      { type: 'text', text: analysisSystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: analysisUserPrompt(buyerMessage) }],
  });
  const block = response.content[0];
  if (!block || block.type !== 'text') return parseAnalysisResponse('');
  return parseAnalysisResponse(block.text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kleinanzeigen/analyzer.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kleinanzeigen/analyzer.ts tests/lib/kleinanzeigen/analyzer.test.ts
git commit -m "feat(kleinanzeigen): add pre-analysis Claude call with JSON parsing"
```

---

## Task 7: Reply generators (single + alternatives + refinement)

**Files:**
- Create: `src/lib/kleinanzeigen/reply.ts`
- Test: `tests/lib/kleinanzeigen/reply.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/lib/kleinanzeigen/reply.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseAlternativesResponse, cleanReplyText } from '@/lib/kleinanzeigen/reply';

describe('cleanReplyText', () => {
  it('trims and strips wrapping quotes', () => {
    expect(cleanReplyText('  "Hallo Jessy"  ')).toBe('Hallo Jessy');
    expect(cleanReplyText('„Hallo"')).toBe('Hallo');
  });
  it('leaves clean text untouched', () => {
    expect(cleanReplyText('Hallo Jessy, klar!')).toBe('Hallo Jessy, klar!');
  });
});

describe('parseAlternativesResponse', () => {
  it('parses a JSON array of {label, text}', () => {
    const raw = JSON.stringify([
      { label: 'Kısa', text: 'Hi Jessy, klar.' },
      { label: 'Detaylı', text: 'Hallo Jessy, gerne erstelle ich dir...' },
      { label: 'Soru', text: 'Hi Jessy, kannst du mir...' },
    ]);
    const out = parseAlternativesResponse(raw);
    expect(out.length).toBe(3);
    expect(out[0]?.label).toBe('Kısa');
    expect(out[1]?.text).toContain('Hallo Jessy');
  });

  it('strips code fences before parsing', () => {
    const raw = '```json\n[{"label":"X","text":"Y"}]\n```';
    const out = parseAlternativesResponse(raw);
    expect(out.length).toBe(1);
    expect(out[0]?.label).toBe('X');
  });

  it('returns an empty array on malformed input', () => {
    expect(parseAlternativesResponse('not json')).toEqual([]);
  });

  it('drops entries missing label or text', () => {
    const raw = JSON.stringify([
      { label: 'A', text: 'a' },
      { label: '', text: 'b' },
      { text: 'c' },
      { label: 'D', text: '' },
    ]);
    expect(parseAlternativesResponse(raw).length).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/kleinanzeigen/reply.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement reply generators**

Create `src/lib/kleinanzeigen/reply.ts`:

```ts
import Anthropic from '@anthropic-ai/sdk';
import {
  replySystemPrompt,
  replyUserPrompt,
  alternativesUserPrompt,
  refinementUserPrompt,
  type ReplyContext,
} from './prompts';
import { loadMergedProfile } from './profile';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 600;
const ALT_MAX_TOKENS = 1200;

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!_client) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
    _client = new Anthropic({ apiKey: key });
  }
  return _client;
}

function stripCodeFences(s: string): string {
  return s.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
}

export function cleanReplyText(s: string): string {
  return s.trim().replace(/^["„»«]+|["„»«]+$/g, '').trim();
}

export async function generateSingleReply(ctx: ReplyContext): Promise<string> {
  const profile = await loadMergedProfile();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: replyUserPrompt(ctx) }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in Kleinanzeigen reply response');
  }
  return cleanReplyText(block.text);
}

export async function refineReply(args: {
  ctx: ReplyContext;
  previousReply: string;
  feedback: string;
}): Promise<string> {
  const profile = await loadMergedProfile();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: refinementUserPrompt(args) }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') {
    throw new Error('No text block in refinement response');
  }
  return cleanReplyText(block.text);
}

export interface ReplyAlternative {
  label: string;
  text: string;
}

export function parseAlternativesResponse(raw: string): ReplyAlternative[] {
  try {
    const stripped = stripCodeFences(raw);
    const arr = JSON.parse(stripped) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .map((entry): ReplyAlternative | null => {
        if (!entry || typeof entry !== 'object') return null;
        const e = entry as Record<string, unknown>;
        const label = typeof e.label === 'string' ? e.label.trim() : '';
        const text = typeof e.text === 'string' ? e.text.trim() : '';
        if (!label || !text) return null;
        return { label, text: cleanReplyText(text) };
      })
      .filter((x): x is ReplyAlternative => x !== null);
  } catch {
    return [];
  }
}

export async function generateAlternatives(ctx: ReplyContext): Promise<ReplyAlternative[]> {
  const profile = await loadMergedProfile();
  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: ALT_MAX_TOKENS,
    system: [
      { type: 'text', text: replySystemPrompt(profile), cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: alternativesUserPrompt(ctx) }],
  });
  const block = res.content[0];
  if (!block || block.type !== 'text') return [];
  return parseAlternativesResponse(block.text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/kleinanzeigen/reply.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/kleinanzeigen/reply.ts tests/lib/kleinanzeigen/reply.test.ts
git commit -m "feat(kleinanzeigen): add single/alternatives/refinement reply generators"
```

---

## Task 8: Send module (Zoho SMTP reply with routing token + attachments)

**Files:**
- Create: `src/lib/kleinanzeigen/send.ts`

- [ ] **Step 1: Implement the send wrapper**

Create `src/lib/kleinanzeigen/send.ts`:

```ts
import { sendMail } from '@/lib/mail/smtp';
import type { KleinanzeigenThread } from '@/types';

export async function sendKleinanzeigenReply(
  thread: KleinanzeigenThread,
  replyText: string,
): Promise<{ messageId: string }> {
  const subject = thread.listing_title
    ? `Re: ${thread.listing_title}`
    : 'Re: Kleinanzeigen Nachricht';
  return sendMail({
    to: thread.sender_address,
    subject,
    body: replyText,
    attachments: thread.attachments ?? [],
    ...(thread.email_message_id
      ? { inReplyTo: thread.email_message_id, references: thread.email_message_id }
      : {}),
  });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kleinanzeigen/send.ts
git commit -m "feat(kleinanzeigen): add SMTP reply helper with routing token + attachments"
```

---

## Task 9: Telegram keyboards + message builders

**Files:**
- Create: `src/lib/telegram/kleinanzeigen-keyboard.ts`
- Create: `src/lib/kleinanzeigen/telegram-ui.ts`

- [ ] **Step 1: Implement keyboard builders**

Create `src/lib/telegram/kleinanzeigen-keyboard.ts`:

```ts
import type { InlineKeyboardMarkup } from './bot';

export function actionMenuKeyboard(
  threadId: string,
  gapTopic: string | null,
): InlineKeyboardMarkup {
  const rows: InlineKeyboardMarkup['inline_keyboard'] = [
    [
      { text: '💡 AI öner', callback_data: `kz_suggest:${threadId}` },
      { text: '🤔 3 alternatif', callback_data: `kz_alts:${threadId}` },
    ],
    [
      { text: '✏️ Kendim yaz', callback_data: `kz_custom:${threadId}` },
      { text: '❌ Reddet', callback_data: `kz_reject:${threadId}` },
    ],
  ];
  if (gapTopic) {
    rows.push([
      {
        text: `🔧 "${gapTopic.slice(0, 24)}" konusunu çöz`,
        callback_data: `kz_gap_open:${threadId}`,
      },
    ]);
  }
  return { inline_keyboard: rows };
}

export function previewKeyboard(
  threadId: string,
  attachCount: number,
): InlineKeyboardMarkup {
  const attachLabel = attachCount > 0 ? `📎 Görsel (${attachCount})` : '📎 Görsel ekle';
  return {
    inline_keyboard: [
      [
        { text: '✅ Gönder', callback_data: `kz_send:${threadId}` },
        { text: '✏️ Düzenle', callback_data: `kz_edit:${threadId}` },
      ],
      [
        { text: '🔄 Tekrar üret', callback_data: `kz_regen:${threadId}` },
        { text: attachLabel, callback_data: `kz_attach:${threadId}` },
      ],
      [
        { text: '🔙 Geri', callback_data: `kz_back:${threadId}` },
      ],
    ],
  };
}

export function alternativesKeyboard(threadId: string, count: number): InlineKeyboardMarkup {
  const numbers: InlineKeyboardMarkup['inline_keyboard'][number] = [];
  for (let i = 0; i < count; i++) {
    numbers.push({ text: String(i + 1), callback_data: `kz_alt_pick:${threadId}:${i}` });
  }
  return {
    inline_keyboard: [
      numbers,
      [{ text: '🔙 Geri', callback_data: `kz_back:${threadId}` }],
    ],
  };
}

export function gapResolveKeyboard(threadId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Evet sunuyorum', callback_data: `kz_gap_yes:${threadId}` },
        { text: '❌ Sunmuyorum', callback_data: `kz_gap_no:${threadId}` },
      ],
      [
        { text: '⏭️ Şimdilik atla', callback_data: `kz_gap_skip:${threadId}` },
      ],
    ],
  };
}

export function attachmentClearKeyboard(threadId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '🗑 Görselleri temizle', callback_data: `kz_attach_clear:${threadId}` }],
      [{ text: '🔙 Geri', callback_data: `kz_attach_done:${threadId}` }],
    ],
  };
}
```

- [ ] **Step 2: Implement message text builders**

Create `src/lib/kleinanzeigen/telegram-ui.ts`:

```ts
import type { KleinanzeigenThread, KleinanzeigenAnalysis } from '@/types';

const MAX_RAW = 1800;

export function buildInitialMessage(thread: KleinanzeigenThread): string {
  const a = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const header = thread.listing_title
    ? `📩 ${thread.listing_title} — ${thread.buyer_name ?? '(bilinmiyor)'}`
    : `📩 Kleinanzeigen mesajı — ${thread.buyer_name ?? '(bilinmiyor)'}`;
  const body = thread.raw_body.slice(0, MAX_RAW);
  const tagLine = a
    ? `🏷️ ${a.subject} · 🌍 ${a.lang.toUpperCase()} · 🗣 ${a.tone_detected}`
    : '🏷️ (analiz yok)';
  const gapLine =
    a && a.knowledge_gaps.length > 0
      ? `⚠️ Bilgi boşluğu: ${a.knowledge_gaps.join(', ')}`
      : null;
  return [
    header,
    '──────────────────────────',
    body,
    '──────────────────────────',
    tagLine,
    gapLine ?? '',
  ]
    .filter((s) => s.length > 0)
    .join('\n');
}

export function buildPreviewMessage(
  thread: KleinanzeigenThread,
  draft: string,
  source: 'ai' | 'custom' | 'regen' = 'ai',
): string {
  const a = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const meta = a ? `(${a.tone_detected} · ${a.lang.toUpperCase()})` : '';
  const headerByType: Record<'ai' | 'custom' | 'regen', string> = {
    ai: '💡 Önerilen cevap',
    custom: '✏️ Senin cevabın',
    regen: '🔄 Yeniden üretilen cevap',
  };
  const attachCount = (thread.attachments ?? []).length;
  const attachLine =
    attachCount > 0
      ? `\n📎 Eklenen görseller: ${(thread.attachments ?? [])
          .map((a) => a.filename)
          .join(', ')}\n`
      : '';
  return [`${headerByType[source]} ${meta}`, attachLine, '', draft].join('\n').slice(0, 4000);
}

export function buildGapPrompt(topic: string): string {
  return [`📚 "${topic}" hakkında profilde bilgi yok.`, '', 'Ne yapmak istersin?'].join('\n');
}

export function buildGapInfoPrompt(topic: string): string {
  return [`📚 "${topic}" detaylarını yaz:`, '(fiyat, süre, format, sınırlamalar — kısa)'].join('\n');
}

export function buildAlternativesMessage(alts: { label: string; text: string }[]): string {
  const lines: string[] = ['🤔 3 alternatif:\n'];
  alts.forEach((a, idx) => {
    lines.push(`(${idx + 1}) ${a.label}:`);
    lines.push(a.text);
    lines.push('');
  });
  return lines.join('\n').slice(0, 4000);
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/telegram/kleinanzeigen-keyboard.ts src/lib/kleinanzeigen/telegram-ui.ts
git commit -m "feat(kleinanzeigen): add Telegram keyboards and message builders"
```

---

## Task 10: Extend IMAP client to expose plain-text body

**Files:**
- Modify: `src/lib/mail/imap-client.ts`

- [ ] **Step 1: Add bodyText to NormalizedIncomingMail**

In `src/lib/mail/imap-client.ts`, change the `NormalizedIncomingMail` interface (lines 8-17) to:

```ts
export interface NormalizedIncomingMail {
  uid: number;
  folder: string;
  messageId: string | null;
  fromEmail: string;
  fromName: string | null;
  subject: string | null;
  bodyPreview: string | null;
  bodyText: string | null;
  receivedAt: Date;
}
```

- [ ] **Step 2: Populate bodyText from the parsed email**

In `pollFolder`, update the `results.push({...})` call (around line 135) to include `bodyText`:

```ts
      results.push({
        uid: Number(message.uid),
        folder,
        messageId: parsed.messageId ?? null,
        fromEmail: email,
        fromName: name,
        subject: parsed.subject ?? null,
        bodyPreview: buildPreview(parsed),
        bodyText: (parsed.text ?? '').trim() || null,
        receivedAt,
      });
```

- [ ] **Step 3: Verify build & typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mail/imap-client.ts
git commit -m "feat(mail): expose plain-text body from IMAP for downstream handlers"
```

---

## Task 11: Handler entry — `src/lib/kleinanzeigen/index.ts`

**Files:**
- Create: `src/lib/kleinanzeigen/index.ts`

- [ ] **Step 1: Implement the orchestrator**

Create `src/lib/kleinanzeigen/index.ts`:

```ts
import { sendMessage } from '@/lib/telegram/bot';
import { actionMenuKeyboard } from '@/lib/telegram/kleinanzeigen-keyboard';
import { createThread, updateThread } from '@/lib/db/queries/kleinanzeigen';
import { parseKleinanzeigenBody, extractRoutingToken } from './detector';
import { analyzeKleinanzeigenMessage } from './analyzer';
import { buildInitialMessage } from './telegram-ui';
import type { KleinanzeigenAnalysis } from '@/types';

export { isKleinanzeigenSender } from './detector';

export interface KleinanzeigenInput {
  fromEmail: string;
  messageId: string | null;
  bodyText: string;
}

function notifyChatId(): number {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) throw new Error('ALLOWED_TELEGRAM_USER_IDS not set');
  const first = raw.split(',')[0]?.trim();
  if (!first) throw new Error('ALLOWED_TELEGRAM_USER_IDS is empty');
  const n = Number(first);
  if (!Number.isFinite(n)) throw new Error('ALLOWED_TELEGRAM_USER_IDS is not a number');
  return n;
}

export async function handleKleinanzeigenMail(input: KleinanzeigenInput): Promise<void> {
  const token = extractRoutingToken(input.fromEmail);
  if (!token) return;

  const parsed = parseKleinanzeigenBody(input.bodyText);
  const chatId = notifyChatId();

  let analysis: KleinanzeigenAnalysis;
  try {
    analysis = await analyzeKleinanzeigenMessage(parsed.message);
  } catch (err) {
    analysis = { subject: 'Kleinanzeigen Nachricht', lang: 'de', tone_detected: 'unknown', knowledge_gaps: [] };
    console.error('Kleinanzeigen analysis failed:', err);
  }

  const thread = await createThread({
    email_message_id: input.messageId,
    routing_token: token,
    sender_address: input.fromEmail,
    buyer_name: parsed.buyerName,
    listing_title: parsed.listingTitle,
    raw_body: parsed.message,
    ai_analysis: analysis,
    status: 'awaiting_action',
    telegram_chat_id: chatId,
  });

  const gapTopic = analysis.knowledge_gaps[0] ?? null;
  const sent = await sendMessage({
    chatId,
    text: buildInitialMessage(thread),
    replyMarkup: actionMenuKeyboard(thread.id, gapTopic),
  });
  await updateThread(thread.id, { telegram_message_id: sent.message_id });
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/kleinanzeigen/index.ts
git commit -m "feat(kleinanzeigen): add orchestrator that analyzes + posts to Telegram"
```

---

## Task 12: Branch the inbox-poll route to Kleinanzeigen handler

**Files:**
- Modify: `src/app/api/mail/poll-inbox/route.ts`

- [ ] **Step 1: Import the handler**

Near the top of `src/app/api/mail/poll-inbox/route.ts`, add:

```ts
import { isKleinanzeigenSender, handleKleinanzeigenMail } from '@/lib/kleinanzeigen';
```

- [ ] **Step 2: Branch on Kleinanzeigen sender after IMAP insertion**

Replace the inner `for (const mail of result.mails)` loop (around lines 81-117) with:

```ts
  for (const mail of result.mails) {
    const stat = bump(perFolder, mail.folder);
    stat.fetched++;
    try {
      const row = await insertInboxMessage({
        uid: mail.uid,
        folder: mail.folder,
        message_id: mail.messageId,
        from_email: mail.fromEmail,
        from_name: mail.fromName,
        subject: mail.subject,
        body_preview: mail.bodyPreview,
        received_at: mail.receivedAt,
      });
      try {
        if (isKleinanzeigenSender(mail.fromEmail)) {
          await handleKleinanzeigenMail({
            fromEmail: mail.fromEmail,
            messageId: mail.messageId,
            bodyText: mail.bodyText ?? mail.bodyPreview ?? '',
          });
        } else {
          await notifyIncomingMail(row);
        }
        stat.notified++;
        notified++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`notify ${mail.folder}/${mail.uid}: ${msg}`);
        await logFailure('mail_inbox_notify', { folder: mail.folder, uid: mail.uid }, msg);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`insert ${mail.folder}/${mail.uid}: ${msg}`);
      await logFailure('mail_inbox_insert', { folder: mail.folder, uid: mail.uid }, msg);
    }
  }
```

- [ ] **Step 3: Verify build & typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mail/poll-inbox/route.ts
git commit -m "feat(mail): route Kleinanzeigen mails to dedicated handler"
```

---

## Task 13: Telegram webhook — Kleinanzeigen callback handlers (action + preview)

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Add imports**

After the existing imports block (around line 88), add:

```ts
import {
  getThread as getKleinanzeigenThread,
  updateThread as updateKleinanzeigenThread,
  getActiveThreadAwaitingText as getActiveKleinanzeigenThread,
  getActiveThreadAwaitingImage as getActiveKleinanzeigenImageThread,
  upsertOverride as upsertKleinanzeigenOverride,
  listOverrides as listKleinanzeigenOverrides,
} from '@/lib/db/queries/kleinanzeigen';
import {
  generateSingleReply,
  generateAlternatives,
  refineReply,
  type ReplyAlternative,
} from '@/lib/kleinanzeigen/reply';
import { sendKleinanzeigenReply } from '@/lib/kleinanzeigen/send';
import {
  actionMenuKeyboard as kzActionMenuKeyboard,
  previewKeyboard as kzPreviewKeyboard,
  alternativesKeyboard as kzAlternativesKeyboard,
  gapResolveKeyboard as kzGapResolveKeyboard,
  attachmentClearKeyboard as kzAttachmentClearKeyboard,
} from '@/lib/telegram/kleinanzeigen-keyboard';
import {
  buildInitialMessage as kzBuildInitialMessage,
  buildPreviewMessage as kzBuildPreviewMessage,
  buildGapPrompt as kzBuildGapPrompt,
  buildGapInfoPrompt as kzBuildGapInfoPrompt,
  buildAlternativesMessage as kzBuildAlternativesMessage,
} from '@/lib/kleinanzeigen/telegram-ui';
import { clearProfileCache as clearKleinanzeigenProfileCache } from '@/lib/kleinanzeigen/profile';
import type { KleinanzeigenThread, KleinanzeigenAnalysis, MailAttachment } from '@/types';
```

Also export `MailAttachment` from `src/types/index.ts` if not already exported (it lives in `src/lib/db/schema.ts`):

```ts
export type { MailAttachment } from '@/lib/db/schema';
```

- [ ] **Step 2: Add shared helpers**

Just below `notifyError` (around line 184), add:

```ts
const kzAlternativesCache = new Map<string, ReplyAlternative[]>();

function kzReplyContextFromThread(thread: KleinanzeigenThread) {
  const analysis = (thread.ai_analysis as KleinanzeigenAnalysis | null) ?? {
    subject: 'Kleinanzeigen Nachricht',
    lang: 'de',
    tone_detected: 'unknown' as const,
    knowledge_gaps: [],
  };
  return {
    buyerName: thread.buyer_name,
    listingTitle: thread.listing_title,
    buyerMessage: thread.raw_body,
    analysis,
  };
}

async function kzShowPreview(
  chatId: number,
  thread: KleinanzeigenThread,
  draft: string,
  source: 'ai' | 'custom' | 'regen',
): Promise<void> {
  const updated = await updateKleinanzeigenThread(thread.id, {
    draft_reply: draft,
    status: 'drafting',
  });
  await sendMessage({
    chatId,
    text: kzBuildPreviewMessage(updated, draft, source),
    replyMarkup: kzPreviewKeyboard(updated.id, (updated.attachments ?? []).length),
  });
}

async function kzShowInitial(chatId: number, thread: KleinanzeigenThread): Promise<void> {
  const analysis = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const gapTopic = analysis?.knowledge_gaps[0] ?? null;
  await sendMessage({
    chatId,
    text: kzBuildInitialMessage(thread),
    replyMarkup: kzActionMenuKeyboard(thread.id, gapTopic),
  });
}
```

- [ ] **Step 3: Add action-menu handlers**

```ts
async function handleKzSuggest(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) { await sendMessage({ chatId, text: `❓ Thread bulunamadı: ${threadId}` }); return; }
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({ chatId, text: '💭 AI cevap üretiyor…' });
  try {
    const draft = await generateSingleReply(kzReplyContextFromThread(thread));
    await kzShowPreview(chatId, thread, draft, 'ai');
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzAlternatives(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) { await sendMessage({ chatId, text: `❓ Thread bulunamadı: ${threadId}` }); return; }
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await sendMessage({ chatId, text: '🤔 3 alternatif üretiliyor…' });
  try {
    const alts = await generateAlternatives(kzReplyContextFromThread(thread));
    if (alts.length === 0) {
      await sendMessage({ chatId, text: '⚠️ Alternatif üretilemedi, tekrar dene.' });
      await kzShowInitial(chatId, thread);
      return;
    }
    kzAlternativesCache.set(thread.id, alts);
    await sendMessage({
      chatId,
      text: kzBuildAlternativesMessage(alts),
      replyMarkup: kzAlternativesKeyboard(thread.id, alts.length),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzAltPick(chatId: number, threadId: string, indexStr: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  const alts = kzAlternativesCache.get(threadId) ?? [];
  const idx = Number(indexStr);
  const picked = alts[idx];
  if (!picked) {
    await sendMessage({ chatId, text: '⚠️ Alternatif kayboldu, tekrar üret.' });
    return;
  }
  await kzShowPreview(chatId, thread, picked.text, 'ai');
}

async function handleKzCustom(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_custom' });
  await sendMessage({ chatId, text: '✏️ Cevabını yaz (sonra önizleme + Gönder butonu çıkacak):' });
}

async function handleKzReject(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  await updateKleinanzeigenThread(thread.id, { status: 'rejected' });
  await sendMessage({ chatId, text: '❌ Reddedildi, cevap gönderilmedi.' });
}
```

- [ ] **Step 4: Add preview-screen handlers**

```ts
async function handleKzSend(chatId: number, messageId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread || !thread.draft_reply) {
    await sendMessage({ chatId, text: '❌ Gönderilecek taslak yok.' });
    return;
  }
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const attachCount = (thread.attachments ?? []).length;
  await sendMessage({
    chatId,
    text: attachCount > 0
      ? `📤 Cevap gönderiliyor (${attachCount} görsel ekli)…`
      : '📤 Cevap gönderiliyor…',
  });
  try {
    const result = await sendKleinanzeigenReply(thread, thread.draft_reply);
    await updateKleinanzeigenThread(thread.id, {
      status: 'sent',
      final_reply: thread.draft_reply,
      sent_at: new Date(),
    });
    await sendMessage({
      chatId,
      text: [
        '✅ Cevap gönderildi.',
        `Kime: ${thread.buyer_name ?? thread.sender_address}`,
        `Message-ID: ${result.messageId}`,
      ].join('\n'),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzEdit(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_refinement' });
  await sendMessage({
    chatId,
    text: 'Nasıl olsun? (örn. "daha kısa", "fiyat 25€ olsun", "Animation kısmını çıkar")',
  });
}

async function handleKzRegen(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await sendMessage({ chatId, text: '🔄 Yeniden üretiliyor…' });
  try {
    const draft = await generateSingleReply(kzReplyContextFromThread(thread));
    await kzShowPreview(chatId, thread, draft, 'regen');
  } catch (err) { await notifyError(chatId, err); }
}

async function handleKzBack(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_action' });
  await kzShowInitial(chatId, thread);
}
```

- [ ] **Step 5: Add gap-resolve handlers**

```ts
async function handleKzGapOpen(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  const analysis = thread.ai_analysis as KleinanzeigenAnalysis | null;
  const topic = analysis?.knowledge_gaps[0];
  if (!topic) { await sendMessage({ chatId, text: 'Bu thread için bilgi boşluğu yok.' }); return; }
  await updateKleinanzeigenThread(thread.id, { pending_gap_topic: topic });
  await sendMessage({
    chatId,
    text: kzBuildGapPrompt(topic),
    replyMarkup: kzGapResolveKeyboard(thread.id),
  });
}

async function handleKzGapYes(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread || !thread.pending_gap_topic) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_gap_info' });
  await sendMessage({ chatId, text: kzBuildGapInfoPrompt(thread.pending_gap_topic) });
}

async function handleKzGapNo(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread || !thread.pending_gap_topic) return;
  await upsertKleinanzeigenOverride({
    topic: thread.pending_gap_topic,
    kind: 'not_offered',
    content: 'Bu hizmeti sunmuyoruz, nazikçe yönlendir.',
  });
  clearKleinanzeigenProfileCache();
  await updateKleinanzeigenThread(thread.id, { pending_gap_topic: null, status: 'awaiting_action' });
  await sendMessage({ chatId, text: '📝 Kaydettim. AI artık bu hizmeti reddedeceğini bilecek.' });
  await kzShowInitial(chatId, thread);
}

async function handleKzGapSkip(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { pending_gap_topic: null, status: 'awaiting_action' });
  await sendMessage({ chatId, text: '⏭️ Atlandı (kaydedilmedi).' });
  await kzShowInitial(chatId, thread);
}
```

- [ ] **Step 6: Add attachment handlers**

```ts
async function handleKzAttach(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { status: 'awaiting_image' });
  const existing = (thread.attachments ?? []).length;
  const baseText = existing > 0
    ? `📎 Şu an ${existing} görsel ekli. Yeni görsel(ler) gönder veya temizle:`
    : '📎 Eklemek istediğin görsel(ler)i gönder (foto veya dosya, her biri max 20 MB). Bitince "Geri"ye bas.';
  await sendMessage({
    chatId,
    text: baseText,
    replyMarkup: kzAttachmentClearKeyboard(thread.id),
  });
}

async function handleKzAttachClear(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  await updateKleinanzeigenThread(thread.id, { attachments: [] });
  await sendMessage({ chatId, text: '🗑 Tüm görseller temizlendi.' });
}

async function handleKzAttachDone(chatId: number, threadId: string): Promise<void> {
  const thread = await getKleinanzeigenThread(threadId);
  if (!thread) return;
  // Return to the preview screen if a draft exists; otherwise the action menu.
  if (thread.draft_reply) {
    await updateKleinanzeigenThread(thread.id, { status: 'drafting' });
    await sendMessage({
      chatId,
      text: kzBuildPreviewMessage(thread, thread.draft_reply, 'ai'),
      replyMarkup: kzPreviewKeyboard(thread.id, (thread.attachments ?? []).length),
    });
  } else {
    await updateKleinanzeigenThread(thread.id, { status: 'awaiting_action' });
    await kzShowInitial(chatId, thread);
  }
}

async function kzAppendAttachment(
  chatId: number,
  thread: KleinanzeigenThread,
  file: { fileId: string; filename: string; mime: string; sizeBytes?: number },
): Promise<void> {
  const MAX_BYTES = 20 * 1024 * 1024;
  if (file.sizeBytes && file.sizeBytes > MAX_BYTES) {
    await sendMessage({ chatId, text: '❌ Dosya 20 MB sınırını aşıyor.' });
    return;
  }
  try {
    const info = await getFile(file.fileId);
    const buffer = await downloadFile(info.file_path);
    const current = thread.attachments ?? [];
    const next: MailAttachment[] = [
      ...current,
      { filename: file.filename, mime: file.mime, base64: buffer.toString('base64') },
    ];
    const updated = await updateKleinanzeigenThread(thread.id, { attachments: next });
    await sendMessage({
      chatId,
      text: `📎 Eklendi (${updated.attachments.length} görsel toplam). Bitince "Geri"ye bas.`,
      replyMarkup: kzAttachmentClearKeyboard(updated.id),
    });
  } catch (err) { await notifyError(chatId, err); }
}
```

- [ ] **Step 7: Wire callbacks into the dispatcher**

In `handleCallback` (around lines 1654-1742), add new branches BEFORE the final unknown-action `else` block:

```ts
    } else if (action === 'kz_suggest' && postId) {
      await handleKzSuggest(chatId, messageId, postId);
    } else if (action === 'kz_alts' && postId) {
      await handleKzAlternatives(chatId, messageId, postId);
    } else if (action === 'kz_alt_pick' && postId) {
      await handleKzAltPick(chatId, postId, rest[0] ?? '0');
    } else if (action === 'kz_custom' && postId) {
      await handleKzCustom(chatId, messageId, postId);
    } else if (action === 'kz_reject' && postId) {
      await handleKzReject(chatId, messageId, postId);
    } else if (action === 'kz_send' && postId) {
      await handleKzSend(chatId, messageId, postId);
    } else if (action === 'kz_edit' && postId) {
      await handleKzEdit(chatId, postId);
    } else if (action === 'kz_regen' && postId) {
      await handleKzRegen(chatId, postId);
    } else if (action === 'kz_back' && postId) {
      await handleKzBack(chatId, postId);
    } else if (action === 'kz_gap_open' && postId) {
      await handleKzGapOpen(chatId, postId);
    } else if (action === 'kz_gap_yes' && postId) {
      await handleKzGapYes(chatId, postId);
    } else if (action === 'kz_gap_no' && postId) {
      await handleKzGapNo(chatId, postId);
    } else if (action === 'kz_gap_skip' && postId) {
      await handleKzGapSkip(chatId, postId);
    } else if (action === 'kz_attach' && postId) {
      await handleKzAttach(chatId, postId);
    } else if (action === 'kz_attach_clear' && postId) {
      await handleKzAttachClear(chatId, postId);
    } else if (action === 'kz_attach_done' && postId) {
      await handleKzAttachDone(chatId, postId);
```

- [ ] **Step 8: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts src/types/index.ts
git commit -m "feat(telegram): add Kleinanzeigen callback handlers (suggest, alts, custom, gap, attach)"
```

---

## Task 14: Telegram webhook — text & photo capture (state-driven)

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Add text-state handler**

Just below the attachment handlers added in Task 13, add:

```ts
async function handleKzTextInput(
  chatId: number,
  thread: KleinanzeigenThread,
  text: string,
): Promise<void> {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    await sendMessage({ chatId, text: '⚠️ Boş mesaj yok sayıldı.' });
    return;
  }

  if (thread.status === 'awaiting_custom') {
    await kzShowPreview(chatId, thread, trimmed, 'custom');
    return;
  }

  if (thread.status === 'awaiting_refinement') {
    const previous = thread.draft_reply ?? '';
    await sendMessage({ chatId, text: '✏️ Yeniden yazılıyor…' });
    try {
      const draft = await refineReply({
        ctx: kzReplyContextFromThread(thread),
        previousReply: previous,
        feedback: trimmed,
      });
      await kzShowPreview(chatId, thread, draft, 'regen');
    } catch (err) { await notifyError(chatId, err); }
    return;
  }

  if (thread.status === 'awaiting_gap_info' && thread.pending_gap_topic) {
    await upsertKleinanzeigenOverride({
      topic: thread.pending_gap_topic,
      kind: 'offered',
      content: trimmed,
    });
    clearKleinanzeigenProfileCache();
    const updated = await updateKleinanzeigenThread(thread.id, {
      pending_gap_topic: null,
      status: 'awaiting_action',
    });
    const { analyzeKleinanzeigenMessage } = await import('@/lib/kleinanzeigen/analyzer');
    try {
      const newAnalysis = await analyzeKleinanzeigenMessage(updated.raw_body);
      await updateKleinanzeigenThread(updated.id, { ai_analysis: newAnalysis });
    } catch {
      /* non-fatal */
    }
    const refreshed = await getKleinanzeigenThread(updated.id);
    await sendMessage({ chatId, text: '📝 Bilgi kaydedildi. Şimdi AI cevap önereyim mi?' });
    if (refreshed) await kzShowInitial(chatId, refreshed);
    return;
  }
}
```

- [ ] **Step 2: Intercept text input inside handleCommand**

In `handleCommand` (around line 1534), insert this block AFTER the `/fatura` handler block but BEFORE the `// Active invoice draft` line (around line 1609):

```ts
  const activeKz = await getActiveKleinanzeigenThread(chatId);
  if (activeKz) {
    await handleKzTextInput(chatId, activeKz, trimmed);
    return;
  }
```

- [ ] **Step 3: Intercept incoming photos/documents for image-attach mode**

In the main `POST` handler (around line 1773), the existing block intercepts attachments for mail drafts. Add a parallel branch BEFORE the mail-draft check:

```ts
  if (msg && (msg.photo?.length || msg.document)) {
    const activeKzImage = await getActiveKleinanzeigenImageThread(chatId);
    if (activeKzImage) {
      if (msg.document) {
        await kzAppendAttachment(chatId, activeKzImage, {
          fileId: msg.document.file_id,
          filename: msg.document.file_name ?? `attachment-${Date.now()}`,
          mime: msg.document.mime_type ?? 'application/octet-stream',
          sizeBytes: msg.document.file_size,
        });
      } else if (msg.photo?.length) {
        const largest = msg.photo[msg.photo.length - 1];
        if (largest) {
          await kzAppendAttachment(chatId, activeKzImage, {
            fileId: largest.file_id,
            filename: `photo-${Date.now()}.jpg`,
            mime: 'image/jpeg',
            sizeBytes: largest.file_size,
          });
        }
      }
      return NextResponse.json({ ok: true });
    }
  }
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat(telegram): capture Kleinanzeigen state-driven text and image input"
```

---

## Task 15: `/refresh-profile` and `/export-overrides` commands

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Add command handlers**

Add near the other command handlers (just above the `handleCommand` definition):

```ts
async function handleRefreshProfileCommand(chatId: number): Promise<void> {
  clearKleinanzeigenProfileCache();
  try {
    const { fetchLlmsTxt } = await import('@/lib/kleinanzeigen/profile');
    const text = await fetchLlmsTxt();
    await sendMessage({
      chatId,
      text: ['🔄 Profil yenilendi.', `Boyut: ${text.length} karakter.`].join('\n'),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleExportOverridesCommand(chatId: number): Promise<void> {
  const overrides = await listKleinanzeigenOverrides();
  if (overrides.length === 0) {
    await sendMessage({ chatId, text: 'Henüz override yok.' });
    return;
  }
  const lines = overrides.map(
    (o) => `- [${o.kind}] ${o.topic}: ${o.content.replace(/\n/g, ' ')}`,
  );
  const blob = ['## Zusätzliche Hinweise (Telegram overrides)', '', ...lines].join('\n');
  await sendMessage({
    chatId,
    text: ['📋 Mevcut overrideler (llms.txt\'e ekleyebilirsin):', '', blob.slice(0, 3500)].join('\n'),
  });
}
```

- [ ] **Step 2: Wire commands into handleCommand**

In `handleCommand`, after the `/help` handler (around line 1546), add:

```ts
  if (trimmed === '/refresh-profile' || trimmed === '/refresh_profile') {
    await handleRefreshProfileCommand(chatId);
    return;
  }
  if (trimmed === '/export-overrides' || trimmed === '/export_overrides') {
    await handleExportOverridesCommand(chatId);
    return;
  }
```

- [ ] **Step 3: Update help text**

In `HELP_TEXT` (around line 149), add two lines before the `/help` entry:

```ts
  '  /refresh-profile        — fly-froth.com/llms.txt cache temizle',
  '  /export-overrides       — Telegram\'dan eklenen overrideleri JSON olarak ver',
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat(telegram): add /refresh-profile and /export-overrides commands"
```

---

## Task 16: Full vitest run + smoke verification

**Files:** none modified.

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: ALL TESTS PASS (existing + new Kleinanzeigen tests).

- [ ] **Step 2: Manual smoke flow**

After deploy, run this manual test plan:

1. Send a fake Kleinanzeigen-format email to your Zoho inbox:
   - From: `test-token@mail.kleinanzeigen.de`
   - Subject: `Nachricht zu deiner Anzeige`
   - Body:
     ```
     Hallo Mehmet,
     du hast eine Nachricht von Test-User zu deiner Anzeige "Test Listing" erhalten:

     ---
     Kannst du mir ein Logo für 50€ machen?
     ---

     Antworte dieser E-Mail direkt.
     ```
2. Trigger the inbox poll: `curl -H "Authorization: Bearer $CRON_SECRET" https://admin.fly-froth.com/api/mail/poll-inbox`
3. Verify Telegram shows the new action menu with [💡][🤔][✏️][❌] buttons.
4. Click `💡 AI öner` → verify a German reply appears with [✅][✏️][🔄][📎][🔙] buttons.
5. Click `📎 Görsel ekle` → upload a photo → confirm "Eklendi" message → click "Geri" → preview shows attachment count.
6. Click `✏️ Düzenle` → type `daha kısa yap` → verify a shorter reply appears.
7. Click `✅ Gönder` → verify "Cevap gönderildi" + check that mail (with image attached) actually left Zoho (Sent folder).
8. Trigger another fake mail mentioning a service NOT in llms.txt (e.g. "3D-Rendering") → verify the gap warning + 🔧 button appears → click → choose "Evet sunuyorum" → type details → verify override saved → verify AI öner now mentions the new info.
9. Run `/refresh-profile` → expect confirmation.
10. Run `/export-overrides` → expect JSON-like list.

- [ ] **Step 3: Final commit (if no fixes needed)**

```bash
git status
# Verify clean tree. If clean, the implementation is complete.
```

---

## Notes for Implementer

- **Existing patterns:** Mirror the `invoices` and `mail-drafts` module layouts. Don't introduce new conventions.
- **Model:** All Claude calls use `claude-sonnet-4-6` (matches `src/lib/ai/reply.ts`).
- **Cache control:** Add `cache_control: { type: 'ephemeral' }` to system prompts on every Anthropic call.
- **Env vars (no new ones required):** `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `ALLOWED_TELEGRAM_USER_IDS`, `ZOHO_SMTP_*`, `ZOHO_IMAP_*`, `DATABASE_URL` / `DATABASE_URL_NON_POOLING`, `CRON_SECRET`. The optional `KLEINANZEIGEN_PROFILE_URL` defaults to `https://fly-froth.com/llms.txt`.
- **DB tests** require a live Neon connection via `.env.local`; they create rows with timestamp-suffixed identifiers and clean up in `afterAll`.
- **No new npm dependencies** are required.
- **Image attachments** are stored inline as base64 in `kleinanzeigen_threads.attachments` (same shape as `MailAttachment`). Telegram 20 MB / file cap applies. Empty array is the default.
- **State machine summary** for threads: `new` → `awaiting_action` (active) → one of `{awaiting_custom, awaiting_refinement, awaiting_gap_info, awaiting_image, drafting}` → terminal `sent` or `rejected`.
