import { db } from '@/lib/db';
import { chatConversations, chatMessages } from '@/lib/db/schema';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Conversation, ChatMessage } from '@/lib/agent/types';

export async function createConversation(
  chatId: number,
  title?: string,
): Promise<Conversation> {
  const [row] = await db
    .insert(chatConversations)
    .values({
      telegram_chat_id: chatId,
      title: title ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to create conversation');
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    title: row.title,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getActiveConversation(
  chatId: number,
): Promise<Conversation | null> {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
  const rows = await db
    .select()
    .from(chatConversations)
    .where(
      and(
        eq(chatConversations.telegram_chat_id, chatId),
        gte(chatConversations.updated_at, twoHoursAgo),
      ),
    )
    .orderBy(desc(chatConversations.updated_at))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    title: row.title,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function getConversation(
  id: string,
): Promise<Conversation | null> {
  const rows = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    title: row.title,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listConversations(
  chatId: number,
  limit = 10,
): Promise<Conversation[]> {
  const rows = await db
    .select()
    .from(chatConversations)
    .where(eq(chatConversations.telegram_chat_id, chatId))
    .orderBy(desc(chatConversations.updated_at))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    telegramChatId: row.telegram_chat_id,
    title: row.title,
    messageCount: row.message_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

export async function touchConversation(id: string): Promise<void> {
  await db
    .update(chatConversations)
    .set({
      updated_at: new Date(),
      message_count: sql`${chatConversations.message_count} + 1`,
    })
    .where(eq(chatConversations.id, id));
}

export async function setConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  await db
    .update(chatConversations)
    .set({ title })
    .where(eq(chatConversations.id, id));
}

export async function getConversationMessages(
  conversationId: string,
  limit = 20,
): Promise<ChatMessage[]> {
  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversation_id, conversationId))
    .orderBy(desc(chatMessages.created_at))
    .limit(limit);
  return rows
    .reverse()
    .map((row) => ({
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant',
      content: (row.content ?? []) as ChatMessage['content'],
      toolCalls: (row.tool_calls ?? null) as ChatMessage['toolCalls'],
      createdAt: row.created_at,
    }));
}

export async function addMessage(data: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: unknown;
  toolCalls?: unknown;
}): Promise<void> {
  await db.insert(chatMessages).values({
    conversation_id: data.conversationId,
    role: data.role,
    content: data.content as never,
    tool_calls: (data.toolCalls as never) ?? null,
  });
  await touchConversation(data.conversationId);
}

export async function deleteConversation(id: string): Promise<void> {
  await db.delete(chatConversations).where(eq(chatConversations.id, id));
}
