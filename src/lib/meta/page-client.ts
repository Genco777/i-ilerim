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

// ─────────────────────────────────────────────────────────────
// Sprint X.2 — FB Page carousel / multi-image post
//
// FB Graph API doesn't have an official "carousel post" the way IG does.
// What works reliably is: upload each photo as UNPUBLISHED, collect the
// photo IDs, then create a feed post that ATTACHES all the photos.
//
// The resulting post appears in the feed as a multi-photo gallery, which
// is what users perceive as a "carousel".
// ─────────────────────────────────────────────────────────────

/**
 * Publish a FB Page post with multiple attached photos (perceived as
 * carousel/gallery in the feed).
 *
 * Two-step:
 *   1. POST /{page-id}/photos for each image with published=false → get IDs.
 *   2. POST /{page-id}/feed with message + attached_media=[{media_fbid: id},...].
 */
export async function publishCarouselToFB(
  imageUrls: string[],
  caption: string,
): Promise<FBPublishResult> {
  const token = await getPageToken();
  const urls = imageUrls.slice(0, 10);
  if (urls.length < 2) {
    throw new Error(`publishCarouselToFB needs >=2 images, got ${urls.length}`);
  }

  // Step 1 — upload each photo as unpublished, collect the photo IDs.
  const mediaIds: string[] = [];
  for (const u of urls) {
    const photoUrl = `https://graph.facebook.com/${VERSION}/${pageId()}/photos`;
    const params = new URLSearchParams({
      url: u,
      published: 'false', // upload but don't post yet
      access_token: token,
    });
    const res = await fetch(photoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const j = (await res.json()) as { id?: string; error?: unknown };
    if (!res.ok || j.error || !j.id) {
      throw new Error(`FB carousel child upload failed: ${JSON.stringify(j)}`);
    }
    mediaIds.push(j.id);
  }

  // Step 2 — create the feed post that attaches all the photos.
  const attached = mediaIds.map((id) => ({ media_fbid: id }));
  const feedUrl = `https://graph.facebook.com/${VERSION}/${pageId()}/feed`;
  const params = new URLSearchParams({
    message: caption,
    attached_media: JSON.stringify(attached),
    access_token: token,
    published: 'true',
  });
  const res = await fetch(feedUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const json = (await res.json()) as FBPublishResult & { error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`FB carousel feed post failed: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Publish a FB Page video post.
 */
export async function publishVideoToFBPage(
  videoUrl: string,
  caption: string,
): Promise<FBPublishResult> {
  const token = await getPageToken();
  const url = `https://graph.facebook.com/${VERSION}/${pageId()}/videos`;

  const params = new URLSearchParams({
    file_url: videoUrl,
    description: caption,
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
    throw new Error(`FB video publish failed: ${JSON.stringify(json)}`);
  }
  return json;
}
