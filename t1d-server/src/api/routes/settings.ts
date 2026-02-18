import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../../config/database.js';
import { libreViewPoller } from '../../services/libreviewPoller.js';
import { LibreViewClient } from '../../services/libreview.js';
import { encrypt } from '../../utils/crypto.js';
import { researchMonitor } from '../../services/research-monitor.js';
import type { AuthRequest, User } from '../../types/index.js';

const router = Router();

router.use(authMiddleware);

// Get user settings
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<User>(
      `SELECT id, email, libreview_email, libreview_region, diagnosis_date,
              diagnosis_type, timezone, discord_user_id, preferences
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
        discord: {
          userId: (user as any).discord_user_id || null,
          linked: !!(user as any).discord_user_id,
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

    // Encrypt password so we can decrypt it later for polling
    const encryptedPassword = encrypt(password);

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

// Link Discord account
const discordLinkSchema = z.object({
  discordUserId: z.string().min(1),
});

router.post('/discord', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { discordUserId } = discordLinkSchema.parse(req.body);

    // Check if Discord ID is already linked to another user
    const existing = await query(
      `SELECT id FROM users WHERE discord_user_id = $1`,
      [discordUserId]
    );

    if (existing.rows.length > 0 && existing.rows[0].id !== authReq.user!.id) {
      return res.status(409).json({ error: 'This Discord account is already linked to another user' });
    }

    // Link Discord account
    await query(
      `UPDATE users SET discord_user_id = $1 WHERE id = $2`,
      [discordUserId, authReq.user!.id]
    );

    res.json({ success: true, discordUserId });
  } catch (error) {
    next(error);
  }
});

// Unlink Discord account
router.delete('/discord', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    await query(
      `UPDATE users SET discord_user_id = NULL WHERE id = $1`,
      [authReq.user!.id]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Get research preferences
router.get('/research-preferences', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query(
      `SELECT research_preferences FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const prefs = result.rows[0].research_preferences || {
      enabled: true,
      max_papers_per_week: 2
    };

    res.json(prefs);
  } catch (error) {
    next(error);
  }
});

// Update research preferences
const researchPreferencesSchema = z.object({
  enabled: z.boolean().optional(),
  max_papers_per_week: z.number().int().min(1).max(5).optional(),
});

router.put('/research-preferences', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const updates = researchPreferencesSchema.parse(req.body);

    // Get current preferences
    const result = await query(
      `SELECT research_preferences FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    const currentPrefs = result.rows[0]?.research_preferences || {
      enabled: true,
      max_papers_per_week: 2
    };

    // Merge updates with current preferences
    const newPrefs = { ...currentPrefs, ...updates };

    // Update in database
    await query(
      `UPDATE users SET research_preferences = $1 WHERE id = $2`,
      [JSON.stringify(newPrefs), authReq.user!.id]
    );

    res.json(newPrefs);
  } catch (error) {
    next(error);
  }
});

// Test endpoint: Manually trigger research monitor check
router.post('/research/trigger', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    console.log(`[Test] Manually triggering research check for user ${authReq.user!.id}`);

    // Trigger a research check (this runs in background)
    researchMonitor.runScheduledCheck().catch((err: Error) => {
      console.error('[Test] Research check failed:', err);
    });

    res.json({
      success: true,
      message: 'Research monitor check triggered. This runs in the background and may take 30-60 seconds. Check your chat for proactive messages.',
      note: 'The system will analyze your patterns and send relevant research papers if found.'
    });
  } catch (error) {
    next(error);
  }
});

// Get model configuration preferences
router.get('/models', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query(
      `SELECT preferences FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const prefs = result.rows[0].preferences || {};
    const modelConfig = prefs.modelConfig || {
      chat: {
        smallModel: process.env.HYBRID_SMALL_MODEL || 'qwen2.5:32b',
        largeModel: process.env.HYBRID_LARGE_MODEL || 'anthropic/claude-sonnet-4.5',
      },
      proactive: {
        smallModel: process.env.PROACTIVE_SMALL_MODEL || process.env.HYBRID_SMALL_MODEL || 'qwen2.5:32b',
        largeModel: process.env.PROACTIVE_LARGE_MODEL || process.env.HYBRID_LARGE_MODEL || 'anthropic/claude-sonnet-4.5',
      }
    };

    res.json(modelConfig);
  } catch (error) {
    next(error);
  }
});

// Update model configuration preferences
const modelConfigSchema = z.object({
  chat: z.object({
    smallModel: z.string().min(1),
    largeModel: z.string().min(1),
  }).optional(),
  proactive: z.object({
    smallModel: z.string().min(1),
    largeModel: z.string().min(1),
  }).optional(),
});

router.put('/models', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const updates = modelConfigSchema.parse(req.body);

    // Get current preferences
    const result = await query(
      `SELECT preferences FROM users WHERE id = $1`,
      [authReq.user!.id]
    );

    const currentPrefs = result.rows[0]?.preferences || {};
    const currentModelConfig = currentPrefs.modelConfig || {
      chat: {
        smallModel: process.env.HYBRID_SMALL_MODEL || 'qwen2.5:32b',
        largeModel: process.env.HYBRID_LARGE_MODEL || 'anthropic/claude-sonnet-4.5',
      },
      proactive: {
        smallModel: process.env.PROACTIVE_SMALL_MODEL || process.env.HYBRID_SMALL_MODEL || 'qwen2.5:32b',
        largeModel: process.env.PROACTIVE_LARGE_MODEL || process.env.HYBRID_LARGE_MODEL || 'anthropic/claude-sonnet-4.5',
      }
    };

    // Merge updates with current config
    const newModelConfig = {
      chat: updates.chat || currentModelConfig.chat,
      proactive: updates.proactive || currentModelConfig.proactive,
    };

    // Update preferences in database
    const newPrefs = {
      ...currentPrefs,
      modelConfig: newModelConfig,
    };

    await query(
      `UPDATE users SET preferences = $1 WHERE id = $2`,
      [JSON.stringify(newPrefs), authReq.user!.id]
    );

    res.json(newModelConfig);
  } catch (error) {
    next(error);
  }
});

export default router;
