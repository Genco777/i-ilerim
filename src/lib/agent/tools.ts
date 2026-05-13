import type { AgentTool, ToolExecutionResult } from './types';

type ToolExecutor = (input: Record<string, unknown>) => Promise<unknown>;

// ── Tool Definitions ──

export const AGENT_TOOLS: AgentTool[] = [
  // ── Business Context ──
  {
    name: 'get_business_profile',
    description:
      'Fly & Froth işletme profili: hizmetler, uzmanlık alanları, çalışma şekli, iletişim. Şirketi tanımak için kullan.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_brand_kit',
    description:
      'Marka kiti: renkler, logo kullanımı, yazı tonu, negatif kelimeler. Tasarım veya içerik işlerinde kullan.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_portfolio',
    description:
      'Fly & Froth portfolyosundaki tüm işleri listeler (logo, flyer, web tasarımı vs). Referans göstermek için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'İsteğe bağlı: arama terimi (örn. "logo", "flyer", "web")' },
      },
      required: [],
    },
  },

  // ── Content & Social ──
  {
    name: 'list_recent_posts',
    description: 'Son sosyal medya gönderilerini listeler. Status: draft, published, scheduled.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Kaç gönderi? Varsayılan 10.' },
        status: { type: 'string', description: 'Filtre: draft, published, scheduled, failed' },
      },
      required: [],
    },
  },
  {
    name: 'get_weekly_plan',
    description: 'Belirli bir hafta için içerik planını getirir. 16 slot (gün/zaman/kategori/konu) içerir.',
    input_schema: {
      type: 'object',
      properties: {
        week: { type: 'string', description: 'Hafta kodu, örn. "2026-W20". Boş bırakılırsa bu hafta.' },
      },
      required: [],
    },
  },
  {
    name: 'generate_post',
    description:
      'Sosyal medya için yeni bir gönderi OLUŞTURUR (AI metin + AI görsel). Konu ver, post veya story üretir.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Gönderi konusu (örn. "Logo tasarımı neden önemlidir?")' },
        channel: { type: 'string', description: "'post' (1:1 kare) veya 'story' (9:16 dikey). Varsayılan: post" },
        pillar: { type: 'string', description: 'İçerik kategorisi: vitrine, prozess, insight, lokal, reel' },
      },
      required: ['topic'],
    },
  },
  {
    name: 'publish_post',
    description: 'Onaylanmış bir gönderiyi Facebook ve/veya Instagram\'da YAYINLAR.',
    input_schema: {
      type: 'object',
      properties: {
        postId: { type: 'string', description: 'Yayınlanacak gönderinin IDsi' },
      },
      required: ['postId'],
    },
  },

  // ── Invoices & Angebot ──
  {
    name: 'list_invoices',
    description: 'Fatura ve angebotları listeler.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: "'rechnung', 'angebot', veya boş (hepsi)" },
        status: { type: 'string', description: "'sent', 'preview', 'collecting', 'cancelled' veya boş" },
        limit: { type: 'number', description: 'Kaç tane? Varsayılan 10.' },
      },
      required: [],
    },
  },
  {
    name: 'get_invoice',
    description: 'Belirli bir fatura veya angebotun tüm detaylarını getirir.',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Fatura/Angebot IDsi' },
      },
      required: ['id'],
    },
  },
  {
    name: 'list_customers',
    description: 'Fatura/Angebot geçmişinden müşteri listesini çıkarır (isim, şirket, email).',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Kaç müşteri? Varsayılan 20.' },
      },
      required: [],
    },
  },

  // ── Communication ──
  {
    name: 'check_inbox',
    description: 'Zoho mail gelen kutusunu kontrol eder. Yeni mailleri gösterir.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Kaç mail? Varsayılan 5.' },
      },
      required: [],
    },
  },
  {
    name: 'send_mail',
    description: 'Email GÖNDERİR. Alıcı, konu ve gövde metni gerekli.',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Alıcı email adresi' },
        subject: { type: 'string', description: 'Email konusu' },
        body: { type: 'string', description: 'Email gövde metni (düz metin)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  {
    name: 'list_kleinanzeigen_threads',
    description: 'Kleinanzeigen (eBay Kleinanzeigen) mesaj geçmişini listeler.',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Kaç thread? Varsayılan 10.' },
        status: { type: 'string', description: "'new', 'sent', 'rejected' veya boş (hepsi)" },
      },
      required: [],
    },
  },
  {
    name: 'generate_kleinanzeigen_reply',
    description: 'Bir Kleinanzeigen mesajı için AI yanıt OLUŞTURUR (henüz göndermez).',
    input_schema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Kleinanzeigen thread IDsi' },
        style: { type: 'string', description: "'short' (kısa), 'detailed' (detaylı), 'question' (soru). Varsayılan: short" },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'send_kleinanzeigen_reply',
    description: 'Onaylanmış bir Kleinanzeigen yanıtını email ile GÖNDERİR.',
    input_schema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Kleinanzeigen thread IDsi' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'list_incoming_messages',
    description: 'Sosyal medyadan gelen mesajları listeler (FB/IG yorum ve DM).',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Kaç mesaj? Varsayılan 10.' },
        status: { type: 'string', description: "'new', 'replied', 'ignored' veya boş" },
        platform: { type: 'string', description: "'fb_comment', 'fb_dm', 'ig_comment', 'ig_dm' veya boş" },
      },
      required: [],
    },
  },
  {
    name: 'draft_social_reply',
    description: 'Sosyal medya mesajına AI yanıt taslağı OLUŞTURUR (henüz göndermez).',
    input_schema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Yanıtlanacak mesajın IDsi' },
      },
      required: ['messageId'],
    },
  },

  // ── Email Marketing ──
  {
    name: 'list_email_lists',
    description: 'Brevo email listelerini ve abone sayılarını gösterir.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'send_email_campaign',
    description: 'Email kampanyası BAŞLATIR (digest, outreach, reactivation).',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', description: "'digest', 'outreach', veya 'reactivation'" },
        city: { type: 'string', description: "Outreach için şehir adı (örn. 'Frankfurt')" },
        email: { type: 'string', description: 'Reaktivasyon için müşteri emaili' },
      },
      required: ['type'],
    },
  },

  // ── Google Ads ──
  {
    name: 'list_ads_campaigns',
    description: 'Google Ads kampanyalarını listeler (durum, bütçe, tıklamalar).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: "'enabled', 'paused', 'removed' veya boş (hepsi)" },
      },
      required: [],
    },
  },
  {
    name: 'get_ads_status',
    description: 'Google Ads özeti: aktif kampanya sayısı, günlük bütçe toplamı, aylık limit kullanımı.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── Design ──
  {
    name: 'generate_image',
    description:
      'AI ile görsel OLUŞTURUR. Logo, flyer, sosyal medya görseli, web banner vs için.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Görsel açıklaması. Detaylı ve İngilizce olursa daha iyi sonuç verir.' },
        style: { type: 'string', description: "'flyer', 'logo', 'social', 'banner', veya boş (genel)" },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'generate_svg',
    description:
      'SVG kodu OLUŞTURUR. Logo, ikon, basit flyer, kartvizit için vektör grafik. Sonuç .svg dosyası olarak kaydedilebilir.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Ne tasarlanacak? (örn. "mavi altıgen logo, içinde FF harfleri")' },
        type: { type: 'string', description: "'logo', 'icon', 'flyer', 'card', veya 'banner'" },
      },
      required: ['description'],
    },
  },

  // ── System ──
  {
    name: 'get_system_status',
    description:
      'Sistem durum özeti: bekleyen faturalar, taslak gönderiler, planlanmış içerikler, okunmamış mesajlar, aktif kampanyalar.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_database_summary',
    description:
      'Veritabanı özeti: toplam fatura sayısı, müşteri sayısı, gönderi sayısı, Kleinanzeigen thread sayısı. İstatistik için kullan.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── Workflows ──
  {
    name: 'run_workflow',
    description:
      'Çok adımlı bir iş akışı başlatır. Mevcut akışlar: new_client_onboarding (yeni müşteri karşılama), invoice_collection (fatura takip zinciri), post_campaign (çok kanallı kampanya), lead_qualification (lead değerlendirme).',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow adı: new_client_onboarding, invoice_collection, post_campaign, lead_qualification' },
        context: { type: 'string', description: 'Opsiyonel: workflow için bağlam bilgisi (JSON string)' },
      },
      required: ['name'],
    },
  },
  {
    name: 'get_workflow_status',
    description: 'Başlatılmış bir workflow\'un durumunu sorgular.',
    input_schema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'Workflow run IDsi' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'cancel_workflow',
    description: 'Çalışan bir workflow\'u iptal eder.',
    input_schema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'İptal edilecek workflow run IDsi' },
      },
      required: ['runId'],
    },
  },

  // ── Auto-Reply Intelligence ──
  {
    name: 'qualify_lead',
    description: 'Gelen bir mesajı analiz eder ve lead sıcaklığını (hot/warm/cold) değerlendirir. Önerilen aksiyonu belirtir.',
    input_schema: {
      type: 'object',
      properties: {
        messageText: { type: 'string', description: 'Analiz edilecek mesaj metni' },
        senderName: { type: 'string', description: 'Gönderenin adı (opsiyonel)' },
      },
      required: ['messageText'],
    },
  },
  {
    name: 'auto_handle_inquiry',
    description:
      'Müşteri sorusunu analiz eder, lead puanlar, uygunsa otomatik yanıt taslağı oluşturur. Sıcak lead ise angebot önerir, soğuk ise Mehmet\'e sorar.',
    input_schema: {
      type: 'object',
      properties: {
        messageId: { type: 'string', description: 'Yanıtlanacak mesajın IDsi (incoming_messages tablosu)' },
      },
      required: ['messageId'],
    },
  },
  {
    name: 'send_follow_up',
    description: 'Belirli bir müşteriye takip maili gönderir.',
    input_schema: {
      type: 'object',
      properties: {
        customerEmail: { type: 'string', description: 'Müşteri email adresi' },
        customerName: { type: 'string', description: 'Müşteri adı' },
        context: { type: 'string', description: 'Takip nedeni (örn. "Angebot 3 gün önce gönderildi, dönüş yok")' },
      },
      required: ['customerEmail', 'context'],
    },
  },
  {
    name: 'create_task',
    description: 'Yapılacaklar listesine yeni bir görev ekler. Takip, hatırlatma, deadline için kullan.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Görev açıklaması' },
        deadline: { type: 'string', description: 'Son tarih (ISO formatında, opsiyonel). Örn. "2026-05-15"' },
        priority: { type: 'string', description: "'high', 'medium', 'low'. Varsayılan: medium" },
      },
      required: ['description'],
    },
  },
  {
    name: 'list_tasks',
    description: 'Bekleyen tüm görevleri listeler.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── Market Intelligence ──
  {
    name: 'web_research',
    description:
      'Web araştırması yapar. Rhein-Main bölgesinde yeni işletmeler, rakip analizi, pazar trendleri için kullan. Sonuçları analiz edip özetler.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Araştırma konusu (örn. "Frankfurt yeni açılan restoranlar", "grafik tasarım fiyatları 2026")' },
        location: { type: 'string', description: 'Opsiyonel: konum filtresi (örn. "Frankfurt", "Rhein-Main")' },
      },
      required: ['query'],
    },
  },
  {
    name: 'scan_market',
    description: 'Pazar taraması yapar: rakip durumu, iç fırsatlar, trend analizi. Haftalık strateji için kullan.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── Cross-Channel Marketing ──
  {
    name: 'launch_campaign',
    description:
      'Çok kanallı kampanya başlatır: Instagram, Facebook, email, Google Ads, Kleinanzeigen. Tek komutla tüm kanallara içerik dağıtır.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Kampanya adı (örn. "Bahar Indirimi 2026")' },
        topic: { type: 'string', description: 'Kampanya konusu / başlığı' },
        text: { type: 'string', description: 'Gönderi / email metni' },
        channels: { type: 'string', description: "Virgülle ayrılmış kanallar: 'instagram,facebook,email,google_ads,kleinanzeigen'" },
        emailListId: { type: 'string', description: 'Opsiyonel: Brevo email listesi IDsi' },
        adBudgetCents: { type: 'number', description: 'Opsiyonel: Google Ads günlük bütçe (cent)' },
      },
      required: ['name', 'topic', 'text', 'channels'],
    },
  },
  {
    name: 'get_customer_360',
    description:
      'Bir müşterinin tüm etkileşimlerini tek görünümde toplar: faturalar, sosyal medya mesajları, Kleinanzeigen threadleri. 360° müşteri profili.',
    input_schema: {
      type: 'object',
      properties: {
        identifier: { type: 'string', description: 'Müşteri emaili veya adı' },
      },
      required: ['identifier'],
    },
  },
  {
    name: 'get_campaign_performance',
    description: 'Son 30 günlük çapraz kanal performans özeti: post, email, ads, ciro.',
    input_schema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Kaç günlük? Varsayılan 30.' },
      },
      required: [],
    },
  },

  // ── Invoice & Payment Automation ──
  {
    name: 'send_invoice_reminder',
    description: 'Ödenmemiş bir fatura için hatırlatma maili gönderir.',
    input_schema: {
      type: 'object',
      properties: {
        invoiceId: { type: 'string', description: 'Fatura IDsi' },
        tone: { type: 'string', description: "'gentle' (ilk hatırlatma), 'firm' (ikinci), 'urgent' (son). Varsayılan: gentle" },
      },
      required: ['invoiceId'],
    },
  },
  {
    name: 'batch_generate_invoices',
    description: 'Toplu fatura oluşturur. "Geçen ayki tüm logo işleri için fatura kes" gibi.',
    input_schema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filtre: "all" (tümü), "monthly" (bu ay), "overdue" (gecikmiş)' },
        type: { type: 'string', description: "'rechnung', 'angebot', 'teilrechnung', 'schlussrechnung'" },
      },
      required: ['filter'],
    },
  },
  {
    name: 'get_revenue_forecast',
    description: 'Aylık ciro tahmini: mevcut işler + geçmiş trend + sezonsallık bazlı.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_service_profitability',
    description: 'Hangi hizmetin daha karlı olduğunu analiz eder: logo, flyer, web, sosyal medya.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_customer_segments',
    description: 'Müşteri segmentlerini analiz eder: VIP, düzenli, tek seferlik, riskli.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },

  // ── Site Management ──
  {
    name: 'update_website_content',
    description: 'fly-froth.com web sitesindeki sayfa içeriğini günceller.',
    input_schema: {
      type: 'object',
      properties: {
        page: { type: 'string', description: "Sayfa: 'home', 'about', 'services', 'contact', 'portfolio'" },
        section: { type: 'string', description: 'Bölüm adı (örn. "hero", "intro", "services-list")' },
        content: { type: 'string', description: 'Yeni içerik (metin veya JSON)' },
      },
      required: ['page', 'section', 'content'],
    },
  },
  {
    name: 'add_portfolio_item',
    description: 'Portfolyoya yeni bir iş ekler.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'İş başlığı (örn. "Logo Design fur Cafe Rose")' },
        description: { type: 'string', description: 'İş açıklaması' },
        category: { type: 'string', description: "'logo', 'flyer', 'web', 'branding', 'social'" },
        imageUrl: { type: 'string', description: 'Görsel URLsi (opsiyonel)' },
      },
      required: ['title', 'description', 'category'],
    },
  },
  {
    name: 'update_contact_info',
    description: 'İletişim bilgilerini günceller (telefon, email, adres).',
    input_schema: {
      type: 'object',
      properties: {
        field: { type: 'string', description: "'phone', 'email', 'address', 'whatsapp'" },
        value: { type: 'string', description: 'Yeni değer' },
      },
      required: ['field', 'value'],
    },
  },
  {
    name: 'upload_image',
    description: 'Portfolyo veya blog icin Vercel Blob uzerine gorsel yukleme talimati verir. Kullaniciya resmi Telegram uzerinden gondermesini soyle.',
    input_schema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Klasor adi: portfolio, blog, general' },
        note: { type: 'string', description: 'Kullaniciya iletilecek not' },
      },
      required: ['folder'],
    },
  },
  {
    name: 'publish_blog_post',
    description: 'fly-froth.com blogunda yeni bir yazı yayınlar.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Blog başlığı' },
        content: { type: 'string', description: 'Blog içeriği (Markdown)' },
        excerpt: { type: 'string', description: 'Özet (1-2 cümle)' },
      },
      required: ['title', 'content'],
    },
  },

  // ── Calendar ──
  {
    name: 'check_availability',
    description: 'Belirtilen günde boş zaman slotlarını gösterir.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Tarih (ISO formatında, opsiyonel). Boş bırakılırsa bugün.' },
      },
      required: [],
    },
  },
  {
    name: 'schedule_appointment',
    description: 'Google Calendar\'da randevu oluşturur.',
    input_schema: {
      type: 'object',
      properties: {
        customerName: { type: 'string', description: 'Müşteri adı' },
        customerEmail: { type: 'string', description: 'Müşteri emaili' },
        date: { type: 'string', description: 'Tarih (ISO formatında, örn. "2026-05-20")' },
        time: { type: 'string', description: 'Saat (örn. "14:00")' },
        duration: { type: 'number', description: 'Süre (dakika). Varsayılan 60.' },
        purpose: { type: 'string', description: 'Görüşme konusu' },
      },
      required: ['customerName', 'date', 'time', 'purpose'],
    },
  },
  {
    name: 'list_appointments',
    description: 'Bugünkü veya belirtilen tarihteki randevuları listeler.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Tarih (ISO formatında). Boş bırakılırsa bugün.' },
      },
      required: [],
    },
  },
  {
    name: 'cancel_appointment',
    description: 'Bir randevuyu iptal eder.',
    input_schema: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Google Calendar event IDsi' },
      },
      required: ['eventId'],
    },
  },
];

