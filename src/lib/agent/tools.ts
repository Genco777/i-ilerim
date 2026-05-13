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
        body: { type: 'string', description: 'Blog içeriği' },
        slug: { type: 'string', description: 'URL slug (bos birakilirsa otomatik)' },
        excerpt: { type: 'string', description: 'Ozet (1-2 cumle)' },
        cover_url: { type: 'string', description: 'Kapak gorseli URL' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Etiketler' },
        publish: { type: 'boolean', description: 'Hemen yayinlansin mi?' },
      },
      required: ['title', 'body'],
    },
  },

  // ── Video ──
  {
    name: 'generate_video',
    description: 'HyperFrames ile sosyal medya videosu (Reel, TikTok, Shorts) kompozisyonu olusturur. Video 1080x1920 dikey formatta, HTML tabanli render edilir.',
    input_schema: {
      type: 'object',
      properties: {
        headline: { type: 'string', description: 'Video basligi (buyuk yazi)' },
        subheadline: { type: 'string', description: 'Alt baslik (opsiyonel)' },
        cta: { type: 'string', description: 'Cagri metni (varsayilan: fly-froth.com)' },
        duration_seconds: { type: 'number', description: 'Saniye (varsayilan: 10)' },
        primary_color: { type: 'string', description: 'Ana renk (hex, varsayilan: #6366f1)' },
        image_url: { type: 'string', description: 'Arka plan veya urun gorseli URL (opsiyonel)' },
      },
      required: ['headline'],
    },
  },

  // ── Local Bridge ──
  {
    name: 'delegate_to_local',
    description: 'Agir bir islemi (video render, buyuk dosya isleme, ffmpeg) local makineye havale eder. Local agent worker scripti bu gorevi alir, isler ve sonucu dondurur.',
    input_schema: {
      type: 'object',
      properties: {
        task_type: { type: 'string', description: 'Gorev tipi: render_video, video_analysis, file_process, general' },
        title: { type: 'string', description: 'Gorev basligi' },
        payload: { type: 'object', description: 'Gorev verisi (ornek: { compDir: "compositions/vid_xxx" })' },
        priority: { type: 'number', description: 'Oncelik 1-10 (varsayilan: 5)' },
      },
      required: ['task_type', 'title', 'payload'],
    },
  },

  // ── Video Analysis ──
  {
    name: 'analyze_video',
    description: 'Gonderilen videoyu AI ile analiz eder. Video frame\'lerine ve ses transkriptine bakarak icerik, kalite, pazarlama etkisi hakkinda yorum yapar. Rakip analizi veya kendi videolarinin degerlendirmesi icin kullanilir.',
    input_schema: {
      type: 'object',
      properties: {
        video_url: { type: 'string', description: 'Video URL (Telegram uzerinden gonderilen video)' },
        analysis_type: { type: 'string', description: 'Analiz tipi: competitor, self_review, content_audit' },
        focus_areas: { type: 'array', items: { type: 'string' }, description: 'Odak alanlari: visuals, messaging, pacing, branding, call_to_action' },
      },
      required: ['video_url'],
    },
  },

  // ── Design Critic ──
  {
    name: 'design_critique',
    description: 'Bir tasarimi (logo, flyer, web sitesi) profesyonel acidan elestirir. Kompozisyon, renk, tipografi, mesaj, hedef kitle uyumu gibi kriterlerde puanlama yapar.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'Degerlendirilecek gorselin URLsi' },
        design_type: { type: 'string', description: 'Tasarim tipi: logo, flyer, website, banner, branding' },
        context: { type: 'string', description: 'Ek baglam: hedef kitle, amac, sektor (opsiyonel)' },
      },
      required: ['image_url', 'design_type'],
    },
  },

  // ── Design Brief Extractor ──
  {
    name: 'extract_design_brief',
    description: 'Musteri mesajlarindan veya konusma gecmisinden yapilandirilmis tasarim briefi cikarir. Hedef kitle, renk tercihleri, rakip ornekleri, butce, zaman gibi bilgileri yapilandirir.',
    input_schema: {
      type: 'object',
      properties: {
        conversation_text: { type: 'string', description: 'Musteri konusmasi veya mesajlari' },
        customer_name: { type: 'string', description: 'Musteri adi (opsiyonel)' },
      },
      required: ['conversation_text'],
    },
  },

  // ── Multi-language Marketing ──
  {
    name: 'translate_content',
    description: 'Icerigi TR/DE/EN/AR dillerine cevirir ve her dilin kulturune uygun sekilde yerellestirir. Sosyal medya postlari, web sitesi icerigi, reklam metinleri icin kullanilir.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Cevrilecek metin' },
        target_languages: { type: 'array', items: { type: 'string' }, description: 'Hedef diller: tr, de, en, ar' },
        content_type: { type: 'string', description: 'Icerik tipi: social_post, ad_copy, website, email, contract' },
        tone: { type: 'string', description: 'Ton: professional, casual, friendly, luxury, urgent' },
      },
      required: ['text', 'target_languages'],
    },
  },

  // ── AI Mockup Generator ──
  {
    name: 'generate_mockup',
    description: 'Bir tasarimi gercek dunya urunlerinde gosteren AI mockup olusturur. Logo kahve kupasinda, flyer elde, web sitesi ekranda gibi. Musteri sunumlari icin idealdir.',
    input_schema: {
      type: 'object',
      properties: {
        design_description: { type: 'string', description: 'Tasarimin aciklamasi (ornek: minimalist yesil agac logolu logo)' },
        mockup_type: { type: 'string', description: 'Mockup tipi: coffee_cup, tshirt, billboard, phone_screen, business_card, storefront' },
        style: { type: 'string', description: 'Stil: realistic, minimal, lifestyle, dark_mood' },
      },
      required: ['design_description', 'mockup_type'],
    },
  },

  // ── Smart Contract Generator ──
  {
    name: 'generate_contract',
    description: 'Tasarim isleri icin akilli sozlesme/AGB/teklif mektubu olusturur. Almanya yasal cercevesine uygun, musterinin projesine ozellestirilmis.',
    input_schema: {
      type: 'object',
      properties: {
        contract_type: { type: 'string', description: 'Sozlesme tipi: design_agreement, agb, angebot_brief, revision_policy, nda' },
        client_name: { type: 'string', description: 'Musteri adi/sirket' },
        project_details: { type: 'string', description: 'Proje detaylari (kapsam, fiyat, sure)' },
        language: { type: 'string', description: 'Dil: de (varsayilan), en, tr' },
      },
      required: ['contract_type', 'client_name', 'project_details'],
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
  {
    name: 'generate_color_palette',
    description: 'Sektör, mood ve marka kişiliğine göre akıllı renk paleti oluşturur. Hex, CMYK, kullanım yüzdeleri ve anlamlarıyla birlikte.',
    input_schema: {
      type: 'object',
      properties: {
        industry: { type: 'string', description: 'Sektör (örn. restoran, teknoloji, moda, hukuk, sağlık)' },
        mood: { type: 'string', description: 'Mood (örn. modern, klasik, enerjik, sakin, lüks, samimi)' },
        existingColors: { type: 'string', description: 'Mevcut renk varsa hex kodları (örn. "#1A2B3C,#FF5733")' },
        count: { type: 'number', description: 'Kaç renk? Varsayılan 5.' },
      },
      required: ['industry', 'mood'],
    },
  },
  {
    name: 'suggest_font_pairing',
    description: 'Tasarım stiline uygun font eşleştirmesi önerir (Google Fonts + sistem fontları). Başlık ve gövde için ayrı ayrı, CSS import ile birlikte.',
    input_schema: {
      type: 'object',
      properties: {
        style: { type: 'string', description: 'Stil (örn. modern-minimal, classic-serif, playful, luxury, tech, handcrafted)' },
        language: { type: 'string', description: 'Dil desteği (örn. de, tr, ar). Varsayılan Latin.' },
        usage: { type: 'string', description: 'Kullanım yeri (örn. logo, web, print, brand-identity)' },
      },
      required: ['style'],
    },
  },
  {
    name: 'generate_logo_concepts',
    description: 'İşletme bilgilerinden 3-5 logo konsept yönü üretir. Her konsept: stil adı, sembol fikri, tipografi, renk paleti, AI görsel promptu.',
    input_schema: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'İşletme adı' },
        industry: { type: 'string', description: 'Sektör' },
        values: { type: 'string', description: 'Marka değerleri/kişiliği (örn. güvenilir, yenilikçi, samimi)' },
        targetAudience: { type: 'string', description: 'Hedef kitle' },
        preferences: { type: 'string', description: 'Tercihler veya kısıtlamalar (örn. minimalist, sadece tipografik, retro, mascot)' },
        competitors: { type: 'string', description: 'Farklılaşmak istenen rakipler (isteğe bağlı)' },
      },
      required: ['businessName', 'industry'],
    },
  },
  {
    name: 'calculate_print_specs',
    description: 'Basılı materyal formatı için teknik baskı özelliklerini hesaplar: ölçü, bleed, safe zone, DPI, renk profili, önerilen kağıt.',
    input_schema: {
      type: 'object',
      properties: {
        format: { type: 'string', description: 'Format (örn. flyer-a5, flyer-a6, business-card, poster-a3, poster-a2, banner-rollup, brosur-dl, brosur-a4, letterhead, folder, social-media-post, social-media-story)' },
        customWidthMm: { type: 'number', description: 'Özel en (mm) — format belirtilmezse kullanılır' },
        customHeightMm: { type: 'number', description: 'Özel boy (mm) — format belirtilmezse kullanılır' },
        folding: { type: 'string', description: 'Katlamalı ise tip (örn. z-fold, tri-fold, half-fold)' },
        hasBleed: { type: 'boolean', description: 'Tam bleed (kesim payı) gerekli mi? Varsayılan true.' },
      },
      required: [],
    },
  },
  {
    name: 'analyze_design_psychology',
    description: 'Renk, kompozisyon ve stilin hedef kitlede uyandırdığı psikolojik etkiyi analiz eder. Kültürel bağlam (TR/DE) ve sektörel beklentileri değerlendirir.',
    input_schema: {
      type: 'object',
      properties: {
        designType: { type: 'string', description: 'Tasarım tipi (örn. logo, flyer, web, banner, kartvizit, ambalaj)' },
        colors: { type: 'string', description: 'Kullanılan ana renkler (hex kodlarıyla, virgülle ayrılmış)' },
        style: { type: 'string', description: 'Tasarım stili (örn. minimalist, bold, elegant, playful, corporate, brutalist)' },
        targetEmotion: { type: 'string', description: 'Hedeflenen duygu (örn. güven, heyecan, huzur, lüks, samimiyet, güç)' },
        targetAudience: { type: 'string', description: 'Hedef kitle profili' },
        industry: { type: 'string', description: 'Sektör' },
        region: { type: 'string', description: 'Kültürel bağlam (tr, de, eu, global). Varsayılan tr.' },
      },
      required: ['designType'],
    },
  },
  {
    name: 'generate_flyer',
    description: 'Text açıklamasından baskıya hazır flyer veya çok sayfalı broşür tasarımı üretir. Tam HTML/CSS layout, CMYK renk paleti, font eşleştirmesi, baskı teknik özellikleri ve AI görsel promptları içerir. A5, A6, DL, kare gibi formatlarda; multiPage=true ile katlamalı broşür çıktısı verir.',
    input_schema: {
      type: 'object',
      properties: {
        description: { type: 'string', description: 'Flyer/broşür için text açıklaması: ne için, hangi mesaj, hedef kitle, özel istekler. Örn: "Kebap restoranı için Ramazan menü flyer. Sıcak renkler, geleneksel motifler, iftar vurgusu. A5 çift taraflı. İletişim: 0176 123456, @kebaphaus.frankfurt"' },
        format: { type: 'string', description: 'Flyer formatı: flyer-a5, flyer-a6, brosur-dl, flyer-a4, square-social, story-social. Varsayılan flyer-a5.' },
        style: { type: 'string', description: 'Tasarım stili (örn. modern-minimal, elegant-restaurant, bold-promo, vintage-market, luxury-boutique, street-food). Varsayılan modern-minimal.' },
        businessName: { type: 'string', description: 'İşletme adı' },
        contactInfo: { type: 'string', description: 'İletişim bilgileri (tel, adres, sosyal medya, web)' },
        cta: { type: 'string', description: 'Call-to-action (örn. "Hemen Ara", "Menüyü İndir", "%20 İndirim")' },
        offerText: { type: 'string', description: 'Özel teklif/indirim metni' },
        language: { type: 'string', description: 'Dil (tr, de, en). Varsayılan tr.' },
        doubleSided: { type: 'boolean', description: 'Çift taraflı mı? Varsayılan false (ön yüz).' },
        multiPage: { type: 'boolean', description: 'Çok sayfalı katlamalı broşür modu. true ise folding parametresi ile katlama tipi belirtilmeli.' },
        folding: { type: 'string', description: 'Katlamalı broşür katlama tipi: tri-fold (3 katlı, mektup), bi-fold (2 katlı, kitap), z-fold (zigzag), gate-fold (kapı katlı). Varsayılan tri-fold. Sadece multiPage=true iken geçerli.' },
        pageContent: { type: 'string', description: 'JSON array: her panel/sayfa için içerik açıklaması. Örn: ["Ön kapak — şirket tanıtımı", "Hizmetlerimiz — detaylı liste", "İletişim ve referanslar"]. Broşür panellerine otomatik dağıtılır.' },
        autoGenerateImages: { type: 'boolean', description: 'AI ile görselleri otomatik üretip HTML\'e göm. Max 3 görsel paralel üretilir. Vercel Blob\'a yüklenir. Varsayılan false.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'generate_menu',
    description: 'Restoran/kafe için baskıya hazır menü kartı üretir. Kategoriler, ürünler, fiyatlar, badge\'ler (vegan, glütensiz vb.), QR kod ve tam HTML/CSS layout içerir.',
    input_schema: {
      type: 'object',
      properties: {
        businessName: { type: 'string', description: 'İşletme adı (örn. "Kebap Haus Frankfurt")' },
        style: { type: 'string', description: 'Menü stili: elegant-fine-dining, casual-bistro, street-food-menu. Varsayılan casual-bistro.' },
        format: { type: 'string', description: 'Menü formatı: a4-portrait, a4-landscape-fold, dl-tri-fold. Varsayılan a4-portrait.' },
        categories: { type: 'string', description: 'JSON: kategori listesi. Her kategori: name, items[{name, description?, price, badges?[]}]. Örn: [{"name":"İçecekler","items":[{"name":"Ayran","price":"2,50€"},{"name":"Çay","description":"Demlik","price":"3€"}]}]' },
        contactInfo: { type: 'string', description: 'İletişim bilgileri (tel, adres, web, sosyal medya)' },
        language: { type: 'string', description: 'Dil (tr, de, en). Varsayılan tr.' },
        specialNote: { type: 'string', description: 'Özel not (örn. "Tüm fiyatlara KDV dahildir", "Alkollü içecekler 18+")' },
        autoGenerateImages: { type: 'boolean', description: 'AI ile yemek/içecek görsellerini otomatik üretip menüye göm. Max 3 görsel paralel üretilir. Varsayılan false.' },
      },
      required: ['businessName'],
    },
  },
];

// ── AI Image Auto-Generation & Embedding ──

async function autoGenerateAndEmbedImages(
  imagePrompts: string[],
  html: string,
  maxImages: number = 3,
): Promise<{ html: string; images: Array<{ prompt: string; blobUrl: string | null; error?: string }> }> {
  const prompts = imagePrompts.slice(0, Math.min(maxImages, 3));
  const { generateImage } = await import('@/lib/ai/image');

  // Generate all images in parallel
  const results = await Promise.allSettled(
    prompts.map(async (prompt) => {
      const result = await generateImage(prompt, { aspectRatio: '1:1' });
      return { prompt, buffer: result.buffer, provider: result.provider };
    }),
  );

  const images: Array<{ prompt: string; blobUrl: string | null; error?: string }> = [];

  // Upload to Vercel Blob and build <img> tags
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const imgTags: string[] = [];

  for (const r of results) {
    if (r.status === 'fulfilled') {
      const { prompt, buffer } = r.value;
      let blobUrl: string | null = null;

      if (blobToken) {
        try {
          const filename = `images/ai-gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
          const blobRes = await fetch(`https://blob.vercel-storage.com/${filename}`, {
            method: 'PUT',
            headers: {
              Authorization: `Bearer ${blobToken}`,
              'Content-Type': 'image/png',
              'X-Content-Type-Options': 'nosniff',
              'X-Cache-Control-Max-Age': '31536000',
            },
            body: new Uint8Array(buffer),
          });
          if (blobRes.ok) {
            const blobData = await blobRes.json() as { url?: string };
            blobUrl = blobData.url ?? null;
          }
        } catch { /* blob upload optional */ }
      }

      images.push({ prompt, blobUrl, error: blobUrl ? undefined : 'Blob upload failed — buffer available' });
      if (blobUrl) {
        imgTags.push(`<img src="${blobUrl}" alt="${prompt.slice(0, 80)}" style="width:100%;max-width:400px;border-radius:8px;margin:8px 0;object-fit:cover;" loading="lazy" />`);
      }
    } else {
      images.push({ prompt: prompts[results.indexOf(r)] ?? '', blobUrl: null, error: r.reason?.message ?? 'Generation failed' });
    }
  }

  // Embed images into HTML — insert after <body> or after first container
  let modifiedHtml = html;
  if (imgTags.length > 0) {
    const imgStrip = `\n<!-- AI Generated Images -->\n<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;padding:8px 0;">\n${imgTags.join('\n')}\n</div>\n`;
    // Insert after <body> tag or at the start of content
    if (modifiedHtml.includes('<body>')) {
      modifiedHtml = modifiedHtml.replace('<body>', `<body>\n${imgStrip}`);
    } else {
      modifiedHtml = imgStrip + modifiedHtml;
    }
  }

  return { html: modifiedHtml, images };
}

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

