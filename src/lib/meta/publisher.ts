import { publishToFBPage } from './page-client';
import { publishToIG, publishToIGStory } from './ig-client';
import { getPost, updatePost } from '@/lib/db/queries/posts';

export interface PublishResult {
  fbPostId: string | null;
  igPostId: string | null;
  igShortcode?: string;
  fbError?: string;
  igError?: string;
}

const PERMANENT_ERROR_PATTERNS =
  /access token|permission|policy|invalid|expired|deprecated/i;

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  delays: number[] = [1000, 4000, 16000],
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err);
      if (PERMANENT_ERROR_PATTERNS.test(msg)) {
        throw err;
      }
      if (i < attempts - 1) {
        const wait = delays[i] ?? 16000;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

// ───── Story: publish to IG Story + FB feed (FB Page Stories not available via Graph API) ─────

export async function publishStory(postId: string): Promise<PublishResult> {
  const post = await getPost(postId);
  if (!post) throw new Error('Post not found');
  if (post.status === 'published') throw new Error('Already published');

  await updatePost(postId, { status: 'publishing' });

  const caption = [
    post.text_de,
    '',
    (post.hashtags ?? [])
      .map((h) => `#${h.replace(/^#/, '')}`)
      .join(' '),
  ].join('\n');

  let fbPostId: string | null = null;
  let fbError: string | undefined;
  let igPostId: string | null = null;
  let igError: string | undefined;
  let igShortcode: string | undefined;

  // IG Story
  try {
    const ig = await withRetry(() => publishToIGStory(post.final_image_url));
    igPostId = ig.id;
  } catch (err) {
    igError = err instanceof Error ? err.message : String(err);
  }

  // FB: publish as photo post (9:16 image works fine in feed)
  try {
    const fb = await withRetry(() =>
      publishToFBPage(post.final_image_url, caption),
    );
    fbPostId = fb.post_id ?? fb.id;
  } catch (err) {
    fbError = err instanceof Error ? err.message : String(err);
  }

  const bothFailed = !igPostId && !fbPostId;

  await updatePost(postId, {
    status: bothFailed ? 'failed' : 'published',
    fb_post_id: fbPostId,
    ig_post_id: igPostId,
    ig_shortcode: igShortcode ?? null,
    published_at: bothFailed ? undefined : new Date(),
    error_log: bothFailed
      ? [fbError, igError].filter(Boolean).join(' | ').slice(0, 1000)
      : null,
    retry_count: bothFailed ? (post.retry_count ?? 0) + 1 : post.retry_count,
  });

  if (bothFailed) {
    throw new Error(`Story publish failed: FB=${fbError ?? 'none'} IG=${igError ?? 'none'}`);
  }

  return { fbPostId, igPostId, igShortcode, fbError, igError };
}

// ───── Feed Post: publish to FB Page + IG — best-effort for each ─────

export async function publishPost(postId: string): Promise<PublishResult> {
  const post = await getPost(postId);
  if (!post) throw new Error('Post not found');
  if (post.status === 'published') throw new Error('Already published');

  await updatePost(postId, { status: 'publishing' });

  const caption = [
    post.text_de,
    '',
    (post.hashtags ?? [])
      .map((h) => `#${h.replace(/^#/, '')}`)
      .join(' '),
  ].join('\n');

  let fbPostId: string | null = null;
  let fbError: string | undefined;
  let igPostId: string | null = null;
  let igError: string | undefined;
  let igShortcode: string | undefined;

  // FB
  try {
    const fb = await withRetry(() =>
      publishToFBPage(post.final_image_url, caption),
    );
    fbPostId = fb.post_id ?? fb.id;
  } catch (err) {
    fbError = err instanceof Error ? err.message : String(err);
  }

  // IG
  try {
    const ig = await withRetry(() =>
      publishToIG(post.final_image_url, caption),
    );
    igPostId = ig.id;
    igShortcode = ig.shortcode;
  } catch (err) {
    igError = err instanceof Error ? err.message : String(err);
  }

  const bothFailed = !igPostId && !fbPostId;

  await updatePost(postId, {
    status: bothFailed ? 'failed' : 'published',
    fb_post_id: fbPostId,
    ig_post_id: igPostId,
    ig_shortcode: igShortcode ?? null,
    published_at: bothFailed ? undefined : new Date(),
    error_log: bothFailed
      ? [fbError, igError].filter(Boolean).join(' | ').slice(0, 1000)
      : null,
    retry_count: bothFailed ? (post.retry_count ?? 0) + 1 : post.retry_count,
  });

  if (bothFailed) {
    throw new Error(`Post publish failed: FB=${fbError ?? 'none'} IG=${igError ?? 'none'}`);
  }

  return { fbPostId, igPostId, igShortcode, fbError, igError };
}
