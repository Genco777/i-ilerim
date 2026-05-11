# Social Media Full Otomasyon — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully automated IG+FB social media system with Telegram-based weekly calendar management, FLUX.2+Recraft AI visual pipeline, and scheduled Meta Graph API publishing.

**Architecture:** Extends existing `fly-froth-social` Next.js 16 app. New DB tables (`content_plans`, `content_slots`) drive weekly plan generation. Image pipeline upgraded from FLUX 1.1 to FLUX.2 flex + Recraft V4 with automatic model routing. Telegram `/haftalik-plan` command triggers weekly preview with inline keyboard approval. Cron endpoint polls scheduled posts and publishes via existing Meta Graph API client.

**Tech Stack:** Next.js 16, Drizzle ORM (PostgreSQL), Replicate (FLUX.2, Recraft), OpenAI (GPT Image 2, fallback), Anthropic (Claude Sonnet 4.6), Telegram Bot API, Meta Graph API v21

---

### Task 1: DB Schema — content_plans + content_slots + posts extension

**Files:**
- Modify: `src/lib/db/schema.ts` (append after line 437)
- Create: Drizzle migration file (auto-generated)

- [ ] **Step 1: Add new enums and tables to schema.ts**

Add these definitions after the `failedJobs` table (line 437):

```typescript
// ───── Content Planning ─────
export const contentPillar = pgEnum('content_pillar', [
  'vitrine',
  'prozess',
  'insight',
  'lokal',
  'reel',
]);

export const planStatus = pgEnum('plan_status', [
  'draft',
  'approved',
  'scheduled',
]);

export const slotStatus = pgEnum('slot_status', [
  'pending',
  'generated',
  'approved',
  'rejected',
]);

export const contentChannel = pgEnum('content_channel', [
  'feed',
  'story',
  'reel',
]);

export const contentPlans = pgTable('content_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  calendar_week: integer('calendar_week').notNull(),
  year: integer('year').notNull(),
  status: planStatus('status').notNull().default('draft'),
  telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
  telegram_message_id: integer('telegram_message_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approved_at: timestamp('approved_at', { withTimezone: true }),
});

export const contentSlots = pgTable(
  'content_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => contentPlans.id, { onDelete: 'cascade' }),
    day_of_week: integer('day_of_week').notNull(), // 0=Mon...6=Sun
    time_slot: text('time_slot').notNull(), // '12:00' | '18:30'
    pillar: contentPillar('pillar').notNull(),
    channel: contentChannel('channel').notNull().default('feed'),
    topic: text('topic'),
    post_id: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
    status: slotStatus('status').notNull().default('pending'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planDayTimeUnique: uniqueIndex('content_slots_plan_day_time_idx').on(
      t.plan_id,
      t.day_of_week,
      t.time_slot,
    ),
  }),
);
```

- [ ] **Step 2: Add new columns to posts table**

Add `content_pillar`, `calendar_week`, and `channel` to the existing `posts` table definition. In the `posts` table (around line 111), add after `created_via`:

```typescript
content_pillar: contentPillar('content_pillar'),
calendar_week: integer('calendar_week'),
channel: contentChannel('channel').default('feed'),
```

- [ ] **Step 3: Generate migration**

```bash
cd C:/Users/flyfr/fly-froth-social && npm run db:generate
```

- [ ] **Step 4: Run migration**

```bash
cd C:/Users/flyfr/fly-froth-social && npm run db:migrate
```

Expected: Migration applied successfully.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle/
git commit -m "feat: add content_plans, content_slots tables and posts extensions"
```

---

### Task 2: DB Queries — Plan CRUD

**Files:**
- Create: `src/lib/db/queries/plans.ts`

- [ ] **Step 1: Write createPlan and getPlan**

```typescript
import { db } from '@/lib/db';
import { contentPlans, contentSlots } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import type { ContentPlan, ContentSlot, NewContentPlan, NewContentSlot } from '@/types';

export async function createPlan(data: NewContentPlan): Promise<ContentPlan> {
  const [created] = await db.insert(contentPlans).values(data).returning();
  if (!created) throw new Error('Failed to create plan');
  return created;
}

