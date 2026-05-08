import { generateText } from '@/lib/ai/text';
import { generateImage, buildImagePrompt } from '@/lib/ai/image';
import { composeLogo } from '@/lib/image/compose-logo';
import { uploadImage } from '@/lib/blob';
import { getBrandKit } from '@/lib/db/queries/brand-kit';
import { createPost, getPost, updatePost } from '@/lib/db/queries/posts';
import type { Post, ImageProvider } from '@/types';

export interface GeneratePostOpts {
  topic: string;
  telegramChatId?: string;
  telegramMessageId?: string;
  forceProvider?: ImageProvider;
  noLogo?: boolean;
  manualImageBuffer?: Buffer;
  rawMode?: boolean;
  rawText?: string;
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

  // 1. Text via Claude
  const textOut = await generateText(opts.topic, brandKit);

  // 2. Image: AI or manual upload
  let rawBuffer: Buffer;
  let imageProvider: ImageProvider | null = null;
  let imagePrompt: string | null = null;
  let imageSource: 'ai_generated' | 'manual_upload' = 'ai_generated';

  if (opts.manualImageBuffer) {
    rawBuffer = opts.manualImageBuffer;
    imageSource = 'manual_upload';
  } else {
    imagePrompt = buildImagePrompt(opts.topic, brandKit);
    const result = await generateImage(imagePrompt, {
      forceProvider: opts.forceProvider,
    });
    rawBuffer = result.buffer;
    imageProvider = result.provider;
  }

  // 3. Upload raw (logo-less) version
  const rawBlob = await uploadImage(rawBuffer, `raw-${Date.now()}.png`);

  // 4. Logo overlay decision
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
  });
}

export async function regenerateImage(postId: string): Promise<Post> {
  const post = await getPost(postId);
  if (!post || !post.topic) {
    throw new Error('Post not found or has no topic');
  }
  const brandKit = await getBrandKit();
  const prompt = buildImagePrompt(post.topic, brandKit);
  const { buffer, provider } = await generateImage(prompt);
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
