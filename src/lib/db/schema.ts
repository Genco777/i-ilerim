import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  pgEnum,
  real,
  customType,
  primaryKey,
  bigint,
  index,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';

// pgcrypto encrypted bytea — encrypt/decrypt is performed via SQL helpers
// (see src/lib/crypto/secrets.ts in Task 7).
const encrypted = customType<{ data: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ───── Enums ─────
export const postStatus = pgEnum('post_status', [
  'draft',
  'scheduled',
  'publishing',
  'published',
  'failed',
  'rejected',
]);

export const imageSource = pgEnum('image_source', [
  'ai_generated',
  'manual_upload',
  'raw_no_processing',
]);

// Defined now so future migrations (Phase 2) don't re-generate them.
export const messagePlatform = pgEnum('message_platform', [
  'fb_comment',
  'fb_dm',
  'ig_comment',
  'ig_dm',
  'wa_message',
]);

export const messageStatus = pgEnum('message_status', [
  'new',
  'drafting',
  'awaiting_approval',
  'replied',
  'ignored',
  'failed',
]);

export const mailDraftStatus = pgEnum('mail_draft_status', [
  'drafting',
  'awaiting_regen',
  'awaiting_attachment',
  'sent',
  'cancelled',
]);

export const invoiceStatus = pgEnum('invoice_status', [
  'collecting',
  'preview',
  'sent',
  'cancelled',
  'deleted',
  'converted',
]);

export const invoiceType = pgEnum('invoice_type', [
  'rechnung',
  'teilrechnung',
  'schlussrechnung',
  'angebot',
]);

export const contentPillar = pgEnum('content_pillar', [
  'vitrine',
  'prozess',
  'insight',
  'lokal',
  'reel',
]);

export const planStatus = pgEnum('plan_status', [
  'draft',
  'approved',
  'scheduled',
]);

export const slotStatus = pgEnum('slot_status', [
  'pending',
  'generated',
  'approved',
  'rejected',
]);

export const adsCampaignType = pgEnum('ads_campaign_type', [
  'search',
  'pmax',
  'display',
  'retargeting',
  'local',
]);

export const adsCampaignStatus = pgEnum('ads_campaign_status', [
  'enabled',
  'paused',
  'removed',
]);

export const adsDraftStatus = pgEnum('ads_draft_status', [
  'collecting',
  'awaiting_approval',
  'confirmed',
  'cancelled',
  'failed',
]);

export const contentChannel = pgEnum('content_channel', [
  'feed',
  'story',
  'reel',
  'info_card',
  'info_card_phone',
  'info_card_split',
]);

// ───── Posts ─────
export const posts = pgTable('posts', {
  id: uuid('id').primaryKey().defaultRandom(),
  status: postStatus('status').notNull().default('draft'),
  topic: text('topic'),
  text_de: text('text_de').notNull(),
  hashtags: text('hashtags').array().default([]),
  image_source: imageSource('image_source').notNull(),
  raw_image_url: text('raw_image_url'),
  final_image_url: text('final_image_url').notNull(),
  image_prompt: text('image_prompt'),
  image_provider: text('image_provider'), // 'openai' | 'replicate'
  style_overrides: jsonb('style_overrides').default({}),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  published_at: timestamp('published_at', { withTimezone: true }),
  fb_post_id: text('fb_post_id'),
  ig_post_id: text('ig_post_id'),
  ig_shortcode: text('ig_shortcode'),
  error_log: text('error_log'),
  retry_count: integer('retry_count').default(0).notNull(),
  created_via: text('created_via').notNull(), // 'telegram' | 'web_admin'
  telegram_chat_id: text('telegram_chat_id'),
  telegram_message_id: text('telegram_message_id'),
  content_pillar: contentPillar('content_pillar'),
  calendar_week: integer('calendar_week'),
  channel: contentChannel('channel').default('feed'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ───── Brand Kit (singleton, id=1) ─────
export const brandKit = pgTable('brand_kit', {
  id: integer('id').primaryKey(),
  logo_url: text('logo_url'),
  logo_position: text('logo_position').default('bottom_right').notNull(),
  logo_size_pct: real('logo_size_pct').default(18.0).notNull(),
  logo_opacity: real('logo_opacity').default(0.85).notNull(),
  logo_padding_px: integer('logo_padding_px').default(40).notNull(),
  manual_upload_logo_default: text('manual_upload_logo_default')
    .default('ask')
    .notNull(),
  brand_colors: jsonb('brand_colors')
    .$type<string[]>()
    .default(['#050912', '#d4a43a'])
    .notNull(),
  visual_style_guide: text('visual_style_guide').notNull(),
  text_tone_guide: text('text_tone_guide').notNull(),
  negative_words: text('negative_words').array().default([]).notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ── Email Preferences (singleton, like brandKit) ──
export const emailPreferences = pgTable('email_preferences', {
  id: integer('id').primaryKey().default(1),
  theme: text('theme').notNull().default('dark_steel'),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── Ads Preferences (singleton, id=1) ──
export const adsPreferences = pgTable('ads_preferences', {
  id: integer('id').primaryKey().default(1),
  daily_limit_cents: integer('daily_limit_cents').notNull().default(5000),
  monthly_limit_cents: integer('monthly_limit_cents').notNull().default(100000),
  default_location_id: bigint('default_location_id', { mode: 'number' })
    .notNull()
    .default(2276), // Germany
  default_language_code: text('default_language_code').notNull().default('de'),
  notify_anomaly_threshold_pct: integer('notify_anomaly_threshold_pct')
    .notNull()
    .default(300),
  report_chat_id: bigint('report_chat_id', { mode: 'number' }),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const adsCampaigns = pgTable(
  'ads_campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    google_campaign_id: text('google_campaign_id').unique(),
    name: text('name').notNull(),
    type: adsCampaignType('type').notNull(),
    status: adsCampaignStatus('status').notNull().default('paused'),
    daily_budget_cents: integer('daily_budget_cents').notNull(),
    target_url: text('target_url').notNull(),
    conversion_action: text('conversion_action'),
    start_date: text('start_date'),
    end_date: text('end_date'),
    created_via: text('created_via').notNull(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    chatStatusIdx: index('ads_campaigns_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);

// ── Email Campaigns (history for dedup) ──
export const emailCampaigns = pgTable('email_campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  subject_line: text('subject_line').notNull(),
  concept_title: text('concept_title').notNull(),
  campaign_type: text('campaign_type').notNull(),
  theme: text('theme').notNull(),
  content_json: jsonb('content_json').notNull(),
  brevo_campaign_id: integer('brevo_campaign_id'),
  recipient_email: text('recipient_email'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ── Wizard States (Telegram email wizard, cross-instance on Vercel Fluid Compute) ──
export const wizardStates = pgTable('wizard_states', {
  chatId: bigint('chat_id', { mode: 'number' }).primaryKey(),
  state: jsonb('state').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ───── Secrets (encrypted with pgcrypto) ─────
export const secrets = pgTable('secrets', {
  key: text('key').primaryKey(),
  value: encrypted('value').notNull(),
  expires_at: timestamp('expires_at', { withTimezone: true }),
  rotation_status: text('rotation_status').default('healthy').notNull(),
  last_refreshed_at: timestamp('last_refreshed_at', { withTimezone: true }),
});

// ───── Telegram Audit ─────
export const telegramActions = pgTable('telegram_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  update_id: integer('update_id').unique(),
  action: text('action').notNull(),
  user_id: integer('user_id').notNull(),
  result: text('result'),
  error: text('error'),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ───── NextAuth tables (Drizzle adapter) ─────
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('emailVerified', { mode: 'date' }),
  image: text('image'),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('userId')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('providerAccountId').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = pgTable('sessions', {
  sessionToken: text('sessionToken').primaryKey(),
  userId: text('userId')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verificationToken',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ───── Incoming Messages (Phase 2) ─────
export const incomingMessages = pgTable('incoming_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  platform: messagePlatform('platform').notNull(),
  external_id: text('external_id').notNull().unique(),
  parent_post_id: text('parent_post_id'),
  parent_comment_id: text('parent_comment_id'),
  sender_name: text('sender_name').notNull(),
  sender_external_id: text('sender_external_id').notNull(),
  message_text: text('message_text').notNull(),
  attachments: jsonb('attachments').default([]),
  status: messageStatus('status').notNull().default('new'),
  draft_reply: text('draft_reply'),
  final_reply: text('final_reply'),
  reply_external_id: text('reply_external_id'),
  replied_at: timestamp('replied_at', { withTimezone: true }),
  ignored_at: timestamp('ignored_at', { withTimezone: true }),
  received_at: timestamp('received_at', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// ───── Mail Drafts (Telegram /mail outbound) ─────
// Single user system: at most one row with non-terminal status per chat.
// Attachments stored inline as base64 (Telegram bot limit is 20MB per file).
export interface MailAttachment {
  filename: string;
  mime: string;
  base64: string;
}

export const mailDrafts = pgTable(
  'mail_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    to_email: text('to_email').notNull(),
    subject: text('subject'),
    body: text('body'),
    instruction: text('instruction').notNull(),
    attachments: jsonb('attachments').$type<MailAttachment[]>().default([]).notNull(),
    status: mailDraftStatus('status').notNull().default('drafting'),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    telegram_preview_msg_id: integer('telegram_preview_msg_id'),
    in_reply_to_message_id: text('in_reply_to_message_id'),
    mail_references: text('mail_references'),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    chatStatusIdx: index('mail_drafts_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);

// ───── Mail Inbox (Zoho IMAP polled by GitHub Actions every 3 min) ─────
// IMAP UIDs are scoped to a single mailbox, so the de-dup key is (folder, uid).
// `replied_draft_id` links to the outbound draft created from "Cevap yaz".
export const mailInbox = pgTable(
  'mail_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    uid: integer('uid').notNull(),
    folder: text('folder').notNull().default('INBOX'),
    message_id: text('message_id'),
    from_email: text('from_email').notNull(),
    from_name: text('from_name'),
    subject: text('subject'),
    body_preview: text('body_preview'),
    body_text: text('body_text'),
    received_at: timestamp('received_at', { withTimezone: true }).notNull(),
    replied_draft_id: uuid('replied_draft_id').references(() => mailDrafts.id, {
      onDelete: 'set null',
    }),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    folderUidIdx: uniqueIndex('mail_inbox_folder_uid_idx').on(t.folder, t.uid),
  }),
);

// ───── Invoices (Telegram /fatura — collected step-by-step, PDF rendered) ─────
// Single user system: at most one row with status='collecting' per chat.
// `pending_item` holds a partial item being assembled across multiple steps;
// completed items are appended to `items`. Numbers from rows with
// status='deleted' are NOT auto-reused — the next number always strictly
// monotonically increases.
export interface InvoiceRecipient {
  company: string | null;
  name: string;
  street: string;
  zipCity: string;
}

export interface InvoiceLineItem {
  description: string;
  unitPriceCents: number;
  quantity: number;
}

export interface InvoicePendingItem {
  description?: string;
  unitPriceCents?: number;
  quantity?: number;
  suggestedNumber?: string;
}

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    number: text('number').notNull().unique(),
    type: invoiceType('type').notNull(),
    date: text('date').notNull(),
    recipient: jsonb('recipient').$type<InvoiceRecipient | null>(),
    items: jsonb('items').$type<InvoiceLineItem[]>().default([]).notNull(),
    total_cents: integer('total_cents').default(0).notNull(),
    footer_note: text('footer_note'),
    valid_until: text('valid_until'),
    converted_to_invoice_id: text('converted_to_invoice_id'),
    status: invoiceStatus('status').notNull().default('collecting'),
    current_step: text('current_step'),
    pending_item: jsonb('pending_item').$type<InvoicePendingItem | null>(),
    pdf_blob_url: text('pdf_blob_url'),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    telegram_preview_msg_id: integer('telegram_preview_msg_id'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    chatStatusIdx: index('invoices_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);

// ───── Kleinanzeigen ─────
export const kleinanzeigenThreadStatus = pgEnum('kleinanzeigen_thread_status', [
  'new',
  'awaiting_action',
  'awaiting_custom',
  'awaiting_refinement',
  'awaiting_gap_info',
  'awaiting_image',
  'drafting',
  'sent',
  'rejected',
]);

export const businessOverrideKind = pgEnum('business_override_kind', [
  'offered',
  'not_offered',
  'note',
  'tone',
  'signature',
]);

export interface KleinanzeigenAnalysis {
  subject: string;
  lang: string;
  tone_detected: 'du' | 'Sie' | 'unknown';
  knowledge_gaps: string[];
}

export const kleinanzeigenThreads = pgTable(
  'kleinanzeigen_threads',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email_message_id: text('email_message_id').unique(),
    routing_token: text('routing_token').notNull(),
    sender_address: text('sender_address').notNull(),
    buyer_name: text('buyer_name'),
    listing_title: text('listing_title'),
    raw_body: text('raw_body').notNull(),
    ai_analysis: jsonb('ai_analysis').$type<KleinanzeigenAnalysis | null>(),
    status: kleinanzeigenThreadStatus('status').notNull().default('new'),
    draft_reply: text('draft_reply'),
    final_reply: text('final_reply'),
    pending_gap_topic: text('pending_gap_topic'),
    attachments: jsonb('attachments').$type<MailAttachment[]>().default([]).notNull(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    telegram_message_id: integer('telegram_message_id'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    chatStatusIdx: index('kleinanzeigen_threads_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);

export const businessProfileOverrides = pgTable(
  'business_profile_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    content: text('content').notNull(),
    kind: businessOverrideKind('kind').notNull().default('note'),
    origin: text('origin').notNull().default('telegram'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    topicKindUnique: unique('business_profile_overrides_topic_kind_unique').on(t.topic, t.kind),
  }),
);

// ───── Failed Jobs (retry queue) ─────
export const failedJobs = pgTable('failed_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  job_type: text('job_type').notNull(),
  payload: jsonb('payload').notNull(),
  error: text('error').notNull(),
  retry_count: integer('retry_count').notNull(),
  failed_at: timestamp('failed_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  retried_at: timestamp('retried_at', { withTimezone: true }),
});

// ───── Ads Drafts (Telegram /ads wizard state) ─────
export interface AdsDraftPayload {
  type?: 'search' | 'pmax' | 'display' | 'retargeting' | 'local';
  target_url?: string;
  conversion_action?: string;
  campaign_name?: string;
  daily_budget_cents?: number;
  start_date?: string;
  end_date?: string;
}

export interface AdsGeneratedCopy {
  headlines: string[];
  descriptions: string[];
}

export interface AdsGeneratedKeyword {
  keyword: string;
  match_type: 'BROAD' | 'PHRASE' | 'EXACT';
  estimated_monthly_volume?: number;
}

export const adsDrafts = pgTable(
  'ads_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    status: adsDraftStatus('status').notNull().default('collecting'),
    current_step: text('current_step').notNull().default('type'),
    draft_payload: jsonb('draft_payload')
      .$type<AdsDraftPayload>()
      .notNull()
      .default({}),
    generated_copy: jsonb('generated_copy').$type<AdsGeneratedCopy | null>(),
    generated_keywords: jsonb('generated_keywords')
      .$type<AdsGeneratedKeyword[] | null>(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    telegram_preview_msg_id: integer('telegram_preview_msg_id'),
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    sent_at: timestamp('sent_at', { withTimezone: true }),
  },
  (t) => ({
    chatStatusIdx: index('ads_drafts_chat_status_idx').on(
      t.telegram_chat_id,
      t.status,
    ),
  }),
);

// ───── Content Planning ─────
export const contentPlans = pgTable('content_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  calendar_week: integer('calendar_week').notNull(),
  year: integer('year').notNull(),
  status: planStatus('status').notNull().default('draft'),
  telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
  telegram_message_id: integer('telegram_message_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  approved_at: timestamp('approved_at', { withTimezone: true }),
});

export const contentSlots = pgTable(
  'content_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    plan_id: uuid('plan_id')
      .notNull()
      .references(() => contentPlans.id, { onDelete: 'cascade' }),
    day_of_week: integer('day_of_week').notNull(),
    time_slot: text('time_slot').notNull(),
    pillar: contentPillar('pillar').notNull(),
    channel: contentChannel('channel').notNull().default('feed'),
    topic: text('topic'),
    post_id: uuid('post_id').references(() => posts.id, { onDelete: 'set null' }),
    status: slotStatus('status').notNull().default('pending'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    planDayTimeUnique: uniqueIndex('content_slots_plan_day_time_idx').on(
      t.plan_id,
      t.day_of_week,
      t.time_slot,
    ),
  }),
);

// ───── Chat Conversations (AI Assistant) ─────
export const chatConversations = pgTable(
  'chat_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    telegram_chat_id: bigint('telegram_chat_id', { mode: 'number' }).notNull(),
    title: text('title'),
    message_count: integer('message_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    chatIdx: index('chat_conv_chat_idx').on(t.telegram_chat_id),
    chatUpdatedIdx: index('chat_conv_updated_idx').on(t.telegram_chat_id, t.updated_at),
  }),
);

// Agent memory — persistent learning and facts
export const agentMemories = pgTable(
  'agent_memories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    category: text('category').notNull(), // 'customer', 'preference', 'lesson', 'insight', 'fact'
    key: text('key').notNull().unique(), // örn. 'customer_X_budget_preference'
    value: jsonb('value').notNull(), // flexible data
    importance: integer('importance').notNull().default(5), // 1-10
    last_accessed: timestamp('last_accessed', { withTimezone: true }).notNull().defaultNow(),
    access_count: integer('access_count').notNull().default(0),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    categoryIdx: index('mem_category_idx').on(t.category),
    importanceIdx: index('mem_importance_idx').on(t.importance),
    accessedIdx: index('mem_accessed_idx').on(t.last_accessed),
  }),
);

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversation_id: uuid('conversation_id')
      .notNull()
      .references(() => chatConversations.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: jsonb('content').notNull(),
    tool_calls: jsonb('tool_calls'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    convIdx: index('chat_msg_conv_idx').on(t.conversation_id),
    convCreatedIdx: index('chat_msg_conv_created_idx').on(t.conversation_id, t.created_at),
  }),
);

// ───── Site Content (Phase 10: agent-managed website content) ─────
export const siteContent = pgTable(
  'site_content',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    section: text('section').notNull().unique(), // 'hero', 'about', 'contact', 'footer'
    title: text('title'),
    body: text('body'),
    meta: jsonb('meta').default({}), // extra fields like phone, email, address
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
);

export const portfolioItems = pgTable(
  'portfolio_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    description: text('description'),
    image_url: text('image_url'), // Vercel Blob URL
    category: text('category'), // 'logo', 'flyer', 'web', 'branding'
    sort_order: integer('sort_order').default(0),
    is_published: integer('is_published').default(1), // 0=draft, 1=published
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    publishedIdx: index('pf_published_idx').on(t.is_published),
    sortIdx: index('pf_sort_idx').on(t.sort_order),
  }),
);

export const blogPosts = pgTable(
  'blog_posts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    title: text('title').notNull(),
    slug: text('slug').notNull().unique(),
    excerpt: text('excerpt'),
    body: text('body'),
    cover_url: text('cover_url'), // Vercel Blob URL
    tags: jsonb('tags').default([]), // string[]
    is_published: integer('is_published').default(0), // 0=draft, 1=published
    published_at: timestamp('published_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    publishedIdx: index('blog_published_idx').on(t.is_published),
    slugIdx: index('blog_slug_idx').on(t.slug),
  }),
);

// ───── Agent Task Queue (Local Bridge: Vercel <-> Local Claude) ─────
export const taskStatusEnum = pgEnum('agent_task_status', [
  'pending',
  'claimed',
  'running',
  'completed',
  'failed',
]);

export const agentTasks = pgTable(
  'agent_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    task_type: text('task_type').notNull(), // 'video_analysis', 'render_video', 'design_critique', 'file_process', 'general'
    title: text('title').notNull(),
    payload: jsonb('payload').default({}), // task-specific data
    status: taskStatusEnum('status').notNull().default('pending'),
    priority: integer('priority').default(5), // 1-10, higher = more urgent
    claimed_by: text('claimed_by'), // machine identifier
    claimed_at: timestamp('claimed_at', { withTimezone: true }),
    result: jsonb('result'), // output data on completion
    error: text('error'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('task_status_idx').on(t.status),
    typeIdx: index('task_type_idx').on(t.task_type),
    pendingPriorityIdx: index('task_pending_priority_idx').on(t.priority.desc()),
  }),
);

// ── System Config (key-value store for operational settings) ──
export const systemConfig = pgTable('system_config', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ═══════════════════════════════════════════════════════════════
// TREND ENGINE — Faz 1: niches + products + niche_performance
// (channel listings, sales, download tokens come in Faz 3–4)
// ═══════════════════════════════════════════════════════════════

export const productType = pgEnum('product_type', [
  'planner',
  'poster',
  'sticker',
  'template',
  'social_template',
]);

export const productStatus = pgEnum('product_status', [
  'draft',
  'awaiting_approval',
  'approved',
  'published',
  'rejected',
  'failed',
]);

export const competitionLevel = pgEnum('competition_level', [
  'low',
  'medium',
  'high',
]);

// ── Niches: discovered trends with gap analysis ──
export const niches = pgTable(
  'niches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    topic: text('topic').notNull(),
    gap_angle: text('gap_angle').notNull(),
    score: real('score').notNull(), // 0-100
    competition: competitionLevel('competition').notNull().default('medium'),
    source_signals: jsonb('source_signals').$type<string[]>().default([]),
    raw_analysis: jsonb('raw_analysis').$type<Record<string, unknown>>().default({}),
    used_in_product_id: uuid('used_in_product_id'),
    discovered_at: timestamp('discovered_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    scoreIdx: index('niche_score_idx').on(t.score.desc()),
    discoveredIdx: index('niche_discovered_idx').on(t.discovered_at.desc()),
  }),
);

// ── Products: full product spec (content + assets + status) ──
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    niche_id: uuid('niche_id').references(() => niches.id),
    type: productType('type').notNull(),
    status: productStatus('status').notNull().default('draft'),
    // Content (Faz 1)
    slug: text('slug').unique(),
    etsy_title: text('etsy_title'),
    etsy_description: text('etsy_description'),
    tags: text('tags').array().default([]),
    shop_title: text('shop_title'),
    shop_description: text('shop_description'),
    // Turkish operator-facing fields (for Telegram digest + approval UI).
    // Etsy/shop content stays in English — these are for Mehmet to evaluate at a glance.
    turkish_gap_angle: text('turkish_gap_angle'),
    turkish_summary: text('turkish_summary'),
    /** Type-specific PDF body content (prompts / stickers / sections) — Claude-generated */
    pdf_body: jsonb('pdf_body').default({}),
    price_cents: integer('price_cents').notNull(),
    // B1 — tier variations (Plus/Pro) for AOV uplift. Basic = price_cents.
    tier_b_price_cents: integer('tier_b_price_cents'),
    tier_b_description: text('tier_b_description'),
    tier_c_price_cents: integer('tier_c_price_cents'),
    tier_c_description: text('tier_c_description'),
    // Stripe references (Faz 4)
    stripe_product_id: text('stripe_product_id'),
    stripe_price_id: text('stripe_price_id'),
    // B1 — Stripe price refs for tier variants
    stripe_price_b_id: text('stripe_price_b_id'),
    stripe_price_c_id: text('stripe_price_c_id'),
    // Sprint I — Editable Canva tier (tier_c slot). Canva-spesifik asset'ler.
    // tier_c_price_cents default: 999 (€9.99). Editable = customizable in Canva.
    editable_canva_design_id: text('editable_canva_design_id'),       // Canva design ID
    editable_canva_share_url: text('editable_canva_share_url'),       // public "use as template" URL
    editable_instructions_pdf_url: text('editable_instructions_pdf_url'), // QR + step-by-step PDF
    editable_preview_image_url: text('editable_preview_image_url'),   // Canva design PNG export
    // Assets (Faz 2)
    hero_image_url: text('hero_image_url'),
    mockup_image_urls: text('mockup_image_urls').array().default([]),
    digital_file_url: text('digital_file_url'),
    digital_file_size_bytes: bigint('digital_file_size_bytes', { mode: 'number' }),
    /** Cinematic 5-sec preview video (Faz 2-D, Kling 2.1 master) */
    video_url: text('video_url'),
    // Approval (Faz 2)
    telegram_approval_chat_id: text('telegram_approval_chat_id'),
    telegram_approval_msg_id: text('telegram_approval_msg_id'),
    approved_at: timestamp('approved_at', { withTimezone: true }),
    rejected_reason: text('rejected_reason'),
    // Shop visibility (Faz 4)
    is_public_in_shop: integer('is_public_in_shop').default(0),
    // Sprint X.3 — Social media publishing references (carousel / story / pin)
    ig_post_id: text('ig_post_id'),           // IG carousel feed post ID (if included)
    ig_story_post_id: text('ig_story_post_id'), // IG video story ID (per-product)
    fb_post_id: text('fb_post_id'),           // FB carousel feed post ID
    pinterest_pin_id: text('pinterest_pin_id'), // Pinterest pin ID
    social_published_at: timestamp('social_published_at', { withTimezone: true }),
    // C3 — A/B Title Test: store 2 alternative titles at creation, rotate
    // them weekly via cron, track which variant got the most clicks.
    title_variant_b: text('title_variant_b'),
    title_variant_c: text('title_variant_c'),
    title_active_variant: text('title_active_variant').default('a'), // 'a' | 'b' | 'c'
    title_last_rotated_at: timestamp('title_last_rotated_at', { withTimezone: true }),
    title_variant_a_views: integer('title_variant_a_views').default(0),
    title_variant_b_views: integer('title_variant_b_views').default(0),
    title_variant_c_views: integer('title_variant_c_views').default(0),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    statusIdx: index('product_status_idx').on(t.status),
    nicheIdx: index('product_niche_idx').on(t.niche_id),
    slugIdx: index('product_slug_idx').on(t.slug),
  }),
);

// ── Niche Performance: rolling aggregate for feedback loop (Faz 5) ──
// Pre-created so Faz 5 doesn't need another migration round.
export const nichePerformance = pgTable(
  'niche_performance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    niche_topic: text('niche_topic').notNull().unique(),
    product_count: integer('product_count').default(0).notNull(),
    total_sales: integer('total_sales').default(0).notNull(),
    total_revenue_cents: integer('total_revenue_cents').default(0).notNull(),
    avg_score_boost: real('avg_score_boost').default(0).notNull(),
    last_sale_at: timestamp('last_sale_at', { withTimezone: true }),
    computed_at: timestamp('computed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
);

// ═══════════════════════════════════════════════════════════════
// FAZ 3 — Stripe Shop: sales, download tokens, channel listings
// ═══════════════════════════════════════════════════════════════

export const channelKind = pgEnum('channel_kind', [
  'stripe_shop',
  'etsy',
  'pinterest',
  'instagram',
  'facebook',
]);

/**
 * Every successful purchase creates one row. Source-of-truth for revenue,
 * Kleinunternehmer §19 yearly cap tracking, and OSS (B2C EU) thresholds.
 */
// ── B2 — Bundle Engine: auto-bundles 2-3 related products with discount ──
//
// Created automatically when a new product gets approved and there are
// already ≥1 other approved products in the same niche. Bundle pricing:
// 30% off the sum of individual prices, rounded to nearest €0.50.
export const productBundles = pgTable(
  'product_bundles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    // Source niche (for organisation + cross-sell logic)
    niche_id: uuid('niche_id').references(() => niches.id),
    // Array of product UUIDs included in the bundle (2-5 items)
    product_ids: text('product_ids').array().notNull().default([]),
    sum_price_cents: integer('sum_price_cents').notNull(), // sum of individual prices
    bundle_price_cents: integer('bundle_price_cents').notNull(), // discounted total
    discount_percent: integer('discount_percent').notNull().default(30),
    // Stripe references
    stripe_product_id: text('stripe_product_id'),
    stripe_price_id: text('stripe_price_id'),
    is_active: integer('is_active').default(1).notNull(),
    is_public_in_shop: integer('is_public_in_shop').default(1).notNull(),
    hero_image_url: text('hero_image_url'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    nicheIdx: index('bundles_niche_idx').on(t.niche_id),
    slugIdx: index('bundles_slug_idx').on(t.slug),
  }),
);

// ── C2 — Cart Abandon: enroll buyer in 3-email drip on Stripe expired session ──
//
// When a Checkout session expires without payment, we enroll the buyer's
// email in a 3-stage email sequence: 1h "Did something go wrong?",
// 24h "15% off coupon", 72h "Last call".
export const cartAbandons = pgTable(
  'cart_abandons',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    customer_email: text('customer_email').notNull(),
    product_id: uuid('product_id').references(() => products.id),
    product_slug: text('product_slug'),
    bundle_id: uuid('bundle_id').references(() => productBundles.id),
    stripe_session_id: text('stripe_session_id').notNull().unique(),
    abandoned_at: timestamp('abandoned_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Stage timestamps — null until that stage's email is sent
    email_1_sent_at: timestamp('email_1_sent_at', { withTimezone: true }),
    email_2_sent_at: timestamp('email_2_sent_at', { withTimezone: true }),
    email_3_sent_at: timestamp('email_3_sent_at', { withTimezone: true }),
    // Set if buyer comes back and completes a purchase before sequence ends
    recovered_at: timestamp('recovered_at', { withTimezone: true }),
    recovered_session_id: text('recovered_session_id'),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: index('cart_abandon_email_idx').on(t.customer_email),
    sessionIdx: index('cart_abandon_session_idx').on(t.stripe_session_id),
    pendingIdx: index('cart_abandon_pending_idx').on(t.abandoned_at),
  }),
);

export const productSales = pgTable(
  'product_sales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    product_id: uuid('product_id').references(() => products.id),
    channel: channelKind('channel').notNull(),
    external_order_id: text('external_order_id'), // Stripe checkout session id
    amount_cents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('eur'),
    buyer_email: text('buyer_email'),
    buyer_country: text('buyer_country'), // ISO-2; needed for OSS/VAT
    sold_at: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
    raw_payload: jsonb('raw_payload'),
    // P1.6 — Reviews automation cron sets this 14 days after sold_at
    review_ask_sent_at: timestamp('review_ask_sent_at', { withTimezone: true }),
    // Sprint G — Personalization Pro Tier
    tier: text('tier').default('basic'), // 'basic' | 'plus' | 'pro'
    custom_name: text('custom_name'),    // Pro tier: buyer-entered name
    custom_date: text('custom_date'),    // Pro tier: buyer-entered date (YYYY-MM-DD)
    personalized_file_url: text('personalized_file_url'), // regenerated PDF with overlay
    personalized_at: timestamp('personalized_at', { withTimezone: true }),
  },
  (t) => ({
    productIdx: index('sales_product_idx').on(t.product_id),
    soldAtIdx: index('sales_sold_at_idx').on(t.sold_at.desc()),
    extOrderIdx: uniqueIndex('sales_external_order_uniq').on(t.external_order_id),
    // partial index for review-ask cron — fast scan of "due" sales
    reviewDueIdx: index('sales_review_due_idx').on(t.sold_at),
  }),
);

/**
 * Single-use download links sent to the buyer after purchase. Each token
 * expires after 24h or 5 uses (whichever first) so a leaked URL has limited
 * blast radius.
 */
export const downloadTokens = pgTable(
  'download_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id),
    sale_id: uuid('sale_id').references(() => productSales.id),
    buyer_email: text('buyer_email'),
    expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
    used_count: integer('used_count').default(0).notNull(),
    max_uses: integer('max_uses').default(5).notNull(),
    created_at: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    tokenIdx: uniqueIndex('download_token_uniq').on(t.token),
  }),
);

/**
 * Sprint K Faz 6 — Daily auto-generated apparel candidates (cron-driven).
 *
 * Cron (08:00 UTC daily):
 *   1. niche rotation (gün → niche)
 *   2. apparel-research (Google Trends + GPT-4o) → 5 slogan candidate
 *   3. Banana 2 + Sharp manual RGBA → transparent PNG
 *   4. Printify product create (DRAFT, Etsy'ye gitmiyor)
 *   5. apparel_candidates row insert (status='pending')
 *   6. Telegram'a notification (mockup URL + slogan + komut)
 *   7. Mehmet /approve_<id> ya da /reject_<id> ile karar verir
 *
 * Status lifecycle:
 *   pending → approved (Etsy'ye gönderildi)
 *   pending → rejected (Printify'dan silindi)
 *   approved → published (Etsy listing aktif oldu)
 *   pending → failed (cron'da hata oldu)
 */
export const apparelCandidates = pgTable(
  'apparel_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    cron_run_id: text('cron_run_id'),
    niche: text('niche').notNull(),

    // LLM çıktıları (research helper'dan)
    slogan: text('slogan').notNull(),
    theme: text('theme').notNull(),
    style: text('style').notNull(),
    demand_hint: text('demand_hint'),
    inspired_by: text('inspired_by'),

    // Printify
    printify_product_id: text('printify_product_id').notNull(),
    printify_preview_url: text('printify_preview_url'),

    // Sprint M3 — Extra visual assets (Vercel Blob URL'leri)
    flat_lay_url: text('flat_lay_url'),
    size_chart_url: text('size_chart_url'),
    color_grid_url: text('color_grid_url'),
    video_url: text('video_url'),

    // Etsy (approve sonrası)
    etsy_listing_id: text('etsy_listing_id'),

    // Lifecycle
    status: text('status').notNull().default('pending'), // pending|approved|rejected|published|failed
    error_log: text('error_log'),
    decided_at: timestamp('decided_at', { withTimezone: true }),
    decided_by: text('decided_by'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index('apparel_candidate_status_idx').on(t.status),
    cronRunIdx: index('apparel_candidate_cron_idx').on(t.cron_run_id),
    createdIdx: index('apparel_candidate_created_idx').on(t.created_at),
  }),
);

/**
 * Tracks where each product is published — Faz 4 will populate Pinterest/Meta.
 * Faz 3 only uses stripe_shop entries.
 */
export const productListings = pgTable(
  'product_listings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    product_id: uuid('product_id')
      .notNull()
      .references(() => products.id),
    channel: channelKind('channel').notNull(),
    external_id: text('external_id'),
    external_url: text('external_url'),
    status: text('status').notNull().default('pending'),
    error_log: text('error_log'),
    published_at: timestamp('published_at', { withTimezone: true }),
  },
  (t) => ({
    uniqProductChannel: unique('uniq_product_channel').on(t.product_id, t.channel),
  }),
);
