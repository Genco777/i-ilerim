# Google Ads Integration — Architecture & Operations Reference

> **Tek nokta referans.** Bu özelliği tekrar çalıştırmak / değiştirmek için ilk önce buraya bak.

**Created:** 2026-05-12
**Phase 1 status:** Code complete, awaiting Google Ads account activation.

---

## ⏯ Quick Resume — Buradan Başla

### Şu anki durum
- **Kod:** Phase 1 (Search kampanya tipleri için) bitti. Tüm modüller commit edildi, testler geçiyor, build temiz.
- **OAuth + token:** Hazır. `.env.local` 6 değişkenin hepsiyle dolu.
- **Vercel env:** **Henüz push edilmedi** — Mehmet'in test hesabı aktif olunca bu adım yapılacak.
- **Blocker:** Test hesabı `336-940-5621` "not enabled or deactivated" hatası veriyor (Google Ads tarafında etkinleştirme bekliyor). Veya yeni bir test hesabı oluşturmak gerekiyor.

### Resume sırası (test hesabı aktif olduğunda)

```bash
cd C:\Users\flyfr\fly-froth-social

# 1. Bağlantı doğrulama
pnpm check:google-ads
# beklenen: "✓ Connected to Google Ads" + EUR currency

# 2. Vercel'e env push
pnpm sync:vercel-env

# 3. Production redeploy
vercel --prod

# 4. Telegram'dan test
# Bot'a: /ads new
```

---

## 🏗 Mimari

### Veri akışı

```
Telegram /ads new
   │
   ▼
[ webhook/[secret]/route.ts ]
   │  handleAdsCommand
   ▼
[ ads-drafts (DB) ]  ← wizard state machine
   │  current_step: type → target → budget → copy_review → approval
   │
   ├─► [ ads-copy.ts ] ───► Claude Sonnet 4.6 ─► 5 başlık + 3 açıklama
   │
   ├─► [ keywords.ts ] ──► Claude (25 seed) ──► KeywordPlanIdeaService ──► 15 keyword
   │
   ├─► [ budget-guard.ts ] ── günlük/aylık limit + EUR kontrolü
   │
   ▼
[ ads_preferences (DB) ]  ← singleton limitler
   │
   ▼ Mehmet "Onayla" tıklayınca
   │
[ campaigns.ts → createSearchCampaign ]
   │
   ├─► CampaignBudgetService.create
   ├─► CampaignService.create (status=PAUSED)
   ├─► CampaignCriterionService.create (geo-target DE)
   ├─► AdGroupService.create
   ├─► AdGroupCriterionService.create (keywords)
   ├─► AdGroupAdService.create (Responsive Search Ad)
   │
   ▼
[ ads_campaigns (DB) ]  ← mirror row, google_campaign_id güncellenir
   │
   ▼
"✅ Kampanya oluşturuldu (paused). Google ID: ..."
```

### Dosya haritası

```
fly-froth-social/
├── docs/
│   ├── google-ads-integration.md            ← BU DOSYA
│   └── superpowers/
│       ├── specs/2026-05-12-google-ads-integration-design.md
│       └── plans/2026-05-12-google-ads-integration-phase-1.md
│
├── scripts/
│   ├── check-google-ads.ts                  ← `pnpm check:google-ads`
│   ├── get-refresh-token.ts                 ← `pnpm get:refresh-token` (OAuth flow, one-time)
│   └── sync-vercel-env.ts                   ← `pnpm sync:vercel-env`
│
└── src/
    ├── lib/
    │   ├── google-ads/
    │   │   ├── types.ts                     # CampaignDraft, KeywordSpec, BudgetCheckResult, ...
    │   │   ├── client.ts                    # OAuth + cached Customer factory
    │   │   ├── budget-guard.ts              # checkBudget(draft) → daily/monthly/EUR
    │   │   ├── ads-copy.ts                  # generateAdCopy() Claude → 5 headlines + 3 descriptions
    │   │   ├── keywords.ts                  # generateKeywords() Claude seeds + Google Idea Service
    │   │   ├── campaigns.ts                 # createSearchCampaign / pause / resume
    │   │   └── ad-groups.ts                 # createSearchAdGroupWithKeywords / createResponsiveSearchAd
    │   │
    │   ├── telegram/
    │   │   └── ads-keyboard.ts              # 5 keyboard helpers + nextStep state machine
    │   │
    │   └── db/queries/
    │       ├── ads-preferences.ts           # singleton row (id=1) — limits, defaults
    │       ├── ads-campaigns.ts             # mirror rows + sumActiveDailyBudgetCents
    │       └── ads-drafts.ts                # wizard state, active draft per chat
    │
    └── app/api/telegram/webhook/[secret]/route.ts
        # /ads dispatch, handleAdsCommand, handleAdsTextInput, runAdsGeneration,
        # ads_type/goal/approve/regen/cancel callback handlers, formatAdsPreview
```

