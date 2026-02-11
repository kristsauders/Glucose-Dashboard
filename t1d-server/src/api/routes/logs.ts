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
      queryText += ` AND timestamp <= $${paramIndex}`;
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
      SELECT id, timestamp, description, duration_minutes, activity_type, intensity, notes, source
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
      queryText += ` AND timestamp <= $${paramIndex}`;
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
      SELECT id, timestamp, insulin_type, brand_name, units, purpose, notes, source
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
      queryText += ` AND timestamp <= $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    queryText += ` ORDER BY timestamp DESC`;
    queryText += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit as string), parseInt(offset as string));

    const result = await query(queryText, params);

    res.json({
      doses: result.rows,
      count: result.rows.length,
      hasMore: result.rows.length === parseInt(limit as string),
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/logs/meals/:id - Delete a meal
router.delete('/meals/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    // Verify ownership before deleting
    const result = await query(
      'DELETE FROM meals WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found or unauthorized' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/logs/exercise/:id - Delete an exercise log
router.delete('/exercise/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    // Verify ownership before deleting
    const result = await query(
      'DELETE FROM exercise_logs WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exercise log not found or unauthorized' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/logs/insulin/:id - Delete an insulin dose
router.delete('/insulin/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    // Verify ownership before deleting
    const result = await query(
      'DELETE FROM insulin_doses WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insulin dose not found or unauthorized' });
    }

    res.json({ success: true, id: result.rows[0].id });
  } catch (error) {
    next(error);
  }
});

export default router;
