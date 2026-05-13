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
