import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@/lib/db';
import { kleinanzeigenThreads, businessProfileOverrides } from '@/lib/db/schema';
import { inArray, eq } from 'drizzle-orm';
import {
  createThread,
  getThread,
  updateThread,
  upsertOverride,
  listOverrides,
  deleteOverride,
} from '@/lib/db/queries/kleinanzeigen';

const createdThreadIds: string[] = [];
const createdTopics: string[] = [];

afterAll(async () => {
  if (createdThreadIds.length > 0) {
    await db.delete(kleinanzeigenThreads).where(inArray(kleinanzeigenThreads.id, createdThreadIds));
  }
  if (createdTopics.length > 0) {
    await db.delete(businessProfileOverrides).where(inArray(businessProfileOverrides.topic, createdTopics));
  }
});

describe('kleinanzeigen queries — threads', () => {
  it('creates and fetches a thread', async () => {
    const token = `tok_${Date.now()}`;
    const t = await createThread({
      email_message_id: `<m_${Date.now()}@example>`,
      routing_token: token,
      sender_address: `${token}@mail.kleinanzeigen.de`,
      buyer_name: 'Jessy',
      listing_title: 'Logo-Vektorisierung',
      raw_body: 'Hi, kannst du mir das vektorisieren?',
      ai_analysis: null,
      telegram_chat_id: 1,
    });
    createdThreadIds.push(t.id);
    expect(t.status).toBe('new');
    const got = await getThread(t.id);
    expect(got?.routing_token).toBe(token);
  });

  it('updates thread status and draft_reply', async () => {
    const token = `tok2_${Date.now()}`;
    const t = await createThread({
      routing_token: token,
      sender_address: `${token}@mail.kleinanzeigen.de`,
      raw_body: 'msg',
      telegram_chat_id: 1,
    });
    createdThreadIds.push(t.id);
    const updated = await updateThread(t.id, { status: 'drafting', draft_reply: 'Hi Jessy …' });
    expect(updated.status).toBe('drafting');
    expect(updated.draft_reply).toBe('Hi Jessy …');
  });

  it('rejects duplicate email_message_id', async () => {
    const messageId = `<dup_${Date.now()}@example>`;
    const token = `dup_${Date.now()}`;
    const first = await createThread({
      email_message_id: messageId,
      routing_token: token,
      sender_address: `${token}@mail.kleinanzeigen.de`,
      raw_body: 'msg',
      telegram_chat_id: 1,
    });
    createdThreadIds.push(first.id);
    await expect(
      createThread({
        email_message_id: messageId,
        routing_token: 'tok_other',
        sender_address: 'tok_other@mail.kleinanzeigen.de',
        raw_body: 'msg',
        telegram_chat_id: 1,
      }),
    ).rejects.toThrow();
  });
});

describe('kleinanzeigen queries — overrides', () => {
  it('upserts and lists overrides', async () => {
    const topic = `topic_${Date.now()}`;
    createdTopics.push(topic);
    const a = await upsertOverride({ topic, kind: 'offered', content: 'Yes, ab 50€' });
    expect(a.content).toBe('Yes, ab 50€');
    const b = await upsertOverride({ topic, kind: 'offered', content: 'Yes, ab 60€' });
    expect(b.id).toBe(a.id);
    expect(b.content).toBe('Yes, ab 60€');
    const list = await listOverrides();
    const found = list.find((o) => o.topic === topic);
    expect(found?.content).toBe('Yes, ab 60€');
  });

  it('deletes overrides by id', async () => {
    const topic = `del_${Date.now()}`;
    createdTopics.push(topic);
    const o = await upsertOverride({ topic, kind: 'note', content: 'todo remove' });
    await deleteOverride(o.id);
    const remaining = await db.select().from(businessProfileOverrides).where(eq(businessProfileOverrides.id, o.id));
    expect(remaining.length).toBe(0);
  });
});
