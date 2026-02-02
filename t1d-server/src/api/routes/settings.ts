import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../../config/database.js';
import { libreViewPoller } from '../../services/libreviewPoller.js';
import { LibreViewClient } from '../../services/libreview.js';
import type { AuthRequest, User } from '../../types/index.js';

const router = Router();

router.use(authMiddleware);

// Get user settings
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<User>(
      `SELECT id, email, libreview_email, libreview_region, diagnosis_date,
              diagnosis_type, timezone, preferences
       FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    res.json({
      settings: {
        email: user.email,
        libreview: {
          email: user.libreview_email || null,
          region: user.libreview_region || 'us',
          connected: !!user.libreview_email,
          polling: libreViewPoller.isPolling(user.id),
          lastPoll: libreViewPoller.getLastPoll(user.id),
        },
        diagnosis: {
          date: user.diagnosis_date,
          type: user.diagnosis_type,
        },
        timezone: user.timezone,
        preferences: user.preferences || {},
      },
    });
  } catch (error) {
    next(error);
  }
});

// Update general settings
const updateSettingsSchema = z.object({
  diagnosisDate: z.string().optional(),
  diagnosisType: z.string().optional(),
  timezone: z.string().optional(),
  preferences: z.record(z.any()).optional(),
});

router.patch('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const updates = updateSettingsSchema.parse(req.body);

    const setClauses: string[] = [];
    const params: any[] = [authReq.user!.id];
    let paramIndex = 2;

    if (updates.diagnosisDate !== undefined) {
      setClauses.push(`diagnosis_date = $${paramIndex}`);
      params.push(updates.diagnosisDate);
      paramIndex++;
    }

    if (updates.diagnosisType !== undefined) {
      setClauses.push(`diagnosis_type = $${paramIndex}`);
      params.push(updates.diagnosisType);
      paramIndex++;
    }

    if (updates.timezone !== undefined) {
      setClauses.push(`timezone = $${paramIndex}`);
      params.push(updates.timezone);
      paramIndex++;
    }

    if (updates.preferences !== undefined) {
      setClauses.push(`preferences = $${paramIndex}`);
      params.push(JSON.stringify(updates.preferences));
      paramIndex++;
    }

    if (setClauses.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }

    await query(
      `UPDATE users SET ${setClauses.join(', ')} WHERE id = $1`,
      params
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get LibreView connection status
router.get('/libreview', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<User>(
      `SELECT libreview_email, libreview_region
       FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    const isConnected = !!user.libreview_email;
    const lastSync = libreViewPoller.getLastPoll(authReq.user!.id);

    res.json({
      isConnected,
      email: user.libreview_email || undefined,
      lastSync,
    });
  } catch (error) {
    next(error);
  }
});

// Save LibreView credentials and start polling
const libreviewSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  region: z.enum(['us', 'eu', 'de', 'fr', 'jp', 'ap', 'au', 'ae', 'ca']).optional(),
});

router.post('/libreview', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { email, password, region = 'us' } = libreviewSchema.parse(req.body);

    // Test credentials first
    const client = new LibreViewClient(region);
    const success = await client.login({ email, password, region });

    if (!success) {
      return res.status(401).json({ error: 'Invalid LibreView credentials' });
    }

    // Encrypt password (basic encryption - in production use proper encryption)
    const encryptedPassword = await bcrypt.hash(password, 10);

    // Save to database
    await query(
      `UPDATE users
       SET libreview_email = $1,
           libreview_password_encrypted = $2,
           libreview_region = $3
       WHERE id = $4`,
      [email, encryptedPassword, region, authReq.user!.id]
    );

    // Start polling
    await libreViewPoller.startPolling(authReq.user!.id, { email, password, region });

    res.json({
      success: true,
      polling: true,
    });
  } catch (error) {
    next(error);
  }
});

// Test LibreView connection
router.get('/libreview/test', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<User>(
      `SELECT libreview_email, libreview_password_encrypted, libreview_region
       FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    if (result.rows.length === 0 || !result.rows[0].libreview_email) {
      return res.status(404).json({ error: 'LibreView credentials not configured' });
    }

    const user = result.rows[0];

    // For testing, we'll just check if polling is active
    const polling = libreViewPoller.isPolling(authReq.user!.id);
    const lastPoll = libreViewPoller.getLastPoll(authReq.user!.id);

    res.json({
      connected: polling,
      email: user.libreview_email,
      region: user.libreview_region,
      lastPoll,
    });
  } catch (error) {
    next(error);
  }
});

// Stop LibreView polling
router.delete('/libreview', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    libreViewPoller.stopPolling(authReq.user!.id);

    await query(
      `UPDATE users
       SET libreview_email = NULL,
           libreview_password_encrypted = NULL
       WHERE id = $1`,
      [authReq.user!.id]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
