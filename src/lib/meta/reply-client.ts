import { getPageToken } from './token-manager';

const VERSION = process.env.META_GRAPH_VERSION ?? 'v21.0';

export interface ReplyResult {
  id: string;
}

async function postForm<T>(
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
    throw new Error(`Meta ${path} failed: ${JSON.stringify(json)}`);
  }
  return json;
}

/**
 * Reply to a Facebook Page post comment.
 * POST /{comment_id}/comments  with message=text
 */
export async function replyToFBComment(
  commentId: string,
  text: string,
): Promise<ReplyResult> {
  return postForm<ReplyResult>(`${commentId}/comments`, { message: text });
}

/**
 * Reply to an Instagram comment.
 * POST /{ig_comment_id}/replies with message=text
 */
export async function replyToIGComment(
  commentId: string,
  text: string,
): Promise<ReplyResult> {
  return postForm<ReplyResult>(`${commentId}/replies`, { message: text });
}

/**
 * Send a Facebook Page DM (Messenger Send API).
 * POST /me/messages with messaging_type=RESPONSE
 */
export async function sendFBPageMessage(
  recipientPsid: string,
  text: string,
): Promise<ReplyResult> {
  const token = await getPageToken();
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientPsid },
        message: { text },
        messaging_type: 'RESPONSE',
      }),
    },
  );
  const json = (await res.json()) as { message_id?: string; error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`FB DM send failed: ${JSON.stringify(json)}`);
  }
  return { id: json.message_id ?? 'unknown' };
}

/**
 * Send an IG Direct Message (Instagram Messaging API).
 */
export async function sendIGDirectMessage(
  recipientIgsid: string,
  text: string,
): Promise<ReplyResult> {
  const token = await getPageToken();
  const res = await fetch(
    `https://graph.facebook.com/${VERSION}/me/messages?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: recipientIgsid },
        message: { text },
      }),
    },
  );
  const json = (await res.json()) as { message_id?: string; error?: unknown };
  if (!res.ok || json.error) {
    throw new Error(`IG DM send failed: ${JSON.stringify(json)}`);
  }
  return { id: json.message_id ?? 'unknown' };
}

/**
 * High-level dispatcher: route by platform.
 */
export async function publishReply(
  platform: string,
  externalParentId: string,
  text: string,
  recipientId?: string,
): Promise<ReplyResult> {
  switch (platform) {
    case 'fb_comment':
      return replyToFBComment(externalParentId, text);
    case 'ig_comment':
      return replyToIGComment(externalParentId, text);
    case 'fb_dm':
      if (!recipientId) throw new Error('fb_dm reply needs recipientId (PSID)');
      return sendFBPageMessage(recipientId, text);
    case 'ig_dm':
      if (!recipientId) throw new Error('ig_dm reply needs recipientId (IGSID)');
      return sendIGDirectMessage(recipientId, text);
    default:
      throw new Error(`Unsupported reply platform: ${platform}`);
  }
}
