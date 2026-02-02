export interface User {
  id: string;
  email: string;
  password_hash: string;
  libreview_email?: string;
  libreview_password_encrypted?: string;
  libreview_region?: string;
  diagnosis_date?: string;
  diagnosis_type?: string;
  timezone?: string;
  preferences?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface GlucoseReading {
  id: string;
  user_id: string;
  timestamp: string;
  glucose: number;
  device?: string;
  record_type?: number;
  trend?: number;
  source?: string;
  created_at: string;
}

export interface AuthRequest extends Express.Request {
  user?: {
    id: string;
    email: string;
  };
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata?: {
    timestamp: string;
    duration?: number;
    toolCalls?: number;
  };
  created_at: string;
}

export interface ConversationWithMessages extends Conversation {
  messages: ChatMessage[];
}

export interface AgentMemory {
  id: string;
  user_id: string;
  key: string;
  value: {
    fact: string;
    category: 'habit' | 'medical' | 'timing' | 'preference' | 'other';
    confidence: number;
  };
  updated_at: string;
}