// ── Tool Executors ──

async function execGetBusinessProfile(): Promise<unknown> {
  const { loadMergedProfile } = await import('@/lib/kleinanzeigen/profile');
  return { profile: await loadMergedProfile() };
}

async function execGetBrandKit(): Promise<unknown> {
  const { getBrandKit } = await import('@/lib/db/queries/brand-kit');
  const bk = await getBrandKit();
  return {
    colors: bk?.brand_colors ?? [],
    toneGuide: bk?.text_tone_guide ?? '',
    visualStyle: bk?.visual_style_guide ?? '',
    negativeWords: bk?.negative_words ?? [],
  };
}

async function execGetPortfolio(input: Record<string, unknown>): Promise<unknown> {
  const { ALL_PORTFOLIO } = await import('@/lib/content/website-images');
  const filter = typeof input.filter === 'string' ? input.filter.toLowerCase() : null;
  const items = filter
    ? ALL_PORTFOLIO.filter(
        (p) =>
          p.description.toLowerCase().includes(filter) ||
          p.keywords?.some((k) => k.toLowerCase().includes(filter)),
      )
    : ALL_PORTFOLIO;
  return {
    count: items.length,
    items: items.slice(0, 20).map((p) => ({ description: p.description, path: p.path, keywords: p.keywords })),
  };
}

