# Angebot Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an /angebot Telegram command that creates professional quote (Angebot) PDFs through the same step-by-step flow as /fatura, with conversion to invoice capability.

**Architecture:** Extends the existing invoices table/workflow by adding `angebot` type and `valid_until` column. Separate numbering (`2026-AN-050`). Reuses PDF renderer with conditional rendering, and light_steel email theme via new `wrapAngebotHtml()`. Conversion creates a new Rechnung from Angebot data.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM + PostgreSQL (Neon), @react-pdf/renderer, Telegram Bot API

---

### Task 1: Schema & Migration

**Files:**
- Modify: `src/lib/db/schema.ts:68-80, 455-478`
- Create: `drizzle/migrations/0013_angebot.sql`
- Create: `scripts/apply-angebot-migration.mjs`

- [ ] **Step 1: Update schema.ts enums & table**

In `invoiceType` (line 76), add `'angebot'`:
```typescript
export const invoiceType = pgEnum('invoice_type', [
  'rechnung', 'teilrechnung', 'schlussrechnung', 'angebot',
]);
```

In `invoiceStatus` (line 68), add `'converted'`:
```typescript
export const invoiceStatus = pgEnum('invoice_status', [
  'collecting', 'preview', 'sent', 'cancelled', 'deleted', 'converted',
]);
```

In `invoices` table (after `footer_note` line), add:
```typescript
valid_until: text('valid_until'),
converted_to_invoice_id: text('converted_to_invoice_id'),
```

- [ ] **Step 2: Write & apply migration**

Create `drizzle/migrations/0013_angebot.sql`:
```sql
ALTER TYPE invoice_type ADD VALUE IF NOT EXISTS 'angebot';
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'converted';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS valid_until TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS converted_to_invoice_id TEXT;
```

Create `scripts/apply-angebot-migration.mjs`:
```javascript
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sql = neon(process.env.POSTGRES_URL);
const migration = readFileSync(join(process.cwd(), 'drizzle/migrations/0013_angebot.sql'), 'utf8');
const statements = migration.split(';').map(s => s.trim()).filter(Boolean);
for (const stmt of statements) {
  await sql`${stmt}`;
  console.log('OK:', stmt.slice(0, 60));
}
console.log('Migration applied.');
```

Run: `node scripts/apply-angebot-migration.mjs`

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/schema.ts drizzle/migrations/0013_angebot.sql scripts/apply-angebot-migration.mjs
git commit -m "feat(schema): add angebot type, valid_until, converted_to_invoice_id"
```

---

### Task 2: Types & Numbering

**Files:**
- Modify: `src/lib/invoice/types.ts`
- Modify: `src/lib/invoice/numbering.ts`

- [ ] **Step 1: Update types.ts**

Change `InvoiceType`:
```typescript
export type InvoiceType = 'rechnung' | 'teilrechnung' | 'schlussrechnung' | 'angebot';
```

Add `validUntil` to `InvoiceData`:
```typescript
export interface InvoiceData {
  number: string;
  type: InvoiceType;
  date: string;
  recipient: InvoiceRecipientData;
  items: InvoiceItem[];
  totalCents: number;
  footerNote: string | null;
  validUntil?: string;
}
```

Update `INVOICE_TYPE_LABEL`:
```typescript
export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  rechnung: 'RECHNUNG',
  teilrechnung: 'TEILRECHNUNG',
  schlussrechnung: 'SCHLUSSRECHNUNG',
  angebot: 'ANGEBOT',
};
```

- [ ] **Step 2: Add nextAngebotNumber() to numbering.ts**

First update imports (line 1) to add `and`, `eq`:
```typescript
import { and, eq, notInArray, sql } from 'drizzle-orm';
```

Add at end of file:
```typescript
const ANGEBOT_FORMAT = /^(\d{4})-AN-(\d{3})$/;
const ANGEBOT_INITIAL_SEQ = 50;

export function parseAngebotNumber(s: string): ParsedInvoiceNumber | null {
  const m = ANGEBOT_FORMAT.exec(s);
  if (!m || !m[1] || !m[2]) return null;
  return { year: Number(m[1]), seq: Number(m[2]) };
}

