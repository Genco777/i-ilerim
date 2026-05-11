# Fly & Froth — Full Otomatik Sosyal Medya Sistemi

## Özet

Fly & Froth (fly-froth.com) için Telegram üzerinden yönetilen, full otomatik Instagram + Facebook sosyal medya içerik sistemi. Sistem haftalık içerik planı oluşturur, multi-agent görsel pipeline ile premium görseller üretir, Telegram preview sonrası onaylanan postları Meta Graph API üzerinden otomatik yayınlar.

Kullanıcı (Mehmet Genco) sadece Pazartesi sabahı Telegram'a düşen haftalık planı inceler, onaylar veya değişiklik yapar. Tüm görsel üretimi, metin yazımı, zamanlama ve yayınlama otomatiktir.

## Hedef

- Aylık 15.000€+ gelir
- Alman tasarım ajanslarının %95'inden güçlü sosyal medya profili
- Organik müşteri kazanımı
- Sıfır "AI kokan" görüntü — tüm görseller fotogerçekçi ve premium

## Marka Kimliği

- **Ses tonu:** Premium & mesafeli. Az konuşan, çok gösteren. "Wir jagen keine Kunden — sie finden uns."
- **Hedef kitle:** Rhein-Main bölgesindeki tüm işletmeler (sektör sınırlaması yok)
- **Dil:** Almanca (tüm içerik)
- **Görsel kimlik:** Dark premium (#050912 bg + #d4a43a altın vurgu), Outfit + JetBrains Mono font, hizmet bazlı altın tonları

## İçerik Stratejisi: "Dark Luxury" Hibrit

### 4 İçerik Sütunu

| Sütun | Oran | Açıklama |
|-------|------|----------|
| **Vitrine** (Portfolio) | %50 | Yapılan işlerin premium sunumu. Sitenin koyu temasıyla uyumlu. |
| **Prozess** (Süreç) | %20 | Reels ve story'lerde tasarım süreci. "Bu kalite nasıl ortaya çıkıyor?" |
| **Insight** (Otorite) | %20 | Carousel bilgi postları. Tasarım trendleri, tipografi, renk psikolojisi. |
| **Lokal** (Local SEO) | %10 | 19 şehir rotasyonlu lokasyon postları. SEO + SM sinerjisi. |

### Haftalık Takvim (İlk 3 Ay)

| Gün | Feed (18:30) | Story (gün içi) | Reel (12:00) |
|-----|-------------|-----------------|--------------|
| Pazartesi | Carousel — otorite | Sabah + öğlen + akşam (3 parça) | — |
| Salı | Vitrin — iş paylaşımı | Süreç parçaları (4-5) | Tasarım süreci |
| Çarşamba | Carousel — lokasyon | Anket + soru + detay | — |
| Perşembe | Vitrin — iş paylaşımı | Müşteri deneyimi (4-5) | Before/After |
| Cuma | Single — değer postu | Hafta özeti + sahne arkası | — |
| Cumartesi | Vitrin — iş paylaşımı | 1-2 light touch | Trend/Motion |
| Pazar | Carousel — haftanın en iyisi | 1 teaser | — |

**Toplam:** 7 feed post + 3 reel + günlük story

### 3 Ay Sonrası

Feed 5 → 4 post/hafta, reel 3 → 1-2/hafta. Sürdürülebilir premium tempoya geçiş.

## Görsel Pipeline — Full Otomatik

### Araç Seti

| Araç | API | Rol |
|------|-----|-----|
| **FLUX.2 [flex]** | Replicate | Ana motor. 10 referans görsel desteği + tipografi. Marka tutarlılığı. |
| **Recraft V4** | Replicate | Tasarım odaklı işler (logo sunumu, brand board). Vektör çıktı desteği. |
| **OpenAI GPT Image 2** | OpenAI | Tipografi işleri + fallback. Projede zaten mevcut. |
| **Claude** | Anthropic | Görsel brief yazarı. Prompt mühendisliği. İçerik metinleri. |
| **Sharp** | Node.js | Post-processing, renk düzeltme, logo overlay. Projede zaten mevcut. |

### Pipeline Akışı

1. **Claude brief yazar** — Konudan detaylı görsel brief (kompozisyon, ışık, malzeme, açı, atmosfer, referans açıklaması)
2. **FLUX.2 flex** — Brief'i + 10 marka referans görselini alır, fotogerçekçi mockup üretir
3. **Recraft V4** (tasarım işlerinde) — Logo sunumu, brand board tipi içerikler
4. **OpenAI GPT Image 2** (gerekirse) — Tipografi ağırlıklı görsel veya fallback
5. **Sharp** — Renk düzeltme, dark premium tonlama, Fly & Froth logo overlay, export (1080x1080 / 1080x1920)

### Görsel Karar Ağacı

Sistem içerik tipine göre hangi aracı kullanacağına otomatik karar verir:
- Webdesign mockup → FLUX.2 flex
- Logo prezentasyonu → Recraft V4
- Flyer / baskı ürünü → FLUX.2 flex (tipografi modu)
- Otorite postu (grafik/istatistik) → Recraft V4
- Reel kapağı → FLUX.2 flex (9:16)
- Herhangi bir hata → OpenAI fallback

## Telegram Yönetim Sistemi

### Haftalık Akış

1. **Pazartesi 08:00** — Sistem haftalık planı oluşturur, tüm postların görsel + metnini üretir, Telegram'a preview olarak gönderir
2. **Kullanıcı inceler** — Her slot için: metin, hashtag, görsel önizleme
3. **Inline keyboard butonları:**
   - "Alle planen" → Tüm hafta onaylanır, zamanında otomatik yayınlanır
   - "Bearbeiten" → Slot bazında düzenleme modu
   - Her slot için: "Metni değiştir", "Görseli yenile", "Saati değiştir", "Sil"
4. **Onay sonrası** — Sistem cron job ile planlanan saatte Meta Graph API üzerinden yayınlar

### Story Yönetimi

Story'ler için ayrı Telegram komutları:
- Günlük story serisi otomatik oluşturulur
- `/story-heute` → Bugünün story planını göster
- Anket ve soru sticker'ları sistem tarafından önerilir

## Veritabanı Genişletmesi

### Yeni Tablo: content_plans

```sql
content_plans:
  id, calendar_week, year, status (draft/approved/scheduled),
  created_at, approved_at, telegram_chat_id, telegram_message_id
```

### Yeni Tablo: content_slots

```sql
content_slots:
  id, plan_id (FK), day_of_week, time_slot,
  pillar (vitrine/prozess/insight/lokal/reel),
  post_id (FK → posts, nullable),
  status (pending/generated/approved)
```

### posts tablosuna eklenecek sütunlar

```sql
ALTER TABLE posts ADD COLUMN content_pillar TEXT;
ALTER TABLE posts ADD COLUMN calendar_week INTEGER;
ALTER TABLE posts ADD COLUMN channel TEXT DEFAULT 'feed'; -- 'feed' | 'story' | 'reel'
```

## Teknik Uygulama

### Mevcut Altyapı (Korunacak)

- Next.js 16 App Router (`fly-froth-social`)
- PostgreSQL + Drizzle ORM
- Telegram Bot API entegrasyonu
- Meta Graph API (IG + FB publishing)
- Vercel Blob (görsel depolama)
- Brand kit yönetimi
- Kleinanzeigen bot sistemi

### Yeni Eklenecekler

1. **FLUX.2 flex + Recraft V4** — `image-replicate.ts` güncellemesi. Model router eklenecek.
2. **content_plans + content_slots** — Drizzle schema + migration
3. **Haftalık plan generator** — `/haftalik-plan` Telegram komutu
4. **Content calendar query** — DB queries for plan CRUD
5. **Preview renderer** — Telegram'a haftalık takvimi formatlayan modül
6. **Cron job** — GitHub Actions ile planlanmış post'ları yayınlayan endpoint
7. **Referans görsel seti** — Brand kit'e 10 adet referans görsel upload mekanizması
8. **Model decision router** — İçerik tipine göre FLUX/Recraft/OpenAI seçimi

### Ortam Değişkenleri

```env
REPLICATE_API_TOKEN=...    # Mevcut
OPENAI_API_KEY=...          # Mevcut
ANTHROPIC_API_KEY=...       # Mevcut
# Recraft Replicate üzerinden — ayrı token gerekmez
```

## Başarı Metrikleri

- Haftalık post sayısı: 7 feed + 3 reel
- Günlük story etkileşimi: hedef %5+ etkileşim oranı
- Aylık takipçi büyümesi: ilk 3 ay %15+
- Web sitesi tıklamaları: ayda 50+ (bio link + story link)
- Dönüşüm: ayda 3+ organik müşteri (hedef: ~5.000€/müşteri ortalama = 15.000€/ay)

## Proje Konumu

- **Sosyal medya sistemi:** `C:\Users\flyfr\fly-froth-social`
- **Web sitesi (referans):** `C:\Users\flyfr\yeni-site\premium-vizyon-projesi-main`
- **Admin panel:** admin.fly-froth.com
