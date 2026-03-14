import * as SecureStore from 'expo-secure-store';
import { NativeModules, Platform } from 'react-native';
import { API_BASE_URL } from '../constants/config';

const TOKEN_KEY = 't1d_auth_token';
const USER_KEY = 't1d_user';

export interface StoredUser {
  id: string;
  email: string;
  diagnosisDate?: string;
  diagnosisType?: string;
  timezone?: string;
}

export async function saveToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  // Mirror to shared app group so the widget extension and AppIntents can
  // make authenticated API calls without accessing the main app's Keychain.
  if (Platform.OS === 'ios') {
    NativeModules.GlucoseWidgetsModule?.setAuthToken?.(token, API_BASE_URL);
  }
}

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function saveUser(user: StoredUser): Promise<void> {
  await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
}

export async function getUser(): Promise<StoredUser | null> {
  const json = await SecureStore.getItemAsync(USER_KEY);
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function clearAuth(): Promise<void> {
  await SecureStore.deleteItemAsync(TOKEN_KEY);
  await SecureStore.deleteItemAsync(USER_KEY);
  if (Platform.OS === 'ios') {
    NativeModules.GlucoseWidgetsModule?.setAuthToken?.('', '');
  }
}