function formatAngebot(year: number, seq: number): string {
  return `${year}-AN-${String(seq).padStart(3, '0')}`;
}

export async function nextAngebotNumber(): Promise<string> {
  const rows = await db
    .select({ number: invoices.number })
    .from(invoices)
    .where(
      and(
        eq(invoices.type, 'angebot'),
        notInArray(invoices.status, ['cancelled', 'deleted']),
      ),
    )
    .orderBy(sql`${invoices.number} DESC`);

  const currentYear = new Date().getFullYear();
  if (rows.length === 0) return formatAngebot(currentYear, ANGEBOT_INITIAL_SEQ);

  let maxSeqCurrentYear = 0;
  for (const row of rows) {
    const parsed = parseAngebotNumber(row.number);
    if (!parsed) continue;
    if (parsed.year === currentYear && parsed.seq > maxSeqCurrentYear) {
      maxSeqCurrentYear = parsed.seq;
    }
  }
  if (maxSeqCurrentYear === 0) return formatAngebot(currentYear, ANGEBOT_INITIAL_SEQ);
  return formatAngebot(currentYear, maxSeqCurrentYear + 1);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/invoice/types.ts src/lib/invoice/numbering.ts
git commit -m "feat: angebot types and numbering (2026-AN-050)"
```

---

### Task 3: PDF Changes

**Files:**
- Modify: `src/lib/invoice/pdf.tsx`

- [ ] **Step 1: Add validUntil to InvoiceData usage in InvoicePdf**

After the date `<View>` block (line 232-234 area), add valid_until display:
```typescript
{data.validUntil ? (
  <View style={[{ flexDirection: 'row' }]}>
    <Text style={[styles.label, { width: 140 }]}>GÜLTIG BIS:</Text>
    <Text style={styles.value}>{data.validUntil}</Text>
  </View>
) : null}
```

- [ ] **Step 2: Hide §19 UStG line for Angebot**

Wrap the tax line (around line 265-270) in a conditional:
```typescript
{data.type !== 'angebot' ? (
  <View style={styles.totalsRow}>
    <Text style={styles.totalsLabel}>
      Gemäß §19 UStG wird keine Umsatzsteuer berechnet.
    </Text>
    <Text style={styles.totalsValue}>0</Text>
  </View>
) : null}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/invoice/pdf.tsx
git commit -m "feat(pdf): angebot mode — hide tax line, show valid until"
```

---

### Task 4: Email Wrapper

**Files:**
- Create: `src/lib/email/angebot-email.ts`

- [ ] **Step 1: Create angebot-email.ts**

```typescript
import { baseLayout, TYPO } from './themes/base';

const BG = '#FCFCFD'; const CARD = '#FFFFFF'; const ACCENT = '#5F6FB0';
const ACCENT_HOVER = '#4658A0'; const HEADING = '#1D2137'; const BODY = '#6B728B';
const MUTED = '#8B92A8'; const BORDER = '#DCE1E9'; const FONT = 'Outfit, system-ui, sans-serif';

export function wrapAngebotHtml(opts: { subject: string; bodyText: string }): string {
  const paragraphs = opts.bodyText.split('\n').filter(Boolean)
    .map((p) => `<p style="color:${BODY};font-family:${FONT};font-size:15px;${TYPO.body};margin:0 0 12px;">${p}</p>`)
    .join('\n');

  const content = `
    <h2 style="color:${HEADING};font-family:${FONT};font-size:20px;${TYPO.heading};margin:0 0 4px;">${opts.subject}</h2>
    <p style="color:${MUTED};font-family:${FONT};font-size:13px;margin:0 0 20px;">Fly &amp; Froth &middot; Angebot</p>
    ${paragraphs}
    <p style="color:${BODY};font-family:${FONT};font-size:13px;${TYPO.body};margin:24px 0 0;text-align:center;">
      Bei Fragen einfach antworten &mdash; pers&ouml;nlicher Support garantiert.</p>`;

  return baseLayout({
    bgColor: BG, cardBg: CARD, accent: ACCENT, accentHover: ACCENT_HOVER,
    headingColor: HEADING, bodyColor: BODY, mutedColor: MUTED, borderColor: BORDER,
    ctaBg: ACCENT, ctaText: '#FFFFFF', fontFamily: FONT, logoVariant: 'navy', content,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/email/angebot-email.ts
git commit -m "feat: angebot email wrapper (light_steel theme)"
```

---

### Task 5: Keyboard Functions

**Files:**
- Modify: `src/lib/telegram/invoice-keyboard.ts`

- [ ] **Step 1: Add angebot keyboards**

Add at end of file:
```typescript
export function angebotFooterKeyboard(draftId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: 'Angebot freibleibend', callback_data: `ang_fp:${draftId}:ap1` }],
      [
        { text: '✏️ Manuel yaz', callback_data: `ang_footer_manual:${draftId}` },
        { text: '— Not yok', callback_data: `ang_footer_skip:${draftId}` },
      ],
    ],
  };
}