async function execListRecentPosts(input: Record<string, unknown>): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const { posts } = await import('@/lib/db/schema');
  const { desc, eq } = await import('drizzle-orm');
  const limit = typeof input.limit === 'number' ? input.limit : 10;
  // Read all posts ordered by created_at, filter in memory
  const all = await db.select().from(posts).orderBy(desc(posts.created_at)).limit(100);
  const filtered = typeof input.status === 'string'
    ? all.filter((p) => p.status === input.status)
    : all;
  return filtered.slice(0, limit).map((p) => ({
    id: p.id,
    topic: p.topic,
    status: p.status,
    channel: p.channel,
    createdAt: p.created_at,
    publishedAt: p.published_at,
  }));
}

async function execGetWeeklyPlan(input: Record<string, unknown>): Promise<unknown> {
  const { getCurrentWeek } = await import('@/lib/content/generate-plan');
  const { getPlanByWeek, getSlotsByPlan } = await import('@/lib/db/queries/plans');
  const { week, year } = getCurrentWeek();
  const plan = await getPlanByWeek(
    typeof input.week === 'string' ? parseWeekNumber(input.week) : week,
    year,
  );
  if (!plan) return { plan: null, slots: [], message: 'Bu hafta için plan yok.' };
  const slots = await getSlotsByPlan(plan.id);
  return {
    plan: { id: plan.id, week: plan.calendar_week, year: plan.year, status: plan.status },
    slots: slots.map((s) => ({
      day: s.day_of_week,
      time: s.time_slot,
      pillar: s.pillar,
      channel: s.channel,
      topic: s.topic,
      status: s.status,
    })),
    summary: `${plan.calendar_week}. hafta / ${plan.year}: ${slots.filter((s) => s.topic).length}/${slots.length} slot dolu (${plan.status})`,
  };
}

function parseWeekNumber(w: string): number {
  const parts = w.split('-W');
  return parseInt(parts[1] ?? w, 10) || new Date().getFullYear();
}

async function execGeneratePost(input: Record<string, unknown>): Promise<unknown> {
  const { generatePost } = await import('@/lib/content/generate-post');
  const topic = String(input.topic ?? '');
  if (!topic) return { error: 'Konu gerekli.' };
  const result = await generatePost({
    topic,
    channel: input.channel === 'story' ? 'ig_story' : 'post',
    pillar: typeof input.pillar === 'string' ? input.pillar as never : undefined,
  });
  return {
    id: result.id,
    topic: result.topic,
    text: result.text_de,
    hashtags: result.hashtags,
    status: result.status,
    imageUrl: result.final_image_url,
  };
}

async function execPublishPost(input: Record<string, unknown>): Promise<unknown> {
  const { publishPost } = await import('@/lib/meta/publisher');
  const postId = String(input.postId ?? '');
  if (!postId) return { error: 'postId gerekli.' };
  const result = await publishPost(postId);
  return { success: true, ...result };
}

async function execListInvoices(input: Record<string, unknown>): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const { invoices } = await import('@/lib/db/schema');
  const { desc, eq, and, inArray } = await import('drizzle-orm');
  const limit = typeof input.limit === 'number' ? input.limit : 10;
  const conditions = [];
  if (typeof input.type === 'string') conditions.push(eq(invoices.type, input.type as never));
  if (typeof input.status === 'string') conditions.push(eq(invoices.status, input.status as never));
  const query = db.select().from(invoices).orderBy(desc(invoices.created_at)).limit(200);
  const rows = await query;
  const filtered = conditions.length > 0
    ? rows.filter((r) => {
        if (typeof input.type === 'string' && r.type !== input.type) return false;
        if (typeof input.status === 'string' && r.status !== input.status) return false;
        return true;
      })
    : rows;
  return {
    count: filtered.length,
    invoices: filtered.slice(0, limit).map((inv) => ({
      id: inv.id,
      number: inv.number,
      type: inv.type,
      status: inv.status,
      totalCents: inv.total_cents,
      recipientName: (inv.recipient as Record<string, string> | null)?.name ?? '',
      createdAt: inv.created_at,
    })),
  };
}

async function execGetInvoice(input: Record<string, unknown>): Promise<unknown> {
  const { getInvoice } = await import('@/lib/db/queries/invoices');
  const { formatCents, INVOICE_TYPE_LABEL } = await import('@/lib/invoice/types');
  const inv = await getInvoice(String(input.id ?? ''));
  if (!inv) return { error: 'Fatura bulunamadı.' };
  return {
    id: inv.id,
    number: inv.number,
    type: inv.type,
    typeLabel: INVOICE_TYPE_LABEL[inv.type as keyof typeof INVOICE_TYPE_LABEL],
    date: inv.date,
    status: inv.status,
    recipient: inv.recipient,
    items: (inv.items ?? []),
    totalCents: inv.total_cents,
    totalFormatted: `${formatCents(inv.total_cents ?? 0)}€`,
    footerNote: inv.footer_note,
  };
}

