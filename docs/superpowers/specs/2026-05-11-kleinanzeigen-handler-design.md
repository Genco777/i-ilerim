# Kleinanzeigen Auto-Reply Handler — Design Spec

**Date:** 2026-05-11
**Author:** Mehmet Genco + Claude (brainstorming session)
**Status:** Approved, ready for implementation plan
**Project:** fly-froth-social (admin.fly-froth.com)

---

## 1. Goal

Kleinanzeigen alıcı mesajlarını Telegram'da gör, AI yardımıyla cevapla, gönder — hepsi tek bot içinden, otomatik ve user-friendly.

**Hedef kullanıcı:** Tek kişi (Mehmet Genco). Tüm akış Telegram'dan, kod-benzeri input istemeden.

## 2. Background

Mevcut sistem:
- Zoho IMAP inbox notifier 4 klasörü polling ediyor (Inbox, Spam, Newsletter, Notification), `src/lib/mail/`
- Per-folder sentinel ile duplicate notification engelleniyor
- Telegram bot mevcut, `src/lib/telegram/`
- Claude AI entegrasyonu hazır, `src/lib/ai/`
- Iteratif draft refinement pattern (`/mail` komutu) zaten kullanılıyor
- Zoho SMTP gönderim hazır

Kullanıcı Kleinanzeigen hesabının cevap-adresini Zoho hesabına yönlendirdi. Yeni email entegrasyonu **gerekmiyor**.

Kleinanzeigen bildirim mailleri:
- Gönderici formatı: `{routing-token}@mail.kleinanzeigen.de`
- Routing token her konuşma için benzersiz; reply bu adrese gidince Kleinanzeigen alıcıya iletir
- Mail body: alıcı adı + ilan başlığı + alıcı mesajı

## 3. User Experience

### 3.1 Yeni mesaj geldiğinde (Telegram)

```
📩 Logo-Vektorisierung — Jessy
──────────────────────────
"Hi, kannst du mir ein JPG vektorisieren?
Wie lange dauert das? Auch mit Animation?"
──────────────────────────
🏷️ Logo vektörizasyon + animasyon · 🌍 DE · 🗣 du
⚠️ Bilgi boşluğu: "Animation" hizmeti tanımlı değil

[💡 AI öner]   [🤔 3 alternatif]
[✏️ Kendim yaz]   [❌ Reddet]
[🔧 "Animation" konusunu çöz]
```

- Üst: ilan başlığı + alıcı adı
- Orta: alıcının mesajı RAW (kısaltma yok, max 4000 char Telegram limiti)
- Tag satırı: AI ön analizinden gelen konu etiketi + dil + tespit edilen ton
- (Varsa) Knowledge gap uyarısı + ilgili çöz-butonu
- Aksiyon menüsü: 4 ana + (varsa) 1 gap-resolve butonu

### 3.2 💡 AI öner

Bot yeni mesaj üzerine cevap üretir → preview:

```
💡 Önerilen cevap (du · DE):
"Hi Jessy, klar – schick mir das JPG einfach
rüber, dauert max 1-2 Tage. Für Animation
müsste ich dir extra ein Angebot machen,
sag Bescheid was du brauchst!"

[✅ Gönder]   [✏️ Düzenle]
[🔄 Tekrar üret]   [🔙 Geri]
```

- **✅ Gönder:** Zoho SMTP reply, routing-token korunur, state = `sent`
- **✏️ Düzenle:** force_reply → "Geri bildirim ver:" → user yazar ("daha kısa", "fiyat 25€ olsun", "Animation kısmını çıkar") → AI regenerate → preview tekrar
- **🔄 Tekrar üret:** aynı parametrelerle yeniden üret (random variation)
- **🔙 Geri:** ana aksiyon menüsüne dön

### 3.3 🤔 3 alternatif

Bot 3 farklı varyasyon üretir (kısa/orta/detaylı; ya da farklı tonlar):

```
🤔 3 alternatif:

(1) Kısa & rahat:
"Hi Jessy, klar — schick mir das JPG..."

(2) Detaylı + fiyat:
"Hallo Jessy, vielen Dank für deine Anfrage..."

(3) Önce soru sor:
"Hi Jessy, gerne! Kannst du mir noch sagen..."

[1] [2] [3]
[🔙 Geri]
```

