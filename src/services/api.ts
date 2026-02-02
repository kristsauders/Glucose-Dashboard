import type { GlucoseReading } from '@/types/glucose';
import type { Conversation, ConversationWithMessages } from '@/types/chat';

const API_BASE_URL = 'http://localhost:3002/api';

// Auth token management
const TOKEN_KEY = 't1d_auth_token';
const USER_KEY = 't1d_user';

interface User {
  id: string;
  email: string;
  diagnosisType?: string;
  diagnosisDate?: string;
  timezone?: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

interface GlucoseResponse {
  readings: Array<{
    id: number;
    timestamp: string;
    glucose: number;
    device: string;
    trend?: number;
  }>;
  count: number;
}

interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  metadata: {
    timestamp: string;
    duration?: number;
    toolCalls?: number;
  };
  created_at: string;
}

interface ChatResponse {
  message: string;
  metadata: {
    duration: number;
    toolCalls: number;
  };
}

interface ChatHistoryResponse {
  messages: ChatMessage[];
  count: number;
}

class APIService {
  private token: string | null = null;
  private user: User | null = null;

  constructor() {
    // Load token and user from localStorage on init
    this.token = localStorage.getItem(TOKEN_KEY);
    const userJson = localStorage.getItem(USER_KEY);
    if (userJson) {
      try {
        this.user = JSON.parse(userJson);
      } catch (error) {
        console.error('Failed to parse stored user:', error);
        localStorage.removeItem(USER_KEY);
      }
    }
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth token if available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  }

  // Auth methods
  async login(email: string, password: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    this.token = response.token;
    this.user = response.user;
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));

    return response;
  }

  async signup(email: string, password: string, diagnosisType?: string, diagnosisDate?: string): Promise<AuthResponse> {
    const response = await this.request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, diagnosisType, diagnosisDate }),
    });

    this.token = response.token;
    this.user = response.user;
    localStorage.setItem(TOKEN_KEY, response.token);
    localStorage.setItem(USER_KEY, JSON.stringify(response.user));

    return response;
  }

  logout(): void {
    this.token = null;
    this.user = null;
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }

  getUser(): User | null {
    return this.user;
  }

  // Glucose data methods
  async getGlucoseReadings(limit?: number, offset?: number): Promise<GlucoseReading[]> {
    const params = new URLSearchParams();
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());

    const query = params.toString();
    const response = await this.request<GlucoseResponse>(
      `/glucose/readings${query ? `?${query}` : ''}`
    );

    // Convert API format to app format
    return response.readings.map(r => ({
      glucose: Number(r.glucose), // Convert string to number
      timestamp: new Date(r.timestamp),
      device: r.device,
      recordType: 0,
      trend: r.trend ? Number(r.trend) : r.trend,
    }));
  }

  async importCSV(file: File): Promise<{ count: number }> {
    // Read file content as text
    const csvContent = await file.text();

    const response = await this.request<{ imported: { glucose: number; meals: number; insulin: number } }>('/import/csv', {
      method: 'POST',
      body: JSON.stringify({ csvContent }),
    });

    // Return total count of imported items
    return { count: response.imported.glucose + response.imported.meals + response.imported.insulin };
  }

  // Chat methods
  async sendChatMessage(message: string): Promise<ChatResponse> {
    return this.request<ChatResponse>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  }

  async getChatHistory(limit = 50): Promise<ChatMessage[]> {
    const response = await this.request<ChatHistoryResponse>(
      `/chat/history?limit=${limit}`
    );
    return response.messages;
  }

  async clearChatHistory(): Promise<void> {
    await this.request('/chat/history', { method: 'DELETE' });
  }

  // Conversation methods
  async getConversations(): Promise<Conversation[]> {
    const response = await this.request<{ conversations: Conversation[]; count: number }>(
      '/conversations'
    );
    return response.conversations;
  }

  async createConversation(): Promise<Conversation> {
    return this.request<Conversation>('/conversations', {
      method: 'POST',
    });
  }

  async getConversation(id: string): Promise<ConversationWithMessages> {
    return this.request<ConversationWithMessages>(`/conversations/${id}`);
  }

  async updateConversation(id: string, title: string): Promise<Conversation> {
    return this.request<Conversation>(`/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title }),
    });
  }

  async deleteConversation(id: string): Promise<void> {
    await this.request(`/conversations/${id}`, {
      method: 'DELETE',
    });
  }

  // Settings methods
  async updateSettings(settings: {
    diagnosisType?: string;
    diagnosisDate?: string;
    timezone?: string;
  }): Promise<void> {
    await this.request('/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });

    // Update local user object
    if (this.user) {
      this.user = { ...this.user, ...settings };
      localStorage.setItem(USER_KEY, JSON.stringify(this.user));
    }
  }

  async getLibreViewStatus(): Promise<{
    isConnected: boolean;
    lastSync?: string;
    email?: string;
  }> {
    return this.request('/settings/libreview');
  }

  async connectLibreView(email: string, password: string): Promise<void> {
    await this.request('/settings/libreview', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async disconnectLibreView(): Promise<void> {
    await this.request('/settings/libreview', {
      method: 'DELETE',
    });
  }
}

export const apiService = new APIService();