---

## 🗄 Veritabanı şeması

3 tablo + 3 enum, hepsi `drizzle/migrations/0010_furry_shiva.sql` migration'da uygulandı.

### `ads_preferences` (singleton, id=1)

| Sütun | Tip | Default | Ne işe yarar |
|---|---|---|---|
| `daily_limit_cents` | int | 5000 (€50) | Tek kampanya günlük üst limit |
| `monthly_limit_cents` | int | 100000 (€1000) | Toplam aylık projeksiyon limiti |
| `default_location_id` | bigint | 2276 | Google geo-target ID (DE) |
| `default_language_code` | text | 'de' | Anahtar kelime + kopya dili |
| `notify_anomaly_threshold_pct` | int | 300 | CPC anomaly alarmı eşiği (Phase 4) |
| `report_chat_id` | bigint | null | Günlük rapor Telegram chat ID |

### `ads_campaigns` (mirror table)

Her oluşturulan kampanya buraya yazılır. `google_campaign_id` API call başarılı olduktan sonra doldurulur (rollback hatası halinde `status='removed'` olur).

Anahtar alanlar: `google_campaign_id`, `name`, `type` (search/pmax/...), `status` (enabled/paused/removed), `daily_budget_cents`, `target_url`, `conversion_action`, `start_date`, `end_date`, `telegram_chat_id`.

### `ads_drafts` (wizard state)

Aktif kampanya sihirbazı durumu. Sohbet başına en fazla 1 satır `('collecting', 'awaiting_approval')` durumunda olabilir.

Anahtar alanlar: `status`, `current_step` (type/target/budget/copy_review/approval), `draft_payload` (jsonb), `generated_copy` (jsonb), `generated_keywords` (jsonb).

### Enums
- `ads_campaign_type`: search, pmax, display, retargeting, local
- `ads_campaign_status`: enabled, paused, removed
- `ads_draft_status`: collecting, awaiting_approval, confirmed, cancelled, failed

---

## 🔐 Environment variables

`.env.local` dosyasında ve Vercel'de **6 anahtarın hepsi olmalı**.

| Anahtar | Nereden gelir | Hassasiyet |
|---|---|---|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | MCC → API Center | Orta (Basic Access aldıktan sonra yüksek) |
| `GOOGLE_ADS_CLIENT_ID` | Cloud Console → Credentials → OAuth client | Düşük |
| `GOOGLE_ADS_CLIENT_SECRET` | Cloud Console → Credentials → OAuth client | **Yüksek** |
| `GOOGLE_ADS_REFRESH_TOKEN` | `pnpm get:refresh-token` ile üretilir | **Çok yüksek** (uzun ömürlü hesap erişimi) |
| `GOOGLE_ADS_CUSTOMER_ID` | MCC altındaki test/gerçek hesabın 10 haneli ID'si (tireler olmadan) | Düşük |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | MCC'nin kendi 10 haneli ID'si (tireler olmadan) | Düşük |

