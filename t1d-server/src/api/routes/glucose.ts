import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/database.js';
import { authMiddleware } from '../middleware/auth.js';
import type { AuthRequest, GlucoseReading } from '../../types/index.js';

const router = Router();

// All routes require authentication
router.use(authMiddleware);

// Get glucose readings
router.get('/readings', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { start, end, limit = '500000' } = req.query;

    let sql = 'SELECT * FROM glucose_readings WHERE user_id = $1';
    const params: any[] = [authReq.user!.id];
    let paramIndex = 2;

    if (start) {
      sql += ` AND timestamp >= $${paramIndex}`;
      params.push(start);
      paramIndex++;
    }

    if (end) {
      sql += ` AND timestamp <= $${paramIndex}`;
      params.push(end);
      paramIndex++;
    }

    sql += ` ORDER BY timestamp DESC LIMIT $${paramIndex}`;
    params.push(parseInt(limit as string));

    const result = await query<GlucoseReading>(sql, params);

    res.json({
      readings: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

// Get latest glucose reading
router.get('/latest', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<GlucoseReading>(
      'SELECT * FROM glucose_readings WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 1',
      [authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.json({ reading: null });
    }

    res.json({ reading: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// Get summary statistics
router.get('/summary', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { period = '7d' } = req.query;

    let daysAgo = 7;
    if (period === '30d') daysAgo = 30;
    else if (period === '90d') daysAgo = 90;

    // Exclude type-0 (LibreView one-time scan readings) — only count continuous CGM (type 1) and manual entries (record_type IS NULL)
    const result = await query(
      `SELECT
        COUNT(*) as count,
        AVG(glucose) as avg_glucose,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose,
        STDDEV(glucose) as std_dev
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${daysAgo} days'
         AND (record_type IS NULL OR record_type = 1)`,
      [authReq.user!.id]
    );

    const stats = result.rows[0];

    // Calculate additional metrics
    const timeInRangeResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) as in_range_70_180,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 140) as in_range_70_140,
        COUNT(*) FILTER (WHERE glucose < 70) as below_70,
        COUNT(*) FILTER (WHERE glucose > 180) as above_180
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${daysAgo} days'
         AND (record_type IS NULL OR record_type = 1)`,
      [authReq.user!.id]
    );

    const timeInRange = timeInRangeResult.rows[0];
    const total = parseInt(stats.count);

    res.json({
      period: `${daysAgo}d`,
      totalReadings: total,
      avgGlucose: parseFloat(stats.avg_glucose || 0).toFixed(1),
      minGlucose: parseFloat(stats.min_glucose || 0).toFixed(1),
      maxGlucose: parseFloat(stats.max_glucose || 0).toFixed(1),
      stdDev: parseFloat(stats.std_dev || 0).toFixed(1),
      cv: stats.avg_glucose ? ((stats.std_dev / stats.avg_glucose) * 100).toFixed(1) : 0,
      estimatedA1c: stats.avg_glucose ? ((parseFloat(stats.avg_glucose) + 46.7) / 28.7).toFixed(1) : 0,
      timeInRange: {
        '70-180': total > 0 ? ((parseInt(timeInRange.in_range_70_180) / total) * 100).toFixed(1) : 0,
        '70-140': total > 0 ? ((parseInt(timeInRange.in_range_70_140) / total) * 100).toFixed(1) : 0,
        below70: total > 0 ? ((parseInt(timeInRange.below_70) / total) * 100).toFixed(1) : 0,
        above180: total > 0 ? ((parseInt(timeInRange.above_180) / total) * 100).toFixed(1) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// Manual entry (single reading)
const manualReadingSchema = z.object({
  timestamp: z.string(),
  glucose: z.number().min(20).max(600),
  device: z.string().optional(),
  notes: z.string().optional(),
});

router.post('/readings', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { timestamp, glucose, device, notes } = manualReadingSchema.parse(req.body);

    const result = await query<GlucoseReading>(
      `INSERT INTO glucose_readings (user_id, timestamp, glucose, device, source)
       VALUES ($1, $2, $3, $4, 'manual')
       ON CONFLICT (user_id, timestamp, source) DO UPDATE
       SET glucose = $3, device = $4
       RETURNING *`,
      [authReq.user!.id, timestamp, glucose, device || 'Manual']
    );

    res.json({ reading: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

export default router;
