export interface Conversation {
  id: string;
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
  metadata: {
    timestamp: string;
    duration?: number;
    toolCalls?: number;
  };
  created_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: Message[];
}
