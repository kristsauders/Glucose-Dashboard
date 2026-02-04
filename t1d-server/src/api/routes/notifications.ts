import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pushNotificationService } from '../../services/push-notification-service.js';
import { env } from '../../config/env.js';
import type { AuthRequest } from '../../types/index.js';
import { query } from '../../config/database.js';

const router = Router();

router.use(authMiddleware);

// Get VAPID public key (needed for frontend subscription)
router.get('/vapid-public-key', (req, res) => {
  if (!env.VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications not configured' });
  }

  res.json({ publicKey: env.VAPID_PUBLIC_KEY });
});

// Subscribe to push notifications
const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }),
});

router.post('/subscribe', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { subscription } = subscribeSchema.parse(req.body);

    await pushNotificationService.saveSubscription(
      authReq.user!.id,
      subscription,
      req.headers['user-agent']
    );

    res.json({ success: true, message: 'Subscription saved successfully' });
  } catch (error) {
    next(error);
  }
});

// Unsubscribe from push notifications
const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

router.post('/unsubscribe', async (req, res, next) => {
  try {
    const { endpoint } = unsubscribeSchema.parse(req.body);
    await pushNotificationService.removeSubscription(endpoint);
    res.json({ success: true, message: 'Subscription removed successfully' });
  } catch (error) {
    next(error);
  }
});

// Get notification preferences
router.get('/preferences', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const preferences = await pushNotificationService.getPreferences(authReq.user!.id);
    res.json(preferences);
  } catch (error) {
    next(error);
  }
});

// Update notification preferences
const preferencesSchema = z.object({
  proactive_enabled: z.boolean().optional(),
  frequency: z.enum(['low', 'normal', 'high']).optional(),
});

router.put('/preferences', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const preferences = preferencesSchema.parse(req.body);

    await pushNotificationService.updatePreferences(authReq.user!.id, preferences);
    res.json({ success: true, message: 'Preferences updated successfully' });
  } catch (error) {
    next(error);
  }
});

// Test endpoint - Send a test notification
const testSchema = z.object({
  message: z.string().optional(),
});

router.post('/test', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message } = testSchema.parse(req.body);
    const testMessage = message || 'This is a test notification from Sage! Everything is working correctly. 🎉';

    // Create a test conversation
    const conversationResult = await query<{ id: string }>(
      `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
      [authReq.user!.id, 'Test Notification']
    );
    const conversationId = conversationResult.rows[0].id;

    // Save test message to chat_messages
    await query(
      `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [
        authReq.user!.id,
        conversationId,
        testMessage,
        JSON.stringify({ type: 'test', timestamp: new Date().toISOString() })
      ]
    );

    // Check if notifications are enabled
    const preferences = await pushNotificationService.getPreferences(authReq.user!.id);

    if (!preferences.proactive_enabled) {
      return res.json({
        success: false,
        message: 'Notifications are disabled in your preferences',
        conversationId
      });
    }

    // Send push notification
    const notificationPayload = {
      title: 'Sage',
      body: testMessage.length > 100 ? testMessage.substring(0, 97) + '...' : testMessage,
      icon: '/sage-icon.png',
      badge: '/sage-badge.png',
      data: {
        conversationId,
        url: `/chat?conversation=${conversationId}`
      }
    };

    await pushNotificationService.sendToUser(authReq.user!.id, notificationPayload);

    res.json({
      success: true,
      message: 'Test notification sent successfully',
      conversationId,
      notificationPayload
    });
  } catch (error) {
    next(error);
  }
});

export default router;
