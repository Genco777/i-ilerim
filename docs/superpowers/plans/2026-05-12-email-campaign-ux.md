# Email Campaign Wizard UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the blind 3-button email campaign flow with a 4-step wizard (plan preview → theme select → portfolio pick → content edit + send) using 3 website-matching HTML email themes.

**Architecture:** New `src/lib/email/themes/` directory with 3 theme functions + shared base layout. New `email_preferences` singleton DB table for theme persistence. In-memory wizard state cache (`wizard-cache.ts`) avoids DB schema changes to mailDrafts. Webhook handler gets `ew:*` callback dispatch. Existing `templates.ts` delegates to new themes.

**Tech Stack:** Next.js 16 API routes, Drizzle ORM (PostgreSQL), Telegram Bot API, Brevo API v3, Claude API (sonnet-4-6), vitest

---

### Task 1: Database — email_preferences table + queries

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/queries/email-preferences.ts`
- Test: `src/__tests__/email-preferences.test.ts`

- [ ] **Step 1: Add emailPreferences table to schema**

Add after the `brandKit` table definition in `src/lib/db/schema.ts` (around line 170):

```typescript
// ── Email Preferences (singleton, like brandKit) ──
export const emailPreferences = pgTable('email_preferences', {
  id: integer('id').primaryKey().default(1),
  theme: text('theme').notNull().default('dark_steel'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Create email-preferences queries**

Create `src/lib/db/queries/email-preferences.ts`:

```typescript
import { db } from '@/lib/db';
import { emailPreferences } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export type ThemeId = 'dark_steel' | 'light_steel' | 'dark_gold';
export const DEFAULT_THEME: ThemeId = 'dark_steel';

export async function getEmailPreferences(): Promise<{ theme: string }> {
  const rows = await db
    .select()
    .from(emailPreferences)
    .where(eq(emailPreferences.id, 1))
    .limit(1);

  const row = rows[0];
  if (row) return row;

  // Seed default row
  const [created] = await db
    .insert(emailPreferences)
    .values({ id: 1, theme: DEFAULT_THEME })
    .returning();
  if (!created) throw new Error('Failed to seed email preferences');
  return created;
}

export async function updateEmailPreferences(theme: string): Promise<void> {
  await db
    .update(emailPreferences)
    .set({ theme, updatedAt: new Date() })
    .where(eq(emailPreferences.id, 1));
}
```

- [ ] **Step 3: Write the failing test**

Create `src/__tests__/email-preferences.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getEmailPreferences, updateEmailPreferences, DEFAULT_THEME } from '@/lib/db/queries/email-preferences';

describe('getEmailPreferences', () => {
  it('returns default theme when no row exists', async () => {
    const prefs = await getEmailPreferences();
    expect(prefs.theme).toBe(DEFAULT_THEME);
  });

  it('returns updated theme after update', async () => {
    await updateEmailPreferences('dark_gold');
    const prefs = await getEmailPreferences();
    expect(prefs.theme).toBe('dark_gold');
    // Reset
    await updateEmailPreferences(DEFAULT_THEME);
  });
});
```

- [ ] **Step 4: Run test to verify**

Run: `npx vitest run src/__tests__/email-preferences.test.ts`
Expected: Tests pass (requires DB connection from `.env.local`)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/queries/email-preferences.ts src/__tests__/email-preferences.test.ts
git commit -m "feat: add email_preferences table and queries for theme persistence"
```

---

### Task 2: Theme shared base layout

**Files:**
- Create: `src/lib/email/themes/base.ts`
- Create: `src/lib/email/themes/index.ts`

- [ ] **Step 1: Define shared types and create theme registry index**

Create `src/lib/email/themes/index.ts`:

```typescript
// ── Theme registry + shared types ──

export interface SectionBlock {
  type: 'portfolio-card' | 'digest-item' | 'usp-list' | 'text';
  title?: string;
  subtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
}

export interface ThemeContent {
  headline: string;
  introHtml: string;
  sections: SectionBlock[];
  closingHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}

export type ThemeId = 'dark_steel' | 'light_steel' | 'dark_gold';

export interface ThemeMeta {
  id: ThemeId;
  label: string;
  description: string;
}

export const THEME_META: Record<ThemeId, ThemeMeta> = {
  dark_steel: {
    id: 'dark_steel',
    label: 'Koyu Çelik',
    description: 'Koyu navy arka plan, çelik mavisi vurgu — website dark mode birebir',
  },
  light_steel: {
    id: 'light_steel',
    label: 'Açık Çelik',
    description: 'Açık temiz arka plan, çelik mavisi vurgu — website light mode birebir',
  },
  dark_gold: {
    id: 'dark_gold',
    label: 'Koyu Altın',
    description: 'Koyu arka plan, altın vurgu — sıcak lüks hissiyat',
  },
};

export const DEFAULT_THEME: ThemeId = 'dark_steel';

// Will be populated after theme files are created
import { darkSteel } from './dark-steel';
import { lightSteel } from './light-steel';
import { darkGold } from './dark-gold';

export const THEME_FUNCTIONS: Record<ThemeId, (content: ThemeContent) => string> = {
  dark_steel: darkSteel,
  light_steel: lightSteel,
  dark_gold: darkGold,
};

export function renderTheme(themeId: ThemeId, content: ThemeContent): string {
  const fn = THEME_FUNCTIONS[themeId];
  if (!fn) throw new Error(`Unknown theme: ${themeId}`);
  return fn(content);
}
```

- [ ] **Step 2: Create base layout**

Create `src/lib/email/themes/base.ts`:

```typescript
// ── Shared HTML layout wrapper for all email themes ──

export interface BaseOpts {
  bgColor: string;
  cardBg: string;
  accent: string;
  accentHover: string;
  headingColor: string;
  bodyColor: string;
  mutedColor: string;
  borderColor: string;
  ctaBg: string;
  ctaText: string;
  fontFamily: string;
  content: string;
}

export function baseLayout(opts: BaseOpts): string {
  const year = new Date().getFullYear();
  return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700;800&display=swap');
</style>
</head>
<body style="margin:0;padding:0;background-color:${opts.bgColor};font-family:${opts.fontFamily};">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:${opts.bgColor};padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background-color:${opts.cardBg};border-radius:12px;overflow:hidden;border:1px solid ${opts.borderColor};">

  <!-- Header -->
  <tr><td style="padding:36px 40px 20px;text-align:center;">
    <h1 style="color:${opts.accent};font-family:${opts.fontFamily};font-size:26px;font-weight:800;margin:0;letter-spacing:-0.5px;">FLY &amp; FROTH</h1>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;margin:8px 0 0;">Grafik- &amp; Webdesign Studio &middot; Karben, Rhein-Main</p>
  </td></tr>

  <!-- Divider -->
  <tr><td style="padding:0 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}40,transparent);"></div>
  </td></tr>

  <!-- Body -->
  <tr><td style="padding:30px 40px;">
    ${opts.content}
  </td></tr>

  <!-- CTA Divider -->
  <tr><td style="padding:10px 40px;">
    <div style="height:1px;background:linear-gradient(to right,transparent,${opts.accent}30,transparent);"></div>
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:24px 40px 32px;text-align:center;">
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:12px;margin:0 0 8px;">
      Fly &amp; Froth &middot; Röderweg 19 &middot; 61184 Karben<br>
      Tel: +49 163 1474127 &middot; info@fly-froth.com
    </p>
    <p style="color:${opts.mutedColor};font-family:${opts.fontFamily};font-size:11px;margin:0;">
      &copy; ${year} Fly &amp; Froth. Alle Rechte vorbehalten.
    </p>
  </td></tr>

</table>
</td></tr></table>
</body>
</html>`;
}

/** Typography defaults — all themes use these */
export const TYPO = {
  heading: 'font-weight:800;letter-spacing:-0.025em;',
  body: 'font-weight:300;line-height:1.7;',
  cta: 'font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.18em;',
  eyebrow: 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.22em;',
};
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: May have errors about missing theme imports (dark-steel, light-steel, dark-gold) — that's OK, we create them in the next tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/themes/base.ts src/lib/email/themes/index.ts
git commit -m "feat: add email theme registry, types, and shared base layout"
```

---

### Task 3: Dark Steel theme

**Files:**
- Modify: `src/lib/email/themes/index.ts` (remove temporary theme function stubs if any)
- Create: `src/lib/email/themes/dark-steel.ts`

- [ ] **Step 1: Write the Dark Steel theme**

Create `src/lib/email/themes/dark-steel.ts`:

```typescript
import { baseLayout, TYPO } from './base';
import type { ThemeContent } from './index';

const BG = '#10131A';
const CARD = '#161A24';
const ACCENT = '#5F6FB0';
const ACCENT_HOVER = '#4658A0';
const HEADING = '#E2E6ED';
const BODY = '#788196';
const MUTED = '#5A657D';
const BORDER = '#262B39';

function renderSection(s: ThemeContent['sections'][number]): string {
  switch (s.type) {
    case 'portfolio-card':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background-color:${CARD};border-radius:8px;border:1px solid ${BORDER};">
      <tr><td style="padding:20px 24px;">
        <span style="color:${ACCENT};${TYPO.eyebrow}">${s.subtitle ?? ''}</span>
        <h2 style="color:${HEADING};font-family:Outfit,system-ui,sans-serif;font-size:18px;${TYPO.heading};margin:8px 0 6px;">${s.title ?? ''}</h2>
        <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;${TYPO.body};margin:0 0 12px;">${s.bodyHtml}</p>
        ${s.ctaLabel ? `<a href="${s.ctaUrl ?? 'https://fly-froth.com/kontakt'}" style="display:inline-block;padding:10px 22px;background-color:${ACCENT};color:#FFFFFF;text-decoration:none;${TYPO.cta};border-radius:6px;">${s.ctaLabel}</a>` : ''}
      </td></tr>
    </table>`;
    case 'digest-item':
      return `
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;${TYPO.body};margin:0 0 6px;padding-left:12px;border-left:2px solid ${ACCENT}40;">
      ${s.subtitle ? `<span style="color:${ACCENT};">${s.subtitle}</span> ` : ''}${s.bodyHtml}
    </p>`;
    case 'usp-list':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${s.bodyHtml.split('\n').filter(Boolean).map(line => `
      <tr><td style="padding:12px 0;border-bottom:1px solid ${BORDER};">
        <span style="color:${ACCENT};">&#10003;</span>
        <span style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;margin-left:8px;">${line}</span>
      </td></tr>`).join('')}
    </table>`;
    default:
      return `<p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:15px;${TYPO.body};margin:0;">${s.bodyHtml}</p>`;
  }
}

export function darkSteel(content: ThemeContent): string {
  const sectionsHtml = content.sections.map(renderSection).join('\n');
  const body = `
    <h2 style="color:${HEADING};font-family:Outfit,system-ui,sans-serif;font-size:20px;${TYPO.heading};margin:0 0 4px;">${content.headline}</h2>
    <p style="color:${MUTED};font-family:Outfit,system-ui,sans-serif;font-size:13px;margin:0 0 20px;">Fly &amp; Froth Weekly</p>
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:15px;${TYPO.body};margin:0 0 24px;">${content.introHtml}</p>
    ${sectionsHtml}
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:13px;${TYPO.body};margin:24px 0 0;text-align:center;">${content.closingHtml}</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${content.ctaUrl}" style="display:inline-block;padding:12px 32px;background-color:${ACCENT};color:#FFFFFF;text-decoration:none;${TYPO.cta};border-radius:6px;">${content.ctaLabel}</a>
    </div>`;

  return baseLayout({
    bgColor: BG, cardBg: CARD, accent: ACCENT, accentHover: ACCENT_HOVER,
    headingColor: HEADING, bodyColor: BODY, mutedColor: MUTED, borderColor: BORDER,
    ctaBg: ACCENT, ctaText: '#FFFFFF',
    fontFamily: 'Outfit, system-ui, sans-serif',
    content: body,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles now with the theme import**

Run: `npx tsc --noEmit --pretty`
Expected: Should compile clean (index.ts imports darkSteel which now exists)

- [ ] **Step 3: Write unit test**

Create `src/__tests__/themes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { renderTheme, type ThemeContent } from '@/lib/email/themes';

const sampleContent: ThemeContent = {
  headline: 'Test Headline',
  introHtml: 'Intro text here.',
  sections: [
    {
      type: 'portfolio-card',
      title: 'Logo Design',
      subtitle: 'Logodesign',
      bodyHtml: 'A beautiful logo for a local restaurant.',
      ctaLabel: 'Projekt ansehen',
      ctaUrl: 'https://fly-froth.com',
    },
  ],
  closingHtml: 'Closing text.',
  ctaLabel: 'Zur Website',
  ctaUrl: 'https://fly-froth.com',
};

describe('renderTheme', () => {
  it('dark_steel produces valid HTML with key elements', () => {
    const html = renderTheme('dark_steel', sampleContent);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Test Headline');
    expect(html).toContain('Logo Design');
    expect(html).toContain('#10131A');
    expect(html).toContain('#5F6FB0');
    expect(html).toContain('FLY &amp; FROTH');
  });

  it('light_steel produces valid HTML with light colors', () => {
    const html = renderTheme('light_steel', sampleContent);
    expect(html).toContain('#FCFCFD');
    expect(html).toContain('#5F6FB0');
  });

  it('dark_gold produces valid HTML with gold accent', () => {
    const html = renderTheme('dark_gold', sampleContent);
    expect(html).toContain('#d4a43a');
  });

  it('throws for unknown theme', () => {
    expect(() => renderTheme('nonexistent' as any, sampleContent)).toThrow();
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/__tests__/themes.test.ts`
Expected: Tests pass for dark_steel, will fail for light_steel and dark_gold (not yet created) — that's expected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/themes/dark-steel.ts src/__tests__/themes.test.ts
git commit -m "feat: add Dark Steel email theme matching website dark mode"
```

---

### Task 4: Light Steel theme

**Files:**
- Create: `src/lib/email/themes/light-steel.ts`

- [ ] **Step 1: Write the Light Steel theme**

Create `src/lib/email/themes/light-steel.ts`:

```typescript
import { baseLayout, TYPO } from './base';
import type { ThemeContent } from './index';

const BG = '#FCFCFD';
const CARD = '#FFFFFF';
const ACCENT = '#5F6FB0';
const ACCENT_HOVER = '#4658A0';
const HEADING = '#1D2137';
const BODY = '#6B728B';
const MUTED = '#8B92A8';
const BORDER = '#DCE1E9';

function renderSection(s: ThemeContent['sections'][number]): string {
  switch (s.type) {
    case 'portfolio-card':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background-color:${CARD};border-radius:8px;border:1px solid ${BORDER};">
      <tr><td style="padding:20px 24px;">
        <span style="color:${ACCENT};${TYPO.eyebrow}">${s.subtitle ?? ''}</span>
        <h2 style="color:${HEADING};font-family:Outfit,system-ui,sans-serif;font-size:18px;${TYPO.heading};margin:8px 0 6px;">${s.title ?? ''}</h2>
        <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;${TYPO.body};margin:0 0 12px;">${s.bodyHtml}</p>
        ${s.ctaLabel ? `<a href="${s.ctaUrl ?? 'https://fly-froth.com/kontakt'}" style="display:inline-block;padding:10px 22px;background-color:${ACCENT};color:#FFFFFF;text-decoration:none;${TYPO.cta};border-radius:6px;">${s.ctaLabel}</a>` : ''}
      </td></tr>
    </table>`;
    case 'digest-item':
      return `
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;${TYPO.body};margin:0 0 6px;padding-left:12px;border-left:2px solid ${ACCENT}60;">
      ${s.subtitle ? `<span style="color:${ACCENT};">${s.subtitle}</span> ` : ''}${s.bodyHtml}
    </p>`;
    case 'usp-list':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${s.bodyHtml.split('\n').filter(Boolean).map(line => `
      <tr><td style="padding:12px 0;border-bottom:1px solid ${BORDER};">
        <span style="color:${ACCENT};">&#10003;</span>
        <span style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;margin-left:8px;">${line}</span>
      </td></tr>`).join('')}
    </table>`;
    default:
      return `<p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:15px;${TYPO.body};margin:0;">${s.bodyHtml}</p>`;
  }
}

export function lightSteel(content: ThemeContent): string {
  const sectionsHtml = content.sections.map(renderSection).join('\n');
  const body = `
    <h2 style="color:${HEADING};font-family:Outfit,system-ui,sans-serif;font-size:20px;${TYPO.heading};margin:0 0 4px;">${content.headline}</h2>
    <p style="color:${MUTED};font-family:Outfit,system-ui,sans-serif;font-size:13px;margin:0 0 20px;">Fly &amp; Froth Weekly</p>
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:15px;${TYPO.body};margin:0 0 24px;">${content.introHtml}</p>
    ${sectionsHtml}
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:13px;${TYPO.body};margin:24px 0 0;text-align:center;">${content.closingHtml}</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${content.ctaUrl}" style="display:inline-block;padding:12px 32px;background-color:${ACCENT};color:#FFFFFF;text-decoration:none;${TYPO.cta};border-radius:6px;">${content.ctaLabel}</a>
    </div>`;

  return baseLayout({
    bgColor: BG, cardBg: CARD, accent: ACCENT, accentHover: ACCENT_HOVER,
    headingColor: HEADING, bodyColor: BODY, mutedColor: MUTED, borderColor: BORDER,
    ctaBg: ACCENT, ctaText: '#FFFFFF',
    fontFamily: 'Outfit, system-ui, sans-serif',
    content: body,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 3: Run tests (light_steel test should now pass)**

Run: `npx vitest run src/__tests__/themes.test.ts`
Expected: dark_steel and light_steel tests pass, dark_gold still fails

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/themes/light-steel.ts
git commit -m "feat: add Light Steel email theme matching website light mode"
```

---

### Task 5: Dark Gold theme

**Files:**
- Create: `src/lib/email/themes/dark-gold.ts`

- [ ] **Step 1: Write the Dark Gold theme**

Create `src/lib/email/themes/dark-gold.ts`:

```typescript
import { baseLayout, TYPO } from './base';
import type { ThemeContent } from './index';

const BG = '#050912';
const CARD = '#0a0f1e';
const ACCENT = '#d4a43a';
const ACCENT_HOVER = '#b8943a';
const HEADING = '#fafafa';
const BODY = '#b0b8c4';
const MUTED = '#8890a0';
const BORDER = 'rgba(212,164,58,0.15)';

function renderSection(s: ThemeContent['sections'][number]): string {
  switch (s.type) {
    case 'portfolio-card':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;background-color:rgba(255,255,255,0.03);border-radius:8px;border:1px solid ${BORDER};">
      <tr><td style="padding:20px 24px;">
        <span style="color:${ACCENT};${TYPO.eyebrow}">${s.subtitle ?? ''}</span>
        <h2 style="color:${HEADING};font-family:Outfit,system-ui,sans-serif;font-size:18px;${TYPO.heading};margin:8px 0 6px;">${s.title ?? ''}</h2>
        <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;${TYPO.body};margin:0 0 12px;">${s.bodyHtml}</p>
        ${s.ctaLabel ? `<a href="${s.ctaUrl ?? 'https://fly-froth.com/kontakt'}" style="display:inline-block;padding:10px 22px;background:linear-gradient(135deg,${ACCENT},${ACCENT_HOVER});color:${BG};text-decoration:none;${TYPO.cta};border-radius:6px;">${s.ctaLabel}</a>` : ''}
      </td></tr>
    </table>`;
    case 'digest-item':
      return `
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;${TYPO.body};margin:0 0 6px;padding-left:12px;border-left:2px solid ${ACCENT}50;">
      ${s.subtitle ? `<span style="color:${ACCENT};">${s.subtitle}</span> ` : ''}${s.bodyHtml}
    </p>`;
    case 'usp-list':
      return `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">
      ${s.bodyHtml.split('\n').filter(Boolean).map(line => `
      <tr><td style="padding:12px 0;border-bottom:1px solid ${BORDER};">
        <span style="color:${ACCENT};">&#10003;</span>
        <span style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:14px;margin-left:8px;">${line}</span>
      </td></tr>`).join('')}
    </table>`;
    default:
      return `<p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:15px;${TYPO.body};margin:0;">${s.bodyHtml}</p>`;
  }
}

export function darkGold(content: ThemeContent): string {
  const sectionsHtml = content.sections.map(renderSection).join('\n');
  const body = `
    <h2 style="color:${HEADING};font-family:Outfit,system-ui,sans-serif;font-size:20px;${TYPO.heading};margin:0 0 4px;">${content.headline}</h2>
    <p style="color:${MUTED};font-family:Outfit,system-ui,sans-serif;font-size:13px;margin:0 0 20px;">Fly &amp; Froth Weekly</p>
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:15px;${TYPO.body};margin:0 0 24px;">${content.introHtml}</p>
    ${sectionsHtml}
    <p style="color:${BODY};font-family:Outfit,system-ui,sans-serif;font-size:13px;${TYPO.body};margin:24px 0 0;text-align:center;">${content.closingHtml}</p>
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="${content.ctaUrl}" style="display:inline-block;padding:12px 32px;background:linear-gradient(135deg,${ACCENT},${ACCENT_HOVER});color:${BG};text-decoration:none;${TYPO.cta};border-radius:6px;">${content.ctaLabel}</a>
    </div>`;

  return baseLayout({
    bgColor: BG, cardBg: CARD, accent: ACCENT, accentHover: ACCENT_HOVER,
    headingColor: HEADING, bodyColor: BODY, mutedColor: MUTED, borderColor: BORDER,
    ctaBg: `linear-gradient(135deg,${ACCENT},${ACCENT_HOVER})`, ctaText: BG,
    fontFamily: 'Outfit, system-ui, sans-serif',
    content: body,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 3: Run all theme tests**

Run: `npx vitest run src/__tests__/themes.test.ts`
Expected: All 4 tests pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/email/themes/dark-gold.ts
git commit -m "feat: add Dark Gold email theme (refined current gold design)"
```

---

### Task 6: Wizard state cache

**Files:**
- Create: `src/lib/email/wizard-cache.ts`

- [ ] **Step 1: Write wizard cache**

Create `src/lib/email/wizard-cache.ts`:

```typescript
import type { ThemeId } from './themes';

export interface PortfolioItemWizard {
  index: number;
  topic: string;
  pillar: string;
  headline: string;
  description: string;
  cta: string;
  serviceType: string;
  selected: boolean;
}

export interface WizardState {
  chatId: number;
  step: 'theme' | 'portfolio' | 'content' | 'send';
  campaignType: 'digest' | 'outreach' | 'reactivation';
  theme: ThemeId;
  // digest
  planId?: string;
  portfolioItems?: PortfolioItemWizard[];
  introText?: string;
  closingText?: string;
  subjectLine?: string;
  // outreach
  city?: string;
  service?: string;
  // reactivation
  recipientEmail?: string;
  clientName?: string;
  lastProject?: string;
}

const cache = new Map<number, WizardState>();
const timeouts = new Map<number, ReturnType<typeof setTimeout>>();

const TTL_MS = 30 * 60 * 1000; // 30 minutes

export function getWizardState(chatId: number): WizardState | undefined {
  return cache.get(chatId);
}

export function setWizardState(chatId: number, state: WizardState): void {
  // Clear existing timeout
  const existing = timeouts.get(chatId);
  if (existing) clearTimeout(existing);

  cache.set(chatId, state);

  // Auto-expire after TTL
  timeouts.set(
    chatId,
    setTimeout(() => {
      cache.delete(chatId);
      timeouts.delete(chatId);
    }, TTL_MS),
  );
}

export function clearWizardState(chatId: number): void {
  cache.delete(chatId);
  const t = timeouts.get(chatId);
  if (t) clearTimeout(t);
  timeouts.delete(chatId);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/wizard-cache.ts
git commit -m "feat: add in-memory wizard state cache with 30min TTL"
```

---

### Task 7: Content generation for wizard

**Files:**
- Create: `src/lib/email/wizard-generate.ts`

- [ ] **Step 1: Write wizard content generation functions**

Create `src/lib/email/wizard-generate.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { PortfolioItemWizard } from './wizard-cache';
import type { ThemeId } from './themes';

const MODEL = 'claude-sonnet-4-6';

function themeTone(theme: ThemeId): string {
  switch (theme) {
    case 'dark_gold': return 'warm, einladend, leicht luxuriös';
    case 'light_steel': return 'klar, professionell, modern-kühl';
    default: return 'selbstbewusst, premium, modern';
  }
}

// ── Digest content (weekly newsletter) ──

export interface DigestContent {
  subjectLine: string;
  introText: string;
  closingText: string;
  portfolioItems: PortfolioItemWizard[];
}

export async function generateDigestContent(
  selectedItems: PortfolioItemWizard[],
  theme: ThemeId,
  week?: number,
): Promise<DigestContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const itemList = selectedItems.map((item, i) =>
    `${i + 1}. [${item.serviceType}] ${item.topic}`
  ).join('\n');

  const system = [
    'Du schreibst Email-Marketing-Texte für Fly & Froth, ein Grafik- und Webdesign-Studio aus Karben (Rhein-Main).',
    'Die Marke: über 850 Projekte, 5,0 Google-Bewertung, faire Preise, Express 24h möglich.',
    `Tonalität: ${themeTone(theme)}.`,
    'Deutsch. Keine Anreden wie "Liebe Kunden". Direkt, modern, kein Werbesprech.',
    'Antworte NUR mit JSON:',
    '{',
    '  "subjectLine": "Betreffzeile (max 60 Zeichen)",',
    '  "introText": "2-3 Sätze Einleitung",',
    '  "closingText": "1 Satz Abschluss mit Call-to-Action",',
    '  "itemTexts": [',
    '    { "headline": "...", "description": "2 Sätze", "cta": "..." }',
    '  ]',
    '}',
  ].join('\n');

  const user = [
    `Folgende Portfolio-Projekte sind im Newsletter (KW${week ?? '?'}):`,
    itemList,
    '',
    'Schreibe einzigartige Texte — keine Wiederholungen zu früheren Wochen.',
  ].join('\n');

  const raw = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: user }],
  }).then((r) => {
    const block = r.content[0];
    if (!block || block.type !== 'text') throw new Error('No text from Claude');
    return block.text;
  });

  const parsed = JSON.parse(raw);
  const itemTexts: Array<{ headline: string; description: string; cta: string }> =
    parsed.itemTexts ?? [];

  return {
    subjectLine: parsed.subjectLine ?? 'Fly & Froth Weekly — Neue Projekte & Ideen',
    introText: parsed.introText ?? 'Diese Woche bei Fly & Froth: frische Design-Arbeiten aus Karben.',
    closingText: parsed.closingText ?? 'Alle Angebote mit Express 24h. Wir freuen uns auf dein Projekt.',
    portfolioItems: selectedItems.map((item, i) => ({
      ...item,
      headline: itemTexts[i]?.headline ?? item.headline,
      description: itemTexts[i]?.description ?? item.description,
      cta: itemTexts[i]?.cta ?? item.cta,
    })),
  };
}

// ── Outreach content (local business) ──

export interface OutreachContent {
  subjectLine: string;
  headline: string;
  bodyText: string;
  ctaLabel: string;
}

export async function generateOutreachContent(
  city: string,
  service: string,
  theme: ThemeId,
): Promise<OutreachContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = [
    'Du schreibst eine Kaltakquise-Email für Fly & Froth, ein Grafik- und Webdesign-Studio.',
    `Tonalität: ${themeTone(theme)}. Kurz, respektvoll, nicht aufdringlich.`,
    'Antworte NUR mit JSON:',
    '{',
    '  "subjectLine": "Betreffzeile (max 50 Zeichen, NICHT mit \"Fly & Froth\" starten)",',
    '  "headline": "Überschrift (5-8 Wörter)",',
    '  "bodyText": "2-3 kurze Sätze, keine Übertreibungen",',
    '  "ctaLabel": "Button-Text (2-3 Wörter)"',
    '}',
  ].join('\n');

  const user = [
    `Stadt: ${city}. Angebotener Service: ${service}.`,
    'Schreibe eine lokale Business-Email. Kein "Sehr geehrte", direkt und modern.',
  ].join('\n');

  const raw = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  }).then((r) => {
    const block = r.content[0];
    if (!block || block.type !== 'text') throw new Error('No text from Claude');
    return block.text;
  });

  const parsed = JSON.parse(raw);
  return {
    subjectLine: parsed.subjectLine ?? `Design-Service für ${city}`,
    headline: parsed.headline ?? `Professionelles Design aus Karben — für ${city}`,
    bodyText: parsed.bodyText ?? `Fly & Froth ist dein lokales Design-Studio für ${service}. Über 850 Projekte, faire Preise, persönliche Betreuung.`,
    ctaLabel: parsed.ctaLabel ?? 'Jetzt anfragen',
  };
}

// ── Reactivation content ──

export interface ReactivationContent {
  subjectLine: string;
  bodyText: string;
}

export async function generateReactivationContent(
  clientName: string,
  lastProject: string,
  theme: ThemeId,
): Promise<ReactivationContent> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const system = [
    'Du schreibst eine Reaktivierungs-Email für Fly & Froth.',
    `Tonalität: ${themeTone(theme)}. Persönlich, warm, nicht aufdringlich.`,
    'Antworte NUR mit JSON:',
    '{',
    '  "subjectLine": "Betreffzeile (max 50 Zeichen)",',
    '  "bodyText": "3-4 Sätze, persönlich, mit echtem Interesse"',
    '}',
  ].join('\n');

  const user = [
    `Kunde: ${clientName}. Letztes Projekt: ${lastProject}.`,
    'Schreibe eine persönliche Reaktivierungs-Email. Kein "Sehr geehrte", direkt mit Vornamen ansprechen.',
  ].join('\n');

  const raw = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    system,
    messages: [{ role: 'user', content: user }],
  }).then((r) => {
    const block = r.content[0];
    if (!block || block.type !== 'text') throw new Error('No text from Claude');
    return block.text;
  });

  const parsed = JSON.parse(raw);
  return {
    subjectLine: parsed.subjectLine ?? `Wieder von dir hören, ${clientName}!`,
    bodyText: parsed.bodyText ?? `Hallo ${clientName}, dein ${lastProject} ist schon eine Weile her. Wir haben uns weiterentwickelt und würden uns freuen, wieder von dir zu hören.`,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/wizard-generate.ts
git commit -m "feat: add AI content generation for email wizard (digest, outreach, reactivation)"
```

---

### Task 8: Update templates.ts to use theme system

**Files:**
- Modify: `src/lib/email/templates.ts`

- [ ] **Step 1: Add delegation functions to templates.ts**

Add the following functions at the end of `src/lib/email/templates.ts` (before the last line). These new functions use the theme system while the old functions remain as fallbacks:

```typescript
// ── New theme-based exports ──

import { renderTheme, type ThemeContent, type ThemeId, type SectionBlock } from './themes/index';

export { type ThemeId, type ThemeContent, type SectionBlock, THEME_META, DEFAULT_THEME } from './themes/index';

export function renderPortfolioNewsletter(
  items: PortfolioItem[],
  themeId: ThemeId,
  introText?: string,
  closingText?: string,
): string {
  const sections: SectionBlock[] = items.map((item) => ({
    type: 'portfolio-card' as const,
    title: item.headline,
    subtitle: item.serviceType,
    bodyHtml: item.description,
    ctaLabel: item.cta,
    ctaUrl: 'https://fly-froth.com/kontakt',
  }));

  const content: ThemeContent = {
    headline: 'Neue Arbeiten aus dem Studio',
    introHtml: introText ?? 'Frische Design-Projekte von Fly & Froth — direkt aus Karben, Rhein-Main.',
    sections,
    closingHtml: closingText ?? 'Alle Angebote mit <strong>Express 24h</strong> verfügbar.',
    ctaLabel: 'Zur Website',
    ctaUrl: 'https://fly-froth.com',
  };

  return renderTheme(themeId, content);
}

export function renderWeeklyDigest(
  items: DigestItem[],
  week: number,
  themeId: ThemeId,
  introText?: string,
): string {
  const year = new Date().getFullYear();

  const pillarLabels: Record<string, string> = {
    vitrine: 'Portfolio',
    prozess: 'Behind the Scenes',
    insight: 'Design-Wissen',
    lokal: 'Rhein-Main Lokal',
    reel: 'Video',
  };

  const sections: SectionBlock[] = [];
  const byPillar: Record<string, DigestItem[]> = {};
  for (const item of items) {
    if (!byPillar[item.pillar]) byPillar[item.pillar] = [];
    byPillar[item.pillar].push(item);
  }

  for (const [pillar, entries] of Object.entries(byPillar)) {
    sections.push({
      type: 'text',
      bodyHtml: `<strong>${pillarLabels[pillar] ?? pillar}</strong>`,
    });
    for (const e of entries) {
      const icon = e.channel === 'story' ? '📖' : e.channel === 'reel' ? '🎬' : '📱';
      sections.push({
        type: 'digest-item',
        subtitle: icon,
        bodyHtml: e.topic,
      });
    }
  }

  const content: ThemeContent = {
    headline: 'Dein Weekly Digest',
    introHtml: introText ?? `Kalenderwoche ${week} — ${year}. Das sind unsere Themen diese Woche.`,
    sections,
    closingHtml: 'Folge uns auf Instagram <strong>@fly.froth</strong> für tägliche Updates.',
    ctaLabel: 'Zur Website',
    ctaUrl: 'https://fly-froth.com',
  };

  return renderTheme(themeId, content);
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: Clean (the renderTheme import from themes/index.ts should resolve)

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/templates.ts
git commit -m "feat: add theme-based rendering to templates.ts (old functions preserved)"
```

---

### Task 9: Webhook handler — wizard callbacks and command handlers

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

This is the largest task. We add:
1. Imports for wizard modules
2. New `handleEmailWizardCallback` dispatcher
3. Rewritten `handleEmailDigestCommand` to start wizard
4. Wizard step handlers: theme selection, portfolio toggling, content editing, send
5. Callback dispatch entries for `ew:*` actions

- [ ] **Step 1: Add imports at top of webhook handler**

Add these imports near the existing email-related imports:

```typescript
import {
  getWizardState,
  setWizardState,
  clearWizardState,
  type WizardState,
  type PortfolioItemWizard,
} from '@/lib/email/wizard-cache';
import {
  generateDigestContent,
  generateOutreachContent,
  generateReactivationContent,
} from '@/lib/email/wizard-generate';
import { getEmailPreferences, updateEmailPreferences } from '@/lib/db/queries/email-preferences';
import { THEME_META, type ThemeId } from '@/lib/email/themes';
import { renderPortfolioNewsletter, renderWeeklyDigest } from '@/lib/email/templates';
import { sendEmail, createCampaign, sendCampaignNow } from '@/lib/email/brevo';
```

- [ ] **Step 2: Rewrite handleEmailDigestCommand to start wizard**

Replace the existing `handleEmailDigestCommand` function (around line 2365) with wizard entry point:

```typescript
async function handleEmailDigestCommand(chatId: number): Promise<void> {
  const plan = await getPlanByWeek(...getCurrentWeek()); // use existing helper pattern
  if (!plan) {
    await sendMessage({ chatId, text: 'Bu hafta için henüz plan yok. /haftalik-plan yaz.' });
    return;
  }

  const slots = await getSlotsByPlan(plan.id);
  const topicsWithContent = slots.filter((s) => s.topic);

  if (topicsWithContent.length === 0) {
    await sendMessage({ chatId, text: 'Planda konusu olan slot yok.' });
    return;
  }

  // Show plan summary + start button
  const pillarCounts: Record<string, number> = {};
  for (const s of topicsWithContent) {
    pillarCounts[s.pillar] = (pillarCounts[s.pillar] ?? 0) + 1;
  }
  const summary = Object.entries(pillarCounts)
    .map(([p, c]) => `${p}: ${c} post`)
    .join('\n');

  const prefs = await getEmailPreferences();
  const currentTheme = prefs.theme as ThemeId;

  const state: WizardState = {
    chatId,
    step: 'theme',
    campaignType: 'digest',
    theme: currentTheme,
    planId: plan.id,
  };
  setWizardState(chatId, state);

  await sendMessage({
    chatId,
    text: [
      `📧 Email Bülteni — KW${plan.calendar_week}/${plan.year}`,
      '',
      summary,
      '',
      `Toplam: ${topicsWithContent.length} post`,
      `Mevcut tema: ${THEME_META[currentTheme].label}`,
    ].join('\n'),
    replyMarkup: {
      inline_keyboard: [[
        { text: '🎨 Tema Seç', callback_data: 'ew:goto:theme' },
        { text: '▶️ İleri', callback_data: 'ew:goto:portfolio' },
      ], [
        { text: '❌ İptal', callback_data: 'ew:cancel' },
      ]],
    },
  });
}
```

- [ ] **Step 3: Add wizard callback dispatcher in handleCallback**

Add in the `handleCallback` function's if/else chain (before the fallback "unknown action"):

```typescript
    } else if (action.startsWith('ew:')) {
      await handleEmailWizardCallback(chatId, messageId, action, postId, rest);
```

- [ ] **Step 4: Write the main wizard callback handler**

Add as a new function before the existing email handler functions:

```typescript
async function handleEmailWizardCallback(
  chatId: number,
  messageId: number,
  action: string,
  _postId: string,
  rest: string[],
): Promise<void> {
  const state = getWizardState(chatId);

  // ew:cancel
  if (action === 'ew:cancel') {
    clearWizardState(chatId);
    await editMessageText({
      chatId, messageId,
      text: '❌ Email kampanyası iptal edildi.',
      replyMarkup: undefined,
    });
    return;
  }

  // Any other action needs state
  if (!state) {
    await sendMessage({
      chatId,
      text: '⚠️ Oturum zaman aşımına uğradı. Lütfen /email-digest ile tekrar başlatın.',
    });
    return;
  }

  // Route to step handler
  const step = action.split(':')[1]; // ew:STEP:...
  switch (step) {
    case 'goto':
      await handleWizardGoto(chatId, messageId, state, rest[0] ?? '');
      break;
    case 'theme':
      await handleWizardTheme(chatId, messageId, state, rest[0] ?? '');
      break;
    case 'portfolio':
      await handleWizardPortfolio(chatId, messageId, state, rest[0] ?? '', rest[1] ?? '');
      break;
    case 'content':
      await handleWizardContent(chatId, messageId, state, rest[0] ?? '', rest[1] ?? '');
      break;
    case 'send':
      await handleWizardSend(chatId, messageId, state, rest[0] ?? '');
      break;
    default:
      await sendMessage({ chatId, text: `Bilinmeyen wizard adımı: ${step}` });
  }
}
```

- [ ] **Step 5: Write step handler: goto (navigation between steps)**

```typescript
async function handleWizardGoto(
  chatId: number, messageId: number, state: WizardState, target: string,
): Promise<void> {
  if (target === 'theme') {
    state.step = 'theme';
    setWizardState(chatId, state);
    await showThemePicker(chatId, messageId, state);
  } else if (target === 'portfolio') {
    state.step = 'portfolio';
    setWizardState(chatId, state);
    await showPortfolioPicker(chatId, messageId, state);
  } else if (target === 'content') {
    // Generate content and go to content preview
    await editMessageText({ chatId, messageId, text: '🤖 İçerik oluşturuluyor...', replyMarkup: undefined });
    try {
      await generateAndShowContent(chatId, messageId, state);
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ İçerik oluşturulamadı: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
```

- [ ] **Step 6: Write step handler: theme selection**

```typescript
async function showThemePicker(chatId: number, messageId: number, state: WizardState): Promise<void> {
  const themeIds: ThemeId[] = ['dark_steel', 'light_steel', 'dark_gold'];
  const keyboard = themeIds.map((id) => {
    const meta = THEME_META[id];
    const checked = state.theme === id ? '✅ ' : '☐ ';
    return [{ text: `${checked}${meta.label}`, callback_data: `ew:theme:${id}` }];
  });

  keyboard.push([
    { text: '◀️ Geri', callback_data: 'ew:goto:theme' },
    { text: '▶️ İleri', callback_data: 'ew:goto:portfolio' },
  ]);
  keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

  const currentMeta = THEME_META[state.theme];
  await editMessageText({
    chatId, messageId,
    text: [
      '🎨 Email teması seçin:',
      '',
      `Seçili: ${currentMeta.label}`,
      `Açıklama: ${currentMeta.description}`,
    ].join('\n'),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleWizardTheme(
  chatId: number, messageId: number, state: WizardState, themeId: string,
): Promise<void> {
  if (!THEME_META[themeId as ThemeId]) return;
  state.theme = themeId as ThemeId;
  setWizardState(chatId, state);
  await updateEmailPreferences(themeId).catch(() => {});
  await showThemePicker(chatId, messageId, state);
}
```

- [ ] **Step 7: Write step handler: portfolio selection (digest only)**

```typescript
async function showPortfolioPicker(chatId: number, messageId: number, state: WizardState): Promise<void> {
  if (state.campaignType !== 'digest' || !state.planId) {
    // Outreach/reactivation skip portfolio step
    await handleWizardGoto(chatId, messageId, state, 'content');
    return;
  }

  // Build portfolio items from plan slots (vitrine + reel pillars)
  if (!state.portfolioItems) {
    const slots = await getSlotsByPlan(state.planId);
    const portfolioSlots = slots.filter(
      (s) => s.status === 'pending' && s.topic && (s.pillar === 'vitrine' || s.pillar === 'reel'),
    );

    const serviceMap: Record<string, string> = {
      webdesign: 'Webdesign', website: 'Webdesign',
      logodesign: 'Logodesign', logo: 'Logodesign',
      flyerdesign: 'Flyerdesign', flyer: 'Flyerdesign',
      druckdesign: 'Druckdesign', branding: 'Branding',
    };

    state.portfolioItems = portfolioSlots.slice(0, 6).map((s, i) => {
      const topic = (s.topic ?? '').toLowerCase();
      let serviceType = 'Design Service';
      for (const [key, label] of Object.entries(serviceMap)) {
        if (topic.includes(key)) { serviceType = label; break; }
      }
      if (s.pillar === 'reel') serviceType = 'Video';
      return {
        index: i,
        topic: s.topic ?? 'Neues Projekt',
        pillar: s.pillar,
        headline: s.topic ?? 'Neues Projekt',
        description: 'Ein Design-Projekt aus Karben, Rhein-Main.',
        cta: s.pillar === 'reel' ? 'Reel ansehen' : 'Projekt ansehen',
        serviceType,
        selected: true,
      };
    });
  }

  const keyboard = (state.portfolioItems ?? []).map((item) => {
    const prefix = item.selected ? '✅' : '☐';
    return [{ text: `${prefix} ${item.serviceType} — ${item.topic.slice(0, 25)}`, callback_data: `ew:portfolio:toggle:${item.index}` }];
  });

  keyboard.push([
    { text: '◀️ Geri', callback_data: 'ew:goto:theme' },
    { text: '▶️ İleri', callback_data: 'ew:goto:content' },
  ]);
  keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

  const selectedCount = (state.portfolioItems ?? []).filter((p) => p.selected).length;
  await editMessageText({
    chatId, messageId,
    text: [
      '🖼 Bültende yer alacak projeler:',
      '',
      ...(state.portfolioItems ?? []).map((item) =>
        `${item.selected ? '✅' : '☐'} ${item.serviceType} — ${item.topic}`,
      ),
      '',
      `${selectedCount} proje seçildi.`,
    ].join('\n'),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleWizardPortfolio(
  chatId: number, messageId: number, state: WizardState, sub: string, indexStr: string,
): Promise<void> {
  if (sub === 'toggle' && state.portfolioItems) {
    const idx = parseInt(indexStr, 10);
    const item = state.portfolioItems[idx];
    if (item) item.selected = !item.selected;
    setWizardState(chatId, state);
    await showPortfolioPicker(chatId, messageId, state);
  }
}
```

- [ ] **Step 8: Write content preview + editing**

```typescript
async function generateAndShowContent(chatId: number, messageId: number, state: WizardState): Promise<void> {
  if (state.campaignType === 'digest' && state.portfolioItems) {
    const selected = state.portfolioItems.filter((p) => p.selected);
    const plan = state.planId ? await getPlan(state.planId) : null;
    const result = await generateDigestContent(selected, state.theme, plan?.calendar_week);
    state.subjectLine = result.subjectLine;
    state.introText = result.introText;
    state.closingText = result.closingText;
    state.portfolioItems = result.portfolioItems;
  } else if (state.campaignType === 'outreach' && state.city && state.service) {
    const result = await generateOutreachContent(state.city, state.service, state.theme);
    state.subjectLine = result.subjectLine;
    state.introText = `${result.headline}\n\n${result.bodyText}`;
    state.closingText = result.ctaLabel;
  } else if (state.campaignType === 'reactivation' && state.clientName && state.lastProject) {
    const result = await generateReactivationContent(state.clientName, state.lastProject, state.theme);
    state.subjectLine = result.subjectLine;
    state.introText = result.bodyText;
    state.closingText = 'Neues Projekt starten';
  }

  state.step = 'content';
  setWizardState(chatId, state);
  await showContentPreview(chatId, messageId, state);
}

async function showContentPreview(chatId: number, messageId: number, state: WizardState): Promise<void> {
  const portfolioSection = state.portfolioItems
    ? state.portfolioItems.filter((p) => p.selected).map((p, i) =>
        `${i + 1}. ${p.headline}`
      ).join('\n')
    : '';

  const text = [
    `📧 Email İçeriği — ${THEME_META[state.theme].label} teması`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `📌 KONU:`,
    `"${(state.subjectLine ?? '').slice(0, 80)}"`,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `📝 İÇERİK:`,
    (state.introText ?? '').slice(0, 300),
    '',
    portfolioSection ? '━━━━━━━━━━━━━━━━━━' : '',
    portfolioSection ? `🖼 PORTFOLYO:` : '',
    portfolioSection,
    '',
    '━━━━━━━━━━━━━━━━━━',
    `🔚 KAPANIŞ:`,
    (state.closingText ?? '').slice(0, 150),
  ].filter(Boolean).join('\n');

  const keyboard = [
    [
      { text: '✏️ Konu', callback_data: 'ew:content:edit:subject' },
      { text: '✏️ İçerik', callback_data: 'ew:content:edit:intro' },
    ],
    [
      { text: '✏️ Kapanış', callback_data: 'ew:content:edit:closing' },
    ],
    [
      { text: '📩 Test Gönder', callback_data: 'ew:send:test' },
      { text: '📤 Listeye Gönder', callback_data: 'ew:send:list' },
    ],
    [
      { text: '◀️ Geri', callback_data: 'ew:goto:portfolio' },
      { text: '❌ İptal', callback_data: 'ew:cancel' },
    ],
  ];

  await editMessageText({
    chatId, messageId,
    text: text.slice(0, 4096),
    replyMarkup: { inline_keyboard: keyboard },
  });
}

async function handleWizardContent(
  chatId: number, messageId: number, state: WizardState, sub: string, field: string,
): Promise<void> {
  if (sub === 'edit') {
    // Store what field is being edited and prompt user
    state.step = 'content';
    setWizardState(chatId, state);

    const fieldLabels: Record<string, string> = {
      subject: 'konu satırını',
      intro: 'giriş metnini',
      closing: 'kapanış metnini',
    };

    await editMessageText({
      chatId, messageId,
      text: [
        `✏️ ${fieldLabels[field] ?? field} düzenle:`,
        '',
        'Yeni metni doğrudan yazabilir veya bir düzeltme talimatı verebilirsin.',
        'Örnek: "daha kısa olsun" veya "vurguyu logo tasarımına yap"',
        '',
        `Şu anki: ${field === 'subject' ? state.subjectLine : field === 'intro' ? state.introText?.slice(0, 200) : state.closingText?.slice(0, 200)}`,
      ].join('\n').slice(0, 4096),
      replyMarkup: { inline_keyboard: [[
        { text: '↩️ Vazgeç', callback_data: 'ew:content:preview' },
      ]]},
    });

    // Store edit context for the next text message
    setWizardState(chatId, { ...state, step: 'content', _editingField: field } as any);
  } else if (sub === 'preview') {
    // Return to content preview
    state.step = 'content';
    setWizardState(chatId, state);
    await showContentPreview(chatId, messageId, state);
  }
}

// Handle text input for editing (called from handleCommand when wizard is in edit mode)
async function handleWizardEditInput(chatId: number, text: string): Promise<void> {
  const state = getWizardState(chatId);
  if (!state || state.step !== 'content') return;

  const field = (state as any)._editingField as string;
  if (!field) return;

  delete (state as any)._editingField;

  const instruction = text.trim();

  // Simple heuristic: if text is longer than 50 chars OR starts with uppercase without keywords, treat as direct replacement
  const isDirectReplacement =
    instruction.length > 50 ||
    !/\b(daha|biraz|kısa|uzun|vurgu|ekle|çıkar|değiştir|olsun|yap)\b/i.test(instruction);

  if (isDirectReplacement) {
    if (field === 'subject') state.subjectLine = instruction;
    else if (field === 'intro') state.introText = instruction;
    else if (field === 'closing') state.closingText = instruction;
  } else {
    // AI revise — call Claude with the existing text + instruction
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const existing = field === 'subject' ? state.subjectLine :
                     field === 'intro' ? state.introText :
                     state.closingText;
    try {
      const revised = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 512,
        system: 'Revise the given text according to the instruction. Return ONLY the revised text, no quotes, no explanation.',
        messages: [{
          role: 'user',
          content: `Original text:\n"${existing}"\n\nInstruction: ${instruction}\n\nRevised text:`,
        }],
      }).then((r) => {
        const block = r.content[0];
        return block && block.type === 'text' ? block.text.trim() : existing;
      });

      if (field === 'subject') state.subjectLine = revised!;
      else if (field === 'intro') state.introText = revised!;
      else if (field === 'closing') state.closingText = revised!;
    } catch {
      // AI failed, keep old text
    }
  }

  setWizardState(chatId, state);
  // Show updated preview (re-use the last message concept — send a new message with preview)
  await sendMessage({
    chatId,
    text: '✅ Metin güncellendi. Güncel önizleme:',
  });
  // Send fresh preview as new message
  await showContentPreviewNew(chatId, state);
}

async function showContentPreviewNew(chatId: number, state: WizardState): Promise<void> {
  // Same as showContentPreview but sends a NEW message instead of editing
  const portfolioSection = state.portfolioItems
    ? state.portfolioItems.filter((p) => p.selected).map((p, i) =>
        `${i + 1}. ${p.headline}`
      ).join('\n')
    : '';

  const text = [
    `📧 Email İçeriği — ${THEME_META[state.theme].label} teması`,
    '',
    `📌 KONU: "${(state.subjectLine ?? '').slice(0, 80)}"`,
    `📝 İÇERİK: ${(state.introText ?? '').slice(0, 200)}`,
    portfolioSection ? `🖼 PORTFOLYO:\n${portfolioSection}` : '',
    `🔚 KAPANIŞ: ${(state.closingText ?? '').slice(0, 100)}`,
  ].filter(Boolean).join('\n');

  const keyboard = [
    [
      { text: '✏️ Konu', callback_data: 'ew:content:edit:subject' },
      { text: '✏️ İçerik', callback_data: 'ew:content:edit:intro' },
      { text: '✏️ Kapanış', callback_data: 'ew:content:edit:closing' },
    ],
    [
      { text: '📩 Test Gönder', callback_data: 'ew:send:test' },
      { text: '📤 Listeye Gönder', callback_data: 'ew:send:list' },
    ],
    [
      { text: '◀️ Geri', callback_data: 'ew:goto:portfolio' },
      { text: '❌ İptal', callback_data: 'ew:cancel' },
    ],
  ];

  await sendMessage({
    chatId,
    text: text.slice(0, 4096),
    replyMarkup: { inline_keyboard: keyboard },
  });
}
```

- [ ] **Step 9: Write send handlers**

```typescript
async function handleWizardSend(
  chatId: number, messageId: number, state: WizardState, mode: string,
): Promise<void> {
  if (mode === 'test') {
    await editMessageText({ chatId, messageId, text: '📤 Test email gönderiliyor...', replyMarkup: undefined });

    try {
      const html = buildEmailHtml(state);
      await sendEmail({
        to: [{ email: 'info@fly-froth.com', name: 'Fly & Froth' }],
        subject: state.subjectLine ?? 'Fly & Froth Newsletter',
        htmlContent: html,
      });

      await sendMessage({
        chatId,
        text: '✅ Test email gönderildi! info@fly-froth.com adresini kontrol et.',
        replyMarkup: {
          inline_keyboard: [[
            { text: '📤 Listeye Gönder', callback_data: 'ew:send:list' },
            { text: '↩️ Düzenle', callback_data: 'ew:content:preview' },
          ]],
        },
      });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ Test gönderimi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else if (mode === 'list') {
    // Confirm list send
    const listIds = (process.env.BREVO_LIST_IDS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (listIds.length === 0) {
      await sendMessage({
        chatId,
        text: '⚠️ BREVO_LIST_IDS env değişkeni ayarlanmamış. Önce Vercel ortam değişkenlerine ekleyin.',
      });
      return;
    }

    await editMessageText({
      chatId, messageId,
      text: [
        `📤 "${state.subjectLine}" konulu email`,
        `${listIds.length} listeye gönderilsin mi?`,
        '',
        'Bu işlem geri alınamaz.',
      ].join('\n'),
      replyMarkup: {
        inline_keyboard: [[
          { text: '✅ Onayla ve Gönder', callback_data: 'ew:send:confirm' },
          { text: '❌ İptal', callback_data: 'ew:content:preview' },
        ]],
      },
    });
  } else if (mode === 'confirm') {
    await editMessageText({ chatId, messageId, text: '📤 Kampanya oluşturuluyor ve gönderiliyor...', replyMarkup: undefined });

    try {
      const html = buildEmailHtml(state);
      const listIds = (process.env.BREVO_LIST_IDS ?? '')
        .split(',')
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n));

      const campaign = await createCampaign({
        name: `FW Newsletter — ${new Date().toISOString().slice(0, 10)}`,
        subject: state.subjectLine ?? 'Fly & Froth Newsletter',
        htmlContent: html,
        sender: { name: 'Fly & Froth', email: 'info@fly-froth.com' },
        recipients: { listIds },
      });

      await sendCampaignNow(campaign.id);

      clearWizardState(chatId);
      await sendMessage({
        chatId,
        text: [
          '✅ Email kampanyası gönderildi!',
          `Campaign ID: ${campaign.id}`,
          'Brevo panelinden performansı takip edebilirsin.',
        ].join('\n'),
      });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ Kampanya gönderimi başarısız: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}

function buildEmailHtml(state: WizardState): string {
  if (state.campaignType === 'digest') {
    const items = (state.portfolioItems ?? [])
      .filter((p) => p.selected)
      .map((p) => ({
        headline: p.headline,
        description: p.description,
        cta: p.cta,
        serviceType: p.serviceType,
      }));
    return renderPortfolioNewsletter(items, state.theme, state.introText, state.closingText);
  }

  // For outreach and reactivation, build a simple content structure
  const { renderTheme } = require('@/lib/email/themes');
  return renderTheme(state.theme, {
    headline: state.campaignType === 'outreach' ? `Design-Service für ${state.city ?? 'Ihre Stadt'}` : `Wieder von dir hören!`,
    introHtml: state.introText ?? '',
    sections: [],
    closingHtml: state.closingText ?? '',
    ctaLabel: state.campaignType === 'outreach' ? 'Jetzt anfragen' : 'Neues Projekt starten',
    ctaUrl: 'https://fly-froth.com/kontakt',
  });
}
```

- [ ] **Step 10: Add text-message intercept for wizard edit mode**

In the `handleCommand` function, add a check after the trimmed text is parsed but before command matching — if the user is in wizard edit mode, route their text to the edit handler:

```typescript
  // Intercept: wizard content editing
  const wizardState = getWizardState(chatId);
  if (wizardState && wizardState.step === 'content' && (wizardState as any)._editingField) {
    await handleWizardEditInput(chatId, trimmed);
    return;
  }
```

- [ ] **Step 11: Wire the Anthropic import**

Ensure `Anthropic` is imported at the top of the file (it likely already is for other handlers — check that it's available):

```typescript
import Anthropic from '@anthropic-ai/sdk';
```

- [ ] **Step 12: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty`
Expected: May have import issues to fix. Resolve any missing imports.

- [ ] **Step 13: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat: add email wizard callbacks and step handlers to webhook"
```

---

### Task 10: Integration & verification

This task verifies all pieces work together and fixes any remaining issues.

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Check for unused imports**

Run: `npx tsc --noEmit --pretty`
Fix any unused import warnings.

- [ ] **Step 4: Build check**

Run: `npm run build` (or `npx next build`)
Expected: Successful build

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: final integration fixes for email campaign wizard"
```

---

## Implementation Order

Tasks must run sequentially (each builds on prior):
1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10

Tasks 3, 4, 5 (individual themes) could theoretically be parallelized, but they're small enough that sequential is fine.

## Testing Strategy

- **Unit tests:** Theme HTML output (themes.test.ts), email preferences CRUD
- **Manual testing (primary):** Send `/email-digest` in Telegram, walk through wizard, test send, verify email arrives in inbox with correct theme colors
- **Edge cases:** Cold start (cache miss), AI timeout, Brevo API failure, empty portfolio, all items deselected
