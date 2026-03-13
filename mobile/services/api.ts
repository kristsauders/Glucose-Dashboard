import { getToken } from './auth';
import { API_BASE_URL } from '../constants/config';
import type { GlucoseReading, GlucoseSummary } from '../types/glucose';
import type { Conversation, Message } from '../types/chat';
import type { MealLog, InsulinLog, ExerciseLog } from '../types/logs';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string>),
  };

  const res = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    const error: any = new Error(err.error || `Request failed: ${res.status}`);
    error.status = res.status;
    throw error;
  }

  return res.json();
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export function login(email: string, password: string) {
  return request<{ token: string; user: any }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function signup(email: string, password: string, diagnosisType?: string, diagnosisDate?: string) {
  return request<{ token: string; user: any }>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, diagnosisType, diagnosisDate }),
  });
}

export function getMe() {
  return request<{ user: any }>('/auth/me');
}

// ── Glucose ───────────────────────────────────────────────────────────────────

export function getReadings(limit = 288) {
  return request<{ readings: GlucoseReading[]; count: number }>(`/glucose/readings?limit=${limit}`);
}

export function getReadingsForRange(start: string, end: string) {
  const p = new URLSearchParams({ start, end, limit: '100000' });
  return request<{ readings: GlucoseReading[]; count: number }>(`/glucose/readings?${p}`);
}

export function getLatestReading() {
  return request<{ reading: GlucoseReading | null }>('/glucose/latest');
}

export function getGlucoseSummary(period: '7d' | '30d' | '90d' = '7d') {
  return request<GlucoseSummary>(`/glucose/summary?period=${period}`);
}

// ── Logs ──────────────────────────────────────────────────────────────────────

export function getMealLogs(start?: string, end?: string, limit = 50) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (start) p.set('start', start);
  if (end) p.set('end', end);
  return request<{ meals: MealLog[]; count: number; hasMore: boolean }>(`/logs/meals?${p}`);
}

export function getInsulinLogs(start?: string, end?: string, limit = 50) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (start) p.set('start', start);
  if (end) p.set('end', end);
  return request<{ doses: InsulinLog[]; count: number; hasMore: boolean }>(`/logs/insulin?${p}`);
}

export function getExerciseLogs(start?: string, end?: string, limit = 50) {
  const p = new URLSearchParams({ limit: String(limit) });
  if (start) p.set('start', start);
  if (end) p.set('end', end);
  return request<{ exercises: ExerciseLog[]; count: number; hasMore: boolean }>(`/logs/exercise?${p}`);
}

export function getMeal(id: string) {
  return request<{ meal: any }>(`/logs/meals/${id}`);
}

export function confirmMeal(id: string, updates?: { carbs?: number; description?: string; timestamp?: string }) {
  return request<{ success: boolean; meal: any }>(`/logs/meals/${id}/confirm`, {
    method: 'POST',
    body: JSON.stringify(updates ?? {}),
  });
}

export function dismissMeal(id: string) {
  return request<{ success: boolean }>(`/logs/meals/${id}/dismiss`, { method: 'POST' });
}

export function getRecentInsulinDoses() {
  return request<{ doses: number[] }>('/logs/recent-insulin-doses');
}

export function logInsulinForMeal(mealId: string, units: number) {
  return request<{ success: boolean; skipped: boolean; reason?: string }>(`/logs/meals/${mealId}/log-insulin`, {
    method: 'POST',
    body: JSON.stringify({ units }),
  });
}

export function deleteMeal(id: string) {
  return request<{ success: boolean }>(`/logs/meals/${id}`, { method: 'DELETE' });
}

export function deleteInsulin(id: string) {
  return request<{ success: boolean }>(`/logs/insulin/${id}`, { method: 'DELETE' });
}

export function deleteExercise(id: string) {
  return request<{ success: boolean }>(`/logs/exercise/${id}`, { method: 'DELETE' });
}

export function quickLog(type: 'meal' | 'insulin' | 'exercise', data: Record<string, any>, timestamp?: string) {
  return request<{ success: boolean; id: string; message: string }>('/quick-actions/log', {
    method: 'POST',
    body: JSON.stringify({ type, data, timestamp: timestamp ?? new Date().toISOString() }),
  });
}

// ── Conversations & Chat ──────────────────────────────────────────────────────

export function getConversations() {
  return request<{ conversations: Conversation[]; count: number }>('/conversations');
}

export function getConversation(id: string) {
  return request<Conversation & { messages: Message[] }>(`/conversations/${id}`);
}

export function deleteConversation(id: string) {
  return request<{ success: boolean }>(`/conversations/${id}`, { method: 'DELETE' });
}

export function renameConversation(id: string, title: string) {
  return request<Conversation>(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title }),
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export function getSettings() {
  return request<{ settings: any }>('/settings');
}

export function updateSettings(data: Record<string, any>) {
  return request<{ success: boolean }>('/settings', {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

export function connectLibreView(email: string, password: string) {
  return request<{ success: boolean }>('/settings/libreview', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export function disconnectLibreView() {
  return request<{ success: boolean }>('/settings/libreview', { method: 'DELETE' });
}

export function getModelConfig() {
  return request<any>('/settings/models');
}

export function updateModelConfig(config: any) {
  return request<any>('/settings/models', {
    method: 'PUT',
    body: JSON.stringify(config),
  });
}

// ── Notifications ─────────────────────────────────────────────────────────────

export function subscribeNotifications(payload: { expoToken?: string; subscription?: any }) {
  return request<{ success: boolean }>('/notifications/subscribe', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function getNotificationPreferences() {
  return request<{ proactive_enabled: boolean; frequency: string }>('/notifications/preferences');
}

export function updateNotificationPreferences(prefs: { proactive_enabled?: boolean; frequency?: string }) {
  return request<{ success: boolean }>('/notifications/preferences', {
    method: 'PUT',
    body: JSON.stringify(prefs),
  });
}

export function sendTestNotification() {
  return request<{ success: boolean }>('/notifications/test', { method: 'POST' });
}

// expose raw request for SSE (caller handles stream)
export { request, getToken };
