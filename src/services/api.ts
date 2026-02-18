import type { GlucoseReading } from '@/types/glucose';
import type { Conversation, ConversationWithMessages } from '@/types/chat';
import type { MealLog, ExerciseLog, InsulinLog } from '@/types/logs';
import type { QuickAction, QuickLogRequest, QuickLogResponse } from '@/types/quickActions';

const API_BASE_URL = `${import.meta.env.VITE_API_URL || 'http://localhost:3002'}/api`;

// Auth token management
const TOKEN_KEY = 't1d_auth_token';
const USER_KEY = 't1d_user';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000; // 1 second
const MAX_RETRY_DELAY = 10000; // 10 seconds
const REQUEST_TIMEOUT = 30000; // 30 seconds

// Helper to detect if an error is transient (should retry)
function isTransientError(error: any): boolean {
  // Network errors, timeouts, and 5xx server errors are transient
  if (error instanceof TypeError && error.message.includes('fetch')) return true;
  if (error.message?.includes('NetworkError')) return true;
  if (error.message?.includes('timeout')) return true;
  if (error.message?.includes('aborted')) return true;
  if (error.status >= 500 && error.status < 600) return true;
  if (error.status === 429) return true; // Rate limit
  return false;
}

// Helper for exponential backoff delay
function getRetryDelay(attempt: number): number {
  const delay = INITIAL_RETRY_DELAY * Math.pow(2, attempt);
  const jitter = Math.random() * 1000; // Add jitter to prevent thundering herd
  return Math.min(delay + jitter, MAX_RETRY_DELAY);
}

// Helper to create fetch with timeout
function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<Response>((_, reject) =>
      setTimeout(() => reject(new Error('Request timeout')), timeout)
    ),
  ]);
}

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

  private async request<T>(endpoint: string, options: RequestInit = {}, retries = 0): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Add auth token if available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    try {
      const response = await fetchWithTimeout(
        `${API_BASE_URL}${endpoint}`,
        {
          ...options,
          headers,
        },
        REQUEST_TIMEOUT
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Request failed' }));
        const error: any = new Error(errorData.error || errorData.message || 'Request failed');
        error.status = response.status;

        // Don't retry auth errors (401, 403) or client errors (4xx except 429)
        if (response.status === 401 || response.status === 403 ||
            (response.status >= 400 && response.status < 500 && response.status !== 429)) {
          throw error;
        }

        throw error;
      }

      return response.json();
    } catch (error: any) {
      // Retry transient errors
      if (isTransientError(error) && retries < MAX_RETRIES) {
        const delay = getRetryDelay(retries);
        console.log(`Request failed, retrying in ${delay}ms... (attempt ${retries + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.request<T>(endpoint, options, retries + 1);
      }

      // Give up after max retries or non-transient error
      throw error;
    }
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

  // Logs methods
  async getMealLogs(start?: Date, end?: Date, limit = 100): Promise<MealLog[]> {
    const params = new URLSearchParams();
    if (start) params.append('start', start.toISOString());
    if (end) params.append('end', end.toISOString());
    params.append('limit', limit.toString());

    const query = params.toString();
    const response = await this.request<{ meals: any[]; count: number }>(
      `/logs/meals${query ? `?${query}` : ''}`
    );

    return response.meals.map(m => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
  }

  async getExerciseLogs(start?: Date, end?: Date, limit = 100): Promise<ExerciseLog[]> {
    const params = new URLSearchParams();
    if (start) params.append('start', start.toISOString());
    if (end) params.append('end', end.toISOString());
    params.append('limit', limit.toString());

    const query = params.toString();
    const response = await this.request<{ exercises: any[]; count: number }>(
      `/logs/exercise${query ? `?${query}` : ''}`
    );

    return response.exercises.map(e => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));
  }

  async getInsulinLogs(start?: Date, end?: Date, limit = 100): Promise<InsulinLog[]> {
    const params = new URLSearchParams();
    if (start) params.append('start', start.toISOString());
    if (end) params.append('end', end.toISOString());
    params.append('limit', limit.toString());

    const query = params.toString();
    const response = await this.request<{ doses: any[]; count: number }>(
      `/logs/insulin${query ? `?${query}` : ''}`
    );

    return response.doses.map(d => ({
      ...d,
      timestamp: new Date(d.timestamp),
    }));
  }

  // Delete log methods
  async deleteMealLog(id: string): Promise<void> {
    await this.request(`/logs/meals/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteExerciseLog(id: string): Promise<void> {
    await this.request(`/logs/exercise/${id}`, {
      method: 'DELETE',
    });
  }

  async deleteInsulinLog(id: string): Promise<void> {
    await this.request(`/logs/insulin/${id}`, {
      method: 'DELETE',
    });
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
  async getSettings(): Promise<{
    settings: {
      email: string;
      libreview: {
        email: string | null;
        region: string;
        connected: boolean;
        polling: boolean;
        lastPoll?: string;
      };
      discord: {
        userId: string | null;
        linked: boolean;
      };
      diagnosis: {
        date?: string;
        type?: string;
      };
      timezone?: string;
      preferences: Record<string, any>;
    };
  }> {
    return this.request('/settings');
  }

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

  // Discord integration
  async linkDiscord(discordUserId: string): Promise<void> {
    await this.request('/settings/discord', {
      method: 'POST',
      body: JSON.stringify({ discordUserId }),
    });
  }

  async unlinkDiscord(): Promise<void> {
    await this.request('/settings/discord', {
      method: 'DELETE',
    });
  }

  // Report generation
  async getReports(): Promise<any[]> {
    const response = await this.request<{ success: boolean; reports: any[] }>('/reports');
    return response.reports;
  }

  async generateReport(params: {
    title: string;
    reportType: 'general' | 'comparison' | 'decision-support';
    dateRangeStart: string;
    dateRangeEnd: string;
    comparisonRangeStart?: string;
    comparisonRangeEnd?: string;
    notes?: string;
  }): Promise<any> {
    return this.request('/reports', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async downloadReport(reportId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/reports/${reportId}/download`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      throw new Error('Failed to download report');
    }
    return response.blob();
  }

  async deleteReport(reportId: string): Promise<void> {
    await this.request(`/reports/${reportId}`, {
      method: 'DELETE',
    });
  }

  // Quick actions methods
  async getQuickActions(): Promise<QuickAction[]> {
    const response = await this.request<{ suggestions: QuickAction[]; generatedAt: string }>(
      '/quick-actions/suggestions'
    );
    return response.suggestions;
  }

  async quickLog(request: QuickLogRequest): Promise<QuickLogResponse> {
    return this.request<QuickLogResponse>('/quick-actions/log', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  // Model configuration methods
  async getModelConfig(): Promise<{
    chat: {
      smallModel: string;
      largeModel: string;
    };
    proactive: {
      smallModel: string;
      largeModel: string;
    };
  }> {
    return this.request('/settings/models');
  }

  async updateModelConfig(config: {
    chat?: {
      smallModel: string;
      largeModel: string;
    };
    proactive?: {
      smallModel: string;
      largeModel: string;
    };
  }): Promise<void> {
    await this.request('/settings/models', {
      method: 'PUT',
      body: JSON.stringify(config),
    });
  }
}

export const apiService = new APIService();
