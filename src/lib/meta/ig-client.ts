import { getPageToken } from './token-manager';

const VERSION = process.env.META_GRAPH_VERSION ?? 'v21.0';

function igAccountId(): string {
  const id = process.env.META_IG_ACCOUNT_ID;
  if (!id) throw new Error('META_IG_ACCOUNT_ID is not set');
  return id;
}

export interface IGPublishResult {
  id: string;
  shortcode?: string;
}

async function call<T>(
  path: string,
  params: Record<string, string>,
): Promise<T> {
  const token = await getPageToken();
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`https://graph.facebook.com/${VERSION}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const json = (await res.json()) as T & { error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`IG ${path} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function igGet<T>(path: string): Promise<T> {
  const token = await getPageToken();
  const sep = path.includes('?') ? '&' : '?';
  const url = `https://graph.facebook.com/${VERSION}/${path}${sep}access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url);
  const json = (await res.json()) as T & { error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`IG GET ${path} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

async function fetchShortcode(mediaId: string): Promise<string | undefined> {
  try {
    const json = await igGet<{ shortcode?: string }>(
      `${mediaId}?fields=shortcode`,
    );
    return json.shortcode;
  } catch {
    return undefined;
  }
}

/**
 * Wait for IG media container to be ready (FINISHED status).
 * IG async-processes images; publishing before FINISHED returns error 9007.
 */
async function waitForContainer(
  containerId: string,
  maxWaitMs = 30000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const status = await igGet<{ status_code?: string }>(
      `${containerId}?fields=status_code`,
    );
    if (status.status_code === 'FINISHED') return;
    if (status.status_code === 'ERROR') {
      throw new Error('IG media container errored during processing');
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/**
 * Publish a feed post to Instagram.
 * Supported aspect ratios: 1:1, 4:5, 1.91:1.
 */
export async function publishToIG(
  imageUrl: string,
  caption: string,
): Promise<IGPublishResult> {
  const container = await call<{ id: string }>(`${igAccountId()}/media`, {
    image_url: imageUrl,
    caption,
  });

  await waitForContainer(container.id);

  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    { creation_id: container.id },
  );

  const shortcode = await fetchShortcode(published.id);
  return { id: published.id, shortcode };
}

/**
 * Publish an Instagram Story (9:16 vertical image).
 */
export async function publishToIGStory(
  imageUrl: string,
): Promise<IGPublishResult> {
  const container = await call<{ id: string }>(`${igAccountId()}/media`, {
    image_url: imageUrl,
    media_type: 'STORIES',
  });

  await waitForContainer(container.id);

  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    { creation_id: container.id },
  );

  return { id: published.id };
}

// ─────────────────────────────────────────────────────────────
// Sprint X.2 — Carousel + video extensions
//
// Strategy: rather than spamming the IG feed with N separate posts (which
// the algorithm flags as low-quality bulk content), we package the day's
// products into 1-2 carousel posts. Each carousel can hold up to 10 items.
// ─────────────────────────────────────────────────────────────

/**
 * Publish an Instagram CAROUSEL post (multi-image feed post).
 *
 * Meta Graph API flow:
 *   1. Create N child containers, each with is_carousel_item=true.
 *   2. Create parent container with media_type=CAROUSEL + children=<comma-list>.
 *   3. Wait for FINISHED (parent only — children are checked implicitly).
 *   4. Publish via media_publish.
 *
 * IG limit: 2-10 items per carousel. We slice down silently.
 * Aspect: 1:1 best (matches our 2K Banana Pro mockups).
 */
export async function publishCarouselToIG(
  imageUrls: string[],
  caption: string,
): Promise<IGPublishResult> {
  const urls = imageUrls.slice(0, 10);
  if (urls.length < 2) {
    throw new Error(
      `publishCarouselToIG needs >=2 images, got ${urls.length}`,
    );
  }

  // Step 1 — create child containers (sequential to keep IG processing happy).
  const childIds: string[] = [];
  for (const u of urls) {
    const child = await call<{ id: string }>(`${igAccountId()}/media`, {
      image_url: u,
      is_carousel_item: 'true',
    });
    childIds.push(child.id);
  }

  // Step 2 — create parent carousel container.
  const parent = await call<{ id: string }>(`${igAccountId()}/media`, {
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    caption,
  });

  await waitForContainer(parent.id, 60000); // carousels take longer

  // Step 3 — publish.
  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    { creation_id: parent.id },
  );

  const shortcode = await fetchShortcode(published.id);
  return { id: published.id, shortcode };
}

/**
 * Publish a video feed post (REELS — modern Meta API requires REELS for
 * videos posted to the feed, not VIDEO).
 *
 * Video must be:
 *  - hosted on a publicly accessible URL (no auth)
 *  - mp4 / mov, max 90 seconds for REELS
 *  - aspect ratio 9:16 (vertical) recommended
 *
 * Higgsfield videos are 5-sec mp4 at varying aspects — IG accepts square.
 */
export async function publishVideoToIG(
  videoUrl: string,
  caption: string,
): Promise<IGPublishResult> {
  const container = await call<{ id: string }>(`${igAccountId()}/media`, {
    media_type: 'REELS',
    video_url: videoUrl,
    caption,
    share_to_feed: 'true', // also appears in main grid, not just Reels tab
  });

  await waitForContainer(container.id, 90000); // videos take ~30-60s

  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    { creation_id: container.id },
  );

  const shortcode = await fetchShortcode(published.id);
  return { id: published.id, shortcode };
}

/**
 * Publish an Instagram Story with a VIDEO (15s short clip).
 *
 * Stories disappear after 24h so algorithm cost is near-zero — this is the
 * highest-volume-friendly channel. Use it for every product.
 */
export async function publishVideoStoryToIG(
  videoUrl: string,
): Promise<IGPublishResult> {
  const container = await call<{ id: string }>(`${igAccountId()}/media`, {
    media_type: 'STORIES',
    video_url: videoUrl,
  });

  await waitForContainer(container.id, 60000);

  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    { creation_id: container.id },
  );

  return { id: published.id };
}