### Şu anki değerler (2026-05-12 itibarıyla)
- `GOOGLE_ADS_CLIENT_ID`: `941904326731-81rc4f2qk0aosp2gpl8k8l2d63948i42.apps.googleusercontent.com`
- `GOOGLE_ADS_CUSTOMER_ID`: `3369405621` (test hesabı — şu an "not enabled")
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID`: `2149016003` (MCC `214-901-6003`)
- `GOOGLE_ADS_DEVELOPER_TOKEN`: `EYNKGqUn6ihozHJ8vEcP2g` (Test Access — chat'te ifşa oldu, rotate edilebilir)
- `GOOGLE_ADS_CLIENT_SECRET`: chat'te ifşa olan `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` — Basic Access alındıktan sonra **mutlaka rotate**
- `GOOGLE_ADS_REFRESH_TOKEN`: chat'te ifşa oldu — gerçek hesaba geçişte **mutlaka yeniden üret** (`pnpm get:refresh-token`)

---

## 🛠 Operasyonel scriptler

### `pnpm check:google-ads`
- `scripts/check-google-ads.ts`
- 6 env var'ı kontrol eder, eksikse exit 1
- Google Ads API'a basit bir `SELECT customer.id...` GAQL sorgusu atar
- Hesap adı, currency, time zone, conversion tracking status'unu yazdırır
- Currency EUR değilse uyarır

### `pnpm get:refresh-token`
- `scripts/get-refresh-token.ts`
- `localhost:8765`'te bir HTTP server açar
- Google OAuth consent URL'yi konsola basar
- Sen URL'yi browser'da açıp "Allow" tıklarsın
- Auth code'u yakalar, refresh token'a çevirir, konsola yazdırır
- **Sen** çıkan token'ı `.env.local`'a ve Vercel'e ekleyeceksin

### `pnpm sync:vercel-env`
- `scripts/sync-vercel-env.ts`
- `.env.local`'daki tüm `GOOGLE_ADS_*` anahtarlarını okur
- Her birini Vercel CLI ile production + preview + development env'lerine push eder
- Var olan değer varsa siler + yeniden ekler
- Vercel CLI'da `genco777` olarak login olmalısın

### `pnpm check:google-ads` örnek başarılı çıktı
```
✓ Connected to Google Ads
  Account: Fly Froth Test
  Currency: EUR
  Time zone: Europe/Berlin
  Conversion tracking: CONVERSION_TRACKING_MANAGED_BY_THIS_CUSTOMER
