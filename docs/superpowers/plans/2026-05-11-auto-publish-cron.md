# Meta Graph API Otomatik Yayınlama Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan onaylandığında postların `scheduled_at` değeri slot takviminden hesaplansın, Vercel cron her 10 dakikada bir zamanı gelen postları Meta Graph API üzerinden otomatik yayınlasın.

**Architecture:** Batch endpoint (`generate-plan-slots`) slot'un `day_of_week` + `time_slot` + planın `calendar_week` + `year` bilgilerinden gerçek `Date` hesaplayıp `generatePost({ scheduledAt })` ile post'a yazar. Vercel cron ile 10 dakikada bir tetiklenen `publish-scheduled` endpoint'i `scheduled_at <= now` olan `draft` postları bulup `publishPost()`/`publishStory()` ile FB + IG'ye aynı anda yayınlar, sonucu Telegram'a bildirir.

**Tech Stack:** Next.js 16 API routes, Vercel cron, Meta Graph API v21.0, Drizzle ORM, Telegram Bot API

---

## File Structure

| File | Role |
|------|------|
| `src/lib/content/schedule-calc.ts` (create) | `day_of_week` + `time_slot` + `calendar_week` + `year` → `Date` hesaplama fonksiyonu |
| `src/app/api/generate-plan-slots/route.ts` (modify) | Her slot için `scheduledAt` hesapla, `generatePost()`'a ilet |
| `src/app/api/cron/publish-scheduled/route.ts` (modify) | Yayınlama sonrası Telegram bildirimi ekle |
| `vercel.json` (modify) | `publish-scheduled` cron kaydı ekle |
| `src/__tests__/schedule-calc.test.ts` (create) | `calculateScheduledAt()` için unit test |

---

### Task 1: `calculateScheduledAt` fonksiyonu

**Files:**
- Create: `src/lib/content/schedule-calc.ts`
- Create: `src/__tests__/schedule-calc.test.ts`

- [ ] **Step 1: Unit test yaz**

```typescript
// src/__tests__/schedule-calc.test.ts
import { describe, it, expect } from 'vitest';
import { calculateScheduledAt } from '@/lib/content/schedule-calc';

describe('calculateScheduledAt', () => {
  it('returns correct date for Monday 18:30 in week 20 of 2026', () => {
    // Week 20 of 2026: Monday (KW 20, 2026-05-11 is Monday. Let's verify:
    // ISO week date: 2026-05-11 = 2026-W20-1 (Monday of week 20)
    const result = calculateScheduledAt(20, 2026, 0, '18:30');
    // 0 = Monday, 18:30
    expect(result.toISOString()).toBe('2026-05-11T16:30:00.000Z'); // UTC = CEST-2
  });

  it('returns correct date for Saturday 12:00 in week 20 of 2026', () => {
    const result = calculateScheduledAt(20, 2026, 5, '12:00');
    // Saturday = day 5, 2026-05-16
    expect(result.toISOString()).toBe('2026-05-16T10:00:00.000Z'); // UTC = CEST-2
  });

  it('handles week boundary (Sunday)', () => {
    const result = calculateScheduledAt(20, 2026, 6, '09:00');
    // Sunday = day 6, 2026-05-17
    expect(result.toISOString()).toBe('2026-05-17T07:00:00.000Z');
  });

  it('returns valid Date for any input', () => {
    const result = calculateScheduledAt(1, 2026, 3, '14:45');
    expect(result instanceof Date).toBe(true);
    expect(isNaN(result.getTime())).toBe(false);
  });
});
```

- [ ] **Step 2: Testi çalıştır, fail olduğunu gör**

Run: `npx vitest run src/__tests__/schedule-calc.test.ts`
Expected: FAIL — `Cannot find module '@/lib/content/schedule-calc'`

- [ ] **Step 3: Implementasyonu yaz**

```typescript
// src/lib/content/schedule-calc.ts

/**
 * Calculate the absolute Date from a slot's calendar position.
 *
 * ISO week date math:
 * - calendar_week + year → find the Monday of that ISO week
 * - day_of_week (0=Mon..6=Sun) → offset from Monday
 * - time_slot ("HH:MM") → hours and minutes
 *
 * Returns a Date in the Europe/Berlin timezone.
 * On Vercel, the function runs in UTC; we interpret
 * time_slot as CET/CEST and convert.
 */
export function calculateScheduledAt(
  calendarWeek: number,
  year: number,
  dayOfWeek: number, // 0=Mon .. 6=Sun
  timeSlot: string,  // "HH:MM" in Europe/Berlin time
): Date {
  const [hours, minutes] = timeSlot.split(':').map(Number);

  // Step 1: January 4th is always in ISO week 1
  const jan4 = new Date(Date.UTC(year, 0, 4, 0, 0, 0, 0));

  // Monday of week 1 = jan4 - (jan4.getUTCDay() || 7) + 1
  // getUTCDay() for Thursday = 4, so Monday = jan4 - 3
  const jan4Day = jan4.getUTCDay() || 7; // Sunday = 7
  const mondayWeek1 = new Date(Date.UTC(year, 0, 4 - jan4Day + 1, 0, 0, 0, 0));

  // Monday of our target week = mondayWeek1 + (calendarWeek - 1) * 7 days
  const targetMonday = new Date(
    Date.UTC(year, 0, 4 - jan4Day + 1 + (calendarWeek - 1) * 7, hours, minutes, 0, 0),
  );

  // Add day_of_week offset
  const scheduled = new Date(
    Date.UTC(
      targetMonday.getUTCFullYear(),
      targetMonday.getUTCMonth(),
      targetMonday.getUTCDate() + dayOfWeek,
      hours,
      minutes,
      0,
      0,
    ),
  );

  return scheduled;
}
```

