import { generateText } from '@/lib/ai/text';
import { generateImage, generateImageRouted, buildImagePrompt } from '@/lib/ai/image';
import { composeLogo, applyGoldTint, cropToStoryAspect, cropToSquare } from '@/lib/image/compose-logo';
import { composeInfoCard, infoCardAspectRatio, type InfoCardOptions } from '@/lib/image/compose-info-card';
import { uploadImage } from '@/lib/blob';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import { createPost, getPost, updatePost } from '@/lib/db/queries/posts';
import type { Post, ImageProvider, ContentPillar, BrandKit } from '@/types';

export type ContentChannel = 'post' | 'ig_story' | 'info_card' | 'info_card_phone' | 'info_card_split';

export interface GeneratePostOpts {
  topic: string;
  telegramChatId?: string;
  telegramMessageId?: string;
  forceProvider?: ImageProvider;
  imageQuality?: 'low' | 'medium' | 'high';
  noLogo?: boolean;
  manualImageBuffer?: Buffer;
  rawMode?: boolean;
  rawText?: string;
  channel?: ContentChannel;
  pillar?: ContentPillar;
  scheduledAt?: Date;
}

function getCalendarWeek(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 1);
  const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + start.getDay() + 1) / 7);
}

export async function generatePost(opts: GeneratePostOpts): Promise<Post> {
  const brandKit = await getBrandKit();

  // RAW mode: just upload buffer + text, no AI, no logo overlay.
  if (opts.rawMode) {
    if (!opts.manualImageBuffer || !opts.rawText) {
      throw new Error('Raw mode requires manualImageBuffer + rawText');
    }
    const blob = await uploadImage(
      opts.manualImageBuffer,
      `raw-${Date.now()}.png`,
    );
    return createPost({
      status: 'draft',
      topic: null,
      text_de: opts.rawText,
      hashtags: [],
      image_source: 'raw_no_processing',
      final_image_url: blob.url,
      created_via: 'telegram',
      telegram_chat_id: opts.telegramChatId ?? null,
      telegram_message_id: opts.telegramMessageId ?? null,
    });
  }

  const channel: ContentChannel = opts.channel ?? 'post';
  const isInfoCard = channel === 'info_card' || channel === 'info_card_phone' || channel === 'info_card_split';
  const isStory = channel === 'ig_story';

  // INFO CARD flow
  if (isInfoCard) {
    return generateInfoCardPost(opts, brandKit);
  }

  // 1. Text via Claude
  const textOut = await generateText(opts.topic, brandKit, {
    scheduleHint: isStory
      ? 'Story format: 1-2 kurze, schlagkraeftige Saetze (max 80 Zeichen), 2-3 Hashtags. Kein langer Beitrag - Story ist visuell.'
      : undefined,
  });

  // 2. Image
  let rawBuffer!: Buffer;
  let imageProvider: string | null = null;
  let imagePrompt: string | null = null;
  const imageSource: 'ai_generated' | 'manual_upload' = opts.manualImageBuffer
    ? 'manual_upload'
    : 'ai_generated';

  if (opts.manualImageBuffer) {
    rawBuffer = opts.manualImageBuffer;
  } else {
    imagePrompt = buildImagePrompt(
      opts.topic,
      brandKit,
      isStory ? 'ig_story' : 'ig_post',
      opts.pillar,
    );

    if (opts.pillar) {
      const result = await generateImageRouted(
        imagePrompt,
        opts.pillar,
        opts.topic,
        {
          forceProvider: opts.forceProvider,
          quality: opts.imageQuality,
          aspectRatio: isStory ? '9:16' : '1:1',
        },
      );
      rawBuffer = result.buffer;
      imageProvider = result.provider;
    } else {
      const result = await generateImage(imagePrompt, {
        forceProvider: opts.forceProvider,
        quality: opts.imageQuality,
        aspectRatio: isStory ? '9:16' : '1:1',
      });
      rawBuffer = result.buffer;
      imageProvider = result.provider;
    }
  }

  // 3. Normalize aspect ratio
  const sizedBuffer = isStory
    ? await cropToStoryAspect(rawBuffer)
    : await cropToSquare(rawBuffer);

  // 4. Gold tint overlay
  const goldBuffer = await applyGoldTint(sizedBuffer, opts.pillar);

  // 5. Upload gold-tinted raw version
  const rawBlob = await uploadImage(goldBuffer, `raw-${Date.now()}.png`);

  // 6. Logo overlay decision
  const shouldOverlay =
    !opts.noLogo &&
    brandKit.logo_position !== 'none' &&
    !!brandKit.logo_url;
  const finalBuffer = shouldOverlay
    ? await composeLogo(goldBuffer, brandKit)
    : goldBuffer;
  const finalBlob = shouldOverlay
    ? await uploadImage(finalBuffer, `final-${Date.now()}.png`)
    : rawBlob;

  // 7. Persist
  return createPost({
    status: 'draft',
    topic: opts.topic,
    text_de: textOut.text,
    hashtags: textOut.hashtags,
    image_source: imageSource,
    raw_image_url: rawBlob.url,
    final_image_url: finalBlob.url,
    image_prompt: imagePrompt,
    image_provider: imageProvider,
    created_via: 'telegram',
    telegram_chat_id: opts.telegramChatId ?? null,
    telegram_message_id: opts.telegramMessageId ?? null,
    content_pillar: opts.pillar ?? null,
    calendar_week: opts.scheduledAt ? getCalendarWeek(opts.scheduledAt) : null,
    channel: isStory ? 'story' : 'feed',
    scheduled_at: opts.scheduledAt ?? null,
  });
}

