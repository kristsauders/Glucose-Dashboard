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
        AND dismissed = FALSE
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
      // Add 2-minute buffer to account for clock skew - allows recently logged items to appear immediately
      queryText += ` AND timestamp <= $${paramIndex}::timestamp + INTERVAL '2 minutes'`;
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
      // Add 2-minute buffer to account for clock skew - allows recently logged items to appear immediately
      queryText += ` AND timestamp <= $${paramIndex}::timestamp + INTERVAL '2 minutes'`;
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
      // Add 2-minute buffer to account for clock skew - allows recently logged items to appear immediately
      queryText += ` AND timestamp <= $${paramIndex}::timestamp + INTERVAL '2 minutes'`;
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

// GET /api/logs/meals/:id - Fetch a single meal by ID
router.get('/meals/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const result = await query(
      `SELECT id, timestamp, description, carbs, notes, source, confirmed_at, dismissed
       FROM meals WHERE id = $1 AND user_id = $2`,
      [id, authReq.user!.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    res.json({ meal: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/logs/meals/:id/confirm - Mark a sage_detected meal as confirmed
router.post('/meals/:id/confirm', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { carbs, description, timestamp } = req.body;

    const updates: string[] = ['confirmed_at = NOW()', "source = 'sage_confirmed'"];
    const params: any[] = [];
    let paramIndex = 1;

    if (carbs !== undefined) {
      updates.push(`carbs = $${paramIndex}`);
      params.push(carbs);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (timestamp !== undefined) {
      updates.push(`timestamp = $${paramIndex}`);
      params.push(timestamp);
      paramIndex++;
    }

    const result = await query(
      `UPDATE meals SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, timestamp, description, carbs, source, confirmed_at`,
      [...params, id, authReq.user!.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }

    res.json({ success: true, meal: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/logs/meals/:id/dismiss - Mark a sage_detected meal as not a real meal
router.post('/meals/:id/dismiss', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const result = await query(
      `UPDATE meals SET dismissed = TRUE
       WHERE id = $1 AND user_id = $2 AND source IN ('sage_detected', 'sage_confirmed')
       RETURNING id`,
      [id, authReq.user!.id],
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found or not dismissible' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/logs/recent-insulin-doses - Get recent distinct bolus doses for quick-pick buttons
router.get('/recent-insulin-doses', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    // Return the 5 most common bolus units from the last 30 days
    const result = await query(
      `SELECT units, COUNT(*) as frequency
       FROM insulin_doses
       WHERE user_id = $1
         AND insulin_type IN ('bolus', 'correction')
         AND timestamp > NOW() - INTERVAL '30 days'
       GROUP BY units
       ORDER BY frequency DESC, units ASC
       LIMIT 5`,
      [authReq.user!.id],
    );

    res.json({ doses: result.rows.map(r => Number(r.units)) });
  } catch (error) {
    next(error);
  }
});

// POST /api/logs/meals/:id/log-insulin
// Logs a bolus dose for a detected meal with dedup: if a bolus/correction already
// exists within 45 min before to 90 min after the meal timestamp, it is NOT
// double-logged. Returns { success, skipped, reason? }.
router.post('/meals/:id/log-insulin', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { units } = req.body;

    if (!units || isNaN(Number(units)) || Number(units) <= 0) {
      return res.status(400).json({ error: 'Invalid units' });
    }

    // Fetch the meal to get its timestamp (and verify ownership)
    const mealResult = await query<{ timestamp: string }>(
      `SELECT timestamp FROM meals WHERE id = $1 AND user_id = $2`,
      [id, authReq.user!.id],
    );
    if (mealResult.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found' });
    }
    const mealTime = mealResult.rows[0].timestamp;

    // Dedup: any bolus/correction within the window already logged?
    const existing = await query(
      `SELECT id FROM insulin_doses
       WHERE user_id = $1
         AND insulin_type IN ('bolus', 'correction')
         AND timestamp BETWEEN $2::timestamptz - INTERVAL '45 minutes'
                            AND $2::timestamptz + INTERVAL '90 minutes'
       LIMIT 1`,
      [authReq.user!.id, mealTime],
    );

    if (existing.rows.length > 0) {
      return res.json({ success: true, skipped: true, reason: 'already_logged' });
    }

    await query(
      `INSERT INTO insulin_doses (user_id, timestamp, insulin_type, units, purpose, source)
       VALUES ($1, $2, 'bolus', $3, 'meal', 'sage_detected')`,
      [authReq.user!.id, mealTime, Number(units)],
    );

    res.json({ success: true, skipped: false });
  } catch (error) {
    next(error);
  }
});

// PUT /api/logs/meals/:id - Update a meal
router.put('/meals/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { timestamp, description, carbs, notes } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (timestamp !== undefined) {
      updates.push(`timestamp = $${paramIndex}`);
      params.push(timestamp);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (carbs !== undefined) {
      updates.push(`carbs = $${paramIndex}`);
      params.push(carbs);
      paramIndex++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Verify ownership and update
    const result = await query(
      `UPDATE meals SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, timestamp, description, carbs, notes`,
      [...params, id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Meal not found or unauthorized' });
    }

    res.json({ success: true, meal: result.rows[0] });
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

// PUT /api/logs/exercise/:id - Update an exercise log
router.put('/exercise/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { timestamp, description, duration_minutes, activity_type, intensity, notes } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (timestamp !== undefined) {
      updates.push(`timestamp = $${paramIndex}`);
      params.push(timestamp);
      paramIndex++;
    }
    if (description !== undefined) {
      updates.push(`description = $${paramIndex}`);
      params.push(description);
      paramIndex++;
    }
    if (duration_minutes !== undefined) {
      updates.push(`duration_minutes = $${paramIndex}`);
      params.push(duration_minutes);
      paramIndex++;
    }
    if (activity_type !== undefined) {
      updates.push(`activity_type = $${paramIndex}`);
      params.push(activity_type);
      paramIndex++;
    }
    if (intensity !== undefined) {
      updates.push(`intensity = $${paramIndex}`);
      params.push(intensity);
      paramIndex++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Verify ownership and update
    const result = await query(
      `UPDATE exercise_logs SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, timestamp, description, duration_minutes, activity_type, intensity, notes`,
      [...params, id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Exercise log not found or unauthorized' });
    }

    res.json({ success: true, exercise: result.rows[0] });
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

// PUT /api/logs/insulin/:id - Update an insulin dose
router.put('/insulin/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { timestamp, insulin_type, brand_name, units, purpose, notes } = req.body;

    // Build dynamic update query
    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (timestamp !== undefined) {
      updates.push(`timestamp = $${paramIndex}`);
      params.push(timestamp);
      paramIndex++;
    }
    if (insulin_type !== undefined) {
      updates.push(`insulin_type = $${paramIndex}`);
      params.push(insulin_type);
      paramIndex++;
    }
    if (brand_name !== undefined) {
      updates.push(`brand_name = $${paramIndex}`);
      params.push(brand_name);
      paramIndex++;
    }
    if (units !== undefined) {
      updates.push(`units = $${paramIndex}`);
      params.push(units);
      paramIndex++;
    }
    if (purpose !== undefined) {
      updates.push(`purpose = $${paramIndex}`);
      params.push(purpose);
      paramIndex++;
    }
    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Verify ownership and update
    const result = await query(
      `UPDATE insulin_doses SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
       RETURNING id, timestamp, insulin_type, brand_name, units, purpose, notes`,
      [...params, id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Insulin dose not found or unauthorized' });
    }

    res.json({ success: true, dose: result.rows[0] });
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
