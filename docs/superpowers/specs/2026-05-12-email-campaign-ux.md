# Email Campaign UX — User-Friendly Campaign Wizard

> **Goal:** Replace the blind "3-button" email campaign flow with a step-by-step wizard where the user sees, edits, and controls every aspect before sending.

> **Architecture:** 4-step wizard (plan preview → theme select → portfolio pick → content edit + send) driven by Telegram inline keyboards. Three website-matching HTML email themes replace the single hardcoded gold template. A new `email_preferences` DB row stores theme/defaults. The wizard shares the same flow across all three campaign commands (`/email-digest`, `/email-outreach`, `/email-reactivate`).

> **Tech Stack:** Next.js 16 API routes (Vercel Fluid Compute), Telegram Bot API (inline keyboards + callback queries), Brevo API v3 (transactional + campaign), Claude API (content generation), PostgreSQL (Drizzle ORM)

---

## 1. Email Themes

Three HTML email themes matching the Fly & Froth website design language. Each theme is a pure function: `(content: ThemeContent) => string`.

### Theme files

```
src/lib/email/themes/
├── index.ts          # Theme registry + type exports
├── base.ts           # Shared layout wrapper (header, footer, responsive boilerplate)
├── dark-steel.ts     # Theme 1: Dark Navy + Steel Blue
├── light-steel.ts    # Theme 2: Light + Steel Blue
└── dark-gold.ts      # Theme 3: Dark Navy + Gold (refined version of current)
```

### Design specs

| Property | Dark Steel (default) | Light Steel | Dark Gold |
|----------|---------------------|-------------|-----------|
| Background | `#10131A` | `#FCFCFD` | `#0a0f1e` |
| Card bg | `#161A24` | `#FFFFFF` | `#0f1424` |
| Accent | `#5F6FB0` | `#5F6FB0` | `#d4a43a` |
| Accent hover | `#4658A0` | `#4658A0` | `#b8943a` |
| Heading color | `#E2E6ED` | `#1D2137` | `#fafafa` |
| Body color | `#788196` | `#6B728B` | `#b0b8c4` |
| Muted text | `#5A657D` | `#8B92A8` | `#8890a0` |
| Border | `#262B39` | `#DCE1E9` | `rgba(212,164,58,0.15)` |
| Font | Outfit, system-ui | Outfit, system-ui | Outfit, system-ui |
| CTA button | bg accent, white text | bg accent, white text | bg gold, dark text |

### Typography (all themes)
- Headings: `font-weight:800; letter-spacing:-0.025em;` (Outfit Extrabold, tracking-tighter)
- Body: `font-weight:300; line-height:1.7;` (Outfit Light, leading-relaxed)
- CTAs/buttons: `font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.18em;`
- Eyebrow labels: `font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:0.22em;`

### ThemeContent interface (shared across themes)
```typescript
interface SectionBlock {
  type: 'portfolio-card' | 'digest-item' | 'usp-list' | 'text';
  title?: string;
  subtitle?: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  imageUrl?: string;
}

interface ThemeContent {
  headline: string;
  introHtml: string;
  sections: SectionBlock[];
  closingHtml: string;
  ctaLabel: string;
  ctaUrl: string;
}
```

### Theme registry
```typescript
// src/lib/email/themes/index.ts
export const THEMES = {
  dark_steel: { id: 'dark_steel', label: 'Koyu Çelik', fn: darkSteel },
  light_steel: { id: 'light_steel', label: 'Açık Çelik', fn: lightSteel },
  dark_gold: { id: 'dark_gold', label: 'Koyu Altın', fn: darkGold },
} as const;
export type ThemeId = keyof typeof THEMES;
export const DEFAULT_THEME: ThemeId = 'dark_steel';
```

---

## 2. Database

### New table: `emailPreferences`

