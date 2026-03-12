/**
 * Meal Spike Detector
 *
 * Called after every LibreView poll. Detects glucose spikes consistent with
 * eating and auto-logs them to the meals table with source='sage_detected'.
 *
 * Detection logic:
 *   - Look at the last 2 hours of readings (oldest first)
 *   - Nadir  = the actual minimum reading in the oldest 60% of the window
 *   - Peak   = maximum glucose in the newest 40%
 *   - Rise   = peak − nadir (must be ≥ 25 mg/dL to qualify)
 *   - Rise start = first point after the nadir where glucose is nadir+5 AND
 *                  the *next* reading also goes up (two consecutive increases —
 *                  filters noise, finds the actual slope onset)
 *   - Meal time  = rise start − 20 min (gastric emptying delay)
 *
 * Deduplication: skip if any meal (user- or sage-logged) exists within
 * ±DEDUP_HOURS of the estimated meal time.
 *
 * Carb estimate: rise × 3g, capped at 150g.
 */

import { query } from '../config/database.js';

const MEAL_RISE_THRESHOLD = 25;  // mg/dL — minimum rise to qualify
const WINDOW_MINUTES      = 120; // 2-hour window for reliable slope detection
const DEDUP_HOURS         = 2;   // suppress duplicate detections within this window
const RISE_NOISE_MARGIN   = 5;   // mg/dL above nadir before counting as a real rise

export async function detectAndLogMealSpike(userId: string): Promise<void> {
  try {
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

    // Nadir: minimum in the oldest 60% (pre-meal baseline)
    const nadirBoundary = Math.max(1, Math.floor(readings.length * 0.6));
    const olderReadings = readings.slice(0, nadirBoundary);
    const nadirIdx = olderReadings.reduce(
      (minIdx, r, i) => r.glucose < olderReadings[minIdx].glucose ? i : minIdx,
      0,
    );
    const nadirReading = olderReadings[nadirIdx];
    const nadir = nadirReading.glucose;

    // Peak: maximum in the newest 40%
    const newerReadings = readings.slice(nadirBoundary);
    const peak = Math.max(...newerReadings.map(r => r.glucose));
    const rise = peak - nadir;

    console.log(`[MealSpike] user=${userId}: nadir=${nadir} peak=${peak} rise=${Math.round(rise)} (threshold=${MEAL_RISE_THRESHOLD})`);

    if (rise < MEAL_RISE_THRESHOLD) return;

    // Find rise start: scan forward from nadir for the first reading where
    // glucose is meaningfully above nadir AND the next reading continues upward.
    // This identifies the actual slope onset rather than mid-spike or noise.
    const scanFrom = nadirIdx; // absolute index in readings[]
    let riseStartTs: Date | null = null;
    for (let i = scanFrom + 1; i <= readings.length - 2; i++) {
      const curr = readings[i];
      const next = readings[i + 1];
      if (curr.glucose >= nadir + RISE_NOISE_MARGIN && next.glucose > curr.glucose) {
        riseStartTs = curr.ts;
        break;
      }
    }

    // Fallback: use the first reading after the nadir if slope detection failed
    const riseStart = riseStartTs ?? readings[scanFrom + 1]?.ts ?? nadirReading.ts;

    // Meal started ~20 min before glucose began rising (gastric emptying delay)
    const estimatedMealTime = new Date(riseStart.getTime() - 20 * 60 * 1000);

    // Deduplication
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

    const estCarbs  = Math.min(150, Math.round(rise * 3));
    const description = `Sage detected meal (~+${Math.round(rise)} mg/dL rise)`;

    await query(
      `INSERT INTO meals (user_id, timestamp, description, carbs, source)
       VALUES ($1, $2, $3, $4, 'sage_detected')`,
      [userId, estimatedMealTime.toISOString(), description, estCarbs],
    );

    console.log(
      `[MealSpike] Auto-logged meal for user ${userId}: ` +
      `rise=${Math.round(rise)} mg/dL, est. carbs=${estCarbs}g, ` +
      `riseStart=${riseStart.toISOString()}, mealTime=${estimatedMealTime.toISOString()}`,
    );
  } catch (err) {
    console.error('[MealSpike] Error during spike detection:', err);
  }
}