export function angebotNumberKeyboard(draftId: string, autoNumber: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: `✓ ${autoNumber}`, callback_data: `ang_number_auto:${draftId}` },
        { text: '✏️ Değiştir', callback_data: `ang_number_manual:${draftId}` },
      ],
    ],
  };
}

export function angebotPreviewKeyboard(angebotId: string): InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [{ text: '📧 Müşteriye mail at', callback_data: `ang_send_mail:${angebotId}` }],
      [
        { text: '💾 Sadece kaydet', callback_data: `ang_save:${angebotId}` },
        { text: '🔄 Faturaya çevir', callback_data: `ang_convert:${angebotId}` },
      ],
      [
        { text: '🔄 Yeniden başla', callback_data: `ang_restart:${angebotId}` },
        { text: '🗑 Sil', callback_data: `ang_delete:${angebotId}` },
      ],
    ],
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/telegram/invoice-keyboard.ts
git commit -m "feat: angebot keyboards (footer, number, preview)"
```

---

### Task 6: Database Queries

**Files:**
- Modify: `src/lib/db/queries/invoices.ts`

- [ ] **Step 1: Update createDraft to accept optional type**

```typescript
export async function createDraft(args: {
  chatId: number;
  type?: InvoiceType;
}): Promise<Invoice> {
  const [created] = await db
    .insert(invoices)
    .values({
      number: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: args.type ?? 'rechnung',
      date: '',
      status: 'collecting',
      current_step: args.type === 'angebot' ? 'recipient_name' : 'type',
      telegram_chat_id: args.chatId,
    } as NewInvoice)
    .returning();
  if (!created) throw new Error('Failed to insert invoice');
  return created;
}
```

Add import: `import { todayDDMMYYYY } from '@/lib/invoice/types';` at top.

- [ ] **Step 2: Add getAngebotByNumber**

```typescript
export async function getAngebotByNumber(number: string): Promise<Invoice | null> {
  const rows = await db
    .select().from(invoices)
    .where(and(
      eq(invoices.number, number),
      eq(invoices.type, 'angebot'),
      notInArray(invoices.status, ['cancelled', 'deleted']),
    ))
    .limit(1);
  return rows[0] ?? null;
}
```

- [ ] **Step 3: Add convertAngebotToInvoice**

```typescript
export async function convertAngebotToInvoice(
  angebotId: string, newNumber: string,
): Promise<Invoice> {
  const angebot = await getInvoice(angebotId);
  if (!angebot || angebot.type !== 'angebot') throw new Error('Angebot not found');

  const [invoice] = await db.insert(invoices).values({
    number: newNumber, type: 'rechnung', date: todayDDMMYYYY(),
    recipient: angebot.recipient, items: angebot.items,
    total_cents: angebot.total_cents, footer_note: angebot.footer_note,
    status: 'collecting', current_step: null,
    telegram_chat_id: angebot.telegram_chat_id,
  } as NewInvoice).returning();

  if (!invoice) throw new Error('Failed to create invoice from angebot');

  await db.update(invoices)
    .set({ status: 'converted', converted_to_invoice_id: invoice.id })
    .where(eq(invoices.id, angebotId));

  return invoice;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/queries/invoices.ts
git commit -m "feat: getAngebotByNumber and convertAngebotToInvoice queries"
```

---

### Task 7: Webhook Handler — /angebot Command & Full Flow

**Files:**
- Modify: `src/app/api/telegram/webhook/[secret]/route.ts`

Add these imports to existing import blocks:
```typescript
import { angebotFooterKeyboard, angebotNumberKeyboard, angebotPreviewKeyboard } from '@/lib/telegram/invoice-keyboard';
import { nextAngebotNumber, parseAngebotNumber } from '@/lib/invoice/numbering';
import { todayDDMMYYYY } from '@/lib/invoice/types';
import { wrapAngebotHtml } from '@/lib/email/angebot-email';
import { convertAngebotToInvoice, getAngebotByNumber } from '@/lib/db/queries/invoices';
```

Add presets (near FOOTER_PRESETS around line 1786):
```typescript
const ANGEBOT_FOOTER_PRESETS: Record<string, string> = {
  ap1: 'Angebot freibleibend. Preise zzgl. MwSt.',
};
```

Helper:
```typescript
function validUntilFromToday(plusDays: number): string {
  const d = new Date(); d.setDate(d.getDate() + plusDays);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}`;
}
```

- [ ] **Step 1: Command handler**

```typescript
async function handleAngebotCommand(chatId: number): Promise<void> {
  await cancelActiveDrafts(chatId);
  const draft = await createDraft({ chatId, type: 'angebot' });
  await sendMessage({ chatId, text: '📋 Yeni Angebot\n\nMüşteri (sadece kişi adı, şirket varsa "Şirket / Kişi Adı" formatında):' });
}
```

- [ ] **Step 2: Text handler handleAngebotText**

```typescript
async function handleAngebotText(chatId: number, draft: Invoice, text: string): Promise<boolean> {
  const step = draft.current_step;

  if (step === 'recipient_name') {
    const parsed = parseRecipientNameLine(text);
    if (!parsed.name) { await sendMessage({ chatId, text: 'Geçerli bir isim yaz.' }); return true; }
    await setRecipient(draft.id, { company: parsed.company, name: parsed.name, street: '', zipCity: '' });
    await updateDraft(draft.id, { current_step: 'recipient_address' });
    await sendMessage({ chatId, text: 'Adres? Format: Sokak No, PLZ Şehir\nÖrnek: Hauptstraße 5, 60311 Frankfurt' });
    return true;
  }

  if (step === 'recipient_address') {
    const parsed = parseAddressLine(text);
    if (!parsed) { await sendMessage({ chatId, text: '⚠️ Adres formatı yanlış. Bir virgül ile sokak ve PLZ Şehir\'i ayır:\nHauptstraße 5, 60311 Frankfurt' }); return true; }
    if (!draft.recipient) { await sendMessage({ chatId, text: '🔴 İç hata: alıcı kaydı yok. /angebot ile yeniden başla.' }); return true; }
    await setRecipient(draft.id, { company: draft.recipient.company, name: draft.recipient.name, street: parsed.street, zipCity: parsed.zipCity });
    const today = todayDDMMYYYY();
    const vu = validUntilFromToday(2);
    await updateDraft(draft.id, { current_step: 'valid_until', date: today });
    await sendMessage({ chatId, text: `Tarih: ${today}\n\nGültig bis (son geçerlilik)?\nVarsayılan: ${vu}\n\n"✓" ya da DD.MM.YYYY yaz:` });
    return true;
  }

  if (step === 'valid_until') {
    let vu: string;
    if (text.trim() === '✓' || text.trim().toLowerCase() === 'ok') {
      vu = validUntilFromToday(2);
    } else {
      const parsed = parseGermanDate(text);
      if (!parsed) { await sendMessage({ chatId, text: '⚠️ Tarih formatı yanlış. DD.MM.YYYY ya da "✓" yaz.' }); return true; }
      vu = parsed;
    }
    await updateDraft(draft.id, { current_step: 'item_description', valid_until: vu });
    await sendMessage({ chatId, text: 'Hizmet/ürün açıklaması?' });
    return true;
  }

  if (step === 'item_description') {
    const desc = text.trim();
    if (!desc) { await sendMessage({ chatId, text: 'Boş açıklama olmaz.' }); return true; }
    await setPendingItem(draft.id, { description: desc });
    await updateDraft(draft.id, { current_step: 'item_price' });
    await sendMessage({ chatId, text: 'Tutar (€)? Örnek: 300 ya da 199,90' });
    return true;
  }

  if (step === 'item_price') {
    const cents = parsePriceCents(text);
    if (cents === null) { await sendMessage({ chatId, text: '⚠️ Geçerli bir tutar yaz. Örnek: 300 veya 199,90' }); return true; }
    await setPendingItem(draft.id, { ...(draft.pending_item ?? {}), unitPriceCents: cents });
    await updateDraft(draft.id, { current_step: 'item_quantity' });
    await sendMessage({ chatId, text: 'Adet (varsayılan 1)? Sayı yaz veya "atla":' });
    return true;
  }

  if (step === 'item_quantity') {
    const qty = parseQuantity(text);
    if (qty === null) { await sendMessage({ chatId, text: '⚠️ 1 ya da daha büyük bir sayı yaz. "atla" yazabilirsin.' }); return true; }
    const pending = draft.pending_item;
    if (!pending?.description || typeof pending.unitPriceCents !== 'number') {
      await sendMessage({ chatId, text: '🔴 İç hata: kalem bilgileri eksik. /angebot ile yeniden başla.' }); return true;
    }
    await appendItem(draft.id, { description: pending.description, unitPriceCents: pending.unitPriceCents, quantity: qty });
    await updateDraft(draft.id, { current_step: 'item_more' });
    await sendMessage({ chatId, text: '✅ Kalem eklendi. Başka kalem var mı?', replyMarkup: invoiceItemMoreKeyboard(draft.id) });
    return true;
  }

  if (step === 'footer_manual') {
    await updateDraft(draft.id, { footer_note: text.trim() || null });
    await moveToAngebotNumberStep(chatId, draft.id);
    return true;
  }

  if (step === 'number_manual') {
    const t = text.trim(); const parsed = parseAngebotNumber(t);
    if (!parsed) { await sendMessage({ chatId, text: '⚠️ Format: YYYY-AN-NNN\nÖrnek: 2026-AN-051' }); return true; }
    const existing = await getAngebotByNumber(t);
    if (existing && existing.id !== draft.id) { await sendMessage({ chatId, text: `⚠️ ${t} numaralı Angebot zaten var.` }); return true; }
    const fd = await updateDraft(draft.id, { number: t, current_step: 'confirm' });
    await buildAndPreviewAngebot(chatId, fd);
    return true;
  }

  return false;
}
```

- [ ] **Step 3: Step-mover & preview helpers**

```typescript
async function moveToAngebotFooterStep(chatId: number, draftId: string): Promise<void> {
  await updateDraft(draftId, { current_step: 'footer' });
  await sendMessage({ chatId, text: 'Alt not — seç veya yaz:', replyMarkup: angebotFooterKeyboard(draftId) });
}

async function moveToAngebotNumberStep(chatId: number, draftId: string): Promise<void> {
  const auto = await nextAngebotNumber();
  await updateDraft(draftId, { current_step: 'number' });
  await sendMessage({ chatId, text: `Angebot no önerisi: ${auto}`, replyMarkup: angebotNumberKeyboard(draftId, auto) });
}

function summarizeAngebot(inv: Invoice): string {
  const r = inv.recipient ? [inv.recipient.company, inv.recipient.name, inv.recipient.street, inv.recipient.zipCity].filter(Boolean).join(', ') : '(yok)';
  const lines = inv.items.map(it => `  • ${it.description} — ${it.quantity}× ${formatCents(it.unitPriceCents)}€ = ${formatCents(it.unitPriceCents * it.quantity)}€`).join('\n');
  return [`📋 ANGEBOT #${inv.number}`, `📅 ${inv.date}`, inv.valid_until ? `⏳ Gültig bis: ${inv.valid_until}` : '', `👤 ${r}`, '', 'Kalemler:', lines || '  (yok)', '', `💶 Toplam: ${formatCents(inv.total_cents)}€`, inv.footer_note ? `\n📝 ${inv.footer_note}` : ''].filter(Boolean).join('\n');
}

