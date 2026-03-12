/**
 * Meal Spike Detector
 *
 * Called after every LibreView poll. Detects glucose spikes consistent with
 * eating and auto-logs them to the meals table with source='sage_detected'.
 *
 * Detection logic:
 *   - Look at the last 45 min of readings
 *   - Nadir  = minimum glucose in the oldest 70% of that window
 *   - Peak   = maximum glucose in the newest 30%
 *   - Rise   = peak − nadir
 *   - Meal   : rise ≥ 25 mg/dL
 *
 * Deduplication: skip if any meal (user- or sage-logged) exists within 3 hours
 * of the estimated meal start time.
 *
 * Carb estimate (rough, personalises over time as user corrects):
 *   - rise × 3g, capped at 150g
 *
 * Meal time estimate: start of the rise minus 20 min (gastric emptying delay).
 */

import { query } from '../config/database.js';

const MEAL_RISE_THRESHOLD = 25; // mg/dL
const WINDOW_MINUTES      = 45; // how far back to look
const DEDUP_HOURS         = 2;  // ignore window around an existing meal log

export async function detectAndLogMealSpike(userId: string): Promise<void> {
  try {
    // Fetch the last WINDOW_MINUTES of readings, oldest first
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
    const result = await query<{ glucose: number; timestamp: string }>(
      `SELECT glucose, timestamp
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= $2
         AND glucose > 0
       ORDER BY timestamp ASC`,
      [userId, windowStart.toISOString()],
    );

    const readings = result.rows.map(r => ({
      glucose: Number(r.glucose),
      ts: new Date(r.timestamp),
    }));

    if (readings.length < 4) {
      console.log(`[MealSpike] user=${userId}: only ${readings.length} readings in last ${WINDOW_MINUTES}min — skipping`);
      return;
    }

    // Split oldest 70% / newest 30%
    const splitIdx = Math.max(1, Math.floor(readings.length * 0.7));
    const older    = readings.slice(0, splitIdx);
    const newer    = readings.slice(splitIdx);

    const nadir = Math.min(...older.map(r => r.glucose));
    const peak  = Math.max(...newer.map(r => r.glucose));
    const rise  = peak - nadir;

    console.log(`[MealSpike] user=${userId}: nadir=${nadir} peak=${peak} rise=${Math.round(rise)} (threshold=${MEAL_RISE_THRESHOLD})`);

    if (rise < MEAL_RISE_THRESHOLD) return; // no notable spike

    // Estimate when glucose started rising: first newer reading that is
    // noticeably above nadir (≥ nadir + 8). Fall back to first newer reading.
    const riseStart = newer.find(r => r.glucose >= nadir + 8) ?? newer[0];

    // Meal actually started ~20 min before glucose began rising
    const estimatedMealTime = new Date(riseStart.ts.getTime() - 20 * 60 * 1000);

    // Deduplication: skip if any meal exists within ±DEDUP_HOURS of estimated time
    const dedupFrom = new Date(estimatedMealTime.getTime() - DEDUP_HOURS * 60 * 60 * 1000);
    const dedupTo   = new Date(estimatedMealTime.getTime() + DEDUP_HOURS * 60 * 60 * 1000);

    const existing = await query(
      `SELECT id FROM meals
       WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
       LIMIT 1`,
      [userId, dedupFrom.toISOString(), dedupTo.toISOString()],
    );

    if (existing.rows.length > 0) {
      console.log(`[MealSpike] user=${userId}: spike detected but meal already logged within ${DEDUP_HOURS}h — skipping`);
      return;
    }

    // Estimate carbs
    const estCarbs = Math.min(150, Math.round(rise * 3));

    const description = `Sage detected meal (~+${Math.round(rise)} mg/dL rise)`;

    await query(
      `INSERT INTO meals (user_id, timestamp, description, carbs, source)
       VALUES ($1, $2, $3, $4, 'sage_detected')`,
      [userId, estimatedMealTime.toISOString(), description, estCarbs],
    );

    console.log(
      `[MealSpike] Auto-logged meal for user ${userId}: ` +
      `rise=${Math.round(rise)} mg/dL, est. carbs=${estCarbs}g, time=${estimatedMealTime.toISOString()}`,
    );
  } catch (err) {
    // Non-fatal — log and continue
    console.error('[MealSpike] Error during spike detection:', err);
  }
}
