import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { subscribeNotifications } from './api';
import { EAS_PROJECT_ID } from '../constants/config';

const EXPO_TOKEN_KEY = 'expo_push_token';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  console.log('[Notifications] Permission status:', existingStatus);

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
    console.log('[Notifications] Requested permission, result:', status);
  }

  if (finalStatus !== 'granted') {
    console.warn('[Notifications] Permission not granted, skipping registration');
    return null;
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? EAS_PROJECT_ID;
  console.log('[Notifications] Getting push token for projectId:', projectId);

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;
  console.log('[Notifications] Got push token:', token.slice(0, 40) + '...');

  const cached = await SecureStore.getItemAsync(EXPO_TOKEN_KEY);
  if (cached === token) {
    // Token unchanged — still re-register with server to handle reinstalls/server resets
    console.log('[Notifications] Token unchanged, re-confirming with server');
  }

  // Always send to server (upsert — safe to call on every launch)
  await subscribeNotifications({ expoToken: token });
  await SecureStore.setItemAsync(EXPO_TOKEN_KEY, token);
  console.log('[Notifications] Token registered with server successfully');

  return token;
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
