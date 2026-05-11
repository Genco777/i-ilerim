import { generateText } from '@/lib/ai/text';
import { generateImage, generateImageRouted, buildImagePrompt } from '@/lib/ai/image';
import { composeLogo } from '@/lib/image/compose-logo';
import { uploadImage } from '@/lib/blob';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import { createPost, getPost, updatePost } from '@/lib/db/queries/posts';
import { pickPortfolioImage } from '@/lib/content/website-images';
import type { Post, ImageProvider, ContentPillar } from '@/types';

export type ContentChannel = 'post' | 'ig_story';

export interface GeneratePostOpts {
  topic: string;
  telegramChatId?: string;
  telegramMessageId?: string;
  forceProvider?: ImageProvider;
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
  const isStory = channel === 'ig_story';

  // 1. Text via Claude (different style for stories)
  const textOut = await generateText(opts.topic, brandKit, {
    scheduleHint: isStory
      ? 'Story format: 1-2 kurze, schlagkräftige Sätze (max 80 Zeichen), 2-3 Hashtags. Kein langer Beitrag — Story ist visuell.'
      : undefined,
  });

  // 2. Image: real portfolio images for vitrine/prozess, AI for insight/lokal/reel
  let rawBuffer: Buffer;
  let imageProvider: string | null = null;
  let imagePrompt: string | null = null;
  let imageSource: 'ai_generated' | 'manual_upload' = 'ai_generated';

  const useRealImage = !opts.manualImageBuffer
    && (opts.pillar === 'vitrine' || opts.pillar === 'prozess');

  if (opts.manualImageBuffer) {
    rawBuffer = opts.manualImageBuffer;
    imageSource = 'manual_upload';
  } else if (useRealImage) {
    // Use real portfolio image from fly-froth.com — no AI at all
    const picked = pickPortfolioImage(opts.topic, opts.pillar);
    const res = await fetch(picked.url);
    if (!res.ok) {
      throw new Error(`Website image fetch failed (${res.status}): ${picked.url}`);
    }
    rawBuffer = Buffer.from(await res.arrayBuffer());
    imageSource = 'manual_upload';
    imageProvider = 'website';
    imagePrompt = `Real portfolio: ${picked.description} (${picked.service})`;
  } else {
    imagePrompt = buildImagePrompt(
      opts.topic,
      brandKit,
      isStory ? 'ig_story' : 'ig_post',
      opts.pillar,
    );

    // Use routed pipeline when pillar is known, fallback to generic generateImage
    if (opts.pillar) {
      const result = await generateImageRouted(
        imagePrompt,
        opts.pillar,
        opts.topic,
        {
          forceProvider: opts.forceProvider,
          aspectRatio: isStory ? '9:16' : '1:1',
        },
      );
      rawBuffer = result.buffer;
      imageProvider = result.provider;
    } else {
      const result = await generateImage(imagePrompt, {
        forceProvider: opts.forceProvider,
        aspectRatio: isStory ? '9:16' : '1:1',
      });
      rawBuffer = result.buffer;
      imageProvider = result.provider;
    }
  }

  // 3. Upload raw (logo-less) version
  const rawBlob = await uploadImage(rawBuffer, `raw-${Date.now()}.png`);

  // 4. Logo overlay decision (Sharp post-processing for manual uploads)
  const shouldOverlay =
    !opts.noLogo &&
    brandKit.logo_position !== 'none' &&
    !!brandKit.logo_url;
  const finalBuffer = shouldOverlay
    ? await composeLogo(rawBuffer, brandKit)
    : rawBuffer;
  const finalBlob = shouldOverlay
    ? await uploadImage(finalBuffer, `final-${Date.now()}.png`)
    : rawBlob;

  // 5. Persist
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

export async function regenerateImage(postId: string): Promise<Post> {
  const post = await getPost(postId);
  if (!post || !post.topic) {
    throw new Error('Post not found or has no topic');
  }
  const brandKit = await getBrandKit();

  const useRealImage = post.content_pillar === 'vitrine' || post.content_pillar === 'prozess';

  let buffer: Buffer;
  let provider: string | null = null;
  let prompt: string | null = null;

  if (useRealImage) {
    const picked = pickPortfolioImage(post.topic, post.content_pillar ?? undefined);
    const res = await fetch(picked.url);
    if (!res.ok) throw new Error(`Website image fetch failed (${res.status})`);
    buffer = Buffer.from(await res.arrayBuffer());
    provider = 'website';
    prompt = `Real portfolio: ${picked.description} (${picked.service})`;
  } else {
    prompt = buildImagePrompt(post.topic, brandKit, undefined, post.content_pillar ?? undefined);
    const result = await generateImage(prompt);
    buffer = result.buffer;
    provider = result.provider;
  }

  const rawBlob = await uploadImage(buffer, `raw-${Date.now()}.png`);
  const shouldOverlay =
    brandKit.logo_position !== 'none' && !!brandKit.logo_url;
  const finalBuffer = shouldOverlay
    ? await composeLogo(buffer, brandKit)
    : buffer;
  const finalBlob = shouldOverlay
    ? await uploadImage(finalBuffer, `final-${Date.now()}.png`)
    : rawBlob;
  return updatePost(postId, {
    raw_image_url: rawBlob.url,
    final_image_url: finalBlob.url,
    image_prompt: prompt,
    image_provider: provider,
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
