export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    timestamp?: string;
    duration?: number;
    toolCalls?: number;
    toolNames?: string[];
    thinkingMessage?: string;
    charts?: string[];
  };
  created_at: string;
}

export type SSEEvent =
  | { type: 'status'; content: string }
  | { type: 'thinking'; content: string }
  | { type: 'content'; content: string }
  | { type: 'chart'; data: string }
  | { type: 'done'; metadata: { duration: number; toolCalls: number; toolNames: string[]; conversationId: string } }
  | { type: 'error'; content: string };