async function execListCustomers(input: Record<string, unknown>): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const { invoices } = await import('@/lib/db/schema');
  const { desc, sql } = await import('drizzle-orm');
  const limit = typeof input.limit === 'number' ? input.limit : 20;
  const rows = await db
    .select({
      name: sql<string>`recipient->>'name'`.as('name'),
      company: sql<string>`recipient->>'company'`.as('company'),
      street: sql<string>`recipient->>'street'`.as('street'),
      zipCity: sql<string>`recipient->>'zipCity'`.as('zipCity'),
      email: sql<string>`recipient->>'email'`.as('email'),
      lastInvoice: sql<Date>`max(created_at)`.as('last_invoice'),
      count: sql<number>`count(*)::int`.as('count'),
    })
    .from(invoices)
    .where(sql`recipient->>'name' IS NOT NULL`)
    .groupBy(
      sql`recipient->>'name'`,
      sql`recipient->>'company'`,
      sql`recipient->>'street'`,
      sql`recipient->>'zipCity'`,
      sql`recipient->>'email'`,
    )
    .orderBy(desc(sql`last_invoice`))
    .limit(limit);
  return { count: rows.length, customers: rows };
}

async function execCheckInbox(input: Record<string, unknown>): Promise<unknown> {
  const { getRecentInbox } = await import('@/lib/db/queries/mail-inbox');
  const limit = typeof input.limit === 'number' ? input.limit : 5;
  const messages = await getRecentInbox(limit);
  return {
    count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      from: m.from_email,
      fromName: m.from_name,
      subject: m.subject,
      preview: m.body_preview,
      receivedAt: m.received_at,
    })),
  };
}

async function execSendMail(input: Record<string, unknown>): Promise<unknown> {
  const { sendMail } = await import('@/lib/mail/smtp');
  const { wrapMailHtml } = await import('@/lib/email/mail-html');
  const to = String(input.to ?? '');
  const subject = String(input.subject ?? '');
  const body = String(input.body ?? '');
  if (!to || !subject || !body) return { error: 'to, subject, body gerekli.' };
  const result = await sendMail({
    to,
    subject,
    body,
    html: wrapMailHtml({ subject, bodyText: body }),
  });
  return { success: true, messageId: result.messageId, to, subject };
}

async function execListKleinanzeigenThreads(input: Record<string, unknown>): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const { kleinanzeigenThreads } = await import('@/lib/db/schema');
  const { desc } = await import('drizzle-orm');
  const limit = typeof input.limit === 'number' ? input.limit : 10;
  const rows = await db
    .select()
    .from(kleinanzeigenThreads)
    .orderBy(desc(kleinanzeigenThreads.created_at))
    .limit(200);
  const filtered = typeof input.status === 'string'
    ? rows.filter((r) => r.status === input.status)
    : rows;
  return {
    count: filtered.length,
    threads: filtered.slice(0, limit).map((t) => ({
      id: t.id,
      buyerName: t.buyer_name,
      listingTitle: t.listing_title,
      status: t.status,
      createdAt: t.created_at,
    })),
  };
}

async function execGenerateKleinanzeigenReply(input: Record<string, unknown>): Promise<unknown> {
  const { getThread } = await import('@/lib/db/queries/kleinanzeigen');
  const { generateStyledReply, generateSingleReply } = await import(
    '@/lib/kleinanzeigen/reply'
  );
  const thread = await getThread(String(input.threadId ?? ''));
  if (!thread) return { error: 'Thread bulunamadı.' };
  const style = typeof input.style === 'string' ? input.style : 'short';
  const ctx = {
    buyerName: thread.buyer_name,
    listingTitle: thread.listing_title,
    buyerMessage: thread.raw_body,
    analysis: thread.ai_analysis ?? {
      subject: '',
      lang: 'de',
      tone_detected: 'Sie' as const,
      knowledge_gaps: [] as string[],
    },
  };
  let reply: string;
  if (style === 'detailed' || style === 'question') {
    reply = await generateStyledReply(ctx, style as 'detailed' | 'question');
  } else {
    reply = await generateSingleReply(ctx);
  }
  return { threadId: thread.id, reply };
}

async function execSendKleinanzeigenReply(input: Record<string, unknown>): Promise<unknown> {
  const { getThread } = await import('@/lib/db/queries/kleinanzeigen');
  const { sendKleinanzeigenReply } = await import('@/lib/kleinanzeigen/send');
  const thread = await getThread(String(input.threadId ?? ''));
  if (!thread) return { error: 'Thread bulunamadı.' };
  if (!thread.draft_reply) return { error: 'Önce yanıt oluşturun (generate_kleinanzeigen_reply).' };
  const result = await sendKleinanzeigenReply(thread, thread.draft_reply);
  return { success: true, messageId: result.messageId };
}

async function execListIncomingMessages(input: Record<string, unknown>): Promise<unknown> {
  const { listIncomingMessages } = await import('@/lib/db/queries/messages');
  const limit = typeof input.limit === 'number' ? input.limit : 10;
  const opts: Record<string, unknown> = { limit };
  if (typeof input.status === 'string') opts.status = input.status;
  if (typeof input.platform === 'string') opts.platform = input.platform;
  const messages = await listIncomingMessages(opts as never);
  return {
    count: messages.length,
    messages: messages.map((m) => ({
      id: m.id,
      platform: m.platform,
      senderName: m.sender_name,
      text: m.message_text,
      status: m.status,
      receivedAt: m.received_at,
    })),
  };
}

async function execDraftSocialReply(input: Record<string, unknown>): Promise<unknown> {
  const { getIncomingMessage, updateIncomingMessage } = await import(
    '@/lib/db/queries/messages'
  );
  const { generateReply } = await import('@/lib/ai/reply');
  const { getBrandKit } = await import('@/lib/db/queries/brand-kit');
  const msg = await getIncomingMessage(String(input.messageId ?? ''));
  if (!msg) return { error: 'Mesaj bulunamadı.' };
  const brandKit = await getBrandKit();
  const reply = await generateReply(
    {
      sender_name: msg.sender_name ?? '',
      message_text: msg.message_text ?? '',
      platform: msg.platform ?? 'ig_comment',
    },
    brandKit,
  );
  await updateIncomingMessage(msg.id, { draft_reply: reply, status: 'drafting' });
  return { messageId: msg.id, draftReply: reply };
}

async function execListEmailLists(): Promise<unknown> {
  const { getLists } = await import('@/lib/email/brevo');
  const lists = await getLists();
  return { lists };
}

async function execSendEmailCampaign(input: Record<string, unknown>): Promise<unknown> {
  const campaignType = String(input.type ?? '');
  if (!['digest', 'outreach', 'reactivation'].includes(campaignType)) {
    return { error: "type 'digest', 'outreach', veya 'reactivation' olmalı." };
  }
  return {
    note: `Email kampanyası başlatma (${campaignType}) — bu işlem Telegram üzerinden /email-${campaignType} ile yapılır. Agent üzerinden doğrudan başlatma henüz eklenmedi. Lütfen slash komut kullanın.`,
  };
}

async function execListAdsCampaigns(input: Record<string, unknown>): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const { adsCampaigns } = await import('@/lib/db/schema');
  const { desc } = await import('drizzle-orm');
  const rows = await db.select().from(adsCampaigns).orderBy(desc(adsCampaigns.created_at)).limit(50);
  const filtered = typeof input.status === 'string'
    ? rows.filter((c) => c.status === input.status)
    : rows;
  return {
    count: filtered.length,
    campaigns: filtered.map((c) => ({
      id: c.id,
      googleId: c.google_campaign_id,
      name: c.name,
      type: c.type,
      status: c.status,
      dailyBudgetCents: c.daily_budget_cents,
      createdAt: c.created_at,
    })),
  };
}

async function execGetAdsStatus(): Promise<unknown> {
  const { sumActiveDailyBudgetCents } = await import('@/lib/db/queries/ads-campaigns');
  const totalDailyCents = await sumActiveDailyBudgetCents();
  return {
    activeDailyBudgetEuros: `${((totalDailyCents ?? 0) / 100).toFixed(2)}€`,
    monthlyLimit: 'Bütçe limiti adsPreferences tablosundan kontrol edilmeli.',
  };
}

