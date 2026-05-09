import { getPageToken } from './token-manager';

const VERSION = process.env.META_GRAPH_VERSION ?? 'v21.0';

function pageId(): string {
  const id = process.env.META_PAGE_ID;
  if (!id) throw new Error('META_PAGE_ID is not set');
  return id;
}

function igAccountId(): string {
  const id = process.env.META_IG_ACCOUNT_ID;
  if (!id) throw new Error('META_IG_ACCOUNT_ID is not set');
  return id;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = (await res.json()) as T & { error?: unknown };
  if (!res.ok || (json as { error?: unknown }).error) {
    throw new Error(`Meta GET failed: ${JSON.stringify(json)}`);
  }
  return json;
}

// ─── Facebook Page comment polling ───
interface FBComment {
  id: string;
  message?: string;
  created_time: string;
  from?: { id: string; name?: string };
}

interface FBPostFeedItem {
  id: string;
  created_time: string;
  message?: string;
  comments?: { data: FBComment[] };
}

export interface NormalizedComment {
  platform: 'fb_comment' | 'ig_comment';
  external_id: string;
  parent_post_id: string;
  parent_comment_id: string | null;
  sender_name: string;
  sender_external_id: string;
  message_text: string;
  received_at: Date;
  parent_post_text: string | null;
}

export async function fetchFBPageComments(
  limit = 10,
): Promise<NormalizedComment[]> {
  const token = await getPageToken();
  const url =
    `https://graph.facebook.com/${VERSION}/${pageId()}/feed` +
    `?fields=id,created_time,message,comments.limit(10){id,message,from,created_time}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;

  const json = await getJson<{ data: FBPostFeedItem[] }>(url);
  const out: NormalizedComment[] = [];
  for (const post of json.data) {
    const parentText = post.message ?? null;
    const comments = post.comments?.data ?? [];
    for (const c of comments) {
      if (!c.message) continue;
      out.push({
        platform: 'fb_comment',
        external_id: c.id,
        parent_post_id: post.id,
        parent_comment_id: null,
        sender_name: c.from?.name ?? 'Unbekannt',
        sender_external_id: c.from?.id ?? 'unknown',
        message_text: c.message,
        received_at: new Date(c.created_time),
        parent_post_text: parentText,
      });
    }
  }
  return out;
}

// ─── Instagram comment polling ───
interface IGComment {
  id: string;
  text?: string;
  username?: string;
  timestamp?: string;
  from?: { id: string; username?: string };
}

interface IGMediaItem {
  id: string;
  caption?: string;
  timestamp?: string;
  comments?: { data: IGComment[] };
}

export async function fetchIGComments(
  limit = 10,
): Promise<NormalizedComment[]> {
  const token = await getPageToken();
  const url =
    `https://graph.facebook.com/${VERSION}/${igAccountId()}/media` +
    `?fields=id,caption,timestamp,comments.limit(10){id,text,username,timestamp,from}` +
    `&limit=${limit}` +
    `&access_token=${encodeURIComponent(token)}`;

  const json = await getJson<{ data: IGMediaItem[] }>(url);
  const out: NormalizedComment[] = [];
  for (const media of json.data) {
    const parentText = media.caption ?? null;
    const comments = media.comments?.data ?? [];
    for (const c of comments) {
      if (!c.text) continue;
      const ts = c.timestamp ? new Date(c.timestamp) : new Date();
      const senderName =
        c.username ?? c.from?.username ?? 'Unbekannt';
      const senderId = c.from?.id ?? c.username ?? 'unknown';
      out.push({
        platform: 'ig_comment',
        external_id: c.id,
        parent_post_id: media.id,
        parent_comment_id: null,
        sender_name: senderName,
        sender_external_id: senderId,
        message_text: c.text,
        received_at: ts,
        parent_post_text: parentText,
      });
    }
  }
  return out;
}
