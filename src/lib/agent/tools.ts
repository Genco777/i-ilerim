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
