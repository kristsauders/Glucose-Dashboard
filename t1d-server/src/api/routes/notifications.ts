import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { pushNotificationService } from '../../services/push-notification-service.js';
import { env } from '../../config/env.js';
import type { AuthRequest } from '../../types/index.js';

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

export default router;