```sql
CREATE TABLE email_preferences (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- singleton row
  theme TEXT NOT NULL DEFAULT 'dark_steel',
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Singleton pattern (same as `brandKit`). Single row with `id=1`. Used to persist the user's preferred theme across sessions.

### Drizzle schema addition

Add to `src/lib/db/schema.ts`:
```typescript
export const emailPreferences = pgTable('email_preferences', {
  id: integer('id').primaryKey().default(1),
  theme: text('theme').notNull().default('dark_steel'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});
```

### New query file: `src/lib/db/queries/email-preferences.ts`

```typescript
export async function getEmailPreferences(): Promise<{ theme: string }>
export async function updateEmailPreferences(theme: string): Promise<void>
```

---

## 3. Wizard Flow

### State machine

Wizard state is carried in callback data strings. Format: `ew:<step>:<campaignType>:<params>`

Steps: `theme` → `portfolio` → `content` → `send`

### Step 1: Plan preview (digest only) or skip to theme

**`/email-digest`**: Show weekly plan summary (pillar counts, total posts). Button: `[İleri → Tema Seçimi]`.

**`/email-outreach <city>`**: Skip plan preview, go directly to theme selection. City/service saved in callback data.

**`/email-reactivate <email> <name> <project>`**: Skip plan preview, go directly to theme selection. Recipient data saved in callback data.

### Step 2: Theme selection

Three theme option buttons. Selected theme is highlighted (checkbox prefix). Preview hint: a short text description of how each theme looks.

```
🎨 Email teması seçin:

✅ Koyu Çelik (varsayılan)
☐ Açık Çelik
☐ Koyu Altın

[İleri] [Geri] [İptal]
```

Selecting a theme edits the message to show the new selection (no new message). `[İleri]` proceeds to step 3.

### Step 3: Portfolio selection (digest) / Content config (outreach/reactivate)

**For `/email-digest`:** AI extracts 4-6 portfolio highlights from the current week's plan. Each shown as a toggle button:

```
🖼 Bültende yer alacak projeler:

✅ Logo-Design — Gaststätte "Zum Hirsch"
✅ Webdesign — Zahnarztpraxis Dr. Weber
☐ Flyer-Design — Döner-Imbiss "Urfa"
✅ Branding — Café "Bohne & Blatt"
☐ Social-Media — Fitness-Studio "FitLife"

[İleri] [Geri] [İptal]
```

Tapping toggles selection. AI provides headline + description + CTA for each selected item.

**For `/email-outreach`:** Skip portfolio, go to content config. User picks which services to highlight (Logo, Web, Druck — multi-select toggles).

**For `/email-reactivate`:** Skip portfolio, go directly to content.

### Step 4: Content preview + editing

Show the full email content in Telegram, piece by piece:

```
📧 Email İçeriği — Koyu Çelik teması

━━━━━━━━━━━━━━━━━━
📌 KONU:
"Fly & Froth Weekly — Neue Projekte, Design-Tipps & mehr"
                              [✏️ Düzenle]
━━━━━━━━━━━━━━━━━━
📝 GİRİŞ:
Diese Woche bei Fly & Froth: drei frische...
                              [✏️ Düzenle]
━━━━━━━━━━━━━━━━━━
🖼 PORTFOLYO (3 proje):
1. Logo für Gaststätte "Zum Hirsch"
2. Website für Zahnarztpraxis Weber
3. Branding für Café "Bohne & Blatt"
                              [✏️ Düzenle]
━━━━━━━━━━━━━━━━━━
🔚 KAPANIŞ:
Alle Angebote mit Express 24h...
                              [✏️ Düzenle]
━━━━━━━━━━━━━━━━━━

[📩 Test Gönder (bana)] [📤 Listeye Gönder]
[Geri] [İptal]
```

### Editing flow

When user taps `[✏️ Düzenle]` on any section:
1. Bot prompts: "Yeni metni yaz veya düzeltme talimatı ver (örn: 'daha kısa olsun', 'vurguyu logo tasarımına yap')"
2. User types their instruction or new text
3. If it's an instruction (not a complete replacement), AI revises that section
4. If it's a complete replacement, it's used directly
5. Updated section is shown, returning to the content overview

### Send flow

**Test send:** Sends to `info@fly-froth.com` via Brevo transactional API. Message updates to show "Test gönderildi ✅" with a "Gelen kutunu kontrol et" note.

**List send:** Shows confirmation with list name and recipient count. On confirm, creates Brevo campaign, sends immediately, reports campaign ID.

---

## 4. Webhook Handler Changes

### New callback actions

All wizard callbacks use the `ew:` prefix (email wizard):

| Callback pattern | Handler |
|---|---|
| `ew:theme:digest:themeId` | Set theme, re-render theme picker |
| `ew:theme:outreach:city:service:themeId` | Set theme for outreach |
| `ew:theme:reactivate:email:name:project:themeId` | Set theme for reactivation |
| `ew:portfolio:toggle:index` | Toggle portfolio item selection |
| `ew:portfolio:done` | Confirm portfolio, generate content, go to step 4 |
| `ew:content:edit:section` | Enter edit mode for a section |
| `ew:content:preview` | Return to content overview |
| `ew:send:test` | Generate full HTML, send test email |
| `ew:send:list` | Confirm list, create + send campaign |
| `ew:cancel` | Cancel wizard, clean up |

### New command handler functions

- `handleEmailWizardCallback(chatId, messageId, action, params)` — dispatcher for all `ew:` callbacks
- `handleEmailDigestWizard(chatId)` — entry point, step 1
- `handleEmailOutreachWizard(chatId, city)` — entry point, skip to step 2
- `handleEmailReactivationWizard(chatId, email, name, project)` — entry point, skip to step 2

### State storage

Wizard state is NOT stored in DB (avoids schema changes to mailDrafts). Instead, all state is serialized into callback data strings. Limitations:
- Callback data max 64 bytes in Telegram → longer data (like full AI-generated text) is stored in a transient cache
- Use `emailCampaignCache` Map (in-memory, same function instance) keyed by `chatId`
- Vercel Fluid Compute reuses instances, so cache persists across callbacks within a session
- Cache entries expire after 30 minutes (cleaned up via `setTimeout`)

```typescript
// src/lib/email/wizard-cache.ts
const cache = new Map<number, WizardState>();
export function getWizardState(chatId: number): WizardState | undefined { ... }
export function setWizardState(chatId: number, state: WizardState): void { ... }
export function clearWizardState(chatId: number): void { ... }

interface WizardState {
  step: 'theme' | 'portfolio' | 'content' | 'send';
  campaignType: 'digest' | 'outreach' | 'reactivation';
  theme: ThemeId;
  // digest
  planId?: string;
  selectedPortfolioIndices?: number[];
  portfolioItems?: PortfolioItem[];
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
```

---

## 5. Email Generation

### Content generation

AI generates content at step 4 (when portfolio is confirmed). Single Claude call per content generation:

- **Digest:** `generateDigestContent(planId, selectedItems, theme)` → `{ subjectLine, introText, closingText, portfolioItems }`
- **Outreach:** `generateOutreachContent(city, service, theme)` → `{ subjectLine, headline, bodyText, ctaLabel }`
- **Reactivation:** `generateReactivationContent(clientName, lastProject, theme)` → `{ subjectLine, bodyText }`

The theme is passed to AI so it can adjust tone (e.g., gold theme = warmer tone, steel = more professional).

### HTML generation

Each theme function takes `ThemeContent` and returns a full HTML string. The content is assembled by the wizard, not the theme. Themes only handle layout + styling.

---

## 6. Migration Path

1. Existing `templates.ts` functions (`weeklyDigest`, `portfolioNewsletter`, `localOutreachEmail`, `reactivationEmail`) remain as fallbacks
2. New theme files are added in `src/lib/email/themes/`
3. `baseTemplate()` in `templates.ts` is replaced by the new `base.ts` shared layout
4. Old template functions delegate to new theme system where applicable
5. No breaking changes to existing Brevo integration (`src/lib/email/brevo.ts`)

---

## 7. Error Handling

- **AI generation fails:** Show error, allow retry or manual text entry
- **Brevo API fails:** Show specific error (auth, list not found, rate limit), allow retry
- **Cache miss (function cold start):** If wizard state not found, show "Oturum zaman aşımına uğradı, tekrar başlatın" and restart wizard
- **Callback data too long:** Truncate portfolio items to IDs, resolve from cache

---

## 8. Scope Boundaries

**In scope:**
- 3 email themes matching website
- 4-step wizard for `/email-digest`, `/email-outreach`, `/email-reactivate`
- Content preview + per-section editing
- Theme selection persisted to DB
- Test send before list send
- In-memory wizard state cache

**Out of scope:**
- Blog features
- New email campaign types beyond existing 3
- Drag-and-drop email builder
- Email analytics/campaign history dashboard
- Brevo list management via bot (still env var)
- Multi-language bot interface (stays Turkish)