async function execGenerateVideo(input: Record<string, unknown>): Promise<unknown> {
  const headline = typeof input.headline === 'string' ? input.headline : null;
  if (!headline) return { error: 'headline gerekli' };

  const { generateSocialMediaComposition, saveComposition } = await import('@/lib/video/hyperframes');
  const html = generateSocialMediaComposition({
    headline,
    subheadline: typeof input.subheadline === 'string' ? input.subheadline : undefined,
    cta: typeof input.cta === 'string' ? input.cta : undefined,
    primaryColor: typeof input.primary_color === 'string' ? input.primary_color : undefined,
    durationSeconds: typeof input.duration_seconds === 'number' ? input.duration_seconds : 10,
    imageUrl: typeof input.image_url === 'string' ? input.image_url : undefined,
  });

  const comp = await saveComposition({
    title: headline,
    description: `${headline} — ${new Date().toLocaleDateString('de-DE')}`,
    html,
    durationSeconds: (typeof input.duration_seconds === 'number' ? input.duration_seconds : 10),
  });

  return {
    ok: true,
    composition: {
      id: comp.id,
      title: comp.title,
      durationSeconds: comp.durationSeconds,
      format: comp.format,
      status: comp.status,
    },
    message: `"${headline}" videosu hazir. Render icin: npx hyperframes render compositions/${comp.id}/index.html -o output/${comp.id}.mp4`,
    nextSteps: [
      'Video kompozisyonu olusturuldu.',
      'Render islemi local makinede yapilir (ffmpeg + puppeteer gerekli).',
      'Render sonrasi MP4 Vercel Blob uzerine yuklenebilir.',
      'Instagram Reel / TikTok / YouTube Shorts formatinda (1080x1920).',
    ],
  };
}

async function execDelegateToLocal(input: Record<string, unknown>): Promise<unknown> {
  const taskType = typeof input.task_type === 'string' ? input.task_type : null;
  const title = typeof input.title === 'string' ? input.title : null;
  if (!taskType || !title) return { error: 'task_type ve title gerekli' };

  const { createTask, waitForTask } = await import('@/lib/db/queries/agent-tasks');
  const { id } = await createTask({
    task_type: taskType,
    title,
    payload: (input.payload as Record<string, unknown>) ?? {},
    priority: typeof input.priority === 'number' ? input.priority : 5,
  });

  return {
    ok: true,
    taskId: id,
    message: `Gorev "${title}" local worker'a havale edildi. ID: ${id}`,
    nextSteps: [
      'Local agent worker bu gorevi otomatik alip isleyecek.',
      `Sonucu sorgulamak icin: GET /api/agent/tasks?action=result&taskId=${id}`,
      'Islem suresi gorev tipine gore 10sn - 5dk arasi degisir.',
    ],
  };
}

async function execAnalyzeVideo(input: Record<string, unknown>): Promise<unknown> {
  const videoUrl = typeof input.video_url === 'string' ? input.video_url : null;
  if (!videoUrl) return { error: 'video_url gerekli' };

  const analysisType = (typeof input.analysis_type === 'string' ? input.analysis_type : 'self_review') as string;
  const focusAreas = Array.isArray(input.focus_areas) ? (input.focus_areas as string[]) : ['visuals', 'messaging', 'branding'];

  // Delegate to local for frame extraction + transcription
  const { createTask } = await import('@/lib/db/queries/agent-tasks');
  await createTask({
    task_type: 'video_analysis',
    title: `Video Analysis: ${analysisType}`,
    payload: { videoUrl, analysisType, focusAreas },
    priority: 7,
  });

  return {
    ok: true,
    analysisType,
    focusAreas,
    message: `Video analizi baslatildi (${analysisType}). Local worker frame'leri cikarip Claude Vision ile analiz edecek.`,
    note: 'Video once ffmpeg ile frame ve sese ayrilir, sonra Claude Vision frame+transkript uzerinden analiz yapar.',
  };
}

async function execDesignCritique(input: Record<string, unknown>): Promise<unknown> {
  const imageUrl = typeof input.image_url === 'string' ? input.image_url : null;
  const designType = typeof input.design_type === 'string' ? input.design_type : 'logo';
  if (!imageUrl) return { error: 'image_url gerekli' };

  const context = typeof input.context === 'string' ? input.context : '';

  return {
    instruction: 'Claude Vision ile tasarim elestirisi yap. Asagidaki kriterlere gore puanla (1-10):',
    criteria: [
      'Kompozisyon ve denge',
      'Renk uyumu ve anlami',
      'Tipografi ve okunurluk',
      'Mesaj netligi ve iletisim gucu',
      'Hedef kitleye uygunluk',
      'Ozgunluk ve akilda kalicilik',
      'Profesyonel gorunum',
    ],
    designType,
    imageUrl,
    context,
    format: 'Her kriter icin puan + 1 cumle yorum. Sonunda genel degerlendirme ve 3 iyilestirme onerisi.',
  };
}

async function execExtractDesignBrief(input: Record<string, unknown>): Promise<unknown> {
  const conversationText = typeof input.conversation_text === 'string' ? input.conversation_text : null;
  if (!conversationText) return { error: 'conversation_text gerekli' };
  const customerName = typeof input.customer_name === 'string' ? input.customer_name : 'Musteri';

  return {
    instruction: 'Bu konusma gecmisinden yapilandirilmis bir tasarim briefi cikar.',
    customerName,
    sections: {
      projectType: 'Ne tur bir tasarim isteniyor? (logo, flyer, web...)',
      targetAudience: 'Hedef kitle kim? (sektor, yas, konum...)',
      stylePreferences: 'Stil tercihleri neler? (minimal, modern, klasik...)',
      colorPreferences: 'Renk tercihleri veya kacinilmasi gereken renkler?',
      competitors: 'Referans alinan rakipler veya ornekler?',
      deliverables: 'Teslim edilmesi gereken dosyalar/formats?',
      budget: 'Butce bilgisi var mi?',
      deadline: 'Teslim zamani ne zaman?',
      missingInfo: 'Hangi kritik bilgiler eksik, sorulmali?',
    },
    conversation: conversationText.slice(0, 8000),
  };
}

async function execTranslateContent(input: Record<string, unknown>): Promise<unknown> {
  const text = typeof input.text === 'string' ? input.text : null;
  if (!text) return { error: 'text gerekli' };

  const targetLanguages = (Array.isArray(input.target_languages) ? input.target_languages : ['de', 'en']) as string[];
  const contentType = (typeof input.content_type === 'string' ? input.content_type : 'social_post') as string;
  const tone = (typeof input.tone === 'string' ? input.tone : 'professional') as string;

  return {
    instruction: `Bu metni ${targetLanguages.join(', ')} dillerine cevir ve her dilin kulturune uygun sekilde yerellestir.`,
    originalText: text,
    targetLanguages,
    contentType,
    tone,
    requirements: {
      de: 'Almanca: resmi ve profesyonel, Almanya is kulturu normlarina uygun.',
      en: 'Ingilizce: uluslararasi, dogal ve akici.',
      tr: 'Turkce: samimi ama profesyonel, Turk is kulturu.',
      ar: 'Arapca: kultur olarak uygun, gerekiyorsa saga hizali.',
    },
    note: 'Her dil icin ayri ayri ceviriyi json formatinda dondur: { "de": "...", "en": "...", ... }',
  };
}

async function execGenerateMockup(input: Record<string, unknown>): Promise<unknown> {
  const designDescription = typeof input.design_description === 'string' ? input.design_description : null;
  if (!designDescription) return { error: 'design_description gerekli' };

  const mockupType = (typeof input.mockup_type === 'string' ? input.mockup_type : 'business_card') as string;
  const style = (typeof input.style === 'string' ? input.style : 'realistic') as string;

  return {
    instruction: 'Bu tasarim icin bir AI mockup gorseli olustur. generate_image toolunu kullan.',
    prompt: `Professional product mockup, ${style} style: ${designDescription}. Shown on a ${mockupType.replace(/_/g, ' ')}. Clean background, studio lighting, high resolution, photorealistic. No text overlays on the product shot itself.`,
    mockupType,
    style,
    designDescription,
    tool: 'Bu islem icin generate_image cagirilacak. generate_image mevcut degilse, kullaniciya mockup icin harici bir arac (Placeit, Smartmockups) oner.',
  };
}

