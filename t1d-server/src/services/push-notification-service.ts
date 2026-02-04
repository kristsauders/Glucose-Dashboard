import webpush from 'web-push';
import { query } from '../config/database.js';
import { env } from '../config/env.js';

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

interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  data?: {
    conversationId: string;
    url: string;
  };
}

export class PushNotificationService {
  /**
   * Send push notification to all subscribed devices for a user
   */
  async sendToUser(userId: string, payload: NotificationPayload): Promise<void> {
    // Check if VAPID keys are configured
    if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY || !env.VAPID_EMAIL) {
      console.log('[PushNotification] VAPID keys not configured, skipping push notification');
      return;
    }

    try {
      // Get all active subscriptions for user
      const result = await query<{ endpoint: string; keys: any }>(
        'SELECT endpoint, keys FROM push_subscriptions WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        console.log(`[PushNotification] No push subscriptions found for user ${userId}`);
        return;
      }

      console.log(`[PushNotification] Sending to ${result.rows.length} device(s)...`);

      // Send to all devices in parallel
      const sendPromises = result.rows.map(async (subscription) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: subscription.keys,
            },
            JSON.stringify(payload)
          );

          // Update last_used_at
          await query(
            'UPDATE push_subscriptions SET last_used_at = NOW() WHERE endpoint = $1',
            [subscription.endpoint]
          );

          console.log(`[PushNotification] ✓ Sent to ${subscription.endpoint.substring(0, 50)}...`);
        } catch (error: any) {
          // Handle subscription errors (expired, invalid, etc.)
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
