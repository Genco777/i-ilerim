import type Anthropic from '@anthropic-ai/sdk';

export type ContentBlock = Anthropic.Messages.ContentBlock;
export type MessageParam = Anthropic.Messages.MessageParam;
export type ToolUseBlock = Anthropic.Messages.ToolUseBlock;

export interface AgentTool {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolExecutionResult {
  toolUseId: string;
  content: string;
  isError: boolean;
}

export interface Conversation {
  id: string;
  telegramChatId: number;
  title: string | null;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: ContentBlock[];
  toolCalls: ToolUseBlock[] | null;
  createdAt: Date;
}

export interface AgentSession {
  conversationId: string;
  messages: MessageParam[];
  status: 'idle' | 'running';
}

export const MAX_TOOL_TURNS = 5;
export const MAX_CONTEXT_MESSAGES = 20;
export const SESSION_IDLE_HOURS = 2;
export const THROTTLE_EDIT_MS = 800;