Bir varyasyon seçilirse → 3.2 preview ekranına geç (artık bu draft üzerinde işlem).

### 3.4 ✏️ Kendim yaz

```
Bot: ✏️ Cevabını yaz:
[force_reply input]
```

Kullanıcı yazar → preview (3.2 ile aynı format, "Önerilen" yerine "Senin cevabın") → [✅ Gönder] [✏️ Tekrar yaz] [🔙 Geri]

### 3.5 ❌ Reddet

State = `rejected`, cevap gitmez. Telegram'da kısa onay: "❌ Reddedildi"

### 3.6 🔧 Gap çöz (knowledge gap subflow)

Sadece pre-analysis knowledge gap bulduğunda gösterilir.

```
📚 "Animation" hizmeti hakkında bilgin yok.
Ne yapmak istersin?

[✅ Evet sunuyorum]
[❌ Sunmuyorum]
[⏭️ Şimdilik atla]
```

- **✅ Evet sunuyorum:** force_reply → "Detayları yaz (fiyat, süre, örnek, sınırlamalar):" → user yazar → `business_profile_overrides`'a `{topic: "animation", content: "...", origin: "telegram"}` kaydet → "📝 Kaydettim. Cevap önereyim mi?" → 💡 AI öner akışına dön (AI artık bu bilgiyi biliyor)
- **❌ Sunmuyorum:** `{topic: "animation", content: "Bu hizmeti sunmuyoruz, nazikçe yönlendir", origin: "telegram"}` kaydet → 💡 AI öner akışına dön
- **⏭️ Şimdilik atla:** sadece bu thread için flag, kalıcı yazma

## 4. Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Zoho IMAP inbox notifier (mevcut)                        │
│   • polls 4 folders                                      │
│   • per-folder sentinel                                  │
└──────────────────────┬───────────────────────────────────┘
                       │ for each new mail
                       ▼
                ┌──────────────┐
                │ detector.ts  │  sender matches *@mail.kleinanzeigen.de?
                └──────┬───────┘
              no │     │ yes
        (normal  │     │
         flow)   │     ▼
                 │  ┌──────────────────────────────────────┐
                 │  │ Kleinanzeigen handler                │
                 │  │                                      │
                 │  │  1. Parse: buyer name, listing,      │
                 │  │     message body, routing token      │
                 │  │  2. Pre-analyze (Claude):            │
                 │  │     {subject, lang, tone,            │
                 │  │      knowledge_gaps[]}               │
                 │  │  3. INSERT kleinanzeigen_threads     │
                 │  │  4. Send Telegram message + buttons  │
                 │  └──────────────┬───────────────────────┘
                 │                 │
                 │                 ▼
                 │       ┌─────────────────────────┐
                 │       │ Telegram callback router│
                 │       │ (action handlers)       │
                 │       └─────────┬───────────────┘
                 │                 │
                 │   ┌─────────────┼─────────────┬─────────────┐
                 │   ▼             ▼             ▼             ▼
                 │ AI öner    3 alternatif   Kendim yaz   Gap çöz
                 │   │             │             │             │
                 │   └─────────────┴─────────────┴─────────────┘
                 │                 │
                 │                 ▼
                 │       Reply preview + edit loop
                 │                 │
                 │                 ▼
                 │       Zoho SMTP → routing-token@mail.kleinanzeigen.de
                 ▼
              (continues normal inbox processing)
```

## 5. Data Sources

### 5.1 Primary: `https://fly-froth.com/llms.txt`

- Dosya zaten mevcut: `premium-vizyon-projesi-main/public/llms.txt` (43 satır)
- İçerik: hizmetler + fiyatlar + teslim süreleri + iletişim + standorte + kennzahlen
- Bot **1 saatte bir** fetch eder (in-memory cache + `last_fetched_at` zaman damgası)
- Bot startup'ta da fetch eder
- Site update → Netlify deploy → bot max 1h sonra otomatik günceller
- Telegram komutu: `/refresh-profile` → cache'i invalidate eder, anında re-fetch

