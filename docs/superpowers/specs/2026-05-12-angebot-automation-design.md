# Angebot Automation Design

> **Goal:** Build an /angebot Telegram command that creates professional quote (Angebot) PDFs through the same step-by-step flow as /fatura, with conversion to invoice capability.

**Architecture:** Reuses the existing invoices table, workflow engine, PDF renderer, and email theming infrastructure. Adds `angebot` as a new invoice type alongside the existing rechnung/teilrechnung/schlussrechnung types. Separate numbering series (`2026-AN-050`).

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, PostgreSQL (Neon), @react-pdf/renderer, Telegram Bot API

---

## Database Changes

### invoice_type enum — add `angebot`

```sql
ALTER TYPE invoice_type ADD VALUE 'angebot';
```

### invoice_status enum — add `converted`

```sql
ALTER TYPE invoice_status ADD VALUE 'converted';
```

### invoices table — add columns

```sql
ALTER TABLE invoices ADD COLUMN valid_until TEXT;
ALTER TABLE invoices ADD COLUMN converted_to_invoice_id TEXT;
```

### New partial unique index for Angebot numbering

```sql
CREATE UNIQUE INDEX invoices_number_angebot_unique_active
  ON invoices (number)
  WHERE status NOT IN ('cancelled', 'deleted') AND type = 'angebot';
```

Wait — existing index already covers this because number format differs (`2026-AN-050` vs `2026-050`), so no collision possible. No new index needed.

---

## Numbering System

Format: `YYYY-AN-NNN` (e.g., `2026-AN-050`)

- Separate sequence from invoice numbering
- Starts at 050 per year
- `nextAngebotNumber()` function — same logic as `nextInvoiceNumber()` but regex matches `AN` prefix
- Regex: `/^(\d{4})-AN-(\d{3})$/`

---

## PDF (pdf.tsx)

Reuse `InvoicePdf` component with conditional rendering based on `type === 'angebot'`:

| Element | Rechnung | Angebot |
|---------|----------|---------|
| Title (bigType) | RECHNUNG / TEILRECHNUNG / SCHLUSSRECHNUNG | ANGEBOT |
| Date | "DATUM" | "DATUM" |
| Valid until | — | "GÜLTIG BIS: [date]" |
| Items table | ✓ | ✓ |
| Totals | Zwischensumme + §19 UStG + Gesamtbetrag | Zwischensumme + Gesamtbetrag (no tax line) |
| Bank info | ✓ | ✓ |
| Footer | same | same |

Implementation: Pass `validUntil` as optional field in `InvoiceData`. PDF component checks `type === 'angebot'` to show/hide sections.

---

## Email (angebot-email.ts)

New `wrapAngebotHtml()` function — identical pattern to `wrapInvoiceHtml()` but:
- Subject line from Angebot
- Subtitle: "Fly & Froth · Angebot" instead of "Fly & Froth · Rechnung"
- Same light_steel theme via `baseLayout`

---

## Telegram Command: /angebot

### Flow

```
/angebot
  → "Yeni Angebot"
  → Müşteri adı (like fatura recipient_name)
  → Adres
  → Tarih (DD.MM.YYYY, default: today)
  → Gültig bis (DD.MM.YYYY, default: today + 2 days)
  → Kalem ekleme döngüsü (same as fatura: description → price → quantity → more?)
  → Alt not (presets: "Angebot freibleibend bis zum [date]", vs.)
  → Numara önerisi + onay
  → PDF önizleme
  → Keyboard: [Kaydet] [Mail Gönder] [İptal] [Faturaya Çevir]
```

### States

`collecting` → `preview` → `sent` → `converted` (if turned into invoice)

### Keyboard differences from /fatura

Preview keyboard adds:
- **"Faturaya Çevir"** — creates a new Rechnung from this Angebot

### Conversion logic (handleAngebotConvertToInvoice)

1. Copy recipient, items, total_cents from Angebot
2. Generate new invoice number via `nextInvoiceNumber()`
3. Create new invoice row with type='rechnung', status='collecting'
4. Set Angebot status to 'converted', store new invoice ID in `converted_to_invoice_id`
5. Send message: "✅ Angebot #2026-AN-050 → Rechnung #2026-053 dönüştürüldü."

---

## Files to Touch

| File | Change |
|------|--------|
| `src/lib/db/schema.ts` | Add 'angebot' to invoice_type enum, add 'converted' to invoice_status, add valid_until & converted_to_invoice_id columns |
| `drizzle/migrations/` | New migration for schema changes |
| `src/lib/invoice/types.ts` | Add 'angebot' to InvoiceType, add ANGEBOT to INVOICE_TYPE_LABEL, add validUntil to InvoiceData |
| `src/lib/invoice/numbering.ts` | Add `nextAngebotNumber()` function |
| `src/lib/invoice/pdf.tsx` | Conditional rendering for Angebot (no tax line, show "GÜLTIG BIS") |
| `src/lib/email/angebot-email.ts` | New: `wrapAngebotHtml()` |
| `src/lib/db/queries/invoices.ts` | Add `convertToInvoice()` function |
| `src/app/api/telegram/webhook/[secret]/route.ts` | Add /angebot command, all handler functions, conversion handler, help text |
