/**
 * POST /api/healthkit/sync
 *
 * Accepts batches of glucose readings and workouts exported from Apple HealthKit
 * by the mobile app. Handles all deduplication server-side so the mobile client
 * can safely re-send overlapping windows without creating duplicates.
 *
 * Glucose dedup strategy:
 *   1. Same-source: UNIQUE(user_id, timestamp, source='healthkit') — DB constraint.
 *   2. Cross-source: skip any reading that has an existing glucose_reading for
 *      this user within ±2 minutes (prevents Libre-app-to-HealthKit duplicates).
 *
 * Workout dedup strategy:
 *   1. Primary: healthkit_uuid UNIQUE partial index — perfect dedup by HealthKit UUID.
 *   2. Fallback: find any exercise_log within ±15 minutes with duration within ±10 min.
 *      - Manual entry found → delete it and insert the HealthKit record (richer data).
 *      - HealthKit entry found → skip (already have a good copy).
 */

import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../../config/database.js';
import type { AuthRequest } from '../../types/index.js';

const router = Router();
router.use(authMiddleware);

// ── Types ─────────────────────────────────────────────────────────────────────

interface HKGlucoseReading {
  timestamp: string;   // ISO UTC
  glucose: number;     // mg/dL — client MUST convert before sending
  sourceName?: string; // e.g. "LibreLink", "Health"
}

interface HKWorkout {
  healthkitUUID: string;
  timestamp: string;      // ISO — workout start
  endTimestamp: string;   // ISO — workout end
  durationMinutes: number;
  activityType: string;   // Sage activity type (already mapped client-side)
  activityName: string;   // raw HealthKit name for description
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
}

// ── POST /api/healthkit/sync ──────────────────────────────────────────────────

router.post('/sync', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    const {
      glucose = [],
      workouts = [],
    }: { glucose: HKGlucoseReading[]; workouts: HKWorkout[] } = req.body;

    const [glucoseResult, workoutResult] = await Promise.all([
      syncGlucose(userId, glucose),
      syncWorkouts(userId, workouts),
    ]);

    res.json({
      glucose: glucoseResult,
      workouts: workoutResult,
    });
  } catch (err) {
    next(err);
  }
});

// ── Glucose sync ──────────────────────────────────────────────────────────────

async function syncGlucose(userId: string, readings: HKGlucoseReading[]) {
  if (readings.length === 0) return { inserted: 0, skipped: 0 };

  // Validate: must be finite positive numbers in a plausible BG range (20–600 mg/dL).
  // This catches accidental mmol/L values (which would be 2–33) — we reject the whole
  // batch if any value is suspiciously low (< 18) or impossibly high (> 700).
  const invalid = readings.find(r => !Number.isFinite(r.glucose) || r.glucose < 18 || r.glucose > 700);
  if (invalid) {
    throw Object.assign(
      new Error(`Invalid glucose value ${invalid.glucose} — readings must be in mg/dL (range 18–700)`),
      { status: 400 },
    );
  }

  let inserted = 0;
  let skipped = 0;

  for (const r of readings) {
    // Cross-source time-proximity dedup: skip if ANY reading exists within ±2 min.
    const nearby = await query(
      `SELECT 1 FROM glucose_readings
       WHERE user_id = $1
         AND timestamp BETWEEN $2::timestamptz - INTERVAL '2 minutes'
                            AND $2::timestamptz + INTERVAL '2 minutes'
       LIMIT 1`,
      [userId, r.timestamp],
    );

    if (nearby.rows.length > 0) {
      skipped++;
      continue;
    }

    const result = await query(
      `INSERT INTO glucose_readings
         (user_id, timestamp, glucose, device, record_type, source)
       VALUES ($1, $2, $3, $4, 1, 'healthkit')
       ON CONFLICT (user_id, timestamp, source) DO NOTHING
       RETURNING id`,
      [userId, r.timestamp, r.glucose, r.sourceName ?? 'Apple Health'],
    );

    if (result.rows.length > 0) inserted++;
    else skipped++;
  }

  return { inserted, skipped };
}

// ── Workout sync ──────────────────────────────────────────────────────────────

async function syncWorkouts(userId: string, workouts: HKWorkout[]) {
  if (workouts.length === 0) return { inserted: 0, skipped: 0 };

  let inserted = 0;
  let skipped = 0;

  for (const w of workouts) {
    // Primary dedup: healthkit_uuid
    const existing = await query(
      `SELECT 1 FROM exercise_logs
       WHERE user_id = $1 AND healthkit_uuid = $2
       LIMIT 1`,
      [userId, w.healthkitUUID],
    );

    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }

    // Secondary dedup: any workout within ±15 minutes with similar duration (±10 min).
    // Activity type is intentionally ignored — manual entries and HealthKit often
    // use different labels for the same session (e.g. "gym" vs "Traditional Strength").
    // If the nearby match is a manual entry, replace it with the HealthKit record
    // (which carries more data: HR, calories, UUID). If it's already from HealthKit,
    // just skip.
    const nearbyExercise = await query(
      `SELECT id, source FROM exercise_logs
       WHERE user_id = $1
         AND timestamp BETWEEN $2::timestamptz - INTERVAL '15 minutes'
                            AND $2::timestamptz + INTERVAL '15 minutes'
         AND ABS(duration_minutes - $3) <= 10
       LIMIT 1`,
      [userId, w.timestamp, w.durationMinutes],
    );

    if (nearbyExercise.rows.length > 0) {
      const nearby = nearbyExercise.rows[0];
      if (nearby.source !== 'healthkit') {
        // Delete the manual entry so we can insert the richer HealthKit record below.
        await query(`DELETE FROM exercise_logs WHERE id = $1`, [nearby.id]);
      } else {
        skipped++;
        continue;
      }
    }

    // Derive intensity from heart rate if available.
    const intensity = heartRateToIntensity(w.avgHeartRate);

    const description = w.activityName !== w.activityType
      ? w.activityName
      : null;

    await query(
      `INSERT INTO exercise_logs
         (user_id, timestamp, duration_minutes, activity_type, intensity,
          calories, avg_heart_rate, max_heart_rate, description, source, healthkit_uuid)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'healthkit', $10)`,
      [
        userId,
        w.timestamp,
        w.durationMinutes,
        w.activityType,
        intensity,
        w.calories ?? null,
        w.avgHeartRate ?? null,
        w.maxHeartRate ?? null,
        description,
        w.healthkitUUID,
      ],
    );

    inserted++;
  }

  return { inserted, skipped };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function heartRateToIntensity(avgHR?: number): string {
  if (!avgHR) return 'moderate';
  if (avgHR >= 150) return 'high';
  if (avgHR >= 115) return 'moderate';
  return 'low';
}

export default router;
