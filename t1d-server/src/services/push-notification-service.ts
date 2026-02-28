import webpush from 'web-push';
import { Expo } from 'expo-server-sdk';
import { query } from '../config/database.js';
import { env } from '../config/env.js';

const expo = new Expo();

// Configure web-push with VAPID keys
if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_EMAIL) {
  webpush.setVapidDetails(
    env.VAPID_EMAIL,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  console.log('✓ Web Push configured with VAPID keys');
} else {
  console.warn('⚠ VAPID keys not configured. Push notifications will not work.');
}

interface PushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface ActionButton {
  id: string;
  label: string;
  message: string;
  style?: 'primary' | 'secondary' | 'success' | 'danger';
}

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  actions?: Array<{
    action: string;      // Action ID
    title: string;       // Button label (max 20 chars)
    icon?: string;       // Optional icon URL
  }>;
  data?: {
    conversationId: string;
    messageId?: string;   // For action tracking
    url: string;
    actions?: ActionButton[];  // Full action definitions for service worker
  };
}

export class PushNotificationService {
  /**
   * Send push notification to all subscribed devices for a user
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {

    try {
      // Get all active subscriptions for user (web push + expo tokens)
      const result = await query<{ endpoint: string; keys: any; expo_push_token: string | null }>(
        'SELECT endpoint, keys, expo_push_token FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        console.log(`[PushNotification] No push subscriptions found for user ${userId}`);
        return;
      }

      console.log(`[PushNotification] Sending to ${result.rows.length} device(s)...`);

      const sendPromises = result.rows.map(async (subscription) => {
        // ── Expo (native iOS/Android) ──────────────────────────────────────────
        if (subscription.expo_push_token && Expo.isExpoPushToken(subscription.expo_push_token)) {
          try {
            const messages = [{
              to: subscription.expo_push_token,
              title: payload.title,
              body: payload.body,
              data: payload.data as Record<string, unknown>,
            }];
            const chunks = expo.chunkPushNotifications(messages);
            for (const chunk of chunks) {
              await expo.sendPushNotificationsAsync(chunk);
            }
            await query(
              'UPDATE push_subscriptions SET last_used_at = NOW() WHERE expo_push_token = $1',
              [subscription.expo_push_token]
            );
            console.log(`[PushNotification] ✓ Sent via Expo to ${subscription.expo_push_token.substring(0, 30)}...`);
          } catch (error: any) {
            console.error(`[PushNotification] ✗ Expo send failed:`, error.message);
          }
          return;
        }

        // ── Web push (PWA) ─────────────────────────────────────────────────────
        if (!subscription.keys || !env.VAPID_PUBLIC_KEY) return;

        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            JSON.stringify(payload)
          );

          await query(
            'UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1',
            [subscription.endpoint]
          );

          console.log(`[PushNotification] ✓ Sent via WebPush to ${subscription.endpoint.substring(0, 50)}...`);
        } catch (error: any) {
          if (error.statusCode === 404 || error.statusCode === 410) {
            console.log(`[PushNotification] Subscription expired/invalid, removing: ${subscription.endpoint.substring(0, 50)}...`);
            await this.removeSubscription(subscription.endpoint);
          } else {
            console.error(`[PushNotification] ✗ Failed to send to ${subscription.endpoint.substring(0, 50)}:`, error.message);
          }
        }
      });

      await Promise.allSettled(sendPromises);
    } catch (error) {
      console.error('[PushNotification] Error sending push notifications:', error);
    }
  }

  /**
   * Save a new push subscription
   */
  async saveSubscription(
    userId: string,
    subscription: PushSubscription,
    userAgent?: string
  ): Promise<void> {
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (endpoint)
       DO UPDATE SET user_id = $1, keys = $3, user_agent = $4, last_used_at = NOW()`,
      [userId, subscription.endpoint, JSON.stringify(subscription.keys), userAgent]
    );

    console.log(`[PushNotification] Saved subscription for user ${userId}`);
  }

  /**
   * Save an Expo push token (native app registration)
   */
  async saveExpoToken(userId: string, expoToken: string, userAgent?: string): Promise<void> {
    // Use the token itself as the "endpoint" so the UNIQUE constraint works
    await query(
      `INSERT INTO push_subscriptions (user_id, endpoint, keys, expo_push_token, user_agent)
       VALUES ($1, $2, NULL, $2, $3)
       ON CONFLICT (endpoint)
       DO UPDATE SET user_id = $1, expo_push_token = $2, user_agent = $3, last_used_at = NOW()`,
      [userId, expoToken, userAgent]
    );
    console.log(`[PushNotification] Saved Expo token for user ${userId}`);
  }

  /**
   * Remove a push subscription
   */
  async removeSubscription(endpoint: string): Promise<void> {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
    console.log(`[PushNotification] Removed subscription: ${endpoint.substring(0, 50)}...`);
  }

  /**
   * Get notification preferences for user
   */
  async getPreferences(userId: string): Promise<{ proactive_enabled: boolean; frequency: string }> {
    const result = await query(
      'SELECT notification_preferences FROM users WHERE id = $1',
      [userId]
    );

    return result.rows[0]?.notification_preferences || { proactive_enabled: true, frequency: 'normal' };
  }

  /**
   * Update notification preferences
   */
  async updatePreferences(
    userId: string,
    preferences: { proactive_enabled?: boolean; frequency?: string }
  ): Promise<void> {
    await query(
      `UPDATE users
       SET notification_preferences = notification_preferences || $2::jsonb
       WHERE id = $1`,
      [userId, JSON.stringify(preferences)]
    );

    console.log(`[PushNotification] Updated preferences for user ${userId}:`, preferences);
  }
}

export const pushNotificationService = new PushNotificationService();
