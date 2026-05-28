# Trend Engine — Faz 1

Minimal "beyin" — günde bir kez Telegram'a 1-3 ürün önerisi gönderir.
Yayın yok, görsel yok, sadece içerik + onay görmek için.

## Yapı

```
src/lib/trend/
  seed-topics.ts    → 25+ tohum konu (date-rotated)
  discovery.ts      → Claude ile gap analizi → NicheCandidate[]
  content.ts        → her niş için Etsy + shop içerik paketi
  orchestrator.ts   → günlük pipeline + Telegram digest formatter

src/app/api/cron/trend-discovery/route.ts
  → GET endpoint, CRON_SECRET ile korunmalı
  → Vercel Cron: her gün 05:00 UTC (vercel.json içinde)

drizzle/migrations/0017_trend_engine.sql
  → niches, products, niche_performance tabloları
```

## .env değişkenleri

```ini
ANTHROPIC_API_KEY=         # var olmalı (zaten var)
CRON_SECRET=               # var olmalı (zaten var)
ALLOWED_TELEGRAM_USER_IDS= # var olmalı (zaten var)

# Yeni (opsiyonel — default'ları var):
DAILY_PRODUCT_CAP=2
TREND_ENGINE_ENABLED=true
```

## Lokal test (Mehmet'in yapacakları)

```bash
# 1) Önce DB migration'ını uygula (sadece bir kez)
cd C:\Users\flyfr\fly-froth-social
pnpm db:migrate

# 2) Dev server'ı başlat
pnpm dev

# 3) Yeni terminal — dry-run (DB'ye yazmaz, sadece çıktıyı görür)
curl "http://localhost:3000/api/cron/trend-discovery?secret=$CRON_SECRET&dry=1"

# 4) Gerçek çalıştırma — DB'ye yazar + Telegram'a digest gönderir
curl "http://localhost:3000/api/cron/trend-discovery?secret=$CRON_SECRET"
```

Beklenen çıktı (lokal):
- Terminal'de JSON yanıt: `{ ok: true, productsCreated: 2, ... }`
- Telegram'da digest mesajı (admin chat ID'lerine)
- DB'de `niches` + `products` tablolarına 2 satır

## Production'da

Vercel Cron her gün 05:00 UTC'de tetikler. `vercel.json`'a eklendi:
```json
{ "path": "/api/cron/trend-discovery?secret=...", "schedule": "0 5 * * *" }
```

Deploy sonrası ilk 3 gün gözle takip edilmeli — Telegram'a digest'ler düzenli gelmeli.

## Maliyet (Faz 1)

Her çalıştırma:
- ~6 Claude call (discovery) × ~1500 token = ~$0.04
- ~2 Claude call (content) × ~3000 token = ~$0.06
- Toplam: **~$0.10/gün ≈ $3/ay**

## Bilinen sınırlar

- Discovery dış API kullanmıyor (Google Trends, Etsy scrape yok) — sadece Claude'un eğitim verisi + seed bank. Faz 2'de gerçek sinyal kaynakları eklenir.
- Görsel + PDF üretimi yok (Faz 2)
- Yayın akışı yok (Faz 3-4)
- Feedback loop yok (Faz 5)

## Test edilmesi gerekenler (manuel)

- [ ] Migration uygulandı, 3 tablo oluştu (`niches`, `products`, `niche_performance`)
- [ ] Dry-run çalışıyor (lokal)
- [ ] Gerçek çalıştırma DB'ye yazıyor (lokal)
- [ ] Telegram digest geliyor
- [ ] Vercel deploy sonrası cron tetiklendiğinde production'da da çalışıyor
- [ ] Üst üste 3 gün düzenli çalışıyor

3 gün sonra çıktılar değerlendirilir → Faz 2'ye geçilir.