// -----------------------------------------------------------------------------
// INFO CARD POST — white-bg compositor (Sharp + SVG text + device frame + AI)
//
// Called when channel is 'info_card' | 'info_card_phone' | 'info_card_split'.
// Generates:
//   1. AI text -> title + 3 bullets + label via generateInfoCardText()
//   2. AI image -> screenshot-style content for the device screen
//   3. Sharp compositor -> final 1080x1080 card
// -----------------------------------------------------------------------------

async function generateInfoCardText(
  topic: string,
  brandKit: BrandKit,
): Promise<{ title: string; bullets: string[]; label: string }> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const systemText = [
    'Du bist ein Social-Media-Texter fuer Fly & Froth, ein Grafik- & Webdesign-Studio in Karben.',
    'Erstelle fuer ein Instagram-Info-Card-Post:',
    '  title: Eine praegnante, fettgedruckte Ueberschrift (max 4 Woerter, Deutsch, kein Hashtag, kein Emoji).',
    '  bullets: Genau 3 kurze Stichpunkte auf Deutsch (max 30 Zeichen je Punkt), die den Nutzen beschreiben.',
    '  label: Ein kurzes Label auf Deutsch (max 5 Woerter), das das Projekt/Ergebnis benennt.',
    'Antworte NUR als JSON: {"title":"...","bullets":["...","...","..."],"label":"..."}',
  ].join('\n');

  void brandKit; // reserved for future brand-aware prompting

  const res = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    system: systemText,
    messages: [{ role: 'user', content: 'Thema: ' + topic }],
  });

  const block = res.content[0];
  if (!block || block.type !== 'text') throw new Error('No text from info-card text generator');
  const raw = block.text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const parsed = JSON.parse(raw) as { title: string; bullets: string[]; label: string };
  return {
    title:   (parsed.title  ?? topic).slice(0, 60),
    bullets: (parsed.bullets ?? []).slice(0, 3).map((b: string) => b.slice(0, 40)),
    label:   (parsed.label  ?? '').slice(0, 50),
  };
}

async function generateInfoCardPost(
  opts: GeneratePostOpts,
  brandKit: BrandKit,
): Promise<Post> {
  const channel  = opts.channel!;
  const isSplit  = channel === 'info_card_split';
  const isPhone  = channel === 'info_card_phone' || isSplit;
  const deviceType: InfoCardOptions['deviceType'] = isSplit
    ? 'split_phone'
    : isPhone
      ? 'phone'
      : 'desktop';

  // 1. Generate structured text (title, bullets, label)
  const cardText = await generateInfoCardText(opts.topic, brandKit);

  // 2. Build image prompt for the device screen
  const screenPrompt = buildInfoCardScreenPrompt(opts.topic, opts.pillar, deviceType);

  // 3. Generate AI image(s) for the device screen
  const aspectRatio = infoCardAspectRatio(deviceType);
  const quality     = opts.imageQuality ?? 'medium';

  let heroBuffer: Buffer | undefined;
  let beforeBuffer: Buffer | undefined;
  let afterBuffer: Buffer | undefined;

  if (isSplit) {
    const [beforeRes, afterRes] = await Promise.all([
      generateImage(buildInfoCardScreenPrompt(opts.topic, opts.pillar, 'phone', 'before'), { quality, aspectRatio }),
      generateImage(screenPrompt, { quality, aspectRatio }),
    ]);
    beforeBuffer = beforeRes.buffer;
    afterBuffer  = afterRes.buffer;
  } else {
    const { buffer } = opts.pillar
      ? await generateImageRouted(screenPrompt, opts.pillar, opts.topic, { quality, aspectRatio })
      : await generateImage(screenPrompt, { quality, aspectRatio });
    heroBuffer = buffer;
  }

  // 4. Get logo buffer for compositing
  let logoBuffer: Buffer | undefined;
  if (brandKit.logo_url) {
    try {
      const fetchRes = await fetch(brandKit.logo_url);
      logoBuffer = Buffer.from(await fetchRes.arrayBuffer());
    } catch { /* logo is optional */ }
  }

  // 5. Compose the info card
  const cardBuffer = await composeInfoCard({
    title:        cardText.title,
    bullets:      cardText.bullets,
    label:        cardText.label,
    heroImage:    heroBuffer,
    deviceType,
    beforeImage:  beforeBuffer,
    afterImage:   afterBuffer,
    logoBuffer,
  });

  // 6. Upload
  const blob = await uploadImage(cardBuffer, `info-card-${Date.now()}.png`);

  // 7. Persist
  return createPost({
    status:              'draft',
    topic:               opts.topic,
    text_de:             cardText.title + '\n\n' + cardText.bullets.map((b) => '* ' + b).join('\n'),
    hashtags:            [],
    image_source:        'ai_generated',
    raw_image_url:       blob.url,
    final_image_url:     blob.url,
    image_prompt:        screenPrompt,
    image_provider:      'openai',
    created_via:         'telegram',
    telegram_chat_id:    opts.telegramChatId ?? null,
    telegram_message_id: opts.telegramMessageId ?? null,
    content_pillar:      opts.pillar ?? null,
    calendar_week:       opts.scheduledAt ? getCalendarWeek(opts.scheduledAt) : null,
    channel:             isSplit ? 'info_card_split' : isPhone ? 'info_card_phone' : 'info_card',
    scheduled_at:        opts.scheduledAt ?? null,
  });
}