async function execGenerateImage(input: Record<string, unknown>): Promise<unknown> {
  const prompt = String(input.prompt ?? '');
  if (!prompt) return { error: 'prompt gerekli.' };
  const style = typeof input.style === 'string' ? input.style : 'social';
  const { generateImage } = await import('@/lib/ai/image');
  const result = await generateImage(prompt, {
    aspectRatio: (style === 'story' ? '9:16' : '1:1') as '1:1' | '9:16' | '16:9' | '4:5',
  });
  return {
    success: true,
    provider: result.provider,
    imageSizeKb: Math.round(result.buffer.length / 1024),
    style,
    note: 'Görsel oluşturuldu (buffer). SVG/vektör için generate_svg toolunu kullan.',
  };
}

async function execGenerateSvg(input: Record<string, unknown>): Promise<unknown> {
  const description = String(input.description ?? '');
  if (!description) return { error: 'description gerekli.' };
  const designType = String(input.type ?? 'logo');
  // Return the SVG generation request context — Claude itself can generate SVG code
  // since it knows SVG syntax natively. The tool returns a prompt that tells Claude
  // to generate the SVG inline in its response.
  return {
    instruction:
      `Kullanıcı ${designType} istedi: "${description}". Lütfen yanıtında GEÇERLİ bir SVG kodu üret. SVG şu kurallara uymalı:\n` +
      `- viewBox kullan, responsive olsun\n` +
      `- Fly & Froth renkleri: #0e1626 (lacivert), beyaz, altın #c9a96e\n` +
      `- Profesyonel ve modern tasarım\n` +
      `- SVG kodunu \`\`\`svg ... \`\`\` bloğu içinde ver\n` +
      `- Dosya olarak kaydedilebilmesi için SVG'yi ayrıca düz metin olarak da yaz (render için değil, kaydet için)`,
    designType,
  };
}

async function execGetSystemStatus(): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const { invoices, posts, incomingMessages, kleinanzeigenThreads, contentPlans, adsCampaigns } =
    await import('@/lib/db/schema');
  const { eq, and, inArray, sql } = await import('drizzle-orm');

  const [pendingInvoices, draftPosts, unreadMessages, activeKzThreads, currentPlan, activeAdCampaigns] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(inArray(invoices.status, ['collecting', 'preview'])),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(posts)
        .where(eq(posts.status, 'draft')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(incomingMessages)
        .where(eq(incomingMessages.status, 'new')),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(kleinanzeigenThreads)
        .where(
          inArray(kleinanzeigenThreads.status, ['new', 'awaiting_action', 'drafting']),
        ),
      db
        .select({ week: contentPlans.calendar_week, status: contentPlans.status })
        .from(contentPlans)
        .orderBy(sql`created_at DESC`)
        .limit(1),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(adsCampaigns)
        .where(eq(adsCampaigns.status, 'enabled')),
    ]);

  return {
    pendingInvoices: pendingInvoices[0]?.count ?? 0,
    draftPosts: draftPosts[0]?.count ?? 0,
    unreadMessages: unreadMessages[0]?.count ?? 0,
    activeKleinanzeigenThreads: activeKzThreads[0]?.count ?? 0,
    currentPlan: currentPlan[0] ?? null,
    activeAdCampaigns: activeAdCampaigns[0]?.count ?? 0,
    summary: [
      `${pendingInvoices[0]?.count ?? 0} bekleyen fatura/angebot`,
      `${draftPosts[0]?.count ?? 0} taslak gönderi`,
      `${unreadMessages[0]?.count ?? 0} okunmamış mesaj`,
      `${activeKzThreads[0]?.count ?? 0} aktif Kleinanzeigen thread`,
      `${activeAdCampaigns[0]?.count ?? 0} aktif reklam kampanyası`,
    ].join(' • '),
  };
}

async function execGetDatabaseSummary(): Promise<unknown> {
  const { db } = await import('@/lib/db');
  const {
    invoices,
    posts,
    kleinanzeigenThreads,
    incomingMessages,
    adsCampaigns,
    emailCampaigns,
  } = await import('@/lib/db/schema');
  const { sql } = await import('drizzle-orm');

  const [invoiceCount, postCount, kzCount, msgCount, adCount, emailCount, sentInvoiceCount] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(invoices),
      db.select({ count: sql<number>`count(*)::int` }).from(posts),
      db.select({ count: sql<number>`count(*)::int` }).from(kleinanzeigenThreads),
      db.select({ count: sql<number>`count(*)::int` }).from(incomingMessages),
      db.select({ count: sql<number>`count(*)::int` }).from(adsCampaigns),
      db.select({ count: sql<number>`count(*)::int` }).from(emailCampaigns),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(invoices)
        .where(sql`status = 'sent'`),
    ]);

  const uniqueCustomers = await db.execute(
    sql`SELECT COUNT(DISTINCT recipient->>'name') as cnt FROM invoices WHERE recipient->>'name' IS NOT NULL`,
  );

  return {
    totalInvoices: invoiceCount[0]?.count ?? 0,
    sentInvoices: sentInvoiceCount[0]?.count ?? 0,
    uniqueCustomers: (uniqueCustomers.rows[0] as Record<string, number> | undefined)?.cnt ?? 0,
    totalPosts: postCount[0]?.count ?? 0,
    kleinanzeigenThreads: kzCount[0]?.count ?? 0,
    incomingMessages: msgCount[0]?.count ?? 0,
    adsCampaigns: adCount[0]?.count ?? 0,
    emailCampaigns: emailCount[0]?.count ?? 0,
    summary: `Toplam: ${invoiceCount[0]?.count ?? 0} fatura, ${postCount[0]?.count ?? 0} gönderi, ${(uniqueCustomers.rows[0] as Record<string, number> | undefined)?.cnt ?? 0} müşteri`,
  };
}

async function execRunWorkflow(input: Record<string, unknown>): Promise<unknown> {
  const { startWorkflow, WORKFLOWS } = await import('@/lib/agent/workflows');
  const name = String(input.name ?? '');
  if (!WORKFLOWS[name]) {
    return { error: `Bilinmeyen workflow: ${name}. Mevcut: ${Object.keys(WORKFLOWS).join(', ')}` };
  }
  let context: Record<string, unknown> | undefined;
  if (typeof input.context === 'string' && input.context) {
    try { context = JSON.parse(input.context); } catch { context = { raw: input.context }; }
  }
  const run = startWorkflow(name, context);
  const step = run.steps[0];
  if (step) step.status = 'running';
  return {
    runId: run.id,
    workflow: run.workflowName,
    status: run.status,
    totalSteps: run.totalSteps,
    currentStep: step ? { index: step.index, tool: step.tool, purpose: step.purpose } : null,
    message: step ? `"${name}" workflow'u başlatıldı. İlk adım: ${step.tool} — ${step.purpose}` : `"${name}" workflow'u başlatıldı.`,
  };
}

async function execGetWorkflowStatus(input: Record<string, unknown>): Promise<unknown> {
  const { getWorkflowRun } = await import('@/lib/agent/workflows');
  const run = getWorkflowRun(String(input.runId ?? ''));
  if (!run) return { error: 'Workflow bulunamadı.' };
  return {
    runId: run.id,
    workflow: run.workflowName,
    status: run.status,
    currentStep: run.currentStep,
    totalSteps: run.totalSteps,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    steps: run.steps.map((s) => ({
      tool: s.tool,
      purpose: s.purpose,
      status: s.status,
      error: s.error,
    })),
  };
}

async function execCancelWorkflow(input: Record<string, unknown>): Promise<unknown> {
  const { cancelWorkflow } = await import('@/lib/agent/workflows');
  const ok = cancelWorkflow(String(input.runId ?? ''));
  return { success: ok, message: ok ? 'Workflow iptal edildi.' : 'Workflow bulunamadı veya zaten tamamlanmış.' };
}

async function execQualifyLead(input: Record<string, unknown>): Promise<unknown> {
  const { qualifyLead } = await import('@/lib/agent/workflows');
  return qualifyLead(
    String(input.messageText ?? ''),
    typeof input.senderName === 'string' ? input.senderName : undefined,
  );
}

