import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../../config/database.js';
import type { AuthRequest } from '../../types/index.js';

const router = Router();

router.use(authMiddleware);

// GET /api/logs/meals - Get meal logs with date filtering
router.get('/meals', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { start, end, limit = '100', offset = '0' } = req.query;

    let queryText = `
      SELECT id, timestamp, description, carbs, notes, source
      FROM meals
      WHERE user_id = $1
    `;
    const params: any[] = [authReq.user!.id];
    let paramIndex = 2;

    // Add date range filtering if provided
    if (start) {
      queryText += ` AND timestamp >= $${paramIndex}`;
      params.push(start);
      paramIndex++;
    }

    if (end) {
      queryText += ` AND timestamp < $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    queryText += ` ORDER BY timestamp DESC`;
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(queryText, params);

    res.json({
      meals: result.rows,
      count: result.rows.length,
      hasMore: result.rows.length === parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/logs/exercise - Get exercise logs with date filtering
router.get('/exercise', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { start, end, limit = '100', offset = '0' } = req.query;

    let queryText = `
      SELECT id, timestamp, description, duration_minutes, type as activity_type, intensity, notes, source
      FROM exercise_logs
      WHERE user_id = $1
    `;
    const params: any[] = [authReq.user!.id];
    let paramIndex = 2;

    // Add date range filtering if provided
    if (start) {
      queryText += ` AND timestamp >= $${paramIndex}`;
      params.push(start);
      paramIndex++;
    }

    if (end) {
      queryText += ` AND timestamp < $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    queryText += ` ORDER BY timestamp DESC`;
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(queryText, params);

    res.json({
      exercises: result.rows,
      count: result.rows.length,
      hasMore: result.rows.length === parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/logs/insulin - Get insulin dose logs with date filtering
router.get('/insulin', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { start, end, limit = '100', offset = '0' } = req.query;

    let queryText = `
      SELECT id, timestamp, type as insulin_type, insulin_type as brand_name, units, notes, source
      FROM insulin_doses
      WHERE user_id = $1
    `;
    const params: any[] = [authReq.user!.id];
    let paramIndex = 2;

    // Add date range filtering if provided
    if (start) {
      queryText += ` AND timestamp >= $${paramIndex}`;
      params.push(start);
      paramIndex++;
    }

    if (end) {
      queryText += ` AND timestamp < $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    queryText += ` ORDER BY timestamp DESC`;
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(queryText, params);

    // Map the 'type' field to 'purpose' for frontend compatibility
    const doses = result.rows.map(row => ({
      ...row,
      purpose: row.insulin_type || 'basal', // Map type to purpose
    }));

    res.json({
      doses,
      count: doses.length,
      hasMore: doses.length === parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
