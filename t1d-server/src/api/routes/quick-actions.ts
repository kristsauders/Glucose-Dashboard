import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { quickActionsAnalyzer } from '../../services/quick-actions-analyzer.js';
import { query } from '../../config/database.js';
import type { AuthRequest } from '../../types/index.js';

const router = express.Router();

/**
 * Determine meal type based on time of day
 */
function getMealTypeFromTime(timestamp: string): string {
  const date = new Date(timestamp);
  const hour = date.getHours();

  if (hour >= 5 && hour < 11) {
    return 'breakfast';
  } else if (hour >= 11 && hour < 15) {
    return 'lunch';
  } else if (hour >= 15 && hour < 21) {
    return 'dinner';
  } else {
    return 'snack';
  }
}

/**
 * GET /api/quick-actions/suggestions
 * Get personalized quick action suggestions based on user history
 */
router.get('/suggestions', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const suggestions = await quickActionsAnalyzer.getSuggestionsForUser(userId);

    res.json({
      suggestions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting quick action suggestions:', error);
    res.status(500).json({ error: 'Failed to get suggestions' });
  }
});

/**
 * POST /api/quick-actions/log
 * Quick log an event (insulin, meal, or exercise)
 */
router.post('/log', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { type, timestamp } = req.body;
    // Accept nested { data: {...} } (web app) or flat top-level keys (iOS Shortcuts)
    const data = (req.body.data && typeof req.body.data === 'object' && Object.keys(req.body.data).length > 0)
      ? req.body.data
      : req.body;

    // Default to current time if not provided
    const logTimestamp = timestamp || new Date().toISOString();

    let result;
    let message;

    switch (type) {
      case 'insulin':
        result = await query(
          `INSERT INTO insulin_doses (user_id, insulin_type, units, purpose, timestamp)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [userId, data.insulinType, data.units, data.purpose || 'meal', logTimestamp]
        );
        message = `Logged ${data.units}u ${data.insulinType}`;
        break;

      case 'meal':
        // Determine meal type from timestamp if not provided
        const mealType = data.mealType || getMealTypeFromTime(logTimestamp);
        result = await query(
          `INSERT INTO meals (user_id, description, carbs, meal_type, timestamp)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id`,
          [
            userId,
            data.description || `${data.carbs}g carbs`,
            data.carbs,
            mealType,
            logTimestamp,
          ]
        );
        message = `Logged ${data.carbs}g carbs (${mealType})`;
        break;

      case 'exercise':
        result = await query(
          `INSERT INTO exercise_logs (user_id, activity_type, duration_minutes, intensity, description, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id`,
          [
            userId,
            data.activityType,
            data.duration,
            data.intensity || 'moderate',
            data.description || `${data.activityType} (${data.duration} min)`,
            logTimestamp,
          ]
        );
        message = `Logged ${data.activityType} for ${data.duration} minutes`;
        break;

      default:
        return res.status(400).json({ error: 'Invalid log type' });
    }

    res.json({
      success: true,
      id: result.rows[0].id,
      message,
    });
  } catch (error) {
    console.error('Error quick logging:', error);
    res.status(500).json({ error: 'Failed to log event' });
  }
});

export default router;