async function execAutoHandleInquiry(input: Record<string, unknown>): Promise<unknown> {
  const { getIncomingMessage, updateIncomingMessage } = await import('@/lib/db/queries/messages');
  const { qualifyLead } = await import('@/lib/agent/workflows');
  const { getBrandKit } = await import('@/lib/db/queries/brand-kit');
  const { generateReply } = await import('@/lib/ai/reply');

  const msgId = String(input.messageId ?? '');
  const msg = await getIncomingMessage(msgId);
  if (!msg) return { error: 'Mesaj bulunamadı.' };

  const text = msg.message_text ?? '';
  const sender = msg.sender_name ?? '';

  const lead = await qualifyLead(text, sender);
  const brandKit = await getBrandKit();

  const result: Record<string, unknown> = {
    messageId: msg.id,
    senderName: sender,
    platform: msg.platform,
    leadQualification: lead,
  };

  if (lead.score === 'cold') {
    result.action = 'skip';
    result.note = 'Soğuk lead — otomatik yanıt önerilmez. Mehmet manuel karar versin.';
    return result;
  }

  const reply = await generateReply(
    { sender_name: sender, message_text: text, platform: msg.platform ?? 'ig_comment' },
    brandKit,
  );

  await updateIncomingMessage(msg.id, { draft_reply: reply, status: 'drafting' });

  result.action = lead.score === 'hot' ? 'draft_and_suggest_angebot' : 'draft_reply';
  result.draftReply = reply;
  result.recommendation = lead.score === 'hot'
    ? 'Sıcak lead — angebot oluşturmayı teklif et.'
    : 'Ilık lead — bilgilendirici yanıt ver, takip et.';

  return result;
}

async function execSendFollowUp(input: Record<string, unknown>): Promise<unknown> {
  const { sendMail } = await import('@/lib/mail/smtp');
  const { wrapMailHtml } = await import('@/lib/email/mail-html');
  const to = String(input.customerEmail ?? '');
  const customerName = typeof input.customerName === 'string' ? input.customerName : '';
  const context = String(input.context ?? '');
  if (!to || !context) return { error: 'customerEmail ve context gerekli.' };

  const greeting = customerName ? `Hallo ${customerName}` : 'Hallo';
  const subject = `Follow-Up: Fly & Froth — ${context.slice(0, 60)}`;
  const body = `${greeting},\n\n${context}\n\nBei Fragen stehe ich gerne zur Verfügung.\n\nMit freundlichen Grüßen\nMehmet Genco\nFly & Froth Design`;

  const result = await sendMail({ to, subject, body, html: wrapMailHtml({ subject, bodyText: body }) });
  return { success: true, messageId: result.messageId, to, subject };
}

async function execCreateTask(input: Record<string, unknown>): Promise<unknown> {
  const { createTask } = await import('@/lib/agent/workflows');
  return createTask(
    String(input.description ?? ''),
    typeof input.deadline === 'string' ? input.deadline : undefined,
    typeof input.priority === 'string' ? input.priority : undefined,
  );
}

async function execListTasks(): Promise<unknown> {
  const { listTasks } = await import('@/lib/agent/workflows');
  const tasks = listTasks();
  return { count: tasks.length, tasks };
}

async function execWebResearch(input: Record<string, unknown>): Promise<unknown> {
  const query = String(input.query ?? '');
  if (!query) return { error: 'query gerekli.' };
  const location = typeof input.location === 'string' ? input.location : 'Rhein-Main';

  try {
    const searchUrl = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(`${query} ${location}`)}`;
    const response = await fetch(searchUrl, {
      signal: AbortSignal.timeout(12000),
      headers: { 'User-Agent': 'FlyFroth-MarketResearch/1.0' },
    });

    if (!response.ok) {
      return {
        query,
        location,
        results: [],
        note: 'Web aramasi basarisiz oldu.',
        suggestion: `${query} hakkinda Google\'da arama yapin.`,
      };
    }

    const html = await response.text();
    const linkPattern = /<a[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/gi;
    const results: Array<{ title: string; url: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = linkPattern.exec(html)) !== null) {
      const url = match[1] ?? '';
      const title = match[2] ?? '';
      if (url.startsWith('//') || url.includes('duckduckgo.com')) continue;
      results.push({ title: title.trim(), url: url.startsWith('http') ? url : `https:${url}` });
    }

    return {
      query,
      location,
      resultCount: results.length,
      results: results.slice(0, 10),
      note: 'Otomatik web aramasi sonuclari.',
    };
  } catch {
    return { query, location, results: [], note: 'Web aramasi zaman asimina ugradi.' };
  }
}

async function execScanMarket(): Promise<unknown> {
  const { checkCompetitors } = await import('@/lib/market/competitor-monitor');
  const { scanInternalOpportunities, detectMarketTrends } = await import('@/lib/market/opportunity-scanner');

  const [competitors, opportunities, trends] = await Promise.all([
    checkCompetitors(),
    scanInternalOpportunities(),
    detectMarketTrends(),
  ]);

  return {
    competitors: competitors.map((c) => ({ name: c.name, city: c.city, status: c.status })),
    opportunities: opportunities.map((o) => ({
      title: o.title,
      description: o.description,
      potentialValue: o.potentialValue,
      actionItems: o.actionItems,
    })),
    trends: trends.map((t) => ({
      category: t.category,
      trend: t.trend,
      evidence: t.evidence,
      recommendedAction: t.recommendedAction,
    })),
    scannedAt: new Date().toISOString(),
  };
}

async function execLaunchCampaign(input: Record<string, unknown>): Promise<unknown> {
  const { launchCrossChannelCampaign } = await import('@/lib/marketing/cross-channel');
  const channelsStr = String(input.channels ?? '');
  const channels = channelsStr.split(',').map((c) => c.trim()).filter(Boolean);

  if (channels.length === 0) return { error: 'channels gerekli. Örn: "instagram,facebook,email"' };

  const campaign = await launchCrossChannelCampaign({
    name: String(input.name ?? ''),
    topic: String(input.topic ?? ''),
    text: String(input.text ?? ''),
    channels,
    emailListId: typeof input.emailListId === 'string' ? input.emailListId : undefined,
    adBudgetCents: typeof input.adBudgetCents === 'number' ? input.adBudgetCents : undefined,
  });

  return {
    campaignId: campaign.id,
    name: campaign.name,
    status: campaign.status,
    channels: campaign.channels,
    results: campaign.results.map((r) => ({
      channel: r.channel,
      status: r.status,
      details: r.details,
    })),
  };
}

async function execGetCustomer360(input: Record<string, unknown>): Promise<unknown> {
  const { getCustomer360 } = await import('@/lib/db/queries/customer-360');
  const identifier = String(input.identifier ?? '');
  if (!identifier) return { error: 'identifier gerekli (email veya isim).' };

  const customer = await getCustomer360(identifier);
  if (!customer) return { error: `"${identifier}" için müşteri bulunamadı.` };

  return {
    name: customer.name,
    company: customer.company,
    email: customer.email,
    phone: customer.phone,
    source: customer.source,
    status: customer.status,
    totalRevenue: `${(customer.totalRevenue / 100).toFixed(2)}€`,
    invoiceCount: customer.invoiceCount,
    firstContact: customer.firstContact,
    lastContact: customer.lastContact,
    recentInvoices: customer.invoices.slice(0, 5).map((i) => ({
      number: i.number,
      type: i.type,
      status: i.status,
      total: `${(i.totalCents / 100).toFixed(2)}€`,
      date: i.date,
    })),
    recentInteractions: customer.interactions.slice(0, 10).map((ix) => ({
      type: ix.type,
      date: ix.date,
      details: ix.details,
    })),
  };
}