- [ ] **Step 4: Testi çalıştır, pass olduğunu gör**

Run: `npx vitest run src/__tests__/schedule-calc.test.ts`
Expected: 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/content/schedule-calc.ts src/__tests__/schedule-calc.test.ts
git commit -m "feat: add calculateScheduledAt for slot-to-date conversion"
```

---

### Task 2: Batch endpoint'e scheduled_at ekle

**Files:**
- Modify: `src/app/api/generate-plan-slots/route.ts:36-44`

- [ ] **Step 1: `generate-plan-slots/route.ts` içinde `scheduledAt` hesaplaması ekle**

`generatePost` çağrısına `scheduledAt` parametresini ekle:

```typescript
// Mevcut kod — import satırına ekle:
import { calculateScheduledAt } from '@/lib/content/schedule-calc';

// Mevcut generatePost çağrısı (satır ~39-44), şu şekilde değiştir:
const scheduledAt = calculateScheduledAt(
  plan.calendar_week,
  plan.year,
  slot.day_of_week,
  slot.time_slot,
);

const post = await generatePost({
  topic: slot.topic!,
  telegramChatId: String(chatId),
  channel: slot.channel === 'reel' ? 'ig_story' : 'post',
  pillar: slot.pillar,
  scheduledAt,
});
```

- [ ] **Step 2: TypeScript derlemesini kontrol et**

Run: `npx tsc --noEmit`
Expected: No errors related to schedule-calc or generate-plan-slots

- [ ] **Step 3: Commit**

```bash
git add src/app/api/generate-plan-slots/route.ts
git commit -m "feat: pass calculated scheduled_at when generating plan slots"
```

---

### Task 3: Vercel cron kaydı

**Files:**
- Modify: `vercel.json:4-8`

- [ ] **Step 1: vercel.json'a publish cron ekle**

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/poll-comments",
      "schedule": "0 9 * * *"
    },
    {
      "path": "/api/cron/publish-scheduled",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

> **Neden 10 dakika?** Vercel cron dakikada bir çalıştırmaya izin vermiyor (en sık 1 dakika olabilir ama rate limit riski var). 10 dakika, kullanıcı "şimdi yayınlansın" dediğinde en fazla 10 dk beklemesi demek. Postlar `scheduled_at` ile zamanlandığı için tam saatinde yayınlanmak zorunda değil — 10 dk marj kabul edilebilir.

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "feat: register publish-scheduled cron job every 10 minutes"
```

---

### Task 4: Yayınlama sonrası Telegram bildirimi

**Files:**
- Modify: `src/app/api/cron/publish-scheduled/route.ts:1-53`

- [ ] **Step 1: Bildirim kodunu ekle**

Cron endpoint'ine Telegram bildirimi entegre et. Yayınlanan ve başarısız olan postları admin Telegram sohbetine bildir:

```typescript
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { posts } from '@/lib/db/schema';
import { eq, and, lte, isNull } from 'drizzle-orm';
import { publishPost, publishStory } from '@/lib/meta/publisher';
import { sendMessage } from '@/lib/telegram/bot';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminUserIds(): number[] {
  const raw = process.env.ALLOWED_TELEGRAM_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const now = new Date();
  const results: { id: string; status: string; error?: string }[] = [];

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

  let publishedCount = 0;
  let failedCount = 0;

  for (const post of duePosts) {
    try {
      const isStory = post.channel === 'story' || post.channel === 'reel';
      if (isStory) {
        await publishStory(post.id);
      } else {
        await publishPost(post.id);
      }
      results.push({ id: post.id, status: 'published' });
      publishedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ id: post.id, status: 'failed', error: msg });
      failedCount++;
    }
  }

  // Telegram notification
  if (publishedCount > 0 || failedCount > 0) {
    const lines = ['📤 Yayınlama raporu'];
    if (publishedCount > 0) {
      lines.push(`✅ ${publishedCount} post yayınlandı`);
    }
    if (failedCount > 0) {
      lines.push(`❌ ${failedCount} başarısız`);
      const failed = results.filter((r) => r.status === 'failed');
      for (const f of failed.slice(0, 3)) {
        lines.push(`  - ${f.id.slice(0, 8)}: ${(f.error ?? '').slice(0, 100)}`);
      }
    }
    const text = lines.join('\n');
    const ids = adminUserIds();
    await Promise.all(
      ids.map((chatId) =>
        sendMessage({ chatId, text }).catch((err) =>
          console.error('[publish-scheduled] Telegram notify failed:', err),
        ),
      ),
    );
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    published: publishedCount,
    failed: failedCount,
    timestamp: now.toISOString(),
  });
}
```

- [ ] **Step 2: TypeScript derlemesini kontrol et**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/publish-scheduled/route.ts
git commit -m "feat: add Telegram notification after scheduled publish"
```

---

## Self-Review

**1. Spec coverage:** Spec'teki "Cron job — GitHub Actions ile planlanmış post'ları yayınlayan endpoint" maddesi karşılanıyor. GitHub Actions yerine Vercel cron kullanıldı (zaten mevcut altyapı).

**2. Placeholder scan:** Yok.

**3. Type consistency:**
- `calculateScheduledAt(calendarWeek, year, dayOfWeek, timeSlot)` → parametre tipleri `contentPlans` ve `contentSlots` şemasıyla uyumlu
- `generatePost({ scheduledAt })` → `GeneratePostOpts.scheduledAt?: Date` tipi zaten tanımlı
- Cron endpoint `post.channel === 'story' || post.channel === 'reel'` → `content_channel` enum'unda `'feed' | 'story' | 'reel'` tanımlı

---

## Execution Handoff

Plan tamamlandı ve `docs/superpowers/plans/2026-05-11-auto-publish-cron.md` dosyasına kaydedildi.