function buildInfoCardScreenPrompt(
  topic: string,
  pillar: string | undefined,
  deviceType: InfoCardOptions['deviceType'],
  variant?: 'before' | 'after',
): string {
  void pillar;
  const isPhone  = deviceType !== 'desktop';
  const isBefore = variant === 'before';

  const formatNote = isPhone
    ? 'The image will fill a smartphone screen (9:16 portrait). Design for mobile.'
    : 'The image will fill a desktop browser screen (16:9 landscape). Design for desktop.';

  if (isBefore) {
    return [
      'A screenshot of a generic, cluttered, outdated small-business website shown on a ' + (isPhone ? 'mobile phone' : 'desktop browser') + '.',
      'The website looks amateurish: mismatched colors, too many fonts, poor layout, no clear hierarchy.',
      'It is obviously from around 2010 — dated design, no modern aesthetics.',
      'Topic it relates to: ' + topic,
      formatNote,
      'Render as a realistic flat screenshot — no device frame around it.',
      'The design quality inside the screenshot must look genuinely poor and amateur.',
    ].join(' ');
  }

  return [
    'A clean, modern, professional website or app screenshot for a graphic and web design studio.',
    'Service being showcased: ' + topic + '.',
    'The design inside the screenshot: bold deep navy (#1A2340) header, clean white body, strong typography, clear call-to-action.',
    'The layout is perfectly structured, modern, and trustworthy.',
    formatNote,
    'Render as a realistic flat screenshot — no device frame.',
    'The design quality must look genuinely premium and modern.',
    'Minimal readable text inside — focus on layout structure, color, and visual hierarchy.',
  ].join(' ');
}

export async function regenerateImage(postId: string): Promise<Post> {
  const post = await getPost(postId);
  if (!post || !post.topic) {
    throw new Error('Post not found or has no topic');
  }
  const brandKit = await getBrandKit();

  const prompt = buildImagePrompt(post.topic, brandKit, undefined, post.content_pillar ?? undefined);
  const { buffer, provider } = await generateImage(prompt);

  const isStoryRegen = post.channel === 'story' || post.channel === 'reel';
  const sizedBuffer = isStoryRegen
    ? await cropToStoryAspect(buffer)
    : await cropToSquare(buffer);

  const goldBuffer = await applyGoldTint(sizedBuffer, post.content_pillar);
  const rawBlob = await uploadImage(goldBuffer, `raw-${Date.now()}.png`);
  const shouldOverlay = brandKit.logo_position !== 'none' && !!brandKit.logo_url;
  const finalBuffer = shouldOverlay
    ? await composeLogo(goldBuffer, brandKit)
    : goldBuffer;
  const finalBlob = shouldOverlay
    ? await uploadImage(finalBuffer, `final-${Date.now()}.png`)
    : rawBlob;
  return updatePost(postId, {
    raw_image_url:  rawBlob.url,
    final_image_url: finalBlob.url,
    image_prompt:   prompt,
    image_provider:  provider,
  });
}

export async function regenerateText(postId: string): Promise<Post> {
  const post = await getPost(postId);
  if (!post || !post.topic) {
    throw new Error('Post not found or has no topic');
  }
  const brandKit = await getBrandKit();
  const out = await generateText(post.topic, brandKit, {
    previousAttempt: post.text_de,
  });
  return updatePost(postId, { text_de: out.text, hashtags: out.hashtags });
}