export async function getPlan(id: string): Promise<ContentPlan | null> {
  const rows = await db.select().from(contentPlans).where(eq(contentPlans.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getPlanByWeek(calendarWeek: number, year: number): Promise<ContentPlan | null> {
  const rows = await db
    .select()
    .from(contentPlans)
    .where(and(eq(contentPlans.calendar_week, calendarWeek), eq(contentPlans.year, year)))
    .limit(1);
  return rows[0] ?? null;
}

export async function updatePlan(id: string, patch: Partial<NewContentPlan>): Promise<ContentPlan> {
  const [updated] = await db.update(contentPlans).set(patch).where(eq(contentPlans.id, id)).returning();
  if (!updated) throw new Error(`Plan ${id} not found`);
  return updated;
}

export async function approvePlan(id: string): Promise<ContentPlan> {
  return updatePlan(id, { status: 'approved', approved_at: new Date() });
}
```

- [ ] **Step 2: Write slot CRUD**

```typescript
export async function createSlot(data: NewContentSlot): Promise<ContentSlot> {
  const [created] = await db.insert(contentSlots).values(data).returning();
  if (!created) throw new Error('Failed to create slot');
  return created;
}

export async function createSlots(data: NewContentSlot[]): Promise<ContentSlot[]> {
  if (data.length === 0) return [];
  const created = await db.insert(contentSlots).values(data).returning();
  return created;
}

export async function getSlotsByPlan(planId: string): Promise<ContentSlot[]> {
  return db.select().from(contentSlots).where(eq(contentSlots.plan_id, planId));
}

export async function updateSlot(id: string, patch: Partial<NewContentSlot>): Promise<ContentSlot> {
  const [updated] = await db.update(contentSlots).set(patch).where(eq(contentSlots.id, id)).returning();
  if (!updated) throw new Error(`Slot ${id} not found`);
  return updated;
}

export async function deleteSlot(id: string): Promise<void> {
  await db.delete(contentSlots).where(eq(contentSlots.id, id));
}

export async function getSlot(id: string): Promise<ContentSlot | null> {
  const rows = await db.select().from(contentSlots).where(eq(contentSlots.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function getApprovedSlotsForPublishing(): Promise<ContentSlot[]> {
  return db
    .select()
    .from(contentSlots)
    .where(and(eq(contentSlots.status, 'approved'), eq(contentSlots.channel, 'feed')));
}
```

- [ ] **Step 3: Update types/index.ts**

Add after the existing type exports:

```typescript
import { contentPlans, contentSlots, contentPillar, planStatus, slotStatus, contentChannel } from '@/lib/db/schema';
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';

export type ContentPlan = InferSelectModel<typeof contentPlans>;
export type NewContentPlan = InferInsertModel<typeof contentPlans>;
export type ContentSlot = InferSelectModel<typeof contentSlots>;
export type NewContentSlot = InferInsertModel<typeof contentSlots>;
export type ContentPillar = 'vitrine' | 'prozess' | 'insight' | 'lokal' | 'reel';
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/plans.ts src/types/index.ts
git commit -m "feat: add content plan and slot CRUD queries"
```

---

### Task 3: Image Pipeline — FLUX.2 flex upgrade

**Files:**
- Modify: `src/lib/ai/image-replicate.ts`

- [ ] **Step 1: Refactor replicateGenerate for multi-model support**

Replace the entire file:

```typescript
import Replicate from 'replicate';

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5';

export type FluxModel = 'flux-2-flex' | 'flux-2-max' | 'flux-2-pro';

const MODEL_MAP: Record<FluxModel, `${string}/${string}`> = {
  'flux-2-flex': 'black-forest-labs/flux-2-flex',
  'flux-2-max': 'black-forest-labs/flux-2-max',
  'flux-2-pro': 'black-forest-labs/flux-2-pro',
};

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

export async function replicateGenerate(
  prompt: string,
  opts?: {
    aspectRatio?: AspectRatio;
    model?: FluxModel;
    referenceImages?: string[]; // URLs for img2img style guidance (FLUX.2 flex supports up to 10)
  },
): Promise<Buffer> {
  const modelId = MODEL_MAP[opts?.model ?? 'flux-2-flex'];
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: opts?.aspectRatio ?? '1:1',
    output_format: 'png',
    safety_tolerance: 2,
  };

  if (opts?.referenceImages?.length) {
    input.reference_images = opts.referenceImages.slice(0, 10);
  }

  const output = await getClient().run(modelId as `${string}/${string}:${string}`, { input });

  let url: string | undefined;
  if (typeof output === 'string') {
    url = output;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    url = output[0];
  } else if (output && typeof output === 'object' && 'url' in output && typeof (output as { url: unknown }).url === 'function') {
    url = (output as { url: () => string }).url();
  }

  if (!url) {
    throw new Error('Unexpected Replicate output shape: ' + JSON.stringify(output).slice(0, 200));
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Replicate image fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ai/image-replicate.ts
git commit -m "feat: upgrade Replicate to FLUX.2 flex with multi-model + reference image support"
```

---

### Task 4: Image Pipeline — Recraft V4 + Model Router

**Files:**
- Create: `src/lib/ai/image-recraft.ts`
- Create: `src/lib/ai/image-router.ts`
- Modify: `src/lib/ai/image.ts`

- [ ] **Step 1: Create Recraft V4 integration**

```typescript
// src/lib/ai/image-recraft.ts
import Replicate from 'replicate';

const MODEL = 'recraft-ai/recraft-v4' as const;

let _client: Replicate | null = null;
function getClient(): Replicate {
  if (!_client) {
    const auth = process.env.REPLICATE_API_TOKEN;
    if (!auth) throw new Error('REPLICATE_API_TOKEN is not set');
    _client = new Replicate({ auth });
  }
  return _client;
}

export async function recraftGenerate(
  prompt: string,
  opts?: { style?: 'logo_presentation' | 'brand_board' | 'design_mockup' },
): Promise<Buffer> {
  const style = opts?.style ?? 'design_mockup';
  const input: Record<string, unknown> = {
    prompt,
    style,
    output_format: 'png',
  };

  const output = await getClient().run(MODEL as `${string}/${string}:${string}`, { input });

  let url: string | undefined;
  if (typeof output === 'string') {
    url = output;
  } else if (Array.isArray(output) && typeof output[0] === 'string') {
    url = output[0];
  }

  if (!url) {
    throw new Error('Unexpected Recraft output: ' + JSON.stringify(output).slice(0, 200));
  }

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Recraft image fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}
```

- [ ] **Step 2: Create model router**

```typescript
// src/lib/ai/image-router.ts
import type { ContentPillar } from '@/types';
import { replicateGenerate, type FluxModel } from './image-replicate';
import { recraftGenerate } from './image-recraft';
import { openaiGenerate } from './image-openai';

export type ImageTool = 'flux' | 'recraft' | 'openai';

export interface RouteResult {
  tool: ImageTool;
  model?: FluxModel;
  recraftStyle?: 'logo_presentation' | 'brand_board' | 'design_mockup';
}

export function routeImageTool(pillar: ContentPillar, topic: string): RouteResult {
  const t = topic.toLowerCase();

  // Recraft for design-specific content
  if (pillar === 'vitrine' && (t.includes('logo') || t.includes('branding') || t.includes('corporate'))) {
    return { tool: 'recraft', recraftStyle: 'logo_presentation' };
  }
  if (pillar === 'insight' && (t.includes('farbpalette') || t.includes('brand') || t.includes('designsystem'))) {
    return { tool: 'recraft', recraftStyle: 'brand_board' };
  }

  // FLUX.2 flex for everything else (typography handled natively)
  if (pillar === 'prozess' || pillar === 'lokal') {
    return { tool: 'flux', model: 'flux-2-flex' };
  }

  // FLUX.2 max for vitrine showcase posts
  if (pillar === 'vitrine') {
    return { tool: 'flux', model: 'flux-2-max' };
  }

  // Default: FLUX.2 flex
  return { tool: 'flux', model: 'flux-2-flex' };
}

export async function generateWithRouter(
  prompt: string,
  route: RouteResult,
  opts?: { aspectRatio?: '1:1' | '9:16' | '16:9' | '4:5' },
): Promise<{ buffer: Buffer; tool: ImageTool }> {
  if (route.tool === 'recraft') {
    const buffer = await recraftGenerate(prompt, { style: route.recraftStyle });
    return { buffer, tool: 'recraft' };
  }

  if (route.tool === 'flux') {
    const buffer = await replicateGenerate(prompt, {
      model: route.model,
      aspectRatio: opts?.aspectRatio ?? '1:1',
    });
    return { buffer, tool: 'flux' };
  }

  // Fallback to OpenAI
  const buffer = await openaiGenerate(prompt);
  return { buffer, tool: 'openai' };
}
```

- [ ] **Step 3: Update image.ts to use model router**

In `src/lib/ai/image.ts`, add import and update `generateImage`:

Add imports:
```typescript
import { routeImageTool, generateWithRouter, type RouteResult } from './image-router';
```

Add new function:
```typescript
export async function generateImageRouted(
  prompt: string,
  pillar: ContentPillar,
  topic: string,
  opts?: GenerateOptions,
): Promise<GenerateResult> {
  const route = routeImageTool(pillar, topic);

  try {
    const { buffer, tool } = await generateWithRouter(prompt, route, {
      aspectRatio: opts?.aspectRatio,
    });
    return {
      buffer,
      provider: tool === 'openai' ? 'openai' : 'replicate',
    };
  } catch (err) {
    // Fallback to OpenAI if Replicate tools fail
    if (route.tool !== 'openai') {
      console.warn(`[image] ${route.tool} failed, falling back to OpenAI`);
      const buffer = await openaiGenerate(prompt, { quality: opts?.quality });
      return { buffer, provider: 'openai' };
    }
    throw err;
  }
}
```

Also add the `ContentPillar` import at top:
```typescript
import type { ContentPillar } from '@/types';
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/ai/image-recraft.ts src/lib/ai/image-router.ts src/lib/ai/image.ts
git commit -m "feat: add Recraft V4 integration and automatic model router"
```

---

### Task 5: Weekly Plan Generator

**Files:**
- Create: `src/lib/content/generate-plan.ts`

- [ ] **Step 1: Write the plan generator**

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import { createPlan, createSlots, getPlanByWeek } from '@/lib/db/queries/plans';
import type { ContentPillar, ContentPlan, ContentSlot } from '@/types';

const MODEL = 'claude-sonnet-4-6';

function getCurrentWeek(): { week: number; year: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return { week: Math.ceil((days + start.getDay() + 1) / 7), year: now.getFullYear() };
}

const WEEKLY_CALENDAR: {
  day: number; // 0=Mon
  pillar: ContentPillar;
  time: string;
  channel: 'feed' | 'reel';
}[] = [
  { day: 0, pillar: 'insight', time: '18:30', channel: 'feed' },
  { day: 1, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 1, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 2, pillar: 'lokal', time: '18:30', channel: 'feed' },
  { day: 3, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 3, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 4, pillar: 'insight', time: '18:30', channel: 'feed' },
  { day: 5, pillar: 'vitrine', time: '18:30', channel: 'feed' },
  { day: 5, pillar: 'reel', time: '12:00', channel: 'reel' },
  { day: 6, pillar: 'vitrine', time: '18:30', channel: 'feed' },
];

const GERMAN_DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

interface PlanSlot {
  dayLabel: string;
  time: string;
  pillar: ContentPillar;
  channel: 'feed' | 'reel';
  topic: string;
}

interface GeneratedPlan {
  slots: PlanSlot[];
}

function systemPrompt(): string {
  return [
    'Du bist der Content-Planer für Fly & Froth, ein Grafik- und Webdesign-Studio aus Karben (Deutschland).',
    'Deine Aufgabe: Erstelle für jede Kalenderwoche relevante, ansprechende Themen für Social-Media-Posts.',
    '',
    'Inhaltliche Säulen:',
    '- vitrine: Portfolio-Arbeiten zeigen (Webdesign, Logodesign, Flyer, Visitenkarten)',
    '- prozess: Designprozess, Behind-the-Scenes',
    '- insight: Design-Tipps, Trends, Wissen (Carousel-Posts)',
    '- lokal: Standort-bezogene Posts (19 Städte im Rhein-Main-Gebiet)',
    '- reel: Kurze Video-Themen (Design-Timelapse, Before/After, Trends)',
    '',
    'Themen müssen konkret und realistisch sein. Keine Fantasie-Projekte.',
    'Jedes Thema muss auf Deutsch sein, max 80 Zeichen.',
    '',
    'Antworte NUR mit JSON:',
    '{ "slots": [{ "dayLabel": "Montag", "time": "18:30", "pillar": "insight", "channel": "feed", "topic": "..." }, ...] }',
  ].join('\n');
}

function userPrompt(week: number, year: number): string {
  return `Erstelle Social-Media-Themen für Kalenderwoche ${week}, ${year}. 10 Slots wie angegeben.`;
}

export async function generateWeeklyPlan(chatId: number): Promise<{ plan: ContentPlan; slots: ContentSlot[] }> {
  const { week, year } = getCurrentWeek();

  const existing = await getPlanByWeek(week, year);
  if (existing) {
    throw new Error(`Plan für KW${week}/${year} existiert bereits. Nutze /plan-status zum Anzeigen.`);
  }

  const brandKit = await getBrandKit();

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: systemPrompt(),
    messages: [{ role: 'user', content: userPrompt(week, year) }],
  });

  const block = response.content[0];
  if (!block || block.type !== 'text') throw new Error('No text block in Claude response');

  const jsonMatch = block.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');

  const generated = JSON.parse(jsonMatch[0]) as GeneratedPlan;
  if (!generated.slots?.length) throw new Error('Empty slots array');

  const plan = await createPlan({
    calendar_week: week,
    year,
    status: 'draft',
    telegram_chat_id: chatId,
  });

  const slotData = generated.slots.slice(0, 10).map((s, i) => {
    const template = WEEKLY_CALENDAR[i] ?? WEEKLY_CALENDAR[0];
    return {
      plan_id: plan.id,
      day_of_week: template.day,
      time_slot: template.time,
      pillar: template.pillar,
      channel: template.channel,
      topic: s.topic,
      status: 'pending' as const,
    };
  });

  const slots = await createSlots(slotData);

  return { plan, slots };
}

export function formatPlanForTelegram(plan: ContentPlan, slots: ContentSlot[]): string {
  const pillarEmoji: Record<string, string> = {
    vitrine: '🖼',
    prozess: '🎬',
    insight: '📊',
    lokal: '📍',
    reel: '🎥',
  };

  const grouped: Record<string, ContentSlot[]> = {};
  for (const s of slots) {
    const key = `${s.day_of_week}`;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(s);
  }

  const lines: string[] = [
    `📅 **Woche ${plan.calendar_week} — ${plan.year}**`,
    '',
  ];

  // Count pillars
  const pillarCounts: Record<string, number> = {};
  for (const s of slots) {
    pillarCounts[s.pillar] = (pillarCounts[s.pillar] ?? 0) + 1;
  }
  const summary = Object.entries(pillarCounts)
    .map(([k, v]) => `${v}× ${pillarEmoji[k] ?? ''} ${k}`)
    .join(' | ');
  lines.push(summary);
  lines.push('');

  for (let d = 0; d < 7; d++) {
    const daySlots = grouped[`${d}`] ?? [];
    for (const slot of daySlots) {
      const dayShort = GERMAN_DAYS[d]?.slice(0, 2) ?? '??';
      const emoji = pillarEmoji[slot.pillar] ?? '📌';
      const indent = slot.channel === 'reel' ? '  🎬' : '';
      lines.push(`${dayShort} ${slot.time_slot} — ${emoji}${indent} ${slot.topic ?? '(kein Thema)'}`);
    }
  }

  return lines.join('\n');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/content/generate-plan.ts
git commit -m "feat: add weekly content plan generator with Claude"
```

---

### Task 6: Telegram Plan Keyboard + Webhook Handlers

**Files:**
- Create: `src/lib/telegram/plan-keyboard.ts`
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Create plan keyboard**

```typescript
// src/lib/telegram/plan-keyboard.ts
import type { InlineKeyboardMarkup } from './bot';

export function planOverviewKeyboard(planId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Alle planen', callback_data: `plan_approve_all:${planId}` },
        { text: '✏️ Slot bearbeiten', callback_data: `plan_edit:${planId}` },
      ],
      [
        { text: '🔄 Plan neu', callback_data: `plan_regen:${planId}` },
        { text: '✗ Verwerfen', callback_data: `plan_discard:${planId}` },
      ],
    ],
  };
}

export function slotEditKeyboard(slotId: string, planId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Genehmigen', callback_data: `slot_approve:${slotId}` },
        { text: '🔄 Neues Thema', callback_data: `slot_regen_topic:${slotId}` },
      ],
      [
        { text: '📝 Text bearbeiten', callback_data: `slot_edit_text:${slotId}` },
        { text: '✗ Löschen', callback_data: `slot_delete:${slotId}` },
      ],
      [
        { text: '← Zurück', callback_data: `plan_view:${planId}` },
      ],
    ],
  };
}

export function slotApproveKeyboard(slotId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✓ Jetzt generieren', callback_data: `slot_generate:${slotId}` },
        { text: '← Zurück', callback_data: `slot_back:${slotId}` },
      ],
    ],
  };
}
```

- [ ] **Step 2: Add webhook command handlers**

In `src/app/api/telegram/webhook/[secret]/route.ts`, add after the `/fatura` handler block in `handleCommand`:

```typescript
if (trimmed === '/haftalik-plan' || trimmed === '/haftalik_plan') {
  await handleWeeklyPlanCommand(chatId);
  return;
}

if (trimmed === '/plan-durum' || trimmed === '/plan_durum') {
  await handlePlanStatusCommand(chatId);
  return;
}
```

Also add to HELP_TEXT (around line 193):
```typescript
'  /haftalik-plan           — Haftalık IG+FB içerik planı oluştur (AI)',
'  /plan-durum              — Bu haftanın plan durumunu göster',
```

- [ ] **Step 3: Add handler functions**

Add these functions before the `handleCommand` function:

```typescript
async function handleWeeklyPlanCommand(chatId: number): Promise<void> {
  await sendMessage({ chatId, text: '📅 Haftalık plan oluşturuluyor… (15-30 saniye)' });
  try {
    const { plan, slots } = await generateWeeklyPlan(chatId);
    const text = formatPlanForTelegram(plan, slots);
    const sent = await sendMessage({
      chatId,
      text,
      replyMarkup: planOverviewKeyboard(plan.id),
    });
    await updatePlan(plan.id, { telegram_message_id: sent.message_id });
  } catch (err) {
    await notifyError(chatId, err);
  }
}

async function handlePlanStatusCommand(chatId: number): Promise<void> {
  const { week, year } = getCurrentWeek();
  const plan = await getPlanByWeek(week, year);
  if (!plan) {
    await sendMessage({ chatId, text: `KW${week}/${year} için henüz plan yok. /haftalik-plan yaz.` });
    return;
  }
  const slots = await getSlotsByPlan(plan.id);
  const text = formatPlanForTelegram(plan, slots);
  await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(plan.id) });
}
```

Add these imports at the top of the webhook file:
```typescript
import { generateWeeklyPlan, formatPlanForTelegram } from '@/lib/content/generate-plan';
import { planOverviewKeyboard, slotEditKeyboard, slotApproveKeyboard } from '@/lib/telegram/plan-keyboard';
import {
  createPlan, getPlan, getPlanByWeek, updatePlan, approvePlan,
  createSlot, getSlotsByPlan, updateSlot, deleteSlot, getSlot,
} from '@/lib/db/queries/plans';
import { getCurrentWeek } from '@/lib/content/generate-plan'; // will export
```

- [ ] **Step 4: Add callback handlers for plan actions**

Add in `handleCallback` (after existing `inv_*` handlers, before the `else`):

```typescript
} else if (action === 'plan_approve_all' && postId) {
  await handlePlanApproveAll(chatId, messageId, postId);
} else if (action === 'plan_regen' && postId) {
  await handlePlanRegen(chatId, postId);
} else if (action === 'plan_discard' && postId) {
  await handlePlanDiscard(chatId, messageId, postId);
} else if (action === 'plan_view' && postId) {
  await handlePlanView(chatId, postId);
} else if (action === 'plan_edit' && postId) {
  await handlePlanEditPrompt(chatId, postId);
} else if (action === 'slot_approve' && postId) {
  await handleSlotApprove(chatId, messageId, postId);
} else if (action === 'slot_regen_topic' && postId) {
  await handleSlotRegenTopic(chatId, postId);
} else if (action === 'slot_delete' && postId) {
  await handleSlotDelete(chatId, messageId, postId);
} else if (action === 'slot_generate' && postId) {
  await handleSlotGenerate(chatId, messageId, postId);
} else if (action === 'slot_back' && postId) {
  await handleSlotBack(chatId, postId);
```

- [ ] **Step 5: Add handler implementations**

Add these functions before `handleCallback`:

```typescript
async function handlePlanApproveAll(chatId: number, messageId: number, planId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }

  const slots = await getSlotsByPlan(planId);
  await sendMessage({ chatId, text: `📤 ${slots.length} post onaylanıp sıraya alınıyor…` });

  for (const slot of slots) {
    if (!slot.topic) continue;
    try {
      const post = await generatePost({
        topic: slot.topic,
        telegramChatId: String(chatId),
        channel: slot.channel === 'reel' ? 'ig_story' : 'post',
      });
      await updateSlot(slot.id, { post_id: post.id, status: 'approved' });
    } catch (err) {
      await updateSlot(slot.id, { status: 'rejected' });
      console.error(`Slot ${slot.id} generation failed:`, err);
    }
  }

  await approvePlan(planId);
  await sendMessage({
    chatId,
    text: [
      `✅ KW${plan.calendar_week} planı onaylandı.`,
      `${slots.length} post sıraya alındı.`,
      'Planlanan saatte otomatik yayınlanacak.',
    ].join('\n'),
  });
}

async function handlePlanRegen(chatId: number, planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }
  // Delete old slots
  const oldSlots = await getSlotsByPlan(planId);
  for (const s of oldSlots) await deleteSlot(s.id);
  // Regenerate
  await sendMessage({ chatId, text: '🔄 Plan yeniden oluşturuluyor…' });
  try {
    const { slots } = await generateWeeklyPlan(chatId);
    await updatePlan(planId, { status: 'draft' });
    const text = formatPlanForTelegram(plan, slots);
    const sent = await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(planId) });
    await updatePlan(planId, { telegram_message_id: sent.message_id });
  } catch (err) { await notifyError(chatId, err); }
}

async function handlePlanDiscard(chatId: number, messageId: number, planId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const slots = await getSlotsByPlan(planId);
  for (const s of slots) await deleteSlot(s.id);
  await updatePlan(planId, { status: 'draft' });
  await sendMessage({ chatId, text: '🗑 Plan silindi.' });
}

async function handlePlanView(chatId: number, planId: string): Promise<void> {
  const plan = await getPlan(planId);
  if (!plan) { await sendMessage({ chatId, text: 'Plan bulunamadı.' }); return; }
  const slots = await getSlotsByPlan(planId);
  const text = formatPlanForTelegram(plan, slots);
  await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(planId) });
}

async function handlePlanEditPrompt(chatId: number, planId: string): Promise<void> {
  const slots = await getSlotsByPlan(planId);
  if (!slots.length) { await sendMessage({ chatId, text: 'Planda slot yok.' }); return; }
  const lines = slots.map((s, i) => {
    const day = ['Mo','Di','Mi','Do','Fr','Sa','So'][s.day_of_week] ?? '??';
    return `${i + 1}. ${day} ${s.time_slot} [${s.pillar}] ${s.topic ?? '(leer)'}`;
  });
  await sendMessage({
    chatId,
    text: ['✏️ Düzenlemek için slot numarasını yaz (örn. "3"):', '', ...lines].join('\n'),
  });
  // Set user state to awaiting slot number — handled via text input below
}

async function handleSlotApprove(chatId: number, messageId: number, slotId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const slot = await getSlot(slotId);
  if (!slot || !slot.topic) {
    await sendMessage({ chatId, text: 'Slot bulunamadi veya konu yok.' });
    return;
  }
  await sendMessage({ chatId, text: '🎨 Post üretiliyor…' });
  try {
    const post = await generatePost({
      topic: slot.topic,
      telegramChatId: String(chatId),
      channel: slot.channel === 'reel' ? 'ig_story' : 'post',
    });
    await updateSlot(slotId, { post_id: post.id, status: 'approved' });
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: `${post.text_de}\n\n${(post.hashtags ?? []).map(h => `#${h}`).join(' ')}`.slice(0, 1024),
    });
    await sendMessage({ chatId, text: '✅ Slot onaylandı ve post hazır.' });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleSlotRegenTopic(chatId: number, slotId: string): Promise<void> {
  await sendMessage({ chatId, text: '✏️ Yeni konuyu yaz:' });
  // Text input will be handled by a state machine — simplified: update slot topic directly
}

async function handleSlotDelete(chatId: number, messageId: number, slotId: string): Promise<void> {
  const slot = await getSlot(slotId);
  await deleteSlot(slotId);
  await sendMessage({ chatId, text: `🗑 Slot ${slot?.topic ?? slotId} silindi.` });
}

async function handleSlotGenerate(chatId: number, messageId: number, slotId: string): Promise<void> {
  await editMessageReplyMarkup({ chatId, messageId, replyMarkup: undefined });
  const slot = await getSlot(slotId);
  if (!slot || !slot.topic) return;
  await sendMessage({ chatId, text: '🎨 Post üretiliyor…' });
  try {
    const post = await generatePost({
      topic: slot.topic,
      telegramChatId: String(chatId),
      channel: slot.channel === 'reel' ? 'ig_story' : 'post',
    });
    await updateSlot(slotId, { post_id: post.id, status: 'approved' });
    await sendPhoto({
      chatId,
      photo: post.final_image_url,
      caption: `${post.text_de}`.slice(0, 1024),
    });
  } catch (err) { await notifyError(chatId, err); }
}

async function handleSlotBack(chatId: number, slotId: string): Promise<void> {
  const slot = await getSlot(slotId);
  if (!slot) return;
  const plan = await getPlan(slot.plan_id);
  if (!plan) return;
  const slots = await getSlotsByPlan(plan.id);
  const text = formatPlanForTelegram(plan, slots);
  await sendMessage({ chatId, text, replyMarkup: planOverviewKeyboard(plan.id) });
}
```

Also export `getCurrentWeek` from `generate-plan.ts`:
```typescript
export function getCurrentWeek(): { week: number; year: number } { ... }
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/telegram/plan-keyboard.ts src/lib/content/generate-plan.ts src/app/api/telegram/webhook/\[secret\]/route.ts
git commit -m "feat: add /haftalik-plan Telegram command with inline keyboard management"
```

---

### Task 7: Cron Job — Scheduled Post Publisher

**Files:**
- Create: `src/app/api/cron/publish-scheduled/route.ts`

- [ ] **Step 1: Create cron endpoint**

```typescript
// src/app/api/cron/publish-scheduled/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts, contentSlots } from '@/lib/db/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { publishPost, publishStory } from '@/lib/meta/publisher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const results: { id: string; status: string; error?: string }[] = [];

  // Find posts with scheduled_at in the past that are still 'draft'
  const duePosts = await db
    .select()
    .from(posts)
    .where(
      and(
        eq(posts.status, 'draft'),
        lte(posts.scheduled_at, now),
        isNull(posts.published_at),
      ),
    )
    .limit(20);

  for (const post of duePosts) {
    try {
      const isStory = post.channel === 'story' || post.channel === 'reel';
      if (isStory) {
        await publishStory(post.id);
      } else {
        await publishPost(post.id);
      }
      results.push({ id: post.id, status: 'published' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: post.id, status: 'failed', error: msg });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    timestamp: now.toISOString(),
  });
}
```

- [ ] **Step 2: Set up GitHub Actions cron schedule**

No file change needed — user configures via GitHub Actions dashboard or Vercel Cron:
```
Endpoint: GET https://admin.fly-froth.com/api/cron/publish-scheduled
Header: Authorization: Bearer ${CRON_SECRET}
Schedule: every 15 minutes
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/publish-scheduled/route.ts
git commit -m "feat: add cron endpoint for scheduled post publishing"
```

---

### Task 8: Update generatePost to support pillar + scheduled_at

**Files:**
- Modify: `src/lib/content/generate-post.ts`

- [ ] **Step 1: Add pillar parameter and scheduled_at logic**

Add to `GeneratePostOpts` interface:
```typescript
pillar?: ContentPillar;
scheduledAt?: Date;
```

Add to `createPost` call in `generatePost`:
```typescript
content_pillar: opts.pillar ?? null,
calendar_week: opts.scheduledAt ? getCalendarWeek(opts.scheduledAt) : null,
channel: isStory ? 'story' : 'feed',
scheduled_at: opts.scheduledAt ?? null,
```

Add import:
```typescript
import type { ContentPillar } from '@/types';
```

Add helper:
```typescript
function getCalendarWeek(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + start.getDay() + 1) / 7);
}
```

- [ ] **Step 2: Wire image generator to use routed pipeline**

In `generatePost`, replace the image generation block with:
```typescript
import { generateImageRouted } from '@/lib/ai/image';

// In generatePost function, replace generateImage call:
const result = await generateImageRouted(
  imagePrompt,
  opts.pillar ?? 'vitrine',
  opts.topic,
  {
    forceProvider: opts.forceProvider,
    aspectRatio: isStory ? '9:16' : '1:1',
  },
);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/content/generate-post.ts
git commit -m "feat: add pillar tracking and routed image generation to generatePost"
```

---

### Task 9: End-to-End Test Flow

**Files:**
- Create: `src/__tests__/plan-generator.test.ts`

- [ ] **Step 1: Write unit test for plan generation**

```typescript
import { describe, it, expect } from 'vitest';
import { formatPlanForTelegram } from '@/lib/content/generate-plan';

describe('formatPlanForTelegram', () => {
  it('formats a plan with slots', () => {
    const plan = { id: '1', calendar_week: 20, year: 2026, status: 'draft' as const, telegram_chat_id: 123, created_at: new Date(), approved_at: null, telegram_message_id: null };
    const slots = [
      { id: 's1', plan_id: '1', day_of_week: 0, time_slot: '18:30', pillar: 'insight' as const, channel: 'feed' as const, topic: 'Warum gutes Design kein Zufall ist', post_id: null, status: 'pending' as const, created_at: new Date() },
      { id: 's2', plan_id: '1', day_of_week: 1, time_slot: '18:30', pillar: 'vitrine' as const, channel: 'feed' as const, topic: 'Website-Projekt Muster GmbH', post_id: null, status: 'pending' as const, created_at: new Date() },
    ];

    const result = formatPlanForTelegram(plan, slots);
    expect(result).toContain('Woche 20');
    expect(result).toContain('Warum gutes Design');
    expect(result).toContain('Muster GmbH');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd C:/Users/flyfr/fly-froth-social && npm test
```

Expected: All tests pass.

- [ ] **Step 3: Final commit**

```bash
git add src/__tests__/plan-generator.test.ts
git commit -m "test: add plan formatter unit test"
```

---

### Implementation Order

1. Task 1 → DB schema (foundation)
2. Task 2 → DB queries (foundation)
3. Task 3 → FLUX.2 upgrade (can be parallel with Task 2)
4. Task 4 → Recraft + router (depends on Task 3)
5. Task 5 → Plan generator (depends on Task 2)
6. Task 6 → Telegram handlers (depends on Tasks 2, 5)
7. Task 7 → Cron publisher (independent, can be parallel)
8. Task 8 → generatePost update (depends on Tasks 4, 5)
9. Task 9 → Tests (depends on all)

### Environment Variables Needed

```env
REPLICATE_API_TOKEN=...     # Already exists — FLUX.2 + Recraft use this
OPENAI_API_KEY=...          # Already exists — fallback
ANTHROPIC_API_KEY=...       # Already exists — Claude text + brief
CRON_SECRET=...             # Already exists — scheduled publishing
TELEGRAM_BOT_TOKEN=...      # Already exists
DATABASE_URL=...            # Already exists
```