async function buildAndPreviewAngebot(chatId: number, draft: Invoice): Promise<void> {
  await sendMessage({ chatId, text: '📄 PDF oluşturuluyor…' });
  try {
    const pdf = await renderInvoicePdf(invoiceToData(draft));
    const sent = await sendDocument({ chatId, document: pdf, filename: `Angebot_${draft.number}.pdf`, mime: 'application/pdf', caption: summarizeAngebot(draft).slice(0, 1024) });
    await sendMessage({ chatId, text: 'Şimdi ne yapayım?', replyMarkup: angebotPreviewKeyboard(draft.id) });
    await markPreview(draft.id);
    await updateDraft(draft.id, { telegram_preview_msg_id: sent.message_id });
  } catch (err) { await notifyError(chatId, err); }
}
```

- [ ] **Step 4: Update invoiceToData to include validUntil**

In the existing `invoiceToData` function, add validUntil to the return:
```typescript
return {
  number: inv.number, type: inv.type, date: inv.date,
  validUntil: inv.valid_until ?? undefined,
  recipient: { ... }, items: inv.items, totalCents: inv.total_cents, footerNote: inv.footer_note,
};
```

- [ ] **Step 5: Callback action handlers**

```typescript
async function handleAngebotItemMore(chatId: number, draftId: string): Promise<void> {
  await updateDraft(draftId, { current_step: 'item_description' });
  await sendMessage({ chatId, text: 'Yeni kalemin açıklaması?' });
}