```

---

## ✅ Setup checklist

### Tamam ✅
- [x] Google Ads API developer token alındı (Test Access)
- [x] Google Cloud project oluşturuldu + Google Ads API enabled
- [x] OAuth 2.0 client (Desktop app) oluşturuldu
- [x] OAuth consent screen yapılandırıldı (External + Testing)
- [x] Test user eklendi (`gencoo111@gmail.com`)
- [x] MCC `214-901-6003` (Fly Froth Yönetici) hazır
- [x] Refresh token alındı
- [x] `.env.local` dolduruldu (6 değişken)
- [x] `google-ads-api@^23.0.0` yüklü
- [x] Phase 1 kod commit edildi (17 task)
- [x] Local tsc + build + lint temiz

### Bekleyen ⏳
- [ ] **Test hesabı `3369405621` aktif olsun** (veya yenisi oluşturulsun) — şu an `not enabled or deactivated` hatası veriyor
- [ ] `pnpm check:google-ads` başarılı olsun
- [ ] `pnpm sync:vercel-env` ile Vercel'e push
- [ ] `vercel --prod` ile redeploy
- [ ] Telegram'dan `/ads new` smoke test
- [ ] **Basic Access için Google'a başvur** (`docs/superpowers/specs/...` veya `Downloads/Fly-Froth-Google-Ads-API-Application.pdf` formundaki içerikle)
- [ ] Basic Access onayı geldiğinde: `GOOGLE_ADS_CLIENT_SECRET` rotate + `GOOGLE_ADS_REFRESH_TOKEN` yeniden üret + gerçek hesap ID'sine geçiş

### Gelecek faz'lara ertelendi
- [ ] Phase 2: Performance Max + Display + Retargeting + Local kampanya tipleri
- [ ] Phase 3: `/ads edit`, daily-report cron, `reports.ts` modülü
- [ ] Phase 4: Anomaly check cron, `/ads limits`, mirror reconciliation cron

---

## 🌐 Dış bağlantılar

| Konu | Link |
|---|---|
| Google Ads | https://ads.google.com |
| MCC ana sayfa | https://ads.google.com/aw/overview |
| Developer token / API Center | https://ads.google.com/aw/apicenter |
| Cloud Console — Credentials (OAuth secret rotate) | https://console.cloud.google.com/apis/credentials |
| Cloud Console — Google Ads API enable | https://console.cloud.google.com/apis/library/googleads.googleapis.com |
| Cloud Console — OAuth consent screen / test users | https://console.cloud.google.com/auth/audience |
| Vercel project env | https://vercel.com/dashboard → fly-froth-social → Settings → Environment Variables |
| OAuth-onaylı uygulamaları gör/sil | https://myaccount.google.com/permissions |
| Google Ads API docs | https://developers.google.com/google-ads/api/docs/start |
| Geo target sabitleri (DE=2276) | https://developers.google.com/google-ads/api/data/geotargets |
| Basic Access başvuru klavuzu | https://developers.google.com/google-ads/api/docs/access-levels |
| Basvuru için hazır PDF (Fly Froth) | `C:\Users\flyfr\Downloads\Fly-Froth-Google-Ads-API-Application.pdf` |

---

## 🐛 Karşılaşılan sorunlar + çözümler

### "API Center yalnızca yönetici hesapları tarafından kullanılabilir"
**Sebep:** Normal Google Ads hesabından API Center'a erişilemez.
**Çözüm:** Ücretsiz Manager Account (MCC) oluşturuldu (`214-901-6003`).

### "Erişim engellendi — fly froth doğrulanmadı (403 access_denied)"
**Sebep:** OAuth consent screen "External + Testing" modunda ve test users listesinde değildin.
**Çözüm:** Cloud Console → OAuth consent screen → Audience → Test users → `gencoo111@gmail.com` eklendi.

### "12 UNIMPLEMENTED: GRPC target method can't be resolved"
**Sebep:** `google-ads-api@17.x` Google Ads API v17 hedefliyordu, v17 ise emekli edilmişti.
**Çözüm:** `pnpm add google-ads-api@latest` → v23.0.0'a yükseltildi.

### "The customer account can't be accessed because it is not yet enabled or has been deactivated"
**Sebep:** Test hesabı `3369405621` API tarafından "not enabled" olarak görünüyor. Muhtemelen:
- Test hesabı doğru tipte oluşturulmamış (MCC alt-hesabı olarak değil)
- Veya oluşturulmuş ama Google tarafında activation pending
**Çözüm yolu:** MCC `214-901-6003` içine girip alt-hesaplar listesini kontrol et. `336-940-5621` orada var mı? Yoksa **yeni** bir test hesabı oluştur (MCC içinde "+ Yeni hesap" → "Test hesabı oluştur" — sıradan hesap değil).

### Windows Node uv async assertion (script crash on exit)
**Sebep:** Node.js'in Windows'ta libuv async handle cleanup bug'ı. `pnpm get:refresh-token` token alındıktan sonra crash etse de **token yazdırıldıktan sonra** crash ediyor, dolayısıyla işlevsel sorun değil.

### Vercel CLI ile env push: değer chat'e yazılmamalı
**Çözüm:** `scripts/sync-vercel-env.ts` `.env.local`'daki değerleri okuyup CLI'a pipe ediyor. Chat'e değer geçmiyor.

---

## 🔁 İleride değişiklik yapmak istersen

### Yeni kampanya tipi eklemek (Phase 2)
- `types.ts` → `AdsCampaignType` zaten 5 tipi tanıyor
- `campaigns.ts` → `createPmaxCampaign`, `createDisplayCampaign`, vb. fonksiyonlar ekle
- Webhook handler `ads_approve` callback'inde `if (p.type !== 'search')` kontrolünü kaldır

### Bütçe limitlerini değiştirmek
- DB'de `ads_preferences` tablosunda `id=1` satırını güncelle
- Veya kod tarafından `updateAdsPreferences({ daily_limit_cents: ... })`

### Yeni keyword dili eklemek
- `keywords.ts` → `langCodeToId` map'ine ekle. Google language constant ID'leri:
  https://developers.google.com/google-ads/api/data/codes-formats#languages

### Daily report cron eklemek (Phase 3)
- `src/app/api/cron/ads-daily-report/route.ts` oluştur
- `vercel.json`'a cron ekle (mevcut cronlar referans olarak `cron/poll-comments`)
- `reports.ts` modülü yaz: GAQL ile yesterday performance çek
- `ads_preferences.report_chat_id`'ya Telegram'a push

---

## 📚 İlgili Spec/Plan Dökümanları
- Tasarım: `docs/superpowers/specs/2026-05-12-google-ads-integration-design.md`
- Implementation plan (17 task): `docs/superpowers/plans/2026-05-12-google-ads-integration-phase-1.md`

---

**Son güncelleme:** 2026-05-12, Phase 1 kod tamamlandı, deployment Mehmet'in test hesabı aktif olunca devam edecek.