### 5.2 Override layer: `business_profile_overrides` tablosu

llms.txt'de olmayan veya Telegram'dan eklenen extras:
- Marka sesi notları ("rahat samimi, kurumsal değil")
- Imza ("Liebe Grüße, Mehmet")
- Gap-resolve cevapları
- Spesifik FAQ ("Wenn jemand fragt nach X, antworte mit Y")

Prompt build edilirken llms.txt + overrides birleşir.

### 5.3 Export

Telegram komutu: `/export-overrides` → JSON parçası verir, kullanıcı isterse llms.txt'e ekleyip siteye taşır.

## 6. Data Model

### 6.1 `kleinanzeigen_threads`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `email_message_id` | text unique | IMAP Message-ID header, idempotency |
| `routing_token` | text | local-part of sender, used for reply |
| `buyer_name` | text nullable | extracted from email body |
| `listing_title` | text nullable | extracted from email subject/body |
| `raw_body` | text | plain text of buyer's message |
| `ai_analysis` | jsonb | `{subject, lang, tone, knowledge_gaps: []}` |
| `status` | enum | `new`, `drafting`, `sent`, `rejected` |
| `final_reply` | text nullable | sent cevap (audit için) |
| `telegram_message_id` | bigint nullable | UI update için |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

### 6.2 `business_profile_overrides`

| column | type | notes |
|---|---|---|
| `id` | uuid PK | |
| `topic` | text | normalize: lowercase, slug-like ("animation", "merch-design") |
| `content` | text | user-provided info |
| `kind` | enum | `offered`, `not_offered`, `note`, `tone`, `signature` |
| `origin` | enum | `telegram`, `manual` |
| `created_at` | timestamptz | |

Unique constraint: `(topic, kind)` — aynı topic için aynı kind tek kayıt; yeni override eski override'ı update eder.

## 7. New Files

```
src/lib/kleinanzeigen/
  ├── detector.ts        # isKleinanzeigenMail(from), parseBuyerMessage(body)
  ├── analyzer.ts        # analyzeMessage(text, profile) → AI ön analiz
  ├── profile.ts         # fetchLlmsTxt() + cache + mergeWithOverrides()
  ├── prompts.ts         # ANALYSIS_PROMPT, REPLY_PROMPT, ALTERNATIVES_PROMPT
  ├── telegram-ui.ts     # message builders + inline keyboard builders
  ├── send.ts            # sendReplyViaSmtp(threadId, replyText)
  └── index.ts           # public entry: handleKleinanzeigenMail(mail)

src/app/api/kleinanzeigen/
  └── refresh-profile/route.ts   # /refresh-profile komutu için (opsiyonel; Telegram callback de yeterli)

drizzle/migrations/
  └── 0006_kleinanzeigen.sql     # 2 tablo + enums

scripts/
  └── migrate-kleinanzeigen.ts   # mevcut migrate-invoices.ts pattern
```

Mevcut dosyalar:
- `src/lib/mail/inbox-notifier.ts` (veya benzeri): `if (isKleinanzeigenMail(mail.from)) return handleKleinanzeigenMail(mail);` — 1 satır branch
- `src/app/api/telegram/webhook/route.ts`: callback router'a Kleinanzeigen action handler import + dispatch

## 8. AI Prompts

### 8.1 Pre-analysis (her gelen mailde, ucuz, ~200 token output)

```
Sen Fly & Froth (grafik/web tasarım, Karben/DE) için
Kleinanzeigen mesajlarını analiz eden bir asistansın.

İŞLETME PROFİLİ:
{merged_profile}

ALICININ MESAJI:
{raw_body}

Aşağıdaki JSON'u döndür (sadece JSON, açıklama yok):
{
  "subject": "kısa konu etiketi (max 6 kelime, TR)",
  "lang": "de|en|tr|other",
  "tone_detected": "du|Sie|unknown",
  "knowledge_gaps": [
    "profil bilgilerinde olmayan bir konu sorulmuşsa,
     o konunun kısa slug-ismi (örn. 'animation', '3d-modeling'); yoksa boş array"
  ]
}
```

