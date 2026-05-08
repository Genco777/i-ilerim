import { getPageToken } from './token-manager';

const VERSION = process.env.META_GRAPH_VERSION ?? 'v21.0';

function pageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error('META_PAGE_ID is not set');
  return id;
}

export interface FBPublishResult {
  id: string;
  post_id?: string;
}

export async function publishToFBPage(
  imageUrl: string,
  caption: string,
): Promise<FBPublishResult> {
  const token = await getPageToken();
  const url = `https://graph.facebook.com/${VERSION}/${pageId()}/photos`;

  const params = new URLSearchParams({
    url: imageUrl,
    message: caption,
    access_token: token,
    published: 'true',
  });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const json = (await res.json()) as FBPublishResult & { error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`FB publish failed: ${JSON.stringify(json)}`);
  }
  return json;
}
