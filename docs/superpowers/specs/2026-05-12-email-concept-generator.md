# Email Kampanya Konsept Üretici

> **Goal:** Haftalık plandan bağımsız, AI'ın 2 farklı kampanya konsepti önerdiği, kullanıcının seçip özelleştirdiği, profesyonel email pazarlama sistemi.

> **Architecture:** `/email-digest` ve `/email-reactivate` komutları yeni akışa yönlendirilir. Mevcut tema sistemi, wizard cache ve Brevo entegrasyonu korunur. Yeni eklenen: konsept üretim promptu, kampanya geçmişi tablosu (tekrarı önlemek için), portfolyo seçim adımı kaldırılır.

> **Tech Stack:** Next.js 16 API routes, Telegram Bot API, Brevo API v3, Claude API (sonnet-4-6), PostgreSQL (Drizzle ORM)

---

## 1. Yeni Akış

### Digest (`/email-digest`)

```
1. Konsept Önerisi (AI)
   → "🤖 Kampanya konseptleri oluşturuluyor..."
   → 2 farklı konsept buton olarak sunulur
   
2. Konsept Seçimi
   → Kullanıcı birini seçer

3. Tema Seçimi
   → Mevcut tema seçici (Koyu Çelik / Açık Çelik / Koyu Altın)

4. İçerik Önizleme + Düzenleme
   → AI seçilen konsepte göre tam içerik üretir
   → Konu / Giriş / Portfolyo / Kapanış düzenlenebilir

5. Gönderim
   → Test (info@fly-froth.com) → Liste
```

### Reaktivasyon (`/email-reactivate <email> <isim> <proje>`)

```
1. Konsept Önerisi (AI)
   → Müşterinin geçmiş projesi baz alınarak 2 konsept

2. Konsept Seçimi

3. Tema Seçimi

4. İçerik + Düzenleme

5. Gönderim
   → Doğrudan kişiye gönderilir (liste yok)
```

### Outreach

Şimdilik kapsam dışı. Sonra eklenir.

---

## 2. Konsept Üretim Promptu

Claude'a gönderilen system prompt:

```
Sen Fly & Froth için email pazarlama konseptleri üreten bir stratejistsin.

Firma bilgisi:
- Grafik & Webdesign stüdyosu, Karben (Rhein-Main)
- 1000+ proje, 5.0 Google puanı, Festpreisgarantie
- Hizmetler: Webdesign (499€+), Logodesign (79€+), Druckdesign (49€+), 
  Google Business (99€), WhatsApp Business (49€), Online-Terminbuchung (149€)
- USP: Express 24h, tek muhatap, %100 memnuniyet garantisi
- Hedef kitle: Küçük/orta işletmeler, gastronomi, sağlık, el sanatları

Premium tasarım ajanslarının bülten stratejilerini referans al.
Satış odaklı, profesyonel, asla tekrarlama.

Geçmiş kampanyalar (bunları KULLANMA):
[son 10 kampanyanın konu satırı listelenir]

2 FARKLI konsept üret. Her biri:
- Farklı bir açıdan yaklaşsın (örn. biri portfolyo vitrini, diğeri sektörel içgörü)
- Satışa yönlendirsin
- Özgün olsun, genel "tasarım ajansı bülteni" gibi olmasın

JSON formatında dön:
{
  "concepts": [
    {
      "title": "Konsept başlığı (butonda gösterilecek, max 40 karakter)",
      "angle": "Konseptin satış açısı (1 cümle)",
      "subjectLine": "Önerilen konu satırı",
      "introText": "2-3 cümle giriş",
      "closingText": "1 cümle kapanış + CTA",
      "portfolioFocus": ["hangi hizmetler vurgulansın"]
    }
  ]
}
```

---

## 3. Kampanya Geçmişi Tablosu

```sql
CREATE TABLE email_campaigns (
  id SERIAL PRIMARY KEY,
  subject_line TEXT NOT NULL,
  concept_title TEXT NOT NULL,
  campaign_type TEXT NOT NULL, -- 'digest' | 'reactivation'
  theme TEXT NOT NULL,
  content_json JSONB NOT NULL,
  brevo_campaign_id INTEGER,
  recipient_email TEXT, -- sadece reaktivasyon için
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Drizzle schema:
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

---

## 4. Dosya Değişiklikleri

| Dosya | İşlem |
|---|---|
| `src/lib/email/wizard-generate.ts` | Yeni `generateConcepts()` fonksiyonu eklenecek |
| `src/lib/email/wizard-cache.ts` | `WizardState`'e `concepts` ve `selectedConcept` alanları eklenecek |
| `src/lib/db/schema.ts` | `emailCampaigns` tablosu eklenecek |
| `src/lib/db/queries/email-campaigns.ts` | Yeni — geçmiş kaydı ve sorgu fonksiyonları |
| `src/app/api/telegram/webhook/[secret]/route.ts` | `handleEmailDigestCommand` ve `handleEmailReactivationCommand` güncellenecek; konsept seçimi callback'leri eklenecek |

---

## 5. Kapsam

**İçinde:**
- 2 konseptli AI öneri sistemi
- Kampanya geçmişi (tekrarı önleme)
- Digest ve reaktivasyon için yeni akış
- Portfolyo adımının kaldırılması
- Mevcut tema ve gönderim altyapısı korunur

**Dışında:**
- Outreach kampanyası (sonra)
- Görsel üretimi (sonra)
- Rakip sitesi scraping'i
- Blog içeriği
