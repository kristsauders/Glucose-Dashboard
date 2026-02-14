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

// Handle action button response from notification
const actionResponseSchema = z.object({
  messageId: z.string().uuid(),
  conversationId: z.string().uuid(),
  actionId: z.string(),
  message: z.string(),
});

router.post('/action-response', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { messageId, conversationId, actionId, message: actionMessage } = actionResponseSchema.parse(req.body);

    // 1. Verify message belongs to user
    const sageMessage = await query(
      'SELECT * FROM sage_messages WHERE id = $1 AND user_id = $2',
      [messageId, authReq.user!.id]
    );

    if (sageMessage.rows.length === 0) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // 2. Save user's response as chat message
    await query(
      `INSERT INTO chat_messages (conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, 'user', $3, $4)`,
      [
        conversationId,
        authReq.user!.id,
        actionMessage,
        JSON.stringify({ actionResponse: true, actionId, messageId })
      ]
    );

    // 3. Mark sage_message as acknowledged
    await query(
      `UPDATE sage_messages
       SET acknowledged = true, acknowledged_at = NOW()
       WHERE id = $1`,
      [messageId]
    );

    console.log(`[ActionResponse] User ${authReq.user!.id} clicked action ${actionId} on message ${messageId}`);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Test endpoint - Send a test notification
const testSchema = z.object({
  message: z.string().optional(),
  rich: z.boolean().optional().describe('Include action buttons for rich notification testing'),
});

router.post('/test', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message, rich } = testSchema.parse(req.body);
    const testMessage = message || 'This is a test notification from Sage! Everything is working correctly. 🎉';

    // Create a test conversation
    const conversationResult = await query<{ id: string }>(
      `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING id`,
      [authReq.user!.id, 'Test Notification']
    );
    const conversationId = conversationResult.rows[0].id;

    // Create a sage_message entry for action tracking (if rich notification)
    let messageId: string | undefined;
    if (rich) {
      const sageMessageResult = await query<{ id: string }>(
        `INSERT INTO sage_messages (user_id, conversation_id, type, title, content, metadata)
         VALUES ($1, $2, 'test', 'Test Rich Notification', $3, $4)
         RETURNING id`,
        [
          authReq.user!.id,
          conversationId,
          testMessage,
          JSON.stringify({ actions: [
            { id: 'test_yes', label: 'Yes, it works!', message: 'Yes, the rich notification worked perfectly!' },
            { id: 'test_no', label: 'Not quite', message: 'No, something seems off with the notification.' }
          ]})
        ]
      );
      messageId = sageMessageResult.rows[0].id;
    }

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

    // Prepare action buttons for rich notification
    const actionDefinitions = rich ? [
      {
        id: 'test_yes',
        label: 'Yes, it works!',
        message: 'Yes, the rich notification worked perfectly!',
      },
      {
        id: 'test_no',
        label: 'Not quite',
        message: 'No, something seems off with the notification.',
      }
    ] : undefined;

    // Format actions for Web Push Notifications API (action + title)
    const formattedActions = actionDefinitions?.map(a => ({
      action: a.id,
      title: a.label
    }));

    // Send push notification
    const notificationPayload: any = {
      title: rich ? 'Test Rich Notification' : 'Test Notification',
      body: testMessage.length > 100 ? testMessage.substring(0, 97) + '...' : testMessage,
      icon: '/sage-icon.png',
      badge: '/sage-badge.png',
      data: {
        conversationId,
        messageId,  // Include messageId for action tracking
        url: `/chat?conversation=${conversationId}`,
        actions: formattedActions,  // Formatted actions for service worker to display
        actionDefinitions: actionDefinitions  // Full definitions with messages for action handling
      }
    };

    await pushNotificationService.sendToUser(authReq.user!.id, notificationPayload);

    res.json({
      success: true,
      message: rich ? 'Test rich notification with action buttons sent!' : 'Test notification sent successfully',
      conversationId,
      messageId,
      notificationPayload,
      hasActions: !!actionDefinitions,
      instructions: rich ? 'Click an action button in the notification to test the full flow!' : undefined
    });
  } catch (error) {
    next(error);
  }
});

export default router;