### 8.2 Reply generation (kullanıcı butona basınca)

```
Sen Fly & Froth (Mehmet Genco) adına Kleinanzeigen'da
alıcılara cevap yazan bir asistansın.

KURALLAR:
- Dil: {detected_lang} (genelde Almanca)
- Hitap: {detected_tone} (du veya Sie, alıcı tonuna uy)
- Stil: rahat, samimi, kurumsal değil. Kleinanzeigen tarzı.
- Uzunluk: 2-5 cümle, fazla değil
- Asla uydurma fiyat verme, profilde varsa kullan
- Profilde olmayan bir hizmet sorulduysa, varsa override
  bilgisini kullan; o da yoksa nazikçe bilgi iste veya
  yönlendir
- İmza: "Liebe Grüße, Mehmet" (override'dan)

İŞLETME PROFİLİ:
{merged_profile}

ALICI: {buyer_name} ({listing_title})
MESAJ: {raw_body}

PRE-ANALİZ: {ai_analysis}

Sadece cevap metnini döndür (giriş cümlesi, açıklama yok).
```

### 8.3 Alternatives (3 varyasyon)

Aynı reply prompt, ek talimat: "3 farklı varyasyon üret, JSON array dön: [{label, text}]. Label'lar: 'Kısa & rahat', 'Detaylı + fiyat', 'Önce soru sor' (veya mesaja uygun başka çeşitlemeler)."

### 8.4 Iteratif refinement

Mevcut `/mail` refinement prompt pattern aynen reuse edilir.

## 9. Caching & Performance

- `llms.txt` cache: in-memory (process-level), 1h TTL
- Vercel serverless cold start'larda yeniden fetch — kabul edilebilir, ücretsiz
- AI pre-analysis: her gelen mailde 1 çağrı, ~200 token output, ucuz
- Reply generation: sadece kullanıcı butona basınca → no waste

## 10. Edge Cases

| Durum | Davranış |
|---|---|
| Aynı mail iki kez gelir (IMAP duplicate) | `email_message_id` unique constraint reddeder |
| Alıcı aynı thread'e ikinci mesaj atar | Yeni `kleinanzeigen_threads` kaydı (yeni Message-ID), kullanıcı geçmiş cevabı manuel hatırlamalı (v2'de thread grouping) |
| llms.txt fetch fail eder | Son başarılı cache kullan; fail >1h ise Telegram'a uyarı "⚠️ Site profili çekilemiyor, eski bilgi kullanılıyor" |
| AI gap detect eder ama kullanıcı 💡 AI öner butonuna direkt basar | AI prompt'a "PROFİLDE EKSIK: {gaps}" bağlamı eklenir, AI nazikçe bilgi ister/yönlendirir |
| Reply gönderiminde SMTP fail | Telegram'a hata mesajı, state `drafting` kalır, "Tekrar dene" butonu |
| Buyer'ın mesajı 4000 char'dan uzun | Telegram'da kısalt + "...(devamı için detay)" notu |

## 11. Out of Scope (v1)

- Thread grouping (aynı routing-token = aynı konuşma; v2)
- Multi-message conversation memory (AI önceki cevapları görmesin v1'de)
- Otomatik cevap (her zaman insan onayı şart)
- Brand Kit++ entegrasyonu (Stage 2'de gelecek, o zaman override layer'ı Brand Kit'e migrate edilir)
- Müşteri CRM (Kleinanzeigen lead → invoice flow direct linki — gelecek)
- Resim / dosya eki (alıcı ek gönderirse v1 sadece "📎 Ek var, manuel kontrol et" uyarısı)

## 12. Open Questions (implementation aşamasında çözülür)

- `mail_drafts` tablosu Kleinanzeigen için reuse edilebilir mi yoksa ayrı tablo şart mı? → Ayrı `kleinanzeigen_threads`; semantik farklı (inbound-driven, routing-token, knowledge gaps).
- Override'lar siteye nasıl taşınır? → v1: `/export-overrides` JSON döker, user manuel ekler. v2: GitHub PR otomasyonu (Stage 3).