async function execGetCampaignPerformance(input: Record<string, unknown>): Promise<unknown> {
  const { getCampaignPerformance } = await import('@/lib/marketing/cross-channel');
  const days = typeof input.days === 'number' ? input.days : 30;

  const perf = await getCampaignPerformance(days);

  return {
    period: `Son ${days} gün`,
    posts: perf.posts,
    email: perf.email,
    ads: {
      active: perf.ads.active,
      totalDailyBudget: `${(perf.ads.totalDailyBudget / 100).toFixed(2)}€`,
    },
    revenue: {
      invoiceCount: perf.revenue.invoiceCount,
      total: `${(perf.revenue.total / 100).toFixed(2)}€`,
    },
    summary: [
      `${perf.posts.published} gonderi yayinlandi`,
      `${perf.email.campaigns} email kampanyasi`,
      `${perf.ads.active} aktif reklam`,
      `${(perf.revenue.total / 100).toFixed(2)}€ ciro (${perf.revenue.invoiceCount} fatura)`,
    ].join(' // '),
  };
}

async function execSendInvoiceReminder(input: Record<string, unknown>): Promise<unknown> {
  const { getInvoice } = await import('@/lib/db/queries/invoices');
  const { sendMail } = await import('@/lib/mail/smtp');
  const { wrapMailHtml } = await import('@/lib/email/mail-html');

  const inv = await getInvoice(String(input.invoiceId ?? ''));
  if (!inv) return { error: 'Fatura bulunamadi.' };

  const tone = typeof input.tone === 'string' ? input.tone : 'gentle';
  const recipient = inv.recipient as Record<string, string> | null;
  const name = recipient?.name ?? 'Kunde';
  const email = recipient?.email ?? '';
  const total = `${((inv.total_cents ?? 0) / 100).toFixed(2)}€`;

  if (!email) return { error: 'Faturada email bulunamadi.' };

  const subjects: Record<string, string> = {
    gentle: `Erinnerung: Rechnung ${inv.number} — Fly & Froth`,
    firm: `2. Mahnung: Rechnung ${inv.number} — Fly & Froth`,
    urgent: `Letzte Mahnung: Rechnung ${inv.number} — Fly & Froth`,
  };

  const bodies: Record<string, string> = {
    gentle: `Hallo ${name},\n\nich moechte freundlich an die Rechnung ${inv.number} ueber ${total} erinnern.\n\nFalls die Zahlung bereits erfolgt ist, betrachten Sie diese E-Mail als gegenstandslos.\n\nMit freundlichen Gruessen\nMehmet Genco\nFly & Froth Design`,
    firm: `Hallo ${name},\n\nleider ist die Rechnung ${inv.number} ueber ${total} weiterhin offen. Bitte ueberweisen Sie den Betrag innerhalb der naechsten 7 Tage.\n\nBei Fragen stehe ich gerne zur Verfuegung.\n\nMit freundlichen Gruessen\nMehmet Genco\nFly & Froth Design`,
    urgent: `Hallo ${name},\n\ndies ist die letzte Mahnung fuer die Rechnung ${inv.number} ueber ${total}. Bitte ueberweisen Sie den Betrag umgehend, sonst muss ich rechtliche Schritte einleiten.\n\nMit freundlichen Gruessen\nMehmet Genco\nFly & Froth Design`,
  };

  const subject = subjects[tone] ?? subjects.gentle!;
  const body = bodies[tone] ?? bodies.gentle!;

  const result = await sendMail({ to: email, subject: subject!, body: body!, html: wrapMailHtml({ subject: subject!, bodyText: body! }) });

  return {
    success: true,
    messageId: result.messageId,
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    to: email,
    tone,
  };
}

async function execBatchGenerateInvoices(input: Record<string, unknown>): Promise<unknown> {
  const filter = String(input.filter ?? 'all');

  return {
    note: `Toplu fatura olusturma (${filter}) — bu islem su anda desteklenmiyor. Her fatura ayri ayri /fatura komutu ile olusturulmalidir.`,
    suggestion: 'Tek tek fatura olusturmak icin /fatura komutunu kullanin.',
  };
}

async function execGetRevenueForecast(): Promise<unknown> {
  const { forecastMonthlyRevenue } = await import('@/lib/analytics/forecasting');
  const forecast = await forecastMonthlyRevenue();

  return {
    conservative: `${(forecast.conservative / 100).toFixed(0)}€`,
    expected: `${(forecast.expected / 100).toFixed(0)}€`,
    optimistic: `${(forecast.optimistic / 100).toFixed(0)}€`,
    confidence: `${(forecast.confidence * 100).toFixed(0)}%`,
    drivers: forecast.drivers,
    risks: forecast.risks,
    monthlyTrend: forecast.monthlyTrend.map((m) => ({
      month: m.month,
      revenue: `${(m.revenue / 100).toFixed(0)}€`,
      invoices: m.invoices,
    })),
    summary: `Bu ay beklenen: ${(forecast.expected / 100).toFixed(0)}€ (min: ${(forecast.conservative / 100).toFixed(0)}€, max: ${(forecast.optimistic / 100).toFixed(0)}€)`,
  };
}

async function execGetServiceProfitability(): Promise<unknown> {
  const { analyzeServiceProfitability } = await import('@/lib/analytics/forecasting');
  const services = await analyzeServiceProfitability();

  return {
    services: services.map((s) => ({
      category: s.category,
      invoiceCount: s.invoiceCount,
      totalRevenue: `${(s.totalRevenue / 100).toFixed(2)}€`,
      avgInvoice: `${(s.avgInvoice / 100).toFixed(2)}€`,
      pctOfTotal: `${s.pctOfTotal}%`,
    })),
    mostProfitable: services[0]?.category ?? 'Veri yok',
    recommendation: services[0]
      ? `${services[0].category} en kârli hizmet (${services[0].pctOfTotal}% ciro). Bu alana odaklan.`
      : 'Yeterli veri yok.',
  };
}

async function execGetCustomerSegments(): Promise<unknown> {
  const { segmentCustomers } = await import('@/lib/analytics/forecasting');
  const segments = await segmentCustomers();

  return {
    segments: segments.map((s) => ({
      segment: s.segment,
      count: s.count,
      avgRevenue: `${(s.avgRevenue / 100).toFixed(2)}€`,
      totalRevenue: `${(s.totalRevenue / 100).toFixed(2)}€`,
    })),
    totalCustomers: segments.reduce((sum, s) => sum + s.count, 0),
    vipRatio: segments.length > 0
      ? `${((segments.find((s) => s.segment === 'VIP')?.count ?? 0) / Math.max(1, segments.reduce((sum, s) => sum + s.count, 0)) * 100).toFixed(0)}%`
      : '0%',
  };
}

async function execUpdateWebsiteContent(input: Record<string, unknown>): Promise<unknown> {
  const section = typeof input.section === 'string' ? input.section : null;
  const title = typeof input.title === 'string' ? input.title : undefined;
  const body = typeof input.body === 'string' ? input.body : undefined;
  if (!section) return { error: 'section gerekli (hero, about, contact, footer vb.)' };

  const { upsertSiteSection } = await import('@/lib/db/queries/site-content');
  await upsertSiteSection(section, { title, body });
  return {
    ok: true,
    section,
    message: `${section} bolumu guncellendi. Degisiklikler fly-froth.com'da canli.`,
  };
}

async function execAddPortfolioItem(input: Record<string, unknown>): Promise<unknown> {
  const title = typeof input.title === 'string' ? input.title : null;
  if (!title) return { error: 'title gerekli' };

  const { addPortfolioItem } = await import('@/lib/db/queries/site-content');
  const item = await addPortfolioItem({
    title,
    description: typeof input.description === 'string' ? input.description : undefined,
    image_url: typeof input.image_url === 'string' ? input.image_url : undefined,
    category: typeof input.category === 'string' ? input.category : undefined,
    sort_order: typeof input.sort_order === 'number' ? input.sort_order : undefined,
  });
  return {
    ok: true,
    item,
    message: `"${title}" portfolyoya eklendi.`,
  };
}