async function handleAngebotNoMoreItems(chatId: number, draftId: string): Promise<void> {
  await moveToAngebotFooterStep(chatId, draftId);
}

async function handleAngebotFooterPreset(chatId: number, draftId: string, key: string): Promise<void> {
  await updateDraft(draftId, { footer_note: ANGEBOT_FOOTER_PRESETS[key] ?? null });
  await moveToAngebotNumberStep(chatId, draftId);
}

async function handleAngebotFooterManual(chatId: number, draftId: string): Promise<void> {
  await updateDraft(draftId, { current_step: 'footer_manual' });
  await sendMessage({ chatId, text: 'Notu yaz (tek satırlık serbest metin):' });
}

async function handleAngebotFooterSkip(chatId: number, draftId: string): Promise<void> {
  await updateDraft(draftId, { footer_note: null });
  await moveToAngebotNumberStep(chatId, draftId);
}

async function handleAngebotNumberAuto(chatId: number, draftId: string): Promise<void> {
  const draft = await getInvoice(draftId); if (!draft) return;
  let fn = await nextAngebotNumber();
  for (let i = 0; i < 5; i++) { const ex = await getAngebotByNumber(fn); if (!ex || ex.id === draft.id) break; fn = await nextAngebotNumber(); }
  const updated = await updateDraft(draftId, { number: fn, current_step: 'confirm' });
  await buildAndPreviewAngebot(chatId, updated);
}