async function execGenerateContract(input: Record<string, unknown>): Promise<unknown> {
  const contractType = typeof input.contract_type === 'string' ? input.contract_type : 'design_agreement';
  const clientName = typeof input.client_name === 'string' ? input.client_name : null;
  if (!clientName) return { error: 'client_name gerekli' };

  const projectDetails = typeof input.project_details === 'string' ? input.project_details : '';
  const language = typeof input.language === 'string' ? input.language : 'de';

  const templates: Record<string, string> = {
    design_agreement: 'Tasarim Hizmet Sozlesmesi (Design Service Agreement)',
    agb: 'Genel Islem Kosullari (AGB / Terms and Conditions)',
    angebot_brief: 'Teklif Mektubu (Angebot / Proposal Letter)',
    revision_policy: 'Revizyon Politikasi (Revision Policy)',
    nda: 'Gizlilik Sozlesmesi (NDA / Confidentiality Agreement)',
  };

  return {
    instruction: `${templates[contractType] ?? contractType} olustur. Dil: ${language === 'de' ? 'Almanca' : language === 'tr' ? 'Turkce' : 'Ingilizce'}.`,
    clientName,
    projectDetails,
    contractType,
    language,
    legalRequirements: language === 'de' ? [
      'Alman hukukuna (BGB) uygun olmali',
      'Widerrufsrecht (cayma hakki) icermeli',
      'DSGVO uyumlu kisisel veri maddesi',
      'Impressum bilgileri: Fly & Froth, Roderveg 19, 61184 Karben',
    ] : [
      'Standard contract terms',
      'Intellectual property clause',
      'Payment terms and schedule',
      'Revision policy and scope',
    ],
    sections: [
      '1. Taraflar (Parties)',
      '2. Sozlesme Konusu (Scope of Work)',
      '3. Teslim Zamani (Timeline)',
      '4. Ucret ve Odeme (Payment)',
      '5. Revizyon Hakki (Revisions)',
      '6. Fikri Mulkiyet (Intellectual Property)',
      '7. Cayma Hakki (Right of Withdrawal)',
      '8. Gizlilik (Confidentiality)',
      '9. Yururluk ve Fesih (Term and Termination)',
      '10. Uygulanacak Hukuk (Governing Law)',
    ],
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

// ── Graphic Design Executors ──

// Industry/mood-based color palette knowledge base
const COLOR_KNOWLEDGE: Record<string, Record<string, { hex: string; cmyk: [number, number, number, number]; meaning: string; usage: number }[]>> = {
  restoran: {
    modern: [
      { hex: '#1A1A1A', cmyk: [0, 0, 0, 90], meaning: 'Siyah — premium, sofistike', usage: 60 },
      { hex: '#D4A574', cmyk: [0, 22, 45, 17], meaning: 'Altın-bej — sıcaklık, doğallık', usage: 25 },
      { hex: '#F5F0EB', cmyk: [0, 2, 4, 4], meaning: 'Krem — temizlik, ferahlık', usage: 10 },
      { hex: '#8B4513', cmyk: [0, 50, 86, 45], meaning: 'Kahve — toprak, organik', usage: 5 },
    ],
    klasik: [
      { hex: '#8B0000', cmyk: [0, 100, 100, 45], meaning: 'Bordo — geleneksel, otantik', usage: 40 },
      { hex: '#F5DEB3', cmyk: [0, 8, 26, 4], meaning: 'Buğday — davetkar, rustik', usage: 30 },
      { hex: '#2F4F4F', cmyk: [45, 0, 0, 69], meaning: 'Koyu yeşil — tazelik, doğa', usage: 20 },
      { hex: '#DAA520', cmyk: [0, 15, 85, 15], meaning: 'Altın — kalite, özen', usage: 10 },
    ],
    enerjik: [
      { hex: '#FF4500', cmyk: [0, 73, 100, 0], meaning: 'Turuncu-kırmızı — iştah, enerji', usage: 45 },
      { hex: '#FFD700', cmyk: [0, 10, 100, 0], meaning: 'Sarı — mutluluk, hız', usage: 30 },
      { hex: '#FFFFFF', cmyk: [0, 0, 0, 0], meaning: 'Beyaz — temiz, ferah', usage: 20 },
      { hex: '#2E2E2E', cmyk: [0, 0, 0, 82], meaning: 'Koyu gri — denge', usage: 5 },
    ],
  },
  teknoloji: {
    modern: [
      { hex: '#0A0E27', cmyk: [76, 63, 0, 85], meaning: 'Koyu lacivert — derinlik, güven', usage: 50 },
      { hex: '#00D4FF', cmyk: [65, 0, 4, 0], meaning: 'Cyan — teknoloji, hız', usage: 25 },
      { hex: '#7000FF', cmyk: [56, 100, 0, 0], meaning: 'Mor — inovasyon, yaratıcılık', usage: 15 },
      { hex: '#FFFFFF', cmyk: [0, 0, 0, 0], meaning: 'Beyaz — kontrast, minimal', usage: 10 },
    ],
    lüks: [
      { hex: '#0F0F0F', cmyk: [0, 0, 0, 94], meaning: 'Siyah — ultra premium', usage: 55 },
      { hex: '#C9A84C', cmyk: [0, 16, 62, 21], meaning: 'Altın — eksklüzivite', usage: 20 },
      { hex: '#1A1A2E', cmyk: [44, 44, 0, 82], meaning: 'Gece mavisi — derinlik', usage: 15 },
      { hex: '#E5E5E5', cmyk: [0, 0, 0, 10], meaning: 'Açık gri — nefes alanı', usage: 10 },
    ],
  },
  moda: {
    modern: [
      { hex: '#000000', cmyk: [0, 0, 0, 100], meaning: 'Siyah — zamansız, şık', usage: 50 },
      { hex: '#F5F5F5', cmyk: [0, 0, 0, 4], meaning: 'Beyaz — temiz, minimalist', usage: 30 },
      { hex: '#D4AF37', cmyk: [0, 17, 74, 17], meaning: 'Metalik altın — lüks', usage: 15 },
      { hex: '#8B8B8B', cmyk: [0, 0, 0, 45], meaning: 'Gri — nötr, sofistike', usage: 5 },
    ],
    enerjik: [
      { hex: '#FF1493', cmyk: [0, 92, 42, 0], meaning: 'Pembe — cesur, genç', usage: 40 },
      { hex: '#FFD700', cmyk: [0, 10, 100, 0], meaning: 'Sarı — dikkat çekici', usage: 25 },
      { hex: '#1C1C1C', cmyk: [0, 0, 0, 89], meaning: 'Koyu gri — kontrast', usage: 25 },
      { hex: '#00CED1', cmyk: [57, 0, 17, 0], meaning: 'Turkuaz — taze, modern', usage: 10 },
    ],
  },
  hukuk: {
    klasik: [
      { hex: '#1B2A4A', cmyk: [64, 40, 0, 71], meaning: 'Lacivert — otorite, güven', usage: 50 },
      { hex: '#C9B078', cmyk: [0, 12, 40, 21], meaning: 'Altın — prestij', usage: 20 },
      { hex: '#FFFFFF', cmyk: [0, 0, 0, 0], meaning: 'Beyaz — netlik, dürüstlük', usage: 25 },
      { hex: '#8B4513', cmyk: [0, 50, 86, 45], meaning: 'Kahve — gelenek, sağlamlık', usage: 5 },
    ],
  },
  sağlık: {
    sakin: [
      { hex: '#2ECC71', cmyk: [55, 0, 45, 0], meaning: 'Yeşil — sağlık, doğallık', usage: 40 },
      { hex: '#FFFFFF', cmyk: [0, 0, 0, 0], meaning: 'Beyaz — hijyen, temizlik', usage: 35 },
      { hex: '#3498DB', cmyk: [67, 27, 0, 0], meaning: 'Mavi — güven, sakinlik', usage: 20 },
      { hex: '#2C3E50', cmyk: [50, 20, 0, 69], meaning: 'Koyu mavi — profesyonellik', usage: 5 },
    ],
  },
};

// Fallback palettes by mood only
const MOOD_PALETTES: Record<string, { hex: string; cmyk: [number, number, number, number]; meaning: string; usage: number }[]> = {
  modern: [
    { hex: '#1A1A1A', cmyk: [0, 0, 0, 90], meaning: 'Koyu — temel, güçlü', usage: 50 },
    { hex: '#0066FF', cmyk: [100, 60, 0, 0], meaning: 'Mavi — dijital, güven', usage: 25 },
    { hex: '#FFFFFF', cmyk: [0, 0, 0, 0], meaning: 'Beyaz — boşluk, nefes', usage: 20 },
    { hex: '#FF3366', cmyk: [0, 80, 60, 0], meaning: 'Kırmızı-pembe — vurgu', usage: 5 },
  ],
  klasik: [
    { hex: '#2C3E50', cmyk: [50, 20, 0, 69], meaning: 'Koyu mavi — gelenek', usage: 45 },
    { hex: '#ECF0F1', cmyk: [1, 0, 0, 6], meaning: 'Açık gri — arka plan', usage: 30 },
    { hex: '#C9A84C', cmyk: [0, 16, 62, 21], meaning: 'Altın — prestij', usage: 15 },
    { hex: '#E74C3C', cmyk: [0, 67, 74, 9], meaning: 'Kırmızı — vurgu', usage: 10 },
  ],
  enerjik: [
    { hex: '#FF4500', cmyk: [0, 73, 100, 0], meaning: 'Turuncu — enerji, hareket', usage: 35 },
    { hex: '#FFDD00', cmyk: [0, 7, 99, 0], meaning: 'Sarı — neşe, dikkat', usage: 25 },
    { hex: '#1A1A2E', cmyk: [44, 44, 0, 82], meaning: 'Lacivert — kontrast', usage: 25 },
    { hex: '#00D2FF', cmyk: [57, 0, 3, 0], meaning: 'Cyan — fresh, dinamik', usage: 15 },
  ],
  sakin: [
    { hex: '#A8D8EA', cmyk: [28, 0, 3, 0], meaning: 'Açık mavi — huzur', usage: 40 },
    { hex: '#F8F4E6', cmyk: [0, 2, 7, 3], meaning: 'Krem — yumuşaklık', usage: 30 },
    { hex: '#B8C9A8', cmyk: [20, 0, 16, 21], meaning: 'Adaçayı — doğa, denge', usage: 20 },
    { hex: '#D4A574', cmyk: [0, 22, 45, 17], meaning: 'Kum — sıcaklık', usage: 10 },
  ],
  lüks: [
    { hex: '#0A0A0A', cmyk: [0, 0, 0, 96], meaning: 'Derin siyah — eksklüzivite', usage: 50 },
    { hex: '#D4AF37', cmyk: [0, 17, 74, 17], meaning: 'Metalik altın — zenginlik', usage: 25 },
    { hex: '#F5F5F0', cmyk: [0, 0, 2, 4], meaning: 'Kirli beyaz — kalite', usage: 15 },
    { hex: '#800020', cmyk: [0, 100, 75, 50], meaning: 'Bordo — asalet', usage: 10 },
  ],
  samimi: [
    { hex: '#FF6B6B', cmyk: [0, 58, 58, 0], meaning: 'Mercan — sıcak, arkadaş canlısı', usage: 35 },
    { hex: '#FFE66D', cmyk: [0, 5, 50, 0], meaning: 'Açık sarı — neşeli', usage: 30 },
    { hex: '#4ECDC4', cmyk: [52, 0, 20, 0], meaning: 'Turkuaz — cana yakın', usage: 25 },
    { hex: '#2C3E50', cmyk: [50, 20, 0, 69], meaning: 'Koyu — okunaklı metin', usage: 10 },
  ],
};

async function execGenerateColorPalette(input: Record<string, unknown>): Promise<unknown> {
  const industry = String(input.industry ?? '').toLowerCase();
  const mood = String(input.mood ?? '').toLowerCase();
  const count = typeof input.count === 'number' && input.count > 0 ? input.count : 5;

  // Try exact match first
  const industryPalettes = COLOR_KNOWLEDGE[industry];
  const palette = industryPalettes?.[mood] ?? MOOD_PALETTES[mood] ?? MOOD_PALETTES.modern!;

  const selected = palette.slice(0, count);
  const existingColors = typeof input.existingColors === 'string'
    ? input.existingColors.split(',').map((c) => c.trim()).filter(Boolean)
    : [];

  return {
    industry,
    mood,
    palette: selected.map((c, i) => ({
      index: i,
      hex: c.hex,
      cmyk: `cmyk(${c.cmyk.join('%, ')}%)`,
      meaning: c.meaning,
      usagePercent: c.usage,
      role: i === 0 ? 'primary' : i === 1 ? 'secondary' : i === selected.length - 1 ? 'accent' : 'support',
    })),
    existingColors: existingColors.length > 0 ? existingColors : undefined,
    harmony: mood === 'enerjik' ? 'complementary / triadic' : mood === 'klasik' ? 'analogous / traditional' : mood === 'lüks' ? 'monochromatic + metallic accent' : 'balanced (60-30-10 rule)',
    usageGuide: '60% primary (arka planlar, geniş alanlar), 30% secondary (bölüm başlıkları, kutular), 10% accent (CTA butonları, vurgular)',
  };
}

async function execSuggestFontPairing(input: Record<string, unknown>): Promise<unknown> {
  const style = String(input.style ?? 'modern-minimal').toLowerCase();
  const usage = String(input.usage ?? 'brand-identity').toLowerCase();
  const lang = String(input.language ?? 'latin').toLowerCase();

  const pairings: Record<string, Array<{ heading: string; headingType: string; body: string; bodyType: string; import: string; character: string }>> = {
    'modern-minimal': [
      { heading: 'Inter', headingType: 'sans-serif', body: 'Inter', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap");', character: 'Temiz, nötr, profesyonel. Startup ve tech favorisi.' },
      { heading: 'DM Sans', headingType: 'sans-serif', body: 'DM Sans', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap");', character: 'Geometrik, yumuşak köşeler, davetkar.' },
      { heading: 'Space Grotesk', headingType: 'sans-serif', body: 'Space Grotesk', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap");', character: 'Keskin, teknik, kendine özgü karakter.' },
    ],
    'classic-serif': [
      { heading: 'Playfair Display', headingType: 'serif', body: 'Lora', bodyType: 'serif', import: '@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Lora:wght@400;500&display=swap");', character: 'Zarif, edebi, zamansız. Hukuk ve yayıncılık için ideal.' },
      { heading: 'Cormorant Garamond', headingType: 'serif', body: 'Libre Baskerville', bodyType: 'serif', import: '@import url("https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Libre+Baskerville:wght@400;700&display=swap");', character: 'Klasik kitap estetiği, prestijli.' },
      { heading: 'EB Garamond', headingType: 'serif', body: 'Source Serif 4', bodyType: 'serif', import: '@import url("https://fonts.googleapis.com/css2?family=EB+Garamond:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=swap");', character: 'Rönesans esintili, akademik his.' },
    ],
    'playful': [
      { heading: 'Fredoka', headingType: 'display', body: 'Nunito', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&family=Nunito:wght@400;600;700&display=swap");', character: 'Yuvarlak, arkadaş canlısı, çocuk markaları ve F&B için.' },
      { heading: 'Baloo 2', headingType: 'display', body: 'Quicksand', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Baloo+2:wght@400;500;600;700&family=Quicksand:wght@400;500;600&display=swap");', character: 'Eğlenceli, yumuşak, Hint esintili.' },
      { heading: 'Bubblegum Sans', headingType: 'display', body: 'Nunito Sans', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Bubblegum+Sans&family=Nunito+Sans:wght@400;600;700&display=swap");', character: 'El yazısı havası, neşeli, gündelik.' },
    ],
    'luxury': [
      { heading: 'Playfair Display', headingType: 'serif', body: 'Montserrat', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600;700&family=Montserrat:wght@300;400;500&display=swap");', character: 'Kontrast = lüks. Serif başlık + sans gövde klasik premium formülü.' },
      { heading: 'Cormorant', headingType: 'serif', body: 'Jost', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Cormorant:wght@400;500;600;700&family=Jost:wght@300;400;500&display=swap");', character: 'İnce serif + geometrik sans. Moda ve kuyumculuk.' },
      { heading: 'Bodoni Moda', headingType: 'serif', body: 'Raleway', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Bodoni+Moda:wght@400;500;600;700&family=Raleway:wght@300;400;500&display=swap");', character: 'Yüksek kontrast, Didone stil. Ultra lüks.' },
    ],
    'tech': [
      { heading: 'JetBrains Mono', headingType: 'mono', body: 'Inter', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&family=Inter:wght@400;500&display=swap");', character: 'Mono başlık + sans gövde. Developer/SaaS estetiği.' },
      { heading: 'Space Grotesk', headingType: 'sans-serif', body: 'DM Sans', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=DM+Sans:wght@400;500&display=swap");', character: 'Fütüristik, keskin, yapay zeka/blockchain için.' },
      { heading: 'Sora', headingType: 'sans-serif', body: 'Sora', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700&display=swap");', character: 'Kompakt, modern, fintech/startup.' },
    ],
    'handcrafted': [
      { heading: 'Caveat', headingType: 'handwriting', body: 'Nunito', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Nunito:wght@400;600&display=swap");', character: 'Samimi el yazısı + okunaklı gövde. Butik/artisan markalar.' },
      { heading: 'Amatic SC', headingType: 'handwriting', body: 'Josefin Slab', bodyType: 'slab-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Amatic+SC:wght@400;700&family=Josefin+Slab:wght@400;600&display=swap");', character: 'Sanatsal, bohem, organik ürünler için.' },
      { heading: 'Kalam', headingType: 'handwriting', body: 'Lato', bodyType: 'sans-serif', import: '@import url("https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&family=Lato:wght@400;700&display=swap");', character: 'Hint kaligrafi esintisi, sıcak ve kişisel.' },
    ],
  };

  const matches = pairings[style] ?? pairings['modern-minimal']!;

  // Language-specific notes
  const langNotes: Record<string, string> = {
    tr: 'Türkçe için tüm önerilen fontlar ş, ğ, ı, İ, ü, ö, ç karakterlerini destekler.',
    de: 'Deutsch: Alle Fonts unterstützen ä, ö, ü, ß.',
    ar: 'Arapça için: önerilen fontlar Arap alfabesi için optimize edilmemiş olabilir. Noto Sans Arabic veya Amiri alternatif olarak düşünülebilir.',
  };

  return {
    style,
    usage,
    pairings: matches.map((p) => ({
      heading: { font: p.heading, type: p.headingType },
      body: { font: p.body, type: p.bodyType },
      cssImport: p.import,
      character: p.character,
    })),
    languageNote: langNotes[lang] ?? undefined,
    usageTips: usage === 'logo' ? 'Logo için heading fontunu kullan, kerning ayarlarıyla oyna.' : usage === 'web' ? 'Body fontunu 16-18px, heading\'i 2x-3x oranında kullan.' : 'Print için en az 300 DPI, heading fontunu outline\'a çevirmeyi unutma.',
  };
}

// Logo concept styles by industry
const LOGO_CONCEPTS: Record<string, Array<{ style: string; approach: string; iconType: string; typography: string; colorApproach: string }>> = {
  restoran: [
    { style: 'Minimalist Line Art', approach: 'Tek çizgiyle tabak/çatal/bıçak kontürü', iconType: 'Line art ikon', typography: 'İnce serif veya elegant sans', colorApproach: 'Monokrom + tek vurgu rengi' },
    { style: 'Vintage Badge', approach: 'Dairesel amblem, kuruluş yılıyla', iconType: 'Merkezde şef silüeti veya malzeme', typography: 'Serif + script kombinasyonu', colorApproach: 'Gold foil + mat siyah veya koyu yeşil' },
    { style: 'Modern Typographic', approach: 'Özel lettering, isim odaklı', iconType: 'İkon yok veya minimal nokta', typography: 'Custom/modifiye edilmiş kalın sans', colorApproach: 'Canlı tek renk veya degrade' },
    { style: 'Nature Organic', approach: 'Yaprak/tahıl/ateş gibi doğal form', iconType: 'Organik şekilli ikon', typography: 'Yuvarlak, dost canlısı sans', colorApproach: 'Toprak tonları + yeşil' },
  ],
  teknoloji: [
    { style: 'Geometric Abstract', approach: 'Geometrik şekillerle soyut sembol', iconType: 'Altıgen/dörtgen/daire kombinasyonu', typography: 'Geometric sans (Space Grotesk vb)', colorApproach: 'Gradient mavi-mor veya cyan' },
    { style: 'Minimal Lettermark', approach: 'İsim baş harflerinden geometrik monogram', iconType: 'Monogram/lettermark', typography: 'Temiz, ince sans-serif', colorApproach: 'Tek renk, genelde mavi veya siyah' },
    { style: 'Circuit/Tech Mark', approach: 'Devre kartı veya node bağlantıları', iconType: 'Teknik, ağ benzeri ikon', typography: 'Mono veya teknik sans', colorApproach: 'Neon vurgulu koyu tema' },
  ],
  moda: [
    { style: 'Elegant Wordmark', approach: 'Özel tipografi, isim ön planda', iconType: 'İkon yok veya çok küçük', typography: 'Didone/Bodoni yüksek kontrast', colorApproach: 'Siyah-beyaz, altın vurgu' },
    { style: 'Minimal Symbol', approach: 'Tek, güçlü soyut sembol', iconType: 'Basit geometrik veya organik', typography: 'Modern sans, sembolün yanında', colorApproach: 'Monokrom, lüks his' },
    { style: 'Signature Script', approach: 'El yazısı/script ağırlıklı logo', iconType: 'Akıcı çizgi veya yok', typography: 'Script/el yazısı + küçük sans alt metin', colorApproach: 'Soft pastel veya metalik' },
  ],
};

const DEFAULT_LOGO_CONCEPTS = [
  { style: 'Minimalist Modern', approach: 'Sade geometrik form, az ama öz', iconType: 'Soyut geometrik ikon', typography: 'Temiz sans-serif (Inter, DM Sans)', colorApproach: 'Monokrom + tek vurgu' },
  { style: 'Classic Badge', approach: 'Dairesel/kalkan amblem, geleneksel', iconType: 'Merkezi sembol', typography: 'Serif başlık + sans alt metin', colorApproach: '2-3 klasik renk' },
  { style: 'Typographic Focus', approach: 'Tamamen yazıya dayalı, özel lettering', iconType: 'Yok, tipografi ön planda', typography: 'Custom/modifiye display font', colorApproach: 'Tek veya iki renk' },
  { style: 'Playful Mascot', approach: 'Karakter/maskot odaklı, arkadaş canlısı', iconType: 'İllüstratif maskot', typography: 'Yuvarlak, eğlenceli font', colorApproach: 'Canlı, çok renkli' },
  { style: 'Abstract Art', approach: 'Sanatsal, yoruma açık soyut form', iconType: 'Serbest form, organik', typography: 'İnce, zarif font', colorApproach: 'Gradient veya su bazlı doku' },
];

async function execGenerateLogoConcepts(input: Record<string, unknown>): Promise<unknown> {
  const businessName = String(input.businessName ?? '');
  const industry = String(input.industry ?? '').toLowerCase();
  const values = String(input.values ?? '');
  const preferences = String(input.preferences ?? '');

  const baseConcepts = LOGO_CONCEPTS[industry] ?? DEFAULT_LOGO_CONCEPTS;

  return {
    businessName,
    industry,
    values: values || undefined,
    preferences: preferences || undefined,
    conceptCount: baseConcepts.length,
    concepts: baseConcepts.map((c, i) => ({
      id: i + 1,
      name: c.style,
      approach: c.approach,
      iconType: c.iconType,
      typography: c.typography,
      colorApproach: c.colorApproach,
      aiImagePrompt: `Logo design for "${businessName}", ${industry} industry. Style: ${c.style}. ${c.approach}. ${c.iconType}. Typography: ${c.typography}. Colors: ${c.colorApproach}. Professional, high-quality vector logo on clean background. ${values ? `Brand values: ${values}.` : ''} ${preferences ? `Preferences: ${preferences}.` : ''}`,
      suitableFor: i === 0 ? 'Web + sosyal medya (dijital öncelikli)' : i === 1 ? 'Print + kartvizit + tabela' : i === 2 ? 'App icon + favicon + small spaces' : 'Büyük format + merch + araç kaplama',
    })),
    nextSteps: 'Bu konseptleri müşteriyle paylaş. Beğenilen yönü seç, refine et. AI image generation için concept.aiImagePrompt kullan.',
  };
}

// Print specifications database (all values in mm, 300 DPI)
const PRINT_SPECS: Record<string, { name: string; wMm: number; hMm: number; bleedMm: number; safeMm: number; dpi: number; colorProfile: string; paper: string; notes: string }> = {
  'flyer-a5': { name: 'Flyer A5', wMm: 148, hMm: 210, bleedMm: 3, safeMm: 5, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '135-170g/m² kuşe veya mat', notes: 'Tek veya çift taraflı. Dijital baskı için 300 DPI yeterli, ofset için vektör tercih et.' },
  'flyer-a6': { name: 'Flyer A6', wMm: 105, hMm: 148, bleedMm: 3, safeMm: 4, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '170-250g/m² kuşe', notes: 'Kartvizit boyutunda flyer. Küçük alan = büyük punto + az metin.' },
  'business-card': { name: 'Kartvizit', wMm: 85, hMm: 55, bleedMm: 3, safeMm: 4, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '300-400g/m² mat veya kuşe', notes: 'EU standart 85x55mm. Spot UV veya foil için ayrı katman hazırla.' },
  'poster-a3': { name: 'Poster A3', wMm: 297, hMm: 420, bleedMm: 3, safeMm: 8, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '135-200g/m² kuşe veya mat', notes: 'Büyük format. Görseller en az 300 DPI efektif çözünürlükte olmalı.' },
  'poster-a2': { name: 'Poster A2', wMm: 420, hMm: 594, bleedMm: 3, safeMm: 10, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '135-200g/m²', notes: 'A2 ve üstü için vektör ağırlıklı tasarım önerilir. Raster görseller 150-200 DPI efektif tolere edilebilir.' },
  'poster-a1': { name: 'Poster A1', wMm: 594, hMm: 841, bleedMm: 3, safeMm: 15, dpi: 200, colorProfile: 'CMYK / ISO Coated v2', paper: '135-200g/m²', notes: 'A1 büyük format. 200 DPI yeterli. Metinleri vektör tut. Görselleri 150+ DPI efektifte bırak.' },
  'banner-rollup': { name: 'Roll-up Banner', wMm: 850, hMm: 2000, bleedMm: 0, safeMm: 30, dpi: 150, colorProfile: 'CMYK / ISO Coated v2', paper: 'PVC branda (frontlit)', notes: 'Üst ve altta mekanizma payı var. Alt 30cm ve üst 10cm genelde görünmez, kritik içeriği ortala.' },
  'brosur-dl': { name: 'Broşür DL', wMm: 99, hMm: 210, bleedMm: 3, safeMm: 5, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '135-170g/m²', notes: 'DL = 1/3 A4. Zarf içine sığar. Katlama çizgilerini işaretle (crease).' },
  'brosur-a4': { name: 'Broşür A4', wMm: 210, hMm: 297, bleedMm: 3, safeMm: 5, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '135-200g/m²', notes: 'A4 katlamalı. Tri-fold için panel genişlikleri: 98-100-99mm (tam eşit değil, iç panel biraz dar).' },
  'letterhead': { name: 'Antetli Kağıt', wMm: 210, hMm: 297, bleedMm: 0, safeMm: 15, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '90-100g/m² ofset', notes: 'Bleed yok. Lazer/inkjet yazıcıda basılabilir olmalı. Logo ve iletişim bilgileri üst/alt.' },
  'folder': { name: 'Klasör (A4)', wMm: 450, hMm: 315, bleedMm: 3, safeMm: 10, dpi: 300, colorProfile: 'CMYK / ISO Coated v2', paper: '350-400g/m²', notes: 'Açık hali 450x315mm. Katlama ve cep payları için die-cut şablonu gerekir.' },
  'social-media-post': { name: 'Sosyal Medya Post', wMm: 1080, hMm: 1080, bleedMm: 0, safeMm: 0, dpi: 72, colorProfile: 'RGB / sRGB', paper: 'N/A (dijital)', notes: '1080x1080px @72 DPI. Instagram/Facebook feed. Merkezde kritik içerik, kenarlarda boşluk.' },
  'social-media-story': { name: 'Sosyal Medya Story', wMm: 1080, hMm: 1920, bleedMm: 0, safeMm: 0, dpi: 72, colorProfile: 'RGB / sRGB', paper: 'N/A (dijital)', notes: '1080x1920px @72 DPI. Üst ve alt %14 (yaklaşık 270px) UI elementleri tarafından kapatılabilir.' },
};

async function execCalculatePrintSpecs(input: Record<string, unknown>): Promise<unknown> {
  const format = String(input.format ?? '');
  const hasBleed = input.hasBleed !== false;

  if (format && PRINT_SPECS[format]) {
    const spec = PRINT_SPECS[format];
    const widthWithBleed = spec.bleedMm > 0 && hasBleed ? spec.wMm + spec.bleedMm * 2 : spec.wMm;
    const heightWithBleed = spec.bleedMm > 0 && hasBleed ? spec.hMm + spec.bleedMm * 2 : spec.hMm;
    return {
      format: spec.name,
      dimensions: { widthMm: spec.wMm, heightMm: spec.hMm },
      withBleed: { widthMm: widthWithBleed, heightMm: heightWithBleed },
      bleed: { mm: spec.bleedMm, note: 'Kesim payı. Bu alana arka planı uzat, kritik içerik koyma.' },
      safeZone: { mm: spec.safeMm, note: 'Güvenli alan. Tüm kritik içerik (metin, logo) bu sınır içinde kalmalı.' },
      pixelDimensions: { widthPx: Math.round((widthWithBleed / 25.4) * spec.dpi), heightPx: Math.round((heightWithBleed / 25.4) * spec.dpi), atDpi: spec.dpi },
      colorProfile: spec.colorProfile,
      recommendedPaper: spec.paper,
      notes: spec.notes,
    };
  }

  // Custom size
  const w = typeof input.customWidthMm === 'number' ? input.customWidthMm : 210;
  const h = typeof input.customHeightMm === 'number' ? input.customHeightMm : 297;
  const bleedMm = hasBleed ? 3 : 0;
  const safeMm = Math.max(3, Math.min(w, h) * 0.03);
  const folding = typeof input.folding === 'string' ? input.folding : undefined;

  const result: any = {
    format: `Custom (${w}x${h}mm)`,
    dimensions: { widthMm: w, heightMm: h },
    withBleed: { widthMm: w + bleedMm * 2, heightMm: h + bleedMm * 2 },
    bleed: { mm: bleedMm, note: 'Standart 3mm kesim payı' },
    safeZone: { mm: Math.round(safeMm), note: 'Kritik içerik bu sınır içinde kalmalı' },
    pixelDimensions: { widthPx: Math.round(((w + bleedMm * 2) / 25.4) * 300), heightPx: Math.round(((h + bleedMm * 2) / 25.4) * 300), atDpi: 300 },
    colorProfile: 'CMYK / ISO Coated v2',
    recommendedPaper: 'Müşteriyle teyit et',
  };

  if (folding) {
    result.folding = folding;
    if (folding === 'tri-fold') {
      result.panels = `${w / 3 - 1}/${w / 3}/${w / 3 - 1} mm (iç panel biraz dar)`;
    } else if (folding === 'half-fold') {
      result.panels = `${w / 2}/${w / 2} mm`;
    } else if (folding === 'z-fold') {
      result.panels = `${w / 3}/${w / 3}/${w / 3} mm`;
    }
  }

  return result;
}

// Color psychology database
const COLOR_PSYCHOLOGY: Record<string, { emotions: string[]; industries: string[]; cultureTR: string; cultureDE: string; bestWith: string[]; avoidWith: string[] }> = {
  '#FF0000': { emotions: ['tutku', 'aciliyet', 'heyecan', 'güç'], industries: ['restoran', 'eğlence', 'spor'], cultureTR: 'Bayrak, güç, cesaret', cultureDE: 'Tehlike, dur, yasak', bestWith: ['#FFFFFF', '#000000', '#FFD700'], avoidWith: ['#00FF00'] },
  '#0000FF': { emotions: ['güven', 'sakinlik', 'profesyonellik'], industries: ['finans', 'teknoloji', 'sağlık'], cultureTR: 'Nazar boncuğu, koruma', cultureDE: 'Güven, kurumsallık', bestWith: ['#FFFFFF', '#FFD700', '#00D4FF'], avoidWith: ['#FF0000'] },
  '#FFD700': { emotions: ['zenginlik', 'sıcaklık', 'iyimserlik'], industries: ['lüks', 'gıda', 'konaklama'], cultureTR: 'Altın, zenginlik, bolluk', cultureDE: 'Kalite, premium', bestWith: ['#000000', '#1A1A2E', '#800020'], avoidWith: ['#FFFF00'] },
  '#008000': { emotions: ['doğa', 'büyüme', 'sağlık', 'huzur'], industries: ['organik', 'sağlık', 'çevre'], cultureTR: 'Doğa, İslam rengi, huzur', cultureDE: 'Çevre, sürdürülebilirlik', bestWith: ['#FFFFFF', '#8B4513', '#FFD700'], avoidWith: ['#FF0000'] },
  '#FFA500': { emotions: ['enerji', 'sıcaklık', 'yaratıcılık'], industries: ['eğlence', 'eğitim', 'perakende'], cultureTR: 'Canlılık, sıcaklık', cultureDE: 'Sonbahar, uygun fiyat', bestWith: ['#1A1A1A', '#FFFFFF', '#008080'], avoidWith: ['#FF00FF'] },
  '#800080': { emotions: ['lüks', 'yaratıcılık', 'bilgelik'], industries: ['güzellik', 'eğitim', 'sanat'], cultureTR: 'Asalet, mistisizm', cultureDE: 'Yaratıcılık, spiritüellik', bestWith: ['#FFD700', '#FFFFFF', '#FF1493'], avoidWith: ['#008000'] },
  '#000000': { emotions: ['güç', 'zarafet', 'gizem'], industries: ['lüks', 'moda', 'teknoloji'], cultureTR: 'Güç, ciddiyet, yas', cultureDE: 'Premium, modern, minimalist', bestWith: ['#FFFFFF', '#FFD700', '#D4AF37'], avoidWith: [] },
  '#FFC0CB': { emotions: ['romantizm', 'şefkat', 'kadınsılık'], industries: ['kozmetik', 'moda', 'çocuk'], cultureTR: 'Kadınsı, yumuşak', cultureDE: 'Kadınsı, nazik', bestWith: ['#808080', '#FFFFFF', '#FFD700'], avoidWith: ['#FF0000'] },
  '#808080': { emotions: ['denge', 'nötrlük', 'profesyonellik'], industries: ['kurumsal', 'hukuk', 'finans'], cultureTR: 'Nötr, ciddi', cultureDE: 'Profesyonel, güvenilir', bestWith: ['#0066FF', '#000000', '#FFFFFF'], avoidWith: [] },
};

async function execAnalyzeDesignPsychology(input: Record<string, unknown>): Promise<unknown> {
  const designType = String(input.designType ?? '');
  const colorsRaw = typeof input.colors === 'string' ? input.colors : '';
  const style = String(input.style ?? '');
  const targetEmotion = String(input.targetEmotion ?? '');
  const region = String(input.region ?? 'tr').toLowerCase();
  const industry = String(input.industry ?? '');

  const colors = colorsRaw.split(',').map((c) => c.trim()).filter(Boolean);
  const colorAnalysis = colors.map((hex) => {
    const normalized = hex.toUpperCase();
    const data = COLOR_PSYCHOLOGY[normalized];
    if (!data) {
      // Try approximate matching
      const r = parseInt(normalized.slice(1, 3), 16);
      const g = parseInt(normalized.slice(3, 5), 16);
      const b = parseInt(normalized.slice(5, 7), 16);
      let closest = 'analiz edilemedi';
      if (r > 200 && g < 100 && b < 100) closest = 'kırmızı tonu — tutku, aciliyet';
      else if (r < 100 && g < 100 && b > 200) closest = 'mavi tonu — güven, profesyonellik';
      else if (r > 200 && g > 200 && b < 50) closest = 'sarı tonu — iyimserlik, enerji';
      else if (r < 80 && g > 150 && b < 80) closest = 'yeşil tonu — doğa, büyüme';
      else if (r > 200 && g > 100 && b < 20) closest = 'turuncu tonu — sıcaklık, yaratıcılık';
      else if (r > 150 && g < 50 && b > 150) closest = 'mor tonu — lüks, yaratıcılık';
      else if (r < 50 && g < 50 && b < 50) closest = 'siyah — güç, zarafet';
      else if (r > 200 && g > 200 && b > 200) closest = 'beyaz — temizlik, saflık';
      return { hex: normalized, match: 'approximate', analysis: closest };
    }
    return {
      hex: normalized,
      match: 'exact',
      emotions: data.emotions,
      industries: data.industries,
      cultureTR: data.cultureTR,
      cultureDE: data.cultureDE,
      bestCombinations: data.bestWith,
      avoidWith: data.avoidWith.length > 0 ? data.avoidWith : undefined,
    };
  });

  // Style psychology
  const styleAnalysis: Record<string, { emotion: string; audience: string; strengths: string[]; risks: string[] }> = {
    minimalist: { emotion: 'Sadelik, netlik, güven', audience: 'Premium, eğitimli, 25-45 yaş', strengths: ['Okunabilirlik yüksek', 'Zamansız', 'Profesyonel algı'], risks: ['Fazla soğuk/steril algılanabilir', 'Duygusal bağ kurmak zor'] },
    bold: { emotion: 'Güç, cesaret, dinamizm', audience: 'Genç, enerjik, 18-35 yaş', strengths: ['Dikkat çekici', 'Akılda kalıcı', 'Enerji verir'], risks: ['Agresif algılanabilir', 'Uzun metinlerde yorucu'] },
    elegant: { emotion: 'Zarafet, lüks, incelik', audience: 'Varlıklı, 30-55 yaş', strengths: ['Premium algı', 'Güven verir', 'Detay odaklı'], risks: ['Ulaşılmaz algılanabilir', 'Genç kitleye hitap etmez'] },
    playful: { emotion: 'Neşe, samimiyet, erişilebilirlik', audience: 'Genç, aileler, 15-35 yaş', strengths: ['Sıcak ve davetkar', 'Marka sadakati yüksek', 'Viral potansiyel'], risks: ['Ciddiye alınmayabilir', 'Kurumsal işlerde uygun değil'] },
    corporate: { emotion: 'Güven, istikrar, otorite', audience: 'Profesyoneller, B2B, 30-60 yaş', strengths: ['Güvenilir', 'Kurumsal imaj', 'Uzun vadeli algı'], risks: ['Sıkıcı algılanabilir', 'Farklılaşmak zor'] },
    brutalist: { emotion: 'Ham, otantik, cesur', audience: 'Tasarım bilinçli, genç, 20-35 yaş', strengths: ['Son derece ayırt edici', 'Trend/hip', 'Güçlü karakter'], risks: ['Ana akım kitleye hitap etmez', 'Çabuk eskir'] },
  };

  const styleData = styleAnalysis[style] ?? { emotion: 'Analiz için daha fazla bilgi gerekli', audience: 'Belirtilmedi', strengths: [], risks: [] };

  // Cultural context
  const culturalContext = region === 'tr'
    ? { note: 'Türkiye pazarında: Kırmızı (güç, bayrak), mavi (nazar), yeşil (İslam, doğa) güçlü kültürel anlam taşır. Batı tarzı minimalizm genç kitleye hitap eder. Geleneksel motifler ve sıcak renkler Anadolu kitlesinde karşılık bulur.' }
    : region === 'de'
    ? { note: 'Almanya pazarında: Minimalizm ve işlevsellik ön planda. Siyah-beyaz-kırmızı güçlü. Yeşil = çevre bilinci (yüksek). Mavi = güven ve teknoloji. Altın/lüks abartı algılanabilir. Tipografi ve grid sistemi çok önemli.' }
    : { note: 'Global/European context: Temiz tasarım, accessibility, ve kültürel hassasiyet dengesi.' };

  return {
    designType,
    industry: industry || undefined,
    targetEmotion: targetEmotion || undefined,
    region,
    colorAnalysis: colorAnalysis.length > 0 ? colorAnalysis : 'Renk belirtilmedi. Analiz için ana renkleri hex koduyla gir (örn. "#FF0000,#0000FF").',
    styleAnalysis: { style: style || 'belirtilmedi', ...styleData },
    culturalContext,
    overallAssessment: targetEmotion
      ? `Hedeflenen "${targetEmotion}" duygusu — ${styleData.emotion.includes(targetEmotion) ? 'stil seçimi hedefle UYUMLU' : 'stil ve hedef duygu arasında GERİLİM olabilir, gözden geçir.'}`
      : 'Hedef duygu belirtilmemiş. Daha spesifik analiz için targetEmotion parametresini ekle.',
    recommendations: [
      'Renk kontrastı erişilebilirlik için en az 4.5:1 olmalı (WCAG AA)',
      industry ? `${industry} sektöründe rakiplerden farklılaşmak için beklenmedik bir vurgu rengi düşün.` : 'Sektör belirtirsen rakip analizi de eklerim.',
      'Tipografi stille uyumlu olmalı: ' + (style === 'elegant' || style === 'luxury' ? 'serif başlık + sans gövde.' : style === 'playful' ? 'yuvarlak display font + sans gövde.' : 'sans-serif ağırlıklı.'),
    ],
  };
}

// ── Flyer Layout Generator ──

// Style presets for flyer design
const FLYER_STYLE_PRESETS: Record<string, {
  primaryColor: string; secondaryColor: string; bgColor: string; textColor: string; accentColor: string;
  headingFont: string; bodyFont: string;
  layoutPattern: 'centered' | 'split' | 'grid' | 'banner' | 'edge-to-edge';
  decorativeElements: string[];
}> = {
  'modern-minimal': {
    primaryColor: '#1A1A1A', secondaryColor: '#F5F5F5', bgColor: '#FFFFFF', textColor: '#1A1A1A', accentColor: '#0066FF',
    headingFont: 'Inter', bodyFont: 'Inter',
    layoutPattern: 'split',
    decorativeElements: ['thin-line-divider', 'geometric-accent-dot'],
  },
  'elegant-restaurant': {
    primaryColor: '#1A1A1A', secondaryColor: '#F5F0EB', bgColor: '#FDFBF7', textColor: '#2C2C2C', accentColor: '#C9A84C',
    headingFont: 'Playfair Display', bodyFont: 'Lora',
    layoutPattern: 'centered',
    decorativeElements: ['gold-filigree-corner', 'ornamental-divider', 'elegant-frame'],
  },
  'bold-promo': {
    primaryColor: '#FF4500', secondaryColor: '#1A1A2E', bgColor: '#FFFFFF', textColor: '#1A1A2E', accentColor: '#FFDD00',
    headingFont: 'Bebas Neue', bodyFont: 'Open Sans',
    layoutPattern: 'banner',
    decorativeElements: ['bold-stripe', 'starburst-badge', 'diagonal-banner'],
  },
  'vintage-market': {
    primaryColor: '#8B4513', secondaryColor: '#F5DEB3', bgColor: '#FFF8F0', textColor: '#3C280D', accentColor: '#DAA520',
    headingFont: 'Abril Fatface', bodyFont: 'Crimson Text',
    layoutPattern: 'grid',
    decorativeElements: ['vintage-ornament', 'flourish-divider', 'badge-frame'],
  },
  'luxury-boutique': {
    primaryColor: '#0A0A0A', secondaryColor: '#D4AF37', bgColor: '#FAFAFA', textColor: '#0A0A0A', accentColor: '#800020',
    headingFont: 'Cormorant Garamond', bodyFont: 'Montserrat',
    layoutPattern: 'centered',
    decorativeElements: ['gold-thin-border', 'monogram-lettermark', 'luxury-texture-bg'],
  },
  'street-food': {
    primaryColor: '#FF3366', secondaryColor: '#FFD700', bgColor: '#1A1A2E', textColor: '#FFFFFF', accentColor: '#00D4FF',
    headingFont: 'Bangers', bodyFont: 'Nunito',
    layoutPattern: 'edge-to-edge',
    decorativeElements: ['splash-bg', 'neon-glow-text', 'halftone-pattern'],
  },
  'wedding-romantic': {
    primaryColor: '#2C1810', secondaryColor: '#FFF0F5', bgColor: '#FFFDF9', textColor: '#2C1810', accentColor: '#D4A0A0',
    headingFont: 'Playfair Display', bodyFont: 'Cormorant Garamond',
    layoutPattern: 'centered',
    decorativeElements: ['floral-corner', 'elegant-script-divider', 'rose-gold-filigree', 'lace-pattern-bg'],
  },
  'corporate-clean': {
    primaryColor: '#1B2A4A', secondaryColor: '#F0F4F8', bgColor: '#FFFFFF', textColor: '#1B2A4A', accentColor: '#2563EB',
    headingFont: 'Inter', bodyFont: 'Source Sans 3',
    layoutPattern: 'grid',
    decorativeElements: ['geometric-grid-lines', 'data-dot-accent', 'corporate-angle'],
  },
  'real-estate-premium': {
    primaryColor: '#1A1F2E', secondaryColor: '#F5F0E8', bgColor: '#FFFFFF', textColor: '#1A1F2E', accentColor: '#C9A84C',
    headingFont: 'Marcellus', bodyFont: 'Jost',
    layoutPattern: 'split',
    decorativeElements: ['architectural-line', 'gold-accent-bar', 'property-keyline-icon'],
  },
  'automotive-bold': {
    primaryColor: '#0D0D0D', secondaryColor: '#FF1A1A', bgColor: '#FFFFFF', textColor: '#0D0D0D', accentColor: '#FF1A1A',
    headingFont: 'Bebas Neue', bodyFont: 'Rajdhani',
    layoutPattern: 'banner',
    decorativeElements: ['speed-line-diagonal', 'carbon-fiber-texture', 'racing-stripe', 'bold-number-plate'],
  },
};

// QR Code SVG generator — canvas-free, pure SVG
function generateQRCodeSVG(url: string, size = 160): string {
  // Simple QR-alike pattern for visual placeholder
  // In production, use the 'qrcode' npm package for real QR generation
  const cells = 21;
  const cellSize = size / cells;
  const encoded = encodeURIComponent(url);
  const qrAPIURL = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="#FFFFFF" rx="8"/>
  <image href="${qrAPIURL}" width="${size}" height="${size}" x="0" y="0"/>
  <rect x="${size - 24}" y="${size - 24}" width="20" height="20" fill="#FFFFFF" rx="3"/>
  <text x="${size - 14}" y="${size - 9}" font-size="14" font-family="sans-serif" fill="#000000" text-anchor="middle" font-weight="700">QR</text>
</svg>`;
}

// SVG decorative elements library
function getDecorativeSVG(element: string, color: string, width: number): string {
  const w = Math.round(width);
  switch (element) {
    case 'floral-corner':
      return `<svg width="${w}" height="${w}" viewBox="0 0 100 100" style="position:absolute;top:8px;left:8px;opacity:0.15;"><path d="M10 50 Q30 10 50 10 Q70 10 90 50" fill="none" stroke="${color}" stroke-width="1.5"/><circle cx="20" cy="25" r="4" fill="${color}" opacity="0.3"/><circle cx="35" cy="15" r="3" fill="${color}" opacity="0.3"/></svg>`;
    case 'rose-gold-filigree':
      return `<svg width="${w * 2}" height="60" viewBox="0 0 200 60" style="display:block;margin:0 auto;opacity:0.2;"><path d="M10 30 Q50 5 100 30 Q150 55 190 30" fill="none" stroke="${color}" stroke-width="1"/><circle cx="100" cy="30" r="3" fill="${color}"/><path d="M70 30 Q85 15 100 30 Q115 45 130 30" fill="none" stroke="${color}" stroke-width="0.8"/></svg>`;
    case 'architectural-line':
      return `<svg width="${w}" height="3" viewBox="0 0 200 3" style="display:block;margin:0 auto;"><line x1="0" y1="1.5" x2="80" y2="1.5" stroke="${color}" stroke-width="2.5"/><circle cx="95" cy="1.5" r="2.5" fill="${color}"/><line x1="110" y1="1.5" x2="200" y2="1.5" stroke="${color}" stroke-width="1"/></svg>`;
    case 'speed-line-diagonal':
      return `<svg width="${w}" height="${w}" viewBox="0 0 200 200" style="position:absolute;opacity:0.06;" preserveAspectRatio="none"><line x1="0" y1="200" x2="100" y2="0" stroke="${color}" stroke-width="30"/><line x1="50" y1="200" x2="150" y2="0" stroke="${color}" stroke-width="15"/><line x1="100" y1="200" x2="200" y2="0" stroke="${color}" stroke-width="8"/></svg>`;
    case 'geometric-grid-lines':
      return `<svg width="${w}" height="${w}" viewBox="0 0 100 100" style="position:absolute;top:0;left:0;opacity:0.04;"><rect x="10" y="10" width="80" height="80" fill="none" stroke="${color}" stroke-width="0.5"/><line x1="10" y1="30" x2="90" y2="30" stroke="${color}" stroke-width="0.3"/><line x1="10" y1="50" x2="90" y2="50" stroke="${color}" stroke-width="0.3"/><line x1="30" y1="10" x2="30" y2="90" stroke="${color}" stroke-width="0.3"/><line x1="50" y1="10" x2="50" y2="90" stroke="${color}" stroke-width="0.3"/></svg>`;
    case 'racing-stripe':
      return `<svg width="${w / 3}" height="${w * 2}" viewBox="0 0 33 200" style="position:absolute;right:20px;top:0;opacity:0.08;"><rect x="0" y="0" width="15" height="200" fill="${color}"/><rect x="18" y="0" width="5" height="200" fill="${color}"/></svg>`;
    case 'gold-accent-bar':
      return `<svg width="${w}" height="4" viewBox="0 0 200 4" style="display:block;margin:0 auto;"><rect x="0" y="0" width="200" height="4" fill="${color}" opacity="0.4" rx="2"/><rect x="60" y="0" width="80" height="4" fill="${color}" opacity="0.8" rx="2"/></svg>`;
    case 'data-dot-accent':
      return `<svg width="${60}" height="${60}" viewBox="0 0 60 60" style="display:inline-block;opacity:0.5;"><circle cx="10" cy="10" r="3" fill="${color}"/><circle cx="30" cy="10" r="2" fill="${color}" opacity="0.6"/><circle cx="50" cy="10" r="1.5" fill="${color}" opacity="0.3"/><circle cx="10" cy="30" r="2.5" fill="${color}" opacity="0.6"/><circle cx="30" cy="30" r="5" fill="${color}" opacity="0.8"/><circle cx="50" cy="30" r="2" fill="${color}" opacity="0.4"/><circle cx="10" cy="50" r="1.5" fill="${color}" opacity="0.3"/><circle cx="30" cy="50" r="2" fill="${color}" opacity="0.5"/><circle cx="50" cy="50" r="3" fill="${color}" opacity="0.6"/></svg>`;
    case 'lace-pattern-bg':
      return `<svg width="${w}" height="${w}" viewBox="0 0 100 100" style="position:absolute;top:0;left:0;opacity:0.03;"><circle cx="10" cy="10" r="8" fill="none" stroke="${color}" stroke-width="0.5"/><circle cx="10" cy="10" r="3" fill="${color}"/><circle cx="30" cy="10" r="8" fill="none" stroke="${color}" stroke-width="0.5"/><circle cx="30" cy="10" r="3" fill="${color}"/><circle cx="50" cy="10" r="8" fill="none" stroke="${color}" stroke-width="0.5"/><circle cx="50" cy="10" r="3" fill="${color}"/></svg>`;
    case 'carbon-fiber-texture':
      return `<svg width="${w}" height="${w}" viewBox="0 0 100 100" style="position:absolute;top:0;left:0;opacity:0.04;"><rect x="0" y="0" width="100" height="100" fill="none"/><line x1="10" y1="0" x2="0" y2="10" stroke="${color}" stroke-width="0.5"/><line x1="30" y1="0" x2="0" y2="30" stroke="${color}" stroke-width="0.3"/><line x1="60" y1="0" x2="0" y2="60" stroke="${color}" stroke-width="0.5"/><line x1="90" y1="0" x2="0" y2="90" stroke="${color}" stroke-width="0.3"/></svg>`;
    default:
      return '';
  }
}

// Layout HTML templates
function buildFlyerLayoutHTML(config: {
  description: string;
  format: string;
  style: string;
  businessName?: string;
  contactInfo?: string;
  cta?: string;
  offerText?: string;
  language?: string;
  doubleSided?: boolean;
  qrContent?: string;
  layoutPreset: typeof FLYER_STYLE_PRESETS[string];
  spec: any;
  palette: any;
  fonts: any;
}): { frontHtml: string; backHtml?: string } {
  const { layoutPreset, spec, palette, fonts, businessName, contactInfo, cta, offerText, description } = config;
  const lang = config.language ?? 'tr';
  const isDouble = config.doubleSided === true;
  const pxW = spec.pixelDimensions?.widthPx ?? 1748;
  const pxH = spec.pixelDimensions?.heightPx ?? 2480;
  const isPrint = spec.colorProfile?.includes('CMYK');

  const safeL = spec.safeZone?.mm ? Math.round((spec.safeZone.mm / 25.4) * 300) : 40;
  const safeR = pxW - safeL;
  const safeT = safeL;
  const safeB = pxH - safeL;

  const headline = businessName || (lang === 'tr' ? 'Flyer Başlığı' : lang === 'de' ? 'Flyer Titel' : 'Flyer Title');
  const subheadline = offerText || (lang === 'tr' ? 'Özel Teklif' : lang === 'de' ? 'Sonderangebot' : 'Special Offer');
  const ctaText = cta || (lang === 'tr' ? 'Hemen Ara' : lang === 'de' ? 'Jetzt Anrufen' : 'Call Now');
  const contactText = contactInfo || '';
  const langDir = config.language === 'ar' ? 'rtl' : 'ltr';

  const headingFont = fonts?.pairings?.[0]?.heading?.font ?? layoutPreset.headingFont;
  const bodyFont = fonts?.pairings?.[0]?.body?.font ?? layoutPreset.bodyFont;

  const paletteCss = palette?.palette as any[];
  const primaryHex = paletteCss?.[0]?.hex ?? layoutPreset.primaryColor;
  const secondaryHex = paletteCss?.[1]?.hex ?? layoutPreset.secondaryColor;
  const accentHex = paletteCss?.[paletteCss?.length ? paletteCss.length - 1 : 0]?.hex ?? layoutPreset.accentColor;

  const frontHtml = `<!DOCTYPE html>
<html lang="${lang}" dir="${langDir}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, '+')}:wght@400;600;700&family=${bodyFont.replace(/ /g, '+')}:wght@400;600&display=swap');

  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: ${pxW}px;
    height: ${pxH}px;
    overflow: hidden;
    font-family: '${bodyFont}', sans-serif;
    background: ${isPrint ? '#FFFFFF' : layoutPreset.bgColor};
    color: ${layoutPreset.textColor};
    position: relative;
  }

  .bleed-area {
    position: absolute;
    inset: 0;
    background: ${primaryHex};
  }

  .safe-area {
    position: absolute;
    inset: ${safeT}px ${pxW - safeR}px ${pxH - safeB}px ${safeL}px;
    background: ${layoutPreset.bgColor};
    overflow: hidden;
  }

  /* Decorative elements */
  .deco-corner-tl, .deco-corner-tr, .deco-corner-bl, .deco-corner-br {
    position: absolute;
    width: 60px;
    height: 60px;
    border-color: ${accentHex};
    border-style: solid;
    border-width: 2px;
    opacity: 0.3;
  }
  .deco-corner-tl { top: 10px; left: 10px; border-right: none; border-bottom: none; }
  .deco-corner-tr { top: 10px; right: 10px; border-left: none; border-bottom: none; }
  .deco-corner-bl { bottom: 10px; left: 10px; border-right: none; border-top: none; }
  .deco-corner-br { bottom: 10px; right: 10px; border-left: none; border-top: none; }

  .accent-line {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    width: 80px;
    height: 3px;
    background: ${accentHex};
    border-radius: 2px;
  }

  .accent-dot {
    width: 8px;
    height: 8px;
    background: ${accentHex};
    border-radius: 50%;
    display: inline-block;
  }

  /* Typography */
  h1 {
    font-family: '${headingFont}', serif;
    font-size: 72px;
    font-weight: 700;
    line-height: 1.1;
    color: ${primaryHex};
  }

  h2 {
    font-family: '${headingFont}', serif;
    font-size: 42px;
    font-weight: 600;
    color: ${primaryHex};
  }

  .subheadline {
    font-size: 28px;
    font-weight: 400;
    color: ${accentHex};
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .body-text {
    font-size: 22px;
    line-height: 1.6;
    color: ${layoutPreset.textColor};
  }

  .cta-button {
    display: inline-block;
    background: ${accentHex};
    color: #FFFFFF;
    padding: 16px 48px;
    font-size: 24px;
    font-weight: 700;
    border-radius: 8px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .contact-block {
    font-size: 18px;
    line-height: 1.8;
    color: ${layoutPreset.textColor};
  }

  /* Layout patterns */
  .layout-centered {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 32px;
    height: 100%;
    padding: 40px;
  }

  .layout-split {
    display: flex;
    height: 100%;
  }
  .layout-split .split-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px;
    background: ${secondaryHex};
  }
  .layout-split .split-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 60px;
    gap: 24px;
  }

  .layout-banner {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .layout-banner .banner-top {
    background: ${primaryHex};
    color: #FFFFFF;
    padding: 40px 60px;
    text-align: center;
  }
  .layout-banner .banner-top h1 { color: #FFFFFF; }
  .layout-banner .banner-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 40px;
    gap: 24px;
  }
  .layout-banner .banner-bottom {
    background: ${accentHex};
    color: #FFFFFF;
    padding: 30px 60px;
    text-align: center;
    font-size: 28px;
    font-weight: 700;
  }

  .layout-edge-to-edge {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: linear-gradient(135deg, ${primaryHex} 0%, ${secondaryHex} 100%);
  }
  .layout-edge-to-edge .content-overlay {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 28px;
    color: #FFFFFF;
    padding: 40px;
    text-align: center;
  }
  .layout-edge-to-edge .content-overlay h1,
  .layout-edge-to-edge .content-overlay h2 { color: #FFFFFF; }

  /* Offer badge */
  .offer-badge {
    position: absolute;
    top: 40px;
    right: 40px;
    background: ${accentHex};
    color: #FFFFFF;
    padding: 20px 36px;
    border-radius: 50%;
    width: 180px;
    height: 180px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    font-weight: 700;
    transform: rotate(15deg);
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
  }
  .offer-badge .percent { font-size: 42px; line-height: 1; }
  .offer-badge .label { font-size: 18px; text-transform: uppercase; }

  /* Print marks (only visible in print spec) */
  .crop-mark { position: absolute; background: #000; }
  .crop-mark-h { width: 20px; height: 1px; }
  .crop-mark-v { width: 1px; height: 20px; }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="bleed-area"></div>
  <div class="safe-area">

    <!-- Decorative corners for elegant/luxury -->
    ${layoutPreset.layoutPattern === 'centered' ? `
    <div class="deco-corner-tl"></div>
    <div class="deco-corner-tr"></div>
    <div class="deco-corner-bl"></div>
    <div class="deco-corner-br"></div>
    ` : ''}

    <!-- SVG Decorative Elements -->
    ${layoutPreset.decorativeElements.map(el => getDecorativeSVG(el, accentHex, pxW > 1000 ? 300 : 200)).join('\n    ')}

    <!-- Layout: ${layoutPreset.layoutPattern} -->
    ${layoutPreset.layoutPattern === 'centered' ? `
    <div class="layout-centered">
      <div class="accent-line" style="position:static;transform:none;"></div>
      <h1>${headline}</h1>
      ${subheadline ? `<div class="subheadline">${subheadline}</div>` : ''}
      <div class="body-text">${description.slice(0, 120)}</div>
      ${cta ? `<div class="cta-button">${ctaText}</div>` : ''}
      ${contactText ? `<div class="contact-block">${contactText.replace(/,/g, '<br>')}</div>` : ''}
    </div>
    ` : layoutPreset.layoutPattern === 'split' ? `
    <div class="layout-split">
      <div class="split-left">
        <h1>${headline}</h1>
        <div class="accent-line" style="position:static;transform:none;margin:24px 0;"></div>
        ${subheadline ? `<div class="subheadline">${subheadline}</div>` : ''}
      </div>
      <div class="split-right">
        <div class="body-text">${description.slice(0, 150)}</div>
        ${cta ? `<div class="cta-button">${ctaText}</div>` : ''}
        ${contactText ? `<div class="contact-block">${contactText.replace(/,/g, '<br>')}</div>` : ''}
      </div>
    </div>
    ` : layoutPreset.layoutPattern === 'banner' ? `
    <div class="layout-banner">
      <div class="banner-top">
        <h1>${headline}</h1>
      </div>
      <div class="banner-body">
        ${subheadline ? `<div class="subheadline">${subheadline}</div>` : ''}
        <div class="body-text">${description.slice(0, 150)}</div>
        ${cta ? `<div class="cta-button">${ctaText}</div>` : ''}
      </div>
      ${contactText ? `<div class="banner-bottom">${contactText}</div>` : ''}
    </div>
    ` : layoutPreset.layoutPattern === 'edge-to-edge' ? `
    <div class="layout-edge-to-edge">
      <div class="content-overlay">
        <h1>${headline}</h1>
        ${subheadline ? `<h2>${subheadline}</h2>` : ''}
        <div class="body-text" style="color:rgba(255,255,255,0.9);">${description.slice(0, 150)}</div>
        ${cta ? `<div class="cta-button" style="background:#FFFFFF;color:${primaryHex};">${ctaText}</div>` : ''}
        ${contactText ? `<div class="contact-block" style="color:rgba(255,255,255,0.8);">${contactText.replace(/,/g, '<br>')}</div>` : ''}
      </div>
    </div>
    ` : `
    <div class="layout-centered">
      <h1>${headline}</h1>
      ${subheadline ? `<div class="subheadline">${subheadline}</div>` : ''}
      ${cta ? `<div class="cta-button">${ctaText}</div>` : ''}
      ${contactText ? `<div class="contact-block">${contactText.replace(/,/g, '<br>')}</div>` : ''}
    </div>
    `}

    <!-- Offer badge -->
    ${offerText ? `
    <div class="offer-badge">
      <span class="percent">${offerText.match(/\d+/) ? offerText.match(/\d+/)?.[0] + '%' : 'OFFER'}</span>
      <span class="label">${offerText.replace(/\d+%?\s*/, '').slice(0, 20)}</span>
    </div>
    ` : ''}

    <!-- QR Code -->
    ${config.qrContent ? `
    <div style="position:absolute;bottom:${safeL + 10}px;right:${safeL + 10}px;text-align:center;z-index:10;">
      ${generateQRCodeSVG(config.qrContent, 140)}
      <div style="font-size:11px;color:${layoutPreset.textColor};opacity:0.5;margin-top:4px;font-family:sans-serif;">${lang === 'tr' ? 'Tara & Keşfet' : lang === 'de' ? 'Scannen & Entdecken' : 'Scan & Explore'}</div>
    </div>
    ` : ''}
  </div>
</body>
</html>`;

  const backHtml = isDouble ? `<!DOCTYPE html>
<html lang="${lang}" dir="${langDir}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, '+')}:wght@400;600;700&family=${bodyFont.replace(/ /g, '+')}:wght@400;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${pxW}px;
    height: ${pxH}px;
    overflow: hidden;
    font-family: '${bodyFont}', sans-serif;
    background: ${layoutPreset.bgColor};
    color: ${layoutPreset.textColor};
  }
  h2 { font-family: '${headingFont}', serif; font-size: 36px; color: ${primaryHex}; margin-bottom: 20px; }
  .back-layout { padding: ${safeT + 20}px ${safeL + 20}px; height: 100%; }
  .services-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; }
  .service-card { border: 1px solid ${accentHex}33; padding: 20px; border-radius: 8px; }
  .service-card h3 { font-family: '${headingFont}', serif; font-size: 22px; color: ${primaryHex}; }
  .contact-section { margin-top: auto; padding-top: 30px; border-top: 2px solid ${accentHex}; font-size: 16px; line-height: 1.8; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style>
</head>
<body>
  <div class="back-layout" style="display:flex;flex-direction:column;">
    <h2>${lang === 'tr' ? 'Hizmetlerimiz' : lang === 'de' ? 'Unsere Leistungen' : 'Our Services'}</h2>
    <div class="services-grid">
      <div class="service-card"><h3>${lang === 'tr' ? 'Logo Tasarımı' : lang === 'de' ? 'Logo Design' : 'Logo Design'}</h3><p class="body-text" style="font-size:16px;">${lang === 'tr' ? 'Profesyonel kurumsal kimlik' : 'Professionelle Corporate Identity'}</p></div>
      <div class="service-card"><h3>${lang === 'tr' ? 'Flyer & Broşür' : lang === 'de' ? 'Flyer & Broschüren' : 'Flyers & Brochures'}</h3><p class="body-text" style="font-size:16px;">${lang === 'tr' ? 'Baskıya hazır tasarımlar' : 'Druckfertige Designs'}</p></div>
      <div class="service-card"><h3>${lang === 'tr' ? 'Web Tasarım' : lang === 'de' ? 'Webdesign' : 'Web Design'}</h3><p class="body-text" style="font-size:16px;">${lang === 'tr' ? 'Modern responsive siteler' : 'Moderne responsive Websites'}</p></div>
      <div class="service-card"><h3>${lang === 'tr' ? 'Sosyal Medya' : lang === 'de' ? 'Social Media' : 'Social Media'}</h3><p class="body-text" style="font-size:16px;">${lang === 'tr' ? 'İçerik üretimi ve yönetim' : 'Content-Erstellung & Management'}</p></div>
    </div>
    ${contactText ? `<div class="contact-section">${contactText.replace(/,/g, ' | ')}</div>` : ''}
  </div>
</body>
</html>` : undefined;

  return { frontHtml, backHtml };
}

async function execGenerateFlyer(input: Record<string, unknown>): Promise<unknown> {
  const description = String(input.description ?? '');
  const format = String(input.format ?? 'flyer-a5');
  const style = String(input.style ?? 'modern-minimal');
  const businessName = typeof input.businessName === 'string' ? input.businessName : undefined;
  const contactInfo = typeof input.contactInfo === 'string' ? input.contactInfo : undefined;
  const cta = typeof input.cta === 'string' ? input.cta : undefined;
  const offerText = typeof input.offerText === 'string' ? input.offerText : undefined;
  const language = typeof input.language === 'string' ? input.language : 'tr';
  const doubleSided = input.doubleSided === true;
  const multiPage = input.multiPage === true;
  const autoGenImages = input.autoGenerateImages === true;
  const folding = (typeof input.folding === 'string' && ['tri-fold', 'bi-fold', 'z-fold', 'gate-fold'].includes(input.folding)) ? input.folding : 'tri-fold';
  let pageContent: string[] = [];
  if (typeof input.pageContent === 'string' && input.pageContent.trim()) {
    try { pageContent = JSON.parse(input.pageContent); } catch { /* keep empty */ }
  }

  // Extract QR content from contact info or description
  let qrContent = '';
  if (contactInfo) {
    const urlMatch = contactInfo.match(/(https?:\/\/[^\s,]+)/);
    const phoneMatch = contactInfo.match(/(\+?\d{7,}[\d\s-]*)/);
    const waMatch = contactInfo.match(/wa\.me\/[\w\d]+/i) || contactInfo.match(/WhatsApp[:\s]*([+\d\s-]+)/i);
    if (urlMatch?.[1]) qrContent = urlMatch[1];
    else if (waMatch) qrContent = `https://wa.me/${(waMatch[1] ?? waMatch[0]).replace(/[^\d+]/g, '')}`;
    else if (phoneMatch?.[1]) qrContent = `tel:${phoneMatch[1].replace(/[^\d+]/g, '')}`;
  }
  if (!qrContent && description.match(/https?:\/\/[^\s]+/)) {
    qrContent = description.match(/(https?:\/\/[^\s]+)/)?.[0] ?? '';
  }

  // Get print specs
  const specResult = await execCalculatePrintSpecs({ format, hasBleed: true }) as any;
  if (specResult.error) return { error: 'Geçersiz format.' };

  // Detect industry and mood from description + style
  const descLower = description.toLowerCase();
  const detectedIndustry = descLower.includes('restoran') || descLower.includes('restaurant') || descLower.includes('kebap') || descLower.includes('döner') || descLower.includes('cafe') || descLower.includes('kahve') || descLower.includes('mekan') ? 'restoran'
    : descLower.includes('düğün') || descLower.includes('wedding') || descLower.includes('gelin') || descLower.includes('nikah') ? 'moda'
    : descLower.includes('emlak') || descLower.includes('gayrimenkul') || descLower.includes('real estate') || descLower.includes('konut') || descLower.includes('villa') || descLower.includes('immobilien') ? 'teknoloji'
    : descLower.includes('oto') || descLower.includes('araba') || descLower.includes('galeri') || descLower.includes('auto') || descLower.includes('servis') ? 'teknoloji'
    : descLower.includes('moda') || descLower.includes('giyim') || descLower.includes('butik') ? 'moda'
    : descLower.includes('teknoloji') || descLower.includes('yazılım') || descLower.includes('bilişim') ? 'teknoloji'
    : 'restoran';

  const detectedMood = style.includes('wedding') ? 'lüks'
    : style.includes('corporate') || style.includes('real-estate') ? 'klasik'
    : style.includes('automotive') || style.includes('bold') || style.includes('street') ? 'enerjik'
    : style.includes('elegant') || style.includes('luxury') ? 'lüks'
    : style.includes('vintage') ? 'klasik'
    : 'modern';

  const detectedFontStyle = style.includes('wedding') || style.includes('elegant') || style.includes('luxury') ? 'luxury'
    : style.includes('vintage') ? 'classic-serif'
    : style.includes('street') || style.includes('bold') || style.includes('automotive') ? 'tech'
    : style.includes('corporate') ? 'tech'
    : 'modern-minimal';

  // Generate color palette
  const paletteResult = await execGenerateColorPalette({
    industry: detectedIndustry,
    mood: detectedMood,
    count: 5,
  }) as any;

  // Get font pairing
  const fontResult = await execSuggestFontPairing({
    style: detectedFontStyle,
    usage: 'print',
  }) as any;

  // Get layout preset
  const layoutPreset = FLYER_STYLE_PRESETS[style] ?? FLYER_STYLE_PRESETS['modern-minimal']!;

  // Build HTML
  let frontHtml: string;
  let backHtml: string | undefined;
  let brochurePages: string[] | undefined;

  if (multiPage) {
    const brochureResult = buildBrochureLayoutHTML({
      description, format, style, businessName, contactInfo, cta, offerText, language,
      pageContent, folding,
      qrContent: qrContent || undefined,
      layoutPreset, spec: specResult, palette: paletteResult, fonts: fontResult,
    });
    frontHtml = brochureResult.frontHtml;
    brochurePages = brochureResult.pages;
  } else {
    const flyerResult = buildFlyerLayoutHTML({
      description, format, style, businessName, contactInfo, cta, offerText, language, doubleSided,
      qrContent: qrContent || undefined,
      layoutPreset, spec: specResult, palette: paletteResult, fonts: fontResult,
    });
    frontHtml = flyerResult.frontHtml;
    backHtml = flyerResult.backHtml;
  }

  const qrSVG = qrContent ? generateQRCodeSVG(qrContent, 160) : '';

  // Generate AI image prompts for visuals
  const imagePrompts = multiPage
    ? [
        `Professional commercial photography for print brochure. ${description.slice(0, 100)}. High resolution, well-lit, ${folding} folding layout. Suitable for ${specResult.format} print. 300 DPI CMYK ready.`,
        `Hero product/food/lifestyle image matching "${style}" design style. ${businessName ? `Brand: ${businessName}.` : ''} Professional studio lighting, high detail, commercial photography quality.`,
        `Background texture or pattern for print design. ${style} style. Subtle, elegant, suitable for ${specResult.format} format. 300 DPI seamless.`,
      ]
    : [
        `Professional commercial photography for print flyer. ${description.slice(0, 100)}. High resolution, well-lit, ${layoutPreset.layoutPattern} composition. Suitable for ${specResult.format} print. 300 DPI CMYK ready.`,
        `Hero product/food/lifestyle image matching "${style}" design style. ${businessName ? `Brand: ${businessName}.` : ''} Professional studio lighting, high detail, commercial photography quality.`,
        `Background texture or pattern for print design. ${style} style. Subtle, elegant, suitable for ${specResult.format} format. 300 DPI seamless.`,
      ];

  // Tips for production
  const productionTips = multiPage
    ? (language === 'tr' ? [
        `${FOLDING_CONFIGS[folding]?.name ?? 'Katlamalı'} broşür — ${FOLDING_CONFIGS[folding]?.panels ?? 3} panelli. Katlama çizgileri HTML\'de gösterilir.`,
        'Her sayfayı tarayıcıda açıp "Yazdır" → "PDF Olarak Kaydet" ile baskıya hazır PDF al',
        'Çift taraflı baskıda sayfa sıralamasına dikkat et — outer/inner HTML\'ler sırayla basılmalı',
        'Katlamalı broşürlerde panel genişlikleri milimetrik ayarlanmıştır — baskıda ölçeklendirme yapmayın',
        'Baskı öncesi mutlaka 1:1 ölçekte kağıt mock-up ile katlama provası yapın',
      ] : [
        `${FOLDING_CONFIGS[folding]?.name ?? 'Folded'} brochure — ${FOLDING_CONFIGS[folding]?.panels ?? 3} panels. Fold marks shown in HTML.`,
        'Open each page in browser → Print → Save as PDF for print-ready output',
        'For double-sided printing, ensure outer/inner HTML pages are printed in correct order',
        'Panel widths are millimeter-precise — do not scale during printing',
        'Always create a 1:1 paper mock-up to verify folding before final production',
      ])
    : (language === 'tr' ? [
        'HTML\'i tarayıcıda açıp "Yazdır" → "PDF Olarak Kaydet" ile baskıya hazır PDF al',
        'Vercel Blob preview link\'ini tarayıcıda açıp anında önizleme yap',
        'PDF\'i CMYK\'ya çevirmek için Acrobat Pro veya online CMYK converter kullan',
        'Görselleri ayrıca AI (Midjourney/DALL-E) ile üretip HTML\'deki placeholder\'larla değiştir',
        'Baskı öncesi mutlaka 1:1 ölçekte proof al',
        'Kesim payı (bleed) alanına dikkat et — kritik içeriği safe zone içinde tut',
      ] : [
        'Open HTML in browser → Print → Save as PDF for print-ready output',
        'Use Vercel Blob preview link for instant visual preview',
        'Convert PDF to CMYK using Acrobat Pro or online CMYK converter',
        'Generate images with AI (Midjourney/DALL-E) and replace in HTML',
        'Always get a 1:1 proof before final print run',
        'Keep critical content within safe zone — bleed area will be trimmed',
      ]);

  // Auto-generate and embed AI images if requested
  let autoGeneratedImages: Array<{ prompt: string; blobUrl: string | null; error?: string }> | undefined;
  if (autoGenImages && imagePrompts.length > 0) {
    try {
      const result = await autoGenerateAndEmbedImages(imagePrompts, frontHtml, 3);
      frontHtml = result.html;
      autoGeneratedImages = result.images;
    } catch (err: any) {
      autoGeneratedImages = [{ prompt: imagePrompts[0] ?? '', blobUrl: null, error: err.message ?? 'Auto-generation failed' }];
    }
  }

  // Try Vercel Blob upload for instant preview
  let previewUrl: string | null = null;
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (blobToken) {
      const filename = `flyers/preview-${Date.now()}-${style}.html`;
      const blobRes = await fetch(`https://blob.vercel-storage.com/${filename}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${blobToken}`,
          'Content-Type': 'text/html',
          'X-Content-Type-Options': 'nosniff',
        },
        body: frontHtml,
      });
      if (blobRes.ok) {
        const blobData = await blobRes.json() as { url?: string };
        previewUrl = blobData.url ?? null;
      }
    }
  } catch {
    // Preview upload is optional — silently fail
  }

  const result: any = multiPage ? {
    type: 'brochure',
    format: specResult.format,
    dimensions: specResult.dimensions,
    pixelSize: specResult.pixelDimensions,
    colorProfile: specResult.colorProfile,
    style,
    language,
    folding: { type: folding, config: FOLDING_CONFIGS[folding] },
    colorPalette: paletteResult.palette,
    fontPairing: fontResult?.pairings?.[0] ?? null,
    pageCount: brochurePages?.length ?? 2,
    html: {
      outer: frontHtml,
      ...(brochurePages && brochurePages.length > 1 ? { inner: brochurePages[1] } : {}),
      ...(brochurePages && brochurePages.length > 2 ? { extraPages: brochurePages.slice(2) } : {}),
    },
    imageGenerationPrompts: imagePrompts,
    printSpecs: {
      bleed: specResult.bleed,
      safeZone: specResult.safeZone,
      recommendedPaper: specResult.recommendedPaper,
    },
    productionTips,
    previewUrl,
    ...(qrContent ? {
      qrCode: {
        content: qrContent,
        svg: qrSVG,
        note: 'QR kod arka kapakta otomatik gösterilir.',
      },
    } : {}),
    autoGeneratedImages,
    designerNotes: language === 'tr'
      ? `${FOLDING_CONFIGS[folding]?.name ?? 'Katlamalı'} broşür — ${FOLDING_CONFIGS[folding]?.panels ?? 3} panelli, ${brochurePages?.length ?? 2} sayfa. "${style}" stilinde, ${specResult.format} için optimize edildi. Katlama çizgileri HTML içinde işaretlidir. ${previewUrl ? `Önizleme: ${previewUrl}` : 'HTML doğrudan tarayıcıda açılabilir.'}`
      : `${FOLDING_CONFIGS[folding]?.name ?? 'Folded'} brochure — ${FOLDING_CONFIGS[folding]?.panels ?? 3} panels, ${brochurePages?.length ?? 2} pages. Optimized for ${specResult.format} in "${style}" style. Fold marks shown in HTML. ${previewUrl ? `Preview: ${previewUrl}` : 'HTML can be opened directly in browser.'}`,
  } : {
    format: specResult.format,
    dimensions: specResult.dimensions,
    pixelSize: specResult.pixelDimensions,
    colorProfile: specResult.colorProfile,
    style,
    language,
    layoutPattern: layoutPreset.layoutPattern,
    colorPalette: paletteResult.palette,
    fontPairing: fontResult?.pairings?.[0] ?? null,
    html: {
      front: frontHtml,
      ...(backHtml ? { back: backHtml } : {}),
    },
    imageGenerationPrompts: imagePrompts,
    printSpecs: {
      bleed: specResult.bleed,
      safeZone: specResult.safeZone,
      recommendedPaper: specResult.recommendedPaper,
    },
    productionTips,
    previewUrl,
    ...(qrContent ? {
      qrCode: {
        content: qrContent,
        svg: qrSVG,
        note: 'QR kod flyer\'ın sağ alt köşesine otomatik eklenir.',
      },
    } : {}),
    autoGeneratedImages,
    designerNotes: language === 'tr'
      ? `Bu flyer "${style}" stilinde, ${specResult.format} için optimize edildi. ${previewUrl ? `Önizleme: ${previewUrl}` : 'HTML doğrudan tarayıcıda açılabilir.'} Renkler CMYK baskı için uygundur. Görseller için AI prompt'ları hazır.`
      : `Flyer optimized for ${specResult.format} in "${style}" style. ${previewUrl ? `Preview: ${previewUrl}` : 'HTML can be opened directly in browser.'} Colors are CMYK-print suitable. AI image prompts ready.`,
  };

  // Auto-create a PDF render task for the local bridge if available
  if (process.env.CRON_SECRET) {
    try {
      const deplUrl = process.env.DEPLOY_URL || process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL ?? process.env.DEPLOY_URL}`
        : null;
      if (deplUrl) {
        await fetch(`${deplUrl}/api/agent/tasks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.CRON_SECRET}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            task_type: 'render_flyer_pdf',
            title: `${multiPage ? 'Brochure' : 'Flyer'} PDF: ${businessName ?? description.slice(0, 40)}`,
            payload: {
              html: frontHtml,
              ...(brochurePages ? { extraPages: brochurePages.slice(1) } : {}),
              format: specResult.format,
              style,
              businessName: businessName ?? '',
              multiPage,
            },
            priority: 5,
          }),
        });
      }
      result.pdfTaskQueued = true;
    } catch {
      result.pdfTaskQueued = false;
    }
  }

  return result;
}

// ── Brochure Multi-Page Layout ──

const FOLDING_CONFIGS: Record<string, { name: string; panels: number; ratios: number[]; panelLabels: string[]; foldMarks: number[] }> = {
  'tri-fold': {
    name: 'Üç Katlı (Letter Fold)',
    panels: 3,
    ratios: [0.33, 0.34, 0.33],
    panelLabels: ['Ön Kapak (Sağ)', 'Arka Kapak (Orta)', 'İç Kapak (Sol)'],
    foldMarks: [33, 67],
  },
  'bi-fold': {
    name: 'İki Katlı (Book Fold)',
    panels: 2,
    ratios: [0.5, 0.5],
    panelLabels: ['Ön Kapak (Sağ)', 'Arka Kapak (Sol)'],
    foldMarks: [50],
  },
  'z-fold': {
    name: 'Z Katlı (Zigzag)',
    panels: 3,
    ratios: [1 / 3, 1 / 3, 1 / 3],
    panelLabels: ['Ön Panel', 'Orta Panel', 'Arka Panel'],
    foldMarks: [33, 67],
  },
  'gate-fold': {
    name: 'Kapı Katlı (Gate Fold)',
    panels: 3,
    ratios: [0.25, 0.50, 0.25],
    panelLabels: ['Sol Kanat', 'Orta (Açılış)', 'Sağ Kanat'],
    foldMarks: [25, 75],
  },
};

function buildBrochureLayoutHTML(config: {
  description: string;
  format: string;
  style: string;
  businessName?: string;
  contactInfo?: string;
  cta?: string;
  offerText?: string;
  language?: string;
  pageContent?: string[];
  folding: string;
  qrContent?: string;
  layoutPreset: typeof FLYER_STYLE_PRESETS[string];
  spec: any;
  palette: any;
  fonts: any;
}): { frontHtml: string; pages?: string[] } {
  const { layoutPreset, spec, palette, fonts, businessName, contactInfo, cta, offerText, description, folding } = config;
  const lang = config.language ?? 'tr';
  const pageContent = config.pageContent ?? [];
  const qrContent = config.qrContent ?? '';
  const foldConfig = (FOLDING_CONFIGS[folding] ?? FOLDING_CONFIGS['tri-fold'])!;
  const { panels, ratios, panelLabels, foldMarks } = foldConfig;

  const pxW = spec.pixelDimensions?.widthPx ?? 3508;
  const pxH = spec.pixelDimensions?.heightPx ?? 2480;
  const safeL = spec.safeZone?.mm ? Math.round((spec.safeZone.mm / 25.4) * 300) : 40;
  const safeT = safeL;
  const safeB = pxH - safeL;

  const headingFont = fonts?.pairings?.[0]?.heading?.font ?? layoutPreset.headingFont;
  const bodyFont = fonts?.pairings?.[0]?.body?.font ?? layoutPreset.bodyFont;
  const paletteCss = palette?.palette as any[];
  const primaryHex = paletteCss?.[0]?.hex ?? layoutPreset.primaryColor;
  const accentHex = paletteCss?.[paletteCss?.length ? paletteCss.length - 1 : 0]?.hex ?? layoutPreset.accentColor;

  const headline = businessName || (lang === 'tr' ? 'Broşür' : lang === 'de' ? 'Broschüre' : 'Brochure');
  const contactText = contactInfo || '';
  const ctaText = cta || (lang === 'tr' ? 'Hemen Ulaşın' : lang === 'de' ? 'Jetzt Kontaktieren' : 'Contact Now');

  // Panel widths in px
  const contentW = pxW - safeL * 2;
  const panelWidths = ratios.map((r: number) => Math.round(contentW * r));
  const panelGap = 16;

  // Page break helper: first side (outer), second side (inner)
  function buildSide(side: 'outer' | 'inner', pageNum: number, pageDesc?: string): string {
    // outer = panels that face out when folded (panel 3, 1, etc.)
    // inner = panels that face in when folded

    const panelsHtml = panels === 3
      ? (side === 'outer'
          ? [buildPanel(2, pageDesc ?? (lang === 'tr' ? `Sayfa ${pageNum} — Arka Kapak` : `Page ${pageNum} — Back Cover`), true),
             buildPanel(0, headline, false),
             buildPanel(1, pageDesc ?? contactText, false, true)]
          : [buildPanel(1, pageDesc ?? '', false),
             buildPanel(2, pageDesc ?? '', false),
             buildPanel(0, pageDesc ?? (lang === 'tr' ? `Sayfa ${pageNum}` : `Page ${pageNum}`), false)])
      : panels === 2
      ? (side === 'outer'
          ? [buildPanel(1, pageDesc ?? contactText, true),
             buildPanel(0, headline, false)]
          : [buildPanel(0, pageDesc ?? '', false),
             buildPanel(1, pageDesc ?? '', false)])
      : [buildPanel(0, pageDesc ?? '', false)];

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, '+')}:wght@400;600;700&family=${bodyFont.replace(/ /g, '+')}:wght@400;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${pxW}px; height: ${pxH}px; overflow: hidden;
    font-family: '${bodyFont}', sans-serif;
    background: #FFFFFF; color: ${layoutPreset.textColor};
  }
  @page { size: ${spec.dimensions?.widthMm ?? 297}mm ${spec.dimensions?.heightMm ?? 210}mm; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  .page {
    width: ${pxW}px; height: ${pxH}px; display: flex;
    padding: ${safeT}px ${safeL}px ${pxH - safeB}px ${safeL}px;
    gap: ${panelGap}px; position: relative;
  }

  .panel {
    position: relative; overflow: hidden;
    border-radius: 4px;
  }

  .fold-mark {
    position: absolute; top: 0; bottom: 0;
    width: 1px; border-left: 1px dashed ${accentHex}33;
    pointer-events: none; z-index: 10;
  }

  .panel-header {
    font-family: '${headingFont}', ${layoutPreset.headingFont.includes('Display') || layoutPreset.headingFont.includes('Playfair') ? 'serif' : 'sans-serif'};
    font-size: 32px; font-weight: 700; color: ${primaryHex};
    margin-bottom: 16px; line-height: 1.2;
  }

  .panel-body {
    font-size: 15px; line-height: 1.6; opacity: 0.85;
  }

  .panel-footer {
    position: absolute; bottom: 0; left: 0; right: 0;
    font-size: 12px; opacity: 0.5; text-align: center;
    padding: 8px;
  }

  .cta-box {
    display: inline-block; background: ${accentHex}; color: #FFFFFF;
    padding: 10px 24px; border-radius: 6px; font-weight: 700;
    font-size: 16px; margin-top: 16px;
  }

  .deco-bar {
    width: 50px; height: 4px; background: ${accentHex};
    border-radius: 2px; margin-bottom: 16px;
  }

  .contact-line { font-size: 13px; margin-top: 8px; opacity: 0.7; }
</style>
</head>
<body>
<div class="page">
  ${foldMarks.map((fm: number) => `<div class="fold-mark" style="left:${safeL + Math.round(contentW * fm / 100)}px;"></div>`).join('')}
  ${panelsHtml.map((p, i) => `<div class="panel" style="flex:0 0 ${panelWidths[i]}px;">${p}</div>`).join('')}
</div>
</body>
</html>`;
  }

  function buildPanel(index: number, title: string, isBackCover: boolean, isContactPanel?: boolean): string {
    const label = panelLabels[index] ?? '';
    const w = panelWidths[index] ?? panelWidths[0];
    const innerPad = Math.round(safeL * 0.6);

    if (isBackCover) {
      return `<div style="padding:${innerPad}px;height:100%;display:flex;flex-direction:column;background:${layoutPreset.primaryColor}08;">
        <div class="panel-header" style="font-size:24px;">${title || headline}</div>
        <div class="deco-bar"></div>
        ${contactText ? contactText.split(',').map((c) => `<div class="contact-line">${c.trim()}</div>`).join('') : ''}
        ${qrContent ? `<div style="margin-top:auto;text-align:center;">${generateQRCodeSVG(qrContent, 100)}<div style="font-size:10px;opacity:0.5;margin-top:4px;">${lang === 'tr' ? 'Tarayın' : 'Scan'}</div></div>` : ''}
        <div class="panel-footer">${label}</div>
      </div>`;
    }

    if (isContactPanel) {
      return `<div style="padding:${innerPad}px;height:100%;display:flex;flex-direction:column;justify-content:center;text-align:center;">
        ${contactText ? `<div style="font-size:18px;font-weight:700;font-family:'${headingFont}',serif;color:${primaryHex};margin-bottom:12px;">${lang === 'tr' ? 'İletişim' : lang === 'de' ? 'Kontakt' : 'Contact'}</div>` : ''}
        ${contactText ? contactText.split(',').map((c) => `<div style="font-size:14px;margin-top:6px;opacity:0.8;">${c.trim()}</div>`).join('') : ''}
        ${ctaText ? `<div class="cta-box">${ctaText}</div>` : ''}
        <div class="panel-footer">${label}</div>
      </div>`;
    }

    // Content panel
    const contentDesc = pageContent[index] ?? (index === 0 ? description : '');
    return `<div style="padding:${innerPad}px;height:100%;display:flex;flex-direction:column;">
      <div class="panel-header">${title}</div>
      <div class="deco-bar"></div>
      <div class="panel-body">${contentDesc || (lang === 'tr' ? 'Detaylı bilgi ve fiyat teklifi için iletişime geçin.' : 'Contact us for detailed information and pricing.')}</div>
      ${index === 0 && ctaText ? `<div class="cta-box">${ctaText}</div>` : ''}
      ${offerText && index === 0 ? `<div style="margin-top:12px;font-size:18px;font-weight:700;color:${accentHex};font-family:'${headingFont}',serif;">${offerText}</div>` : ''}
      <div class="panel-footer">${label}</div>
    </div>`;
  }

  // Build outer and inner sides
  const outerHtml = buildSide('outer', 1, pageContent[0]);
  const innerHtml = buildSide('inner', 1, pageContent[1]);

  // Handle multi-page: if pageContent has more than 3 entries, create additional pages
  const extraPages: string[] = [];
  if (pageContent.length > 3) {
    for (let p = 3; p < pageContent.length; p++) {
      extraPages.push(`<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, '+')}:wght@400;600;700&family=${bodyFont.replace(/ /g, '+')}:wght@400;600&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${pxW}px; height: ${pxH}px; overflow: hidden;
    font-family: '${bodyFont}', sans-serif;
    background: #FFFFFF; color: ${layoutPreset.textColor};
  }
  @page { size: ${spec.dimensions?.widthMm ?? 297}mm ${spec.dimensions?.heightMm ?? 210}mm; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  .content-area {
    padding: ${safeT}px ${safeL}px ${pxH - safeB}px ${safeL}px;
    height: 100%; display: flex; flex-direction: column;
  }
  h2 {
    font-family: '${headingFont}', ${layoutPreset.headingFont.includes('Display') || layoutPreset.headingFont.includes('Playfair') ? 'serif' : 'sans-serif'};
    font-size: 32px; color: ${primaryHex}; margin-bottom: 16px;
  }
  .deco-bar { width: 50px; height: 4px; background: ${accentHex}; border-radius: 2px; margin-bottom: 24px; }
  .body-text { font-size: 15px; line-height: 1.8; opacity: 0.85; }
</style>
</head>
<body>
<div class="content-area">
  <h2>${pageContent[p] ?? ''}</h2>
  <div class="deco-bar"></div>
  <div class="body-text">${pageContent[p] ?? ''}</div>
</div>
</body>
</html>`);
    }
  }

  return { frontHtml: outerHtml, pages: [outerHtml, innerHtml, ...extraPages] };
}

// ── Menu Layout Generator ──

const MENU_STYLE_PRESETS: Record<string, {
  primaryColor: string; secondaryColor: string; bgColor: string; textColor: string; accentColor: string;
  headingFont: string; bodyFont: string; priceFont: string;
  badgeColors: Record<string, { bg: string; text: string }>;
  layoutType: 'single-column' | 'two-column' | 'grid-cards' | 'elegant-list';
  decorativeStyle: 'gold-lines' | 'chalkboard' | 'neon-glow' | 'rustic-frames' | 'clean-rule';
}> = {
  'elegant-fine-dining': {
    primaryColor: '#1A1A1A', secondaryColor: '#FDFBF7', bgColor: '#FDFBF7', textColor: '#2C2C2C', accentColor: '#C9A84C',
    headingFont: 'Playfair Display', bodyFont: 'Lora', priceFont: 'Playfair Display',
    badgeColors: {
      'şef önerisi': { bg: '#C9A84C', text: '#FFFFFF' },
      'vegan': { bg: '#2D5016', text: '#FFFFFF' },
      'glütensiz': { bg: '#D4A0A0', text: '#2C1810' },
      'acılı': { bg: '#CC3333', text: '#FFFFFF' },
      'yeni': { bg: '#1A1A1A', text: '#C9A84C' },
    },
    layoutType: 'elegant-list',
    decorativeStyle: 'gold-lines',
  },
  'casual-bistro': {
    primaryColor: '#2C1810', secondaryColor: '#FFF8F0', bgColor: '#FFFDF9', textColor: '#2C1810', accentColor: '#8B4513',
    headingFont: 'Amatic SC', bodyFont: 'Nunito', priceFont: 'Nunito',
    badgeColors: {
      'şef önerisi': { bg: '#8B4513', text: '#FFFFFF' },
      'vegan': { bg: '#2D8B2D', text: '#FFFFFF' },
      'glütensiz': { bg: '#D4A574', text: '#2C1810' },
      'acılı': { bg: '#CC3333', text: '#FFFFFF' },
      'yeni': { bg: '#2C1810', text: '#F5DEB3' },
      'favori': { bg: '#DAA520', text: '#2C1810' },
    },
    layoutType: 'two-column',
    decorativeStyle: 'rustic-frames',
  },
  'street-food-menu': {
    primaryColor: '#FF3366', secondaryColor: '#1A1A2E', bgColor: '#FFFFFF', textColor: '#1A1A2E', accentColor: '#FFD700',
    headingFont: 'Bangers', bodyFont: 'Nunito', priceFont: 'Bebas Neue',
    badgeColors: {
      'şef önerisi': { bg: '#FFD700', text: '#1A1A2E' },
      'vegan': { bg: '#00CC66', text: '#FFFFFF' },
      'acılı': { bg: '#FF3366', text: '#FFFFFF' },
      'yeni': { bg: '#00D4FF', text: '#1A1A2E' },
      'çok satan': { bg: '#1A1A2E', text: '#FFD700' },
    },
    layoutType: 'grid-cards',
    decorativeStyle: 'neon-glow',
  },
};

// Menu format dimensions (pixels at 300 DPI)
const MENU_FORMATS: Record<string, { name: string; wMm: number; hMm: number; dpi: number; bleedMm: number; safeMm: number }> = {
  'a4-portrait': { name: 'A4 Dikey', wMm: 210, hMm: 297, dpi: 300, bleedMm: 3, safeMm: 8 },
  'a4-landscape-fold': { name: 'A4 Yatay (2 Katlı)', wMm: 297, hMm: 210, dpi: 300, bleedMm: 3, safeMm: 6 },
  'dl-tri-fold': { name: 'DL 3 Katlı', wMm: 297, hMm: 210, dpi: 300, bleedMm: 3, safeMm: 5 },
};

function buildMenuLayoutHTML(config: {
  businessName: string;
  style: string;
  format: string;
  categories: Array<{ name: string; items: Array<{ name: string; description?: string; price: string; badges?: string[] }> }>;
  contactInfo?: string;
  language?: string;
  specialNote?: string;
  qrContent?: string;
  paletteResult?: any;
  fontResult?: any;
}): string {
  const preset = (MENU_STYLE_PRESETS[config.style] ?? MENU_STYLE_PRESETS['casual-bistro'])!;
  const fmt = (MENU_FORMATS[config.format] ?? MENU_FORMATS['a4-portrait'])!;
  const lang = config.language ?? 'tr';
  const pxW = Math.round((fmt.wMm / 25.4) * fmt.dpi);
  const pxH = Math.round((fmt.hMm / 25.4) * fmt.dpi);
  const safeL = Math.round((fmt.safeMm / 25.4) * fmt.dpi);

  const headingFont = config.fontResult?.pairings?.[0]?.heading?.font ?? preset.headingFont;
  const bodyFont = config.fontResult?.pairings?.[0]?.body?.font ?? preset.bodyFont;

  const title = config.businessName;
  const cats = config.categories;

  // Build category and item HTML
  const categoryHtml = cats.map((cat, ci) => {
    const itemsHtml = cat.items.map((item, ii) => {
      const badgesHtml = (item.badges ?? []).map((b) => {
        const bc = preset.badgeColors[b.toLowerCase()] ?? { bg: preset.accentColor, text: '#FFFFFF' };
        return `<span style="display:inline-block;background:${bc.bg};color:${bc.text};font-size:11px;padding:2px 8px;border-radius:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">${b}</span>`;
      }).join('');

      const nameStyle = preset.layoutType === 'elegant-list'
        ? `font-family:'${headingFont}',serif;font-size:18px;`
        : `font-family:'${bodyFont}',sans-serif;font-size:20px;font-weight:700;`;

      const priceStyle = `font-family:'${preset.priceFont}',${preset.bodyFont.includes('serif') ? 'serif' : 'sans-serif'};font-size:${preset.layoutType === 'elegant-list' ? '20px' : '22px'};font-weight:700;color:${preset.primaryColor};white-space:nowrap;`;

      return `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:${preset.layoutType === 'grid-cards' ? '12px' : '8px 0'};${preset.layoutType === 'grid-cards' ? `border:1px solid ${preset.accentColor}22;border-radius:8px;` : ''}${ii < cat.items.length - 1 && preset.layoutType !== 'grid-cards' ? `border-bottom:1px solid ${preset.accentColor}15;` : ''}">
        <div style="flex:1;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span style="${nameStyle}color:${preset.textColor};">${item.name}</span>
            ${badgesHtml}
          </div>
          ${item.description ? `<div style="font-size:14px;color:${preset.textColor};opacity:0.6;margin-top:4px;font-family:'${bodyFont}',sans-serif;">${item.description}</div>` : ''}
        </div>
        <div style="margin-left:24px;${priceStyle}">${item.price}</div>
      </div>`;
    }).join('');

    const catTitleStyle = preset.layoutType === 'elegant-list'
      ? `font-family:'${headingFont}',serif;font-size:28px;font-weight:600;color:${preset.accentColor};text-transform:uppercase;letter-spacing:0.08em;text-align:center;`
      : preset.layoutType === 'grid-cards'
      ? `font-family:'${headingFont}',sans-serif;font-size:32px;font-weight:700;color:${preset.primaryColor};text-transform:uppercase;`
      : `font-family:'${headingFont}',serif;font-size:30px;font-weight:700;color:${preset.primaryColor};`;

    return `
    <div style="margin-bottom:${preset.layoutType === 'grid-cards' ? '32px' : '28px'};">
      <div style="${catTitleStyle}margin-bottom:${preset.layoutType === 'elegant-list' ? '16px' : '12px'};">
        ${preset.decorativeStyle === 'gold-lines' ? `<span style="display:inline-block;width:40px;height:1px;background:${preset.accentColor};vertical-align:middle;margin-right:12px;"></span>` : ''}
        ${cat.name}
        ${preset.decorativeStyle === 'gold-lines' ? `<span style="display:inline-block;width:40px;height:1px;background:${preset.accentColor};vertical-align:middle;margin-left:12px;"></span>` : preset.decorativeStyle === 'neon-glow' ? `<span style="display:inline-block;width:30px;height:3px;background:${preset.accentColor};vertical-align:middle;margin-left:8px;border-radius:2px;"></span>` : ''}
      </div>
      <div style="${preset.layoutType === 'grid-cards' ? 'display:grid;grid-template-columns:1fr 1fr;gap:12px;' : ''}${preset.layoutType === 'two-column' ? `columns:2;column-gap:24px;` : ''}">
        ${itemsHtml}
      </div>
    </div>`;
  }).join('');

  // QR code for menu
  const qrSVG = config.qrContent ? generateQRCodeSVG(config.qrContent, 120) : '';

  const backHtml = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<style>
  @import url('https://fonts.googleapis.com/css2?family=${headingFont.replace(/ /g, '+')}:wght@400;600;700&family=${bodyFont.replace(/ /g, '+')}:wght@400;600;700&display=swap');
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: ${pxW}px; height: ${pxH}px; overflow: hidden;
    font-family: '${bodyFont}', sans-serif;
    background: ${preset.bgColor}; color: ${preset.textColor};
  }
  @page { size: ${fmt.wMm}mm ${fmt.hMm}mm; margin: 0; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }

  .page-container { padding: ${safeL}px; height: 100%; display: flex; flex-direction: column; }

  .menu-header {
    text-align: center; padding-bottom: ${safeL / 2}px;
    ${preset.layoutType === 'elegant-list' ? `border-bottom:2px solid ${preset.accentColor};` : `border-bottom:3px solid ${preset.primaryColor};`}
  }
  .menu-header h1 {
    font-family: '${headingFont}', ${preset.layoutType === 'elegant-list' ? 'serif' : 'sans-serif'};
    font-size: ${preset.layoutType === 'elegant-list' ? '48px' : preset.layoutType === 'grid-cards' ? '56px' : '44px'};
    font-weight: 700; color: ${preset.primaryColor};
    ${preset.layoutType === 'elegant-list' ? 'text-transform:uppercase;letter-spacing:0.1em;' : ''}
    ${preset.layoutType === 'grid-cards' ? 'text-transform:uppercase;letter-spacing:0.03em;' : ''}
  }
  .menu-header .subtitle {
    font-size: 16px; color: ${preset.accentColor}; text-transform: uppercase; letter-spacing: 0.15em;
    margin-top: 4px;
  }
  .menu-content { flex: 1; overflow: hidden; padding-top: ${safeL / 2}px; }
  .menu-footer {
    padding-top: ${safeL / 2}px; border-top: 1px solid ${preset.accentColor}33;
    display: flex; justify-content: space-between; align-items: flex-end;
    font-size: 13px; opacity: 0.6;
  }
  .qr-section { text-align: center; }
  .qr-section .qr-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px; }
</style>
</head>
<body>
  <div class="page-container">
    <div class="menu-header">
      <div class="subtitle">${lang === 'tr' ? 'MENÜ' : lang === 'de' ? 'SPEISEKARTE' : 'MENU'}</div>
      <h1>${title}</h1>
    </div>

    <div class="menu-content">
      ${categoryHtml}
    </div>

    <div class="menu-footer">
      <div>
        ${config.contactInfo ? config.contactInfo.replace(/,/g, '<br>') : ''}
        ${config.specialNote ? `<div style="margin-top:4px;font-style:italic;">${config.specialNote}</div>` : ''}
      </div>
      ${qrSVG ? `<div class="qr-section">${qrSVG}<div class="qr-label">${lang === 'tr' ? 'Online Menü' : lang === 'de' ? 'Online Karte' : 'Online Menu'}</div></div>` : ''}
    </div>
  </div>
</body>
</html>`;

  return backHtml;
}

async function execGenerateMenu(input: Record<string, unknown>): Promise<unknown> {
  const businessName = String(input.businessName ?? '');
  const style = String(input.style ?? 'casual-bistro');
  const format = String(input.format ?? 'a4-portrait');
  const language = typeof input.language === 'string' ? input.language : 'tr';
  const contactInfo = typeof input.contactInfo === 'string' ? input.contactInfo : undefined;
  const specialNote = typeof input.specialNote === 'string' ? input.specialNote : undefined;
  const autoGenImages = input.autoGenerateImages === true;

  // Parse categories from JSON string
  let categories: Array<{ name: string; items: Array<{ name: string; description?: string; price: string; badges?: string[] }> }> = [];
  try {
    if (typeof input.categories === 'string' && input.categories.trim()) {
      categories = JSON.parse(input.categories);
    }
  } catch {
    return { error: 'categories JSON formatında olmalı. Örn: [{"name":"İçecekler","items":[{"name":"Ayran","price":"2,50€"}]}]' };
  }

  if (!categories.length) {
    // Default demo categories
    categories = [
      { name: language === 'tr' ? 'İçecekler' : language === 'de' ? 'Getränke' : 'Drinks', items: [
        { name: language === 'tr' ? 'Ayran' : 'Ayran', price: '2,50€' },
        { name: language === 'tr' ? 'Çay' : 'Tee', description: language === 'tr' ? 'Demlik' : 'Kanne', price: '3,00€' },
        { name: language === 'tr' ? 'Kola' : 'Cola', price: '3,50€' },
      ]},
      { name: language === 'tr' ? 'Ana Yemekler' : language === 'de' ? 'Hauptgerichte' : 'Main Courses', items: [
        { name: language === 'tr' ? 'Döner Tabağı' : 'Döner Teller', description: language === 'tr' ? 'Pilav ve salata ile' : 'mit Reis und Salat', price: '12,90€', badges: ['şef önerisi'] },
        { name: language === 'tr' ? 'Adana Kebap' : 'Adana Kebab', price: '14,90€', badges: ['acılı'] },
      ]},
    ];
  }

  const preset = (MENU_STYLE_PRESETS[style] ?? MENU_STYLE_PRESETS['casual-bistro'])!;
  const fmt = (MENU_FORMATS[format] ?? MENU_FORMATS['a4-portrait'])!;

  // Generate color palette
  const paletteResult = await execGenerateColorPalette({
    industry: 'restoran',
    mood: style === 'elegant-fine-dining' ? 'lüks' : style === 'street-food-menu' ? 'enerjik' : 'samimi',
    count: 5,
  }) as any;

  // Generate font pairing
  const fontResult = await execSuggestFontPairing({
    style: style === 'elegant-fine-dining' ? 'luxury' : style === 'street-food-menu' ? 'playful' : 'handcrafted',
    usage: 'print',
  }) as any;

  // Extract QR content
  let qrContent = '';
  if (contactInfo) {
    const urlMatch = contactInfo.match(/(https?:\/\/[^\s,]+)/);
    if (urlMatch?.[1]) qrContent = urlMatch[1];
  }

  // Build HTML
  const html = buildMenuLayoutHTML({
    businessName, style, format, categories, contactInfo, language, specialNote, qrContent: qrContent || undefined,
    paletteResult, fontResult,
  });

  // Print specs
  const pxW = Math.round((fmt.wMm / 25.4) * fmt.dpi);
  const pxH = Math.round((fmt.hMm / 25.4) * fmt.dpi);

  const imagePrompts = [
    `Professional food photography for restaurant menu. Appetizing dishes, warm lighting, shallow depth of field. Commercial quality suitable for print at 300 DPI. Style: ${style}.`,
    `Restaurant interior ambiance shot. ${style === 'elegant-fine-dining' ? 'Elegant dining room, candlelit tables, luxury atmosphere.' : style === 'street-food-menu' ? 'Vibrant street food vibe, neon lights, dynamic angle.' : 'Cozy bistro atmosphere, rustic wooden tables, warm ambient light.'}`,
    `Decorative culinary elements flat lay. Herbs, spices, fresh ingredients arranged elegantly. Overhead shot, natural light, ${style} aesthetic.`,
  ];

  // Auto-generate and embed AI images if requested
  let autoGeneratedImages: Array<{ prompt: string; blobUrl: string | null; error?: string }> | undefined;
  let embedHtml = html;
  if (autoGenImages) {
    try {
      const result = await autoGenerateAndEmbedImages(imagePrompts, html, 3);
      embedHtml = result.html;
      autoGeneratedImages = result.images;
    } catch (err: any) {
      autoGeneratedImages = [{ prompt: imagePrompts[0] ?? '', blobUrl: null, error: err.message ?? 'Auto-generation failed' }];
    }
  }

  // Try Vercel Blob upload
  let previewUrl: string | null = null;
  try {
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (blobToken) {
      const filename = `menus/menu-${Date.now()}-${style}.html`;
      const blobRes = await fetch(`https://blob.vercel-storage.com/${filename}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${blobToken}`, 'Content-Type': 'text/html', 'X-Content-Type-Options': 'nosniff' },
        body: embedHtml,
      });
      if (blobRes.ok) {
        const blobData = await blobRes.json() as { url?: string };
        previewUrl = blobData.url ?? null;
      }
    }
  } catch { /* silent */ }

  // Queue PDF render
  let pdfTaskQueued = false;
  try {
    if (process.env.CRON_SECRET) {
      const deplUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
      if (deplUrl) {
        await fetch(`${deplUrl}/api/agent/tasks`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task_type: 'render_flyer_pdf',
            title: `Menu PDF: ${businessName}`,
            payload: { html: embedHtml, format: format.startsWith('a4') ? 'flyer-a5' : 'flyer-a5', style, businessName },
            priority: 5,
          }),
        });
        pdfTaskQueued = true;
      }
    }
  } catch { /* silent */ }

  const productionTips = language === 'tr' ? [
    'HTML\'i tarayıcıda açıp "Yazdır" → "PDF Olarak Kaydet" ile menü PDF\'i al',
    'Menü kartı için en az 250-300g/m² kağıt önerilir',
    'Laminasyon (mat veya parlak) dayanıklılığı artırır',
    'QR kodu menüyü online versiyona yönlendirir — WhatsApp sipariş linki eklenebilir',
  ] : [
    'Open HTML in browser → Print → Save as PDF for print-ready menu',
    'Use at least 250-300g/m² paper for menu cards',
    'Lamination (matte or glossy) increases durability',
    'QR code links to online menu — add WhatsApp order link',
  ];

  return {
    format: fmt.name,
    dimensions: { widthMm: fmt.wMm, heightMm: fmt.hMm },
    pixelSize: { widthPx: pxW, heightPx: pxH, atDpi: fmt.dpi },
    style,
    language,
    businessName,
    categoryCount: categories.length,
    totalItems: categories.reduce((sum, c) => sum + c.items.length, 0),
    colorPalette: paletteResult.palette,
    fontPairing: fontResult?.pairings?.[0] ?? null,
    html: embedHtml,
    previewUrl,
    pdfTaskQueued,
    autoGeneratedImages,
    imageGenerationPrompts: imagePrompts,
    printSpecs: { bleedMm: fmt.bleedMm, safeMm: fmt.safeMm, dpi: fmt.dpi, profile: 'CMYK / ISO Coated v2' },
    productionTips,
  };
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
  generate_video: execGenerateVideo,
  delegate_to_local: execDelegateToLocal,
  analyze_video: execAnalyzeVideo,
  design_critique: execDesignCritique,
  extract_design_brief: execExtractDesignBrief,
  translate_content: execTranslateContent,
  generate_mockup: execGenerateMockup,
  generate_contract: execGenerateContract,
  check_availability: execCheckAvailability,
  schedule_appointment: execScheduleAppointment,
  list_appointments: execListAppointments,
  cancel_appointment: execCancelAppointment,
  generate_color_palette: execGenerateColorPalette,
  suggest_font_pairing: execSuggestFontPairing,
  generate_logo_concepts: execGenerateLogoConcepts,
  calculate_print_specs: execCalculatePrintSpecs,
  analyze_design_psychology: execAnalyzeDesignPsychology,
  generate_flyer: execGenerateFlyer,
  generate_menu: execGenerateMenu,
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
