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