async function handleAngebotNumberManual(chatId: number, draftId: string): Promise<void> {
  await updateDraft(draftId, { current_step: 'number_manual' });
  await sendMessage({ chatId, text: 'Yeni numara? Format: YYYY-AN-NNN\nÖrnek: 2026-AN-051' });
}

async function handleAngebotSave(chatId: number, draftId: string): Promise<void> {
  await markSent(draftId); const d = await getInvoice(draftId);
  await sendMessage({ chatId, text: `💾 Angebot ${d?.number ?? draftId} kaydedildi.` });
}

async function handleAngebotRestart(chatId: number): Promise<void> {
  await cancelActiveDrafts(chatId);
  await handleAngebotCommand(chatId);
}

async function handleAngebotDelete(chatId: number, draftId: string): Promise<void> {
  await markDeleted(draftId); const d = await getInvoice(draftId);
  await sendMessage({ chatId, text: `🗑 ${d?.number ?? draftId} silindi.` });
}

async function handleAngebotSendMail(chatId: number, draftId: string): Promise<void> {
  await handleMailSend(chatId, undefined, draftId);
}

async function handleAngebotConvert(chatId: number, draftId: string): Promise<void> {
  const newNumber = await nextInvoiceNumber();
  const invoice = await convertAngebotToInvoice(draftId, newNumber);
  const angebot = await getInvoice(draftId);
  await sendMessage({ chatId, text: `✅ Angebot #${angebot?.number ?? draftId} → Rechnung #${invoice.number} dönüştürüldü.\n\n/fatura ile devam edebilirsin.` });
}
```

- [ ] **Step 6: Wire routing**

Command dispatch (near `/faturasil` and `/fatura`):
```typescript
if (trimmed === '/angebot') { await handleAngebotCommand(chatId); return; }
```

Text dispatch — BEFORE invoice text handler (around line 3870):
```typescript
if (activeDraft?.type === 'angebot') { const handled = await handleAngebotText(chatId, activeDraft, trimmed); if (handled) return; }
```

Callback routing — modify existing `inv_item_more`/`inv_no_more_items` entries to check draft type:
```typescript
} else if ((action === 'inv_item_more' || action === 'ang_item_more') && postId) {
  const d = await getInvoice(postId);
  if (d?.type === 'angebot') await handleAngebotItemMore(chatId, postId);
  else await handleInvoiceItemMore(chatId, postId);
} else if ((action === 'inv_no_more_items' || action === 'ang_no_more_items') && postId) {
  const d = await getInvoice(postId);
  if (d?.type === 'angebot') await handleAngebotNoMoreItems(chatId, postId);
  else await handleInvoiceNoMoreItems(chatId, postId);
```

Add new angebot-exclusive callback routes:
```typescript
} else if (action === 'ang_fp' && postId) { await handleAngebotFooterPreset(chatId, postId, rest[0] ?? '');
} else if (action === 'ang_footer_manual' && postId) { await handleAngebotFooterManual(chatId, postId);
} else if (action === 'ang_footer_skip' && postId) { await handleAngebotFooterSkip(chatId, postId);
} else if (action === 'ang_number_auto' && postId) { await handleAngebotNumberAuto(chatId, postId);
} else if (action === 'ang_number_manual' && postId) { await handleAngebotNumberManual(chatId, postId);
} else if (action === 'ang_save' && postId) { await handleAngebotSave(chatId, postId);
} else if (action === 'ang_restart') { await handleAngebotRestart(chatId);
} else if (action === 'ang_delete' && postId) { await handleAngebotDelete(chatId, postId);
} else if (action === 'ang_send_mail' && postId) { await handleAngebotSendMail(chatId, postId);
} else if (action === 'ang_convert' && postId) { await handleAngebotConvert(chatId, postId);
```

- [ ] **Step 7: Update handleMailSend for angebot HTML**

In `handleMailSend`, where `wrapInvoiceHtml` is called:
```typescript
const hasPdf = draft.attachments.some((a) => a.filename.endsWith('.pdf'));
const html = hasPdf
  ? invoice.type === 'angebot'
    ? wrapAngebotHtml({ subject: draft.subject, bodyText: draft.body })
    : wrapInvoiceHtml({ subject: draft.subject, bodyText: draft.body })
  : undefined;
```

Update help text:
```typescript
'  /angebot               — adım adım PDF Angebot oluştur, faturaya çevir',
```

- [ ] **Step 8: Commit**

```bash
git add src/app/api/telegram/webhook/[secret]/route.ts
git commit -m "feat: /angebot command — full flow with PDF, email, invoice conversion"
```

---

### Task 8: Build, Deploy & Smoke Test

- [ ] **Step 1: Build**

Run: `pnpm run build`
Expected: No type errors, compiles successfully.

- [ ] **Step 2: Deploy**

Run: `vercel deploy --prod --yes`

- [ ] **Step 3: Smoke test via Telegram**

Send `/angebot` and walk through:
1. Customer name → address → valid_until → items → footer → number → PDF preview
2. Verify PDF: title "ANGEBOT", valid until shown, no §19 UStG, bank info present
3. Test "Faturaya çevir" button → verify new Rechnung created
4. Test "Müşteriye mail at" → verify HTML email with light_steel theme

- [ ] **Step 4: Commit fixes (if any)**

```bash
git add -A && git commit -m "fix: angebot flow fixes from smoke testing"
```
