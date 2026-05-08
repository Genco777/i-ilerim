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

async function fetchShortcode(mediaId: string): Promise<string | undefined> {
  const token = await getPageToken();
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/${mediaId}?fields=shortcode&access_token=${encodeURIComponent(token)}`,
  );
  const json = (await res.json()) as { shortcode?: string };
  return json.shortcode;
}

export async function publishToIG(
  imageUrl: string,
  caption: string,
): Promise<IGPublishResult> {
  // Step 1: create media container
  const container = await call<{ id: string }>(`${igAccountId()}/media`, {
    image_url: imageUrl,
    caption,
  });

  // Step 2: publish
  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    {
      creation_id: container.id,
    },
  );

  const shortcode = await fetchShortcode(published.id);
  return { id: published.id, shortcode };
}

// Instagram Story publish (image, 9:16 vertical).
// Note: caption is not displayed on IG Stories — passed as alt-text/metadata only.
export async function publishToIGStory(
  imageUrl: string,
): Promise<IGPublishResult> {
  const container = await call<{ id: string }>(`${igAccountId()}/media`, {
    image_url: imageUrl,
    media_type: 'STORIES',
  });

  const published = await call<{ id: string }>(
    `${igAccountId()}/media_publish`,
    { creation_id: container.id },
  );

  return { id: published.id };
}
