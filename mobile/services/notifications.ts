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

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  // Check if we already registered this token
  const cached = await SecureStore.getItemAsync(EXPO_TOKEN_KEY);
  if (cached) return cached;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? EAS_PROJECT_ID;
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;

  // Send to server
  await subscribeNotifications({ expoToken: token });
  await SecureStore.setItemAsync(EXPO_TOKEN_KEY, token);

  return token;
}

export function addNotificationResponseListener(
  handler: (response: Notifications.NotificationResponse) => void,
) {
  return Notifications.addNotificationResponseReceivedListener(handler);
}
