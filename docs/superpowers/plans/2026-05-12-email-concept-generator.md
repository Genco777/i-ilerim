# Email Konsept Üretici — Implementation Plan

> **For agentic workers:** Execute tasks sequentially. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace plan-dependent wizard with AI concept generator that offers 2 unique campaign concepts per run.

**Architecture:** New `email_campaigns` table tracks history to prevent repeats. New `generateConcepts()` in wizard-generate.ts. WizardState extended with concepts. Webhook handlers updated for new flow (concept pick → theme → content → send).

**Tech Stack:** Next.js 16, Drizzle ORM, Telegram Bot API, Brevo API v3, Claude API (sonnet-4-6)

---

### Task 1: Database — email_campaigns table + queries

**Files:**
- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/db/queries/email-campaigns.ts`

- [ ] **Step 1: Add emailCampaigns table to schema**

Add after `emailPreferences` in `src/lib/db/schema.ts`:

```typescript
export const emailCampaigns = pgTable('email_campaigns', {
  id: serial('id').primaryKey(),
  subjectLine: text('subject_line').notNull(),
  conceptTitle: text('concept_title').notNull(),
  campaignType: text('campaign_type').notNull(),
  theme: text('theme').notNull(),
  contentJson: jsonb('content_json').notNull(),
  brevoCampaignId: integer('brevo_campaign_id'),
  recipientEmail: text('recipient_email'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});
```

- [ ] **Step 2: Create queries file**

Create `src/lib/db/queries/email-campaigns.ts`:

```typescript
import { db } from '@/lib/db';
import { emailCampaigns } from '@/lib/db/schema';
import { desc, eq } from 'drizzle-orm';

export interface EmailCampaignRecord {
  id: number;
  subjectLine: string;
  conceptTitle: string;
  campaignType: string;
  theme: string;
  contentJson: Record<string, unknown>;
  brevoCampaignId: number | null;
  recipientEmail: string | null;
  createdAt: Date;
}

export async function getRecentCampaigns(limit = 10): Promise<EmailCampaignRecord[]> {
  return db
    .select()
    .from(emailCampaigns)
    .orderBy(desc(emailCampaigns.createdAt))
    .limit(limit) as any;
}

export async function saveCampaign(opts: {
  subjectLine: string;
  conceptTitle: string;
  campaignType: string;
  theme: string;
  contentJson: Record<string, unknown>;
  brevoCampaignId?: number;
  recipientEmail?: string;
}): Promise<EmailCampaignRecord> {
  const [row] = await db
    .insert(emailCampaigns)
    .values({
      subjectLine: opts.subjectLine,
      conceptTitle: opts.conceptTitle,
      campaignType: opts.campaignType,
      theme: opts.theme,
      contentJson: opts.contentJson,
      brevoCampaignId: opts.brevoCampaignId ?? null,
      recipientEmail: opts.recipientEmail ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to save campaign');
  return row as any;
}
```

- [ ] **Step 3: Generate migration**

Run: `npx drizzle-kit generate`
Then rename the generated migration to `0009_email_campaigns.sql`.

- [ ] **Step 4: Verify TypeScript**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/db/queries/email-campaigns.ts drizzle/migrations/
git commit -m "feat: add email_campaigns table for campaign history"
```

---

### Task 2: Concept generation function

**Files:**
- Modify: `src/lib/email/wizard-generate.ts`

- [ ] **Step 1: Add FirmenInfo constant and generateConcepts function**

Add at the end of wizard-generate.ts:

```typescript
// ── Concept Generation ──

const FIRMEN_INFO = `Fly & Froth — Grafik & Webdesign Studio, Karben (Rhein-Main)
Hizmetler: Webdesign (499€+), Logodesign (79€+), Druckdesign/Flyer/Visitenkarten (29€+), 
Google Business Profil (99€), WhatsApp Business (49€), Online-Terminbuchung (149€), Online-Menü (79€)
USP: 1000+ proje, 5.0 Google (22 yorum), Festpreisgarantie, Express 24h, tek muhatap, %100 memnuniyet
Hedef kitle: Küçük/orta işletmeler, gastronomi, sağlık, el sanatları, Rhein-Main ve Almanya geneli
Website: fly-froth.com | Instagram: @fly.froth`;

export interface CampaignConcept {
  title: string;
  angle: string;
  subjectLine: string;
  introText: string;
  closingText: string;
  portfolioFocus: string[];
}

export async function generateConcepts(
  campaignType: 'digest' | 'reactivation',
  pastSubjects: string[],
  context?: { clientName?: string; lastProject?: string },
): Promise<CampaignConcept[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const pastBlock = pastSubjects.length > 0
    ? `Geçmiş kampanya konuları (BUNLARI ASLA tekrarlama):\n${pastSubjects.map((s, i) => `${i + 1}. "${s}"`).join('\n')}`
    : 'Henüz geçmiş kampanya yok.';

  const contextBlock = campaignType === 'reactivation' && context?.clientName
    ? `Bu bir REAKTİVASYON kampanyası.\nEski müşteri: ${context.clientName}\nSon projesi: ${context.lastProject ?? 'bilinmiyor'}\nKişisel, samimi ama profesyonel ol.`
    : 'Bu bir GENEL BÜLTEN. Mevcut mailing listindeki herkese gidecek.';

  const system = [
    'Sen Fly & Froth için email pazarlama konseptleri üreten bir stratejistsin.',
    '',
    'FİRMA BİLGİSİ:',
    FIRMEN_INFO,
    '',
    'REFERANS: Premium tasarım ajanslarının bülten stratejilerini referans al.',
    'Satış odaklı, profesyonel, özgün. Genel "tasarım ajansı bülteni" gibi olmasın.',
    '',
    pastBlock,
    '',
    contextBlock,
    '',
    '2 FARKLI konsept üret. Her biri FARKLI bir açıdan yaklaşsın.',
    'Örnek açılar: portfolyo vitrini, sektörel trend/ipucu, başarı hikayesi/müşteri yolculuğu, hizmet derinlemesine, sezonluk kampanya, dijital dönüşüm tavsiyesi',
    'Her konsept satışa yönlendirmeli.',
    '',
    'JSON formatında dön:',
    '{',
    '  "concepts": [',
    '    {',
    '      "title": "Konsept başlığı (butonda gösterilecek, max 40 karakter)",',
    '      "angle": "Satış açısı (1 cümle)",',
    '      "subjectLine": "Önerilen konu satırı (max 60 karakter)",',
    '      "introText": "2-3 cümle giriş metni",',
    '      "closingText": "1 cümle kapanış + CTA",',
    '      "portfolioFocus": ["hizmet1", "hizmet2"]',
    '    }',
    '  ]',
    '}',
  ].join('\n');

  const raw = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system,
    messages: [{ role: 'user', content: '2 email kampanya konsepti üret.' }],
  }).then((r) => {
    const block = r.content[0];
    if (!block || block.type !== 'text') throw new Error('No text from Claude');
    return block.text;
  });

  const parsed = JSON.parse(raw);
  return (parsed.concepts ?? []).slice(0, 2);
}
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/wizard-generate.ts
git commit -m "feat: add AI concept generation for email campaigns"
```

---

### Task 3: Wizard cache update

**Files:**
- Modify: `src/lib/email/wizard-cache.ts`

- [ ] **Step 1: Add concept fields to WizardState**

Add to the `WizardState` interface:
```typescript
  // concept generation
  concepts?: CampaignConcept[];
  selectedConceptIndex?: number;
```

And add the import at top:
```typescript
import type { CampaignConcept } from './wizard-generate';
```

- [ ] **Step 2: Verify TypeScript**

Run: `npx tsc --noEmit --pretty`
Expected: Clean (circular import risk — wizard-cache imports from wizard-generate which imports from wizard-cache. If this causes issues, define CampaignConcept in wizard-cache.ts instead.)

Actually, better: define `CampaignConcept` in wizard-cache.ts and re-export from wizard-generate.ts to avoid circular dependency.

So in wizard-cache.ts, add:
```typescript
export interface CampaignConcept {
  title: string;
  angle: string;
  subjectLine: string;
  introText: string;
  closingText: string;
  portfolioFocus: string[];
}
```

And add to WizardState:
```typescript
  concepts?: CampaignConcept[];
  selectedConceptIndex?: number;
```

Then in wizard-generate.ts, import `CampaignConcept` from wizard-cache instead of defining it.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/wizard-cache.ts src/lib/email/wizard-generate.ts
git commit -m "feat: add concept fields to wizard state"
```

---

### Task 4: Webhook handler — concept flow

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

- [ ] **Step 1: Update imports**

Add to wizard-cache import:
```typescript
import {
  getWizardState,
  setWizardState,
  clearWizardState,
  type WizardState,
} from '@/lib/email/wizard-cache';
```
(Already exists, verify it includes what we need)

Add to wizard-generate import:
```typescript
import {
  generateDigestContent,
  generateOutreachContent,
  generateReactivationContent,
  generateConcepts,
} from '@/lib/email/wizard-generate';
```

Add new import:
```typescript
import { getRecentCampaigns, saveCampaign } from '@/lib/db/queries/email-campaigns';
```

- [ ] **Step 2: Rewrite handleEmailDigestCommand**

Replace with concept-first flow:

```typescript
async function handleEmailDigestCommand(chatId: number): Promise<void> {
  // Load preferences
  let currentTheme: ThemeId = 'dark_steel';
  try {
    const prefs = await getEmailPreferences();
    if (prefs.theme === 'dark_steel' || prefs.theme === 'light_steel' || prefs.theme === 'dark_gold') {
      currentTheme = prefs.theme;
    }
  } catch { /* use default */ }

  // Get past campaign subjects for dedup
  let pastSubjects: string[] = [];
  try {
    const past = await getRecentCampaigns(10);
    pastSubjects = past.filter((c) => c.campaignType === 'digest').map((c) => c.subjectLine);
  } catch { /* ok if table doesn't exist yet */ }

  // Init wizard state
  const state: WizardState = {
    chatId,
    step: 'concept',
    campaignType: 'digest',
    theme: currentTheme,
  };
  setWizardState(chatId, state);

  await sendMessage({ chatId, text: '🤖 Kampanya konseptleri oluşturuluyor... (10-15 saniye)' });

  try {
    const concepts = await generateConcepts('digest', pastSubjects);
    state.concepts = concepts;
    state.step = 'concept';
    setWizardState(chatId, state);

    const keyboard = concepts.map((c, i) => [
      { text: `${i + 1}. ${c.title}`, callback_data: `ew:concept:pick:${i}` },
    ]);
    keyboard.push([{ text: '🔄 Yeniden Üret', callback_data: 'ew:concept:regen' }]);
    keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

    await sendMessage({
      chatId,
      text: [
        '📧 Email Kampanya Konseptleri',
        '',
        ...concepts.map((c, i) => `${i + 1}. **${c.title}**\n   ${c.angle}`),
        '',
        'Bir konsept seç:',
      ].join('\n'),
      replyMarkup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    clearWizardState(chatId);
    await sendMessage({
      chatId,
      text: `⚠️ Konsept üretilemedi: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
```

- [ ] **Step 3: Rewrite handleEmailReactivateCommand**

Similar but with client context:

```typescript
async function handleEmailReactivateCommand(
  chatId: number,
  email: string,
  name: string,
  project: string,
): Promise<void> {
  if (!email.includes('@')) {
    await sendMessage({ chatId, text: '⚠️ Geçerli bir email adresi yaz.' });
    return;
  }

  let currentTheme: ThemeId = 'dark_steel';
  try {
    const prefs = await getEmailPreferences();
    if (prefs.theme === 'dark_steel' || prefs.theme === 'light_steel' || prefs.theme === 'dark_gold') {
      currentTheme = prefs.theme;
    }
  } catch { /* use default */ }

  let pastSubjects: string[] = [];
  try {
    const past = await getRecentCampaigns(10);
    pastSubjects = past.filter((c) => c.campaignType === 'reactivation').map((c) => c.subjectLine);
  } catch { /* ok */ }

  const state: WizardState = {
    chatId,
    step: 'concept',
    campaignType: 'reactivation',
    theme: currentTheme,
    recipientEmail: email,
    clientName: name,
    lastProject: project,
  };
  setWizardState(chatId, state);

  await sendMessage({ chatId, text: '🤖 Reaktivasyon konseptleri oluşturuluyor...' });

  try {
    const concepts = await generateConcepts('reactivation', pastSubjects, {
      clientName: name,
      lastProject: project,
    });
    state.concepts = concepts;
    setWizardState(chatId, state);

    const keyboard = concepts.map((c, i) => [
      { text: `${i + 1}. ${c.title}`, callback_data: `ew:concept:pick:${i}` },
    ]);
    keyboard.push([{ text: '🔄 Yeniden Üret', callback_data: 'ew:concept:regen' }]);
    keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

    await sendMessage({
      chatId,
      text: [
        `📧 ${name} için Reaktivasyon Konseptleri`,
        '',
        ...concepts.map((c, i) => `${i + 1}. **${c.title}**\n   ${c.angle}`),
        '',
        'Bir konsept seç:',
      ].join('\n'),
      replyMarkup: { inline_keyboard: keyboard },
    });
  } catch (err) {
    clearWizardState(chatId);
    await sendMessage({
      chatId,
      text: `⚠️ Konsept üretilemedi: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
```

- [ ] **Step 4: Add concept callback handlers in handleEmailWizardCallback**

Add to the switch statement in `handleEmailWizardCallback`:
```typescript
    case 'concept':
      await handleWizardConcept(chatId, messageId, state, rest[0] ?? '', rest[1] ?? '');
      break;
```

Then add the handler function:
```typescript
async function handleWizardConcept(
  chatId: number, messageId: number, state: WizardState, sub: string, arg: string,
): Promise<void> {
  if (sub === 'pick' && state.concepts) {
    const idx = parseInt(arg, 10);
    const concept = state.concepts[idx];
    if (!concept) return;

    state.selectedConceptIndex = idx;
    state.subjectLine = concept.subjectLine;
    state.introText = concept.introText;
    state.closingText = concept.closingText;

    // Go to theme selection
    state.step = 'theme';
    setWizardState(chatId, state);
    await showThemePicker(chatId, messageId, state);

  } else if (sub === 'regen') {
    await editMessageText({ chatId, messageId, text: '🤖 Yeni konseptler üretiliyor...', replyMarkup: undefined });

    let pastSubjects: string[] = [];
    try {
      const past = await getRecentCampaigns(10);
      pastSubjects = past.filter((c) => c.campaignType === state.campaignType).map((c) => c.subjectLine);
    } catch { /* ok */ }

    try {
      const concepts = await generateConcepts(
        state.campaignType,
        pastSubjects,
        state.clientName ? { clientName: state.clientName, lastProject: state.lastProject } : undefined,
      );
      state.concepts = concepts;
      setWizardState(chatId, state);

      const keyboard = concepts.map((c, i) => [
        { text: `${i + 1}. ${c.title}`, callback_data: `ew:concept:pick:${i}` },
      ]);
      keyboard.push([{ text: '🔄 Yeniden Üret', callback_data: 'ew:concept:regen' }]);
      keyboard.push([{ text: '❌ İptal', callback_data: 'ew:cancel' }]);

      await editMessageText({
        chatId, messageId,
        text: [
          '📧 Yeni Kampanya Konseptleri',
          '',
          ...concepts.map((c, i) => `${i + 1}. **${c.title}**\n   ${c.angle}`),
          '',
          'Bir konsept seç:',
        ].join('\n'),
        replyMarkup: { inline_keyboard: keyboard },
      });
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ Konsept üretilemedi: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
}
```

- [ ] **Step 5: Update handleWizardGoto**

The `handleWizardGoto` function's content generation step currently uses `generateDigestContent` which depends on portfolio items. Update to use concept-based generation:

```typescript
// In handleWizardGoto, the 'content' case should use the selected concept:
  } else if (target === 'content') {
    await editMessageText({ chatId, messageId, text: '🤖 İçerik oluşturuluyor...', replyMarkup: undefined });
    try {
      // Use concept data if available, otherwise call AI
      if (state.selectedConceptIndex !== undefined && state.concepts) {
        state.step = 'content';
        setWizardState(chatId, state);
        await showContentPreview(chatId, messageId, state);
      } else {
        // Fallback: generate content (for old flow compatibility)
        await generateAndShowContent(chatId, messageId, state);
      }
    } catch (err) {
      await sendMessage({
        chatId,
        text: `⚠️ İçerik oluşturulamadı: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
```

- [ ] **Step 6: Update send handler to save campaign history**

In `handleWizardSend`, after successful campaign send (mode === 'confirm'), add:

```typescript
      // Save to campaign history
      try {
        await saveCampaign({
          subjectLine: state.subjectLine ?? '',
          conceptTitle: state.concepts?.[state.selectedConceptIndex ?? 0]?.title ?? 'Manuel',
          campaignType: state.campaignType,
          theme: state.theme,
          contentJson: {
            introText: state.introText,
            closingText: state.closingText,
            portfolioItems: state.portfolioItems?.map((p) => ({
              headline: p.headline,
              description: p.description,
              serviceType: p.serviceType,
            })),
          },
          brevoCampaignId: campaign.id,
          recipientEmail: state.recipientEmail,
        });
      } catch { /* non-critical */ }
```

Also add saveCampaign import to the email-campaigns import.

- [ ] **Step 7: Verify TypeScript**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 8: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat: add concept-first email campaign flow (digest + reactivation)"
```

---

### Task 5: Integration & verification

- [ ] **Step 1: Run full TypeScript check**

Run: `npx tsc --noEmit --pretty`
Expected: Clean

- [ ] **Step 2: Run all tests**

Run: `npx vitest run`
Expected: All pass

- [ ] **Step 3: Build check**

Run: `npm run build`
Expected: Successful

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: final integration for email concept generator"
```
