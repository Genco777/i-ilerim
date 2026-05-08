import { publishToFBPage } from './page-client';
import { publishToIG } from './ig-client';
import { getPost, updatePost } from '@/lib/db/queries/posts';

export interface PublishResult {
  fbPostId: string;
  igPostId: string;
  igShortcode?: string;
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

export async function publishPost(postId: string): Promise<PublishResult> {
  const post = await getPost(postId);
  if (!post) {
    throw new Error('Post not found');
  }
  if (post.status === 'published') {
    throw new Error('Already published');
  }

  await updatePost(postId, { status: 'publishing' });

  const caption = [
    post.text_de,
    '',
    (post.hashtags ?? [])
      .map((h) => `#${h.replace(/^#/, '')}`)
      .join(' '),
  ].join('\n');

  try {
    const fb = await withRetry(() =>
      publishToFBPage(post.final_image_url, caption),
    );
    const ig = await withRetry(() =>
      publishToIG(post.final_image_url, caption),
    );

    await updatePost(postId, {
      status: 'published',
      fb_post_id: fb.post_id ?? fb.id,
      ig_post_id: ig.id,
      ig_shortcode: ig.shortcode ?? null,
      published_at: new Date(),
      error_log: null,
    });

    return {
      fbPostId: fb.post_id ?? fb.id,
      igPostId: ig.id,
      igShortcode: ig.shortcode,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await updatePost(postId, {
      status: 'failed',
      error_log: msg.slice(0, 1000),
      retry_count: (post.retry_count ?? 0) + 1,
    });
    throw err;
  }
}