async function execUpdateContactInfo(input: Record<string, unknown>): Promise<unknown> {
  const { upsertSiteSection } = await import('@/lib/db/queries/site-content');
  const meta: Record<string, unknown> = {};
  if (typeof input.phone === 'string') meta.phone = input.phone;
  if (typeof input.email === 'string') meta.email = input.email;
  if (typeof input.address === 'string') meta.address = input.address;
  if (typeof input.whatsapp === 'string') meta.whatsapp = input.whatsapp;

  await upsertSiteSection('contact', {
    title: 'Kontakt',
    body: typeof input.body === 'string' ? input.body : undefined,
    meta,
  });
  return {
    ok: true,
    message: 'Iletisim bilgileri guncellendi. fly-froth.com footer ve iletisim sayfasinda canli.',
  };
}

async function execPublishBlogPost(input: Record<string, unknown>): Promise<unknown> {
  const title = typeof input.title === 'string' ? input.title : null;
  if (!title) return { error: 'title gerekli' };

  const { upsertBlogPost } = await import('@/lib/db/queries/site-content');
  const slug = typeof input.slug === 'string'
    ? input.slug
    : title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  await upsertBlogPost({
    title,
    slug,
    excerpt: typeof input.excerpt === 'string' ? input.excerpt : undefined,
    body: typeof input.body === 'string' ? input.body : undefined,
    cover_url: typeof input.cover_url === 'string' ? input.cover_url : undefined,
    tags: Array.isArray(input.tags) ? input.tags as string[] : undefined,
    is_published: input.publish === true ? 1 : 0,
  });
  return {
    ok: true,
    slug,
    url: `https://fly-froth.com/blog/${slug}`,
    message: input.publish === true
      ? `"${title}" blogda yayinlandi: https://fly-froth.com/blog/${slug}`
      : `"${title}" taslak olarak kaydedildi. Yayinlamak icin publish: true ile tekrar gonder.`,
  };
}

async function execUploadImage(input: Record<string, unknown>): Promise<unknown> {
  const folder = typeof input.folder === 'string' ? input.folder : 'general';
  return {
    instruction: 'Resmi Telegram uzerinden gonderin (fotograf olarak). Webhook otomatik olarak Vercel Blob uzerine yukleyecek ve URL dondurecek.',
    alternative: `Baska bir URLden resim kullanmak istiyorsaniz, dogrudan image_url olarak belirtin.`,
    uploadEndpoint: `/api/blob/upload?secret=CRON_SECRET`,
    folder,
    acceptedFormats: 'PNG, JPG, WebP, GIF (max 10MB)',
  };
}

async function execCheckAvailability(input: Record<string, unknown>): Promise<unknown> {
  const date = typeof input.date === 'string' ? input.date : new Date().toISOString().slice(0, 10);
  const { listEvents, findFreeSlots } = await import('@/lib/calendar/google');
  const freeSlots = await findFreeSlots(date);
  return {
    date,
    freeSlots: freeSlots.map((s) => ({ start: s.start, end: s.end })),
    count: freeSlots.length,
    note: freeSlots.length === 0 ? 'Bu gun icin bos slot yok.' : `${freeSlots.length} bos slot bulundu.`,
  };
}

async function execScheduleAppointment(input: Record<string, unknown>): Promise<unknown> {
  const date = String(input.date ?? '');
  const time = String(input.time ?? '');
  const purpose = String(input.purpose ?? '');
  if (!date || !time || !purpose) return { error: 'date, time, purpose gerekli.' };

  const startDateTime = new Date(`${date}T${time}:00`);
  const duration = typeof input.duration === 'number' ? input.duration : 60;
  const endDateTime = new Date(startDateTime.getTime() + duration * 60000);

  const { createEvent } = await import('@/lib/calendar/google');
  const event = await createEvent({
    summary: purpose,
    description: `Musteri: ${input.customerName ?? 'Belirtilmedi'}\nEmail: ${input.customerEmail ?? 'Belirtilmedi'}`,
    start: startDateTime,
    end: endDateTime,
    attendees: typeof input.customerEmail === 'string' ? [input.customerEmail] : [],
  });

  return {
    success: true,
    eventId: event.id,
    link: event.htmlLink,
    summary: purpose,
    start: startDateTime.toISOString(),
    end: endDateTime.toISOString(),
  };
}

async function execListAppointments(input: Record<string, unknown>): Promise<unknown> {
  const date = typeof input.date === 'string' ? input.date : new Date().toISOString().slice(0, 10);
  const { listEvents } = await import('@/lib/calendar/google');
  const timeMin = new Date(`${date}T00:00:00`);
  const timeMax = new Date(`${date}T23:59:59`);
  const events = await listEvents(timeMin, timeMax);
  return {
    date,
    count: events.length,
    appointments: events.map((e) => ({
      id: e.id,
      summary: e.summary,
      start: e.start?.dateTime ?? e.start?.date,
      end: e.end?.dateTime ?? e.end?.date,
      attendees: e.attendees?.map((a: { email: string }) => a.email),
    })),
  };
}

async function execCancelAppointment(input: Record<string, unknown>): Promise<unknown> {
  const eventId = String(input.eventId ?? '');
  if (!eventId) return { error: 'eventId gerekli.' };
  const { deleteEvent } = await import('@/lib/calendar/google');
  await deleteEvent(eventId);
  return { success: true, eventId, message: 'Randevu iptal edildi.' };
}

// ── Executor Map ──

const EXECUTORS: Record<string, ToolExecutor> = {
  get_business_profile: execGetBusinessProfile,
  get_brand_kit: execGetBrandKit,
  get_portfolio: execGetPortfolio,
  list_recent_posts: execListRecentPosts,
  get_weekly_plan: execGetWeeklyPlan,
  generate_post: execGeneratePost,
  publish_post: execPublishPost,
  list_invoices: execListInvoices,
  get_invoice: execGetInvoice,
  list_customers: execListCustomers,
  check_inbox: execCheckInbox,
  send_mail: execSendMail,
  list_kleinanzeigen_threads: execListKleinanzeigenThreads,
  generate_kleinanzeigen_reply: execGenerateKleinanzeigenReply,
  send_kleinanzeigen_reply: execSendKleinanzeigenReply,
  list_incoming_messages: execListIncomingMessages,
  draft_social_reply: execDraftSocialReply,
  list_email_lists: execListEmailLists,
  send_email_campaign: execSendEmailCampaign,
  list_ads_campaigns: execListAdsCampaigns,
  get_ads_status: execGetAdsStatus,
  generate_image: execGenerateImage,
  generate_svg: execGenerateSvg,
  get_system_status: execGetSystemStatus,
  get_database_summary: execGetDatabaseSummary,
  run_workflow: execRunWorkflow,
  get_workflow_status: execGetWorkflowStatus,
  cancel_workflow: execCancelWorkflow,
  qualify_lead: execQualifyLead,
  auto_handle_inquiry: execAutoHandleInquiry,
  send_follow_up: execSendFollowUp,
  create_task: execCreateTask,
  list_tasks: execListTasks,
  web_research: execWebResearch,
  scan_market: execScanMarket,
  launch_campaign: execLaunchCampaign,
  get_customer_360: execGetCustomer360,
  get_campaign_performance: execGetCampaignPerformance,
  send_invoice_reminder: execSendInvoiceReminder,
  batch_generate_invoices: execBatchGenerateInvoices,
  get_revenue_forecast: execGetRevenueForecast,
  get_service_profitability: execGetServiceProfitability,
  get_customer_segments: execGetCustomerSegments,
  update_website_content: execUpdateWebsiteContent,
  add_portfolio_item: execAddPortfolioItem,
  update_contact_info: execUpdateContactInfo,
  publish_blog_post: execPublishBlogPost,
  upload_image: execUploadImage,
  check_availability: execCheckAvailability,
  schedule_appointment: execScheduleAppointment,
  list_appointments: execListAppointments,
  cancel_appointment: execCancelAppointment,
};

export async function executeTool(
  name: string,
  toolUseId: string,
  input: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const executor = EXECUTORS[name];
  if (!executor) {
    return {
      toolUseId,
      content: `Bilinmeyen tool: ${name}`,
      isError: true,
    };
  }
  try {
    const result = await executor(input);
    return {
      toolUseId,
      content: JSON.stringify(result, null, 2),
      isError: false,
    };
  } catch (err) {
    return {
      toolUseId,
      content: err instanceof Error ? err.message : 'Tool execution failed',
      isError: true,
    };
  }
}
