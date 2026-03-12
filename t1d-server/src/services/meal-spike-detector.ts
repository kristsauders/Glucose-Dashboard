/**
 * Meal Spike Detector
 *
 * Two entry points:
 *
 *   detectAndLogMealSpike(userId)
 *     Called after every LibreView poll. Checks the last 2 hours for a new spike
 *     and auto-logs it if one is found and not already covered by an existing entry.
 *
 *   detectMealSpikesInRange(userId, rangeStart, rangeEnd)
 *     Scans an arbitrary time range for ALL meal spikes. Returns detected spikes
 *     without writing anything — callers decide whether to persist them.
 *
 *   detectAndLogMealSpikesInRange(userId, rangeStart, rangeEnd)
 *     Batch version: detects all spikes in a range, cross-checks against existing
 *     meal logs, and inserts any new ones with source='sage_detected'. Returns a
 *     summary for display in the Sage agent.
 *
 * Detection logic (shared):
 *   - For each 2-hour window: split oldest 60% / newest 40%
 *   - Nadir = actual minimum reading in the older portion (tracks the timestamp too)
 *   - Peak  = maximum in the newer portion
 *   - Rise  = peak − nadir (must be ≥ 25 mg/dL)
 *   - Rise start = first point after nadir where glucose > nadir + 5 AND the next
 *                  reading also goes up (two-point slope confirmation)
 *   - Meal time  = rise start − 20 min (gastric emptying delay)
 *
 * Carb estimate: rise × 3g, capped at 150g.
 */

import { query } from '../config/database.js';

const MEAL_RISE_THRESHOLD = 25;  // mg/dL
const WINDOW_MINUTES      = 120; // 2-hour detection window
const DEDUP_HOURS         = 2;   // minimum time between separate meal detections
const RISE_NOISE_MARGIN   = 5;   // mg/dL above nadir before counting as a real rise

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface DetectedMeal {
  nadir: number;
  peak: number;
  rise: number;
  riseStartTs: Date;
  estimatedMealTime: Date;
  estCarbs: number;
}

interface Reading {
  glucose: number;
  ts: Date;
}

// ─── Core detection logic (stateless) ─────────────────────────────────────────

/**
 * Given a sorted (oldest→newest) array of readings, finds the meal spike if any.
 * Returns null if no qualifying spike is found.
 */
function detectSpikeInWindow(windowReadings: Reading[]): DetectedMeal | null {
  if (windowReadings.length < 4) return null;

  const nadirBoundary = Math.max(1, Math.floor(windowReadings.length * 0.6));
  const older = windowReadings.slice(0, nadirBoundary);
  const newer = windowReadings.slice(nadirBoundary);

  const nadirIdx = older.reduce(
    (minIdx, r, i) => r.glucose < older[minIdx].glucose ? i : minIdx,
    0,
  );
  const nadirReading = older[nadirIdx];
  const nadir = nadirReading.glucose;
  const peak = Math.max(...newer.map(r => r.glucose));
  const rise = peak - nadir;

  if (rise < MEAL_RISE_THRESHOLD) return null;

  // Find the actual rise start: first reading above nadir+NOISE that is
  // followed by another increasing reading (two-point slope confirmation).
  // Scan forward from the nadir's position in the full window array.
  const nadirAbsoluteIdx = nadirIdx; // index within `older`, same as `windowReadings`
  let riseStartTs: Date | null = null;

  for (let i = nadirAbsoluteIdx + 1; i <= windowReadings.length - 2; i++) {
    const curr = windowReadings[i];
    const next = windowReadings[i + 1];
    if (curr.glucose >= nadir + RISE_NOISE_MARGIN && next.glucose > curr.glucose) {
      riseStartTs = curr.ts;
      break;
    }
  }

  const riseStart   = riseStartTs ?? windowReadings[nadirAbsoluteIdx + 1]?.ts ?? nadirReading.ts;
  const mealTime    = new Date(riseStart.getTime() - 20 * 60 * 1000);
  const estCarbs    = Math.min(150, Math.round(rise * 3));

  return { nadir, peak, rise, riseStartTs: riseStart, estimatedMealTime: mealTime, estCarbs };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan [rangeStart, rangeEnd] for all meal spikes.
 * Slides a 2-hour detection window forward; when a spike is found the cursor
 * jumps past DEDUP_HOURS to avoid re-detecting the same spike.
 * Does NOT write to the database.
 */
export async function detectMealSpikesInRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<DetectedMeal[]> {
  // Fetch +1h past rangeEnd so a spike that starts at the boundary is fully captured
  const fetchEnd = new Date(rangeEnd.getTime() + 60 * 60 * 1000);

  const result = await query<{ glucose: number; timestamp: string }>(
    `SELECT glucose, timestamp
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND timestamp <= $3
       AND glucose > 0
     ORDER BY timestamp ASC`,
    [userId, rangeStart.toISOString(), fetchEnd.toISOString()],
  );

  const readings: Reading[] = result.rows.map(r => ({
    glucose: Number(r.glucose),
    ts: new Date(r.timestamp),
  }));

  const detected: DetectedMeal[] = [];
  let scanIdx = 0;

  while (scanIdx < readings.length) {
    const windowStart = readings[scanIdx].ts;
    const windowEnd   = new Date(windowStart.getTime() + WINDOW_MINUTES * 60 * 1000);

    // Build the 2-hour window from scanIdx onward
    let windowEnd2 = scanIdx;
    while (windowEnd2 < readings.length && readings[windowEnd2].ts <= windowEnd) {
      windowEnd2++;
    }
    const windowReadings = readings.slice(scanIdx, windowEnd2);

    const spike = detectSpikeInWindow(windowReadings);

    if (spike) {
      detected.push(spike);
      // Jump the cursor past DEDUP_HOURS from spike onset to avoid re-detecting
      const skipUntil = new Date(spike.riseStartTs.getTime() + DEDUP_HOURS * 60 * 60 * 1000);
      while (scanIdx < readings.length && readings[scanIdx].ts < skipUntil) {
        scanIdx++;
      }
    } else {
      scanIdx++;
    }
  }

  return detected;
}

/**
 * Detect all meal spikes in [rangeStart, rangeEnd], cross-check against existing
 * meal logs, and insert new ones as source='sage_detected'.
 * Returns a summary array describing what was logged.
 */
export async function detectAndLogMealSpikesInRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
): Promise<Array<{ mealTime: Date; estCarbs: number; rise: number; alreadyExisted: boolean }>> {
  const spikes = await detectMealSpikesInRange(userId, rangeStart, rangeEnd);
  const summary: Array<{ mealTime: Date; estCarbs: number; rise: number; alreadyExisted: boolean }> = [];

  for (const spike of spikes) {
    const dedupFrom = new Date(spike.estimatedMealTime.getTime() - DEDUP_HOURS * 60 * 60 * 1000);
    const dedupTo   = new Date(spike.estimatedMealTime.getTime() + DEDUP_HOURS * 60 * 60 * 1000);

    const existing = await query(
      `SELECT id FROM meals WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3 LIMIT 1`,
      [userId, dedupFrom.toISOString(), dedupTo.toISOString()],
    );

    if (existing.rows.length > 0) {
      summary.push({ mealTime: spike.estimatedMealTime, estCarbs: spike.estCarbs, rise: spike.rise, alreadyExisted: true });
      continue;
    }

    const description = `Sage detected meal (~+${Math.round(spike.rise)} mg/dL rise)`;
    await query(
      `INSERT INTO meals (user_id, timestamp, description, carbs, source)
       VALUES ($1, $2, $3, $4, 'sage_detected')`,
      [userId, spike.estimatedMealTime.toISOString(), description, spike.estCarbs],
    );

    console.log(
      `[MealSpike] Batch-logged meal for user ${userId}: ` +
      `rise=${Math.round(spike.rise)} mg/dL, carbs=${spike.estCarbs}g, time=${spike.estimatedMealTime.toISOString()}`,
    );

    summary.push({ mealTime: spike.estimatedMealTime, estCarbs: spike.estCarbs, rise: spike.rise, alreadyExisted: false });
  }

  return summary;
}

/**
 * Real-time entry point: check the last 2 hours for a single new spike.
 * Called after every LibreView poll.
 */
export async function detectAndLogMealSpike(userId: string): Promise<void> {
  try {
    const rangeEnd   = new Date();
    const rangeStart = new Date(rangeEnd.getTime() - WINDOW_MINUTES * 60 * 1000);
    const summary    = await detectAndLogMealSpikesInRange(userId, rangeStart, rangeEnd);

    for (const s of summary) {
      if (!s.alreadyExisted) {
        console.log(`[MealSpike] Auto-logged: rise=${Math.round(s.rise)} mg/dL, carbs=${s.estCarbs}g`);
      }
    }

    // Emit the diagnostic line (nadir/peak) only when no spike found, to keep logs useful
    if (summary.length === 0) {
      // Re-run the window purely for the debug log (no DB write)
      const result = await query<{ glucose: number; timestamp: string }>(
        `SELECT glucose, timestamp FROM glucose_readings
         WHERE user_id = $1 AND timestamp >= $2 AND glucose > 0 ORDER BY timestamp ASC`,
        [userId, rangeStart.toISOString()],
      );
      const readings = result.rows.map(r => ({ glucose: Number(r.glucose), ts: new Date(r.timestamp) }));
      if (readings.length >= 4) {
        const splitIdx = Math.max(1, Math.floor(readings.length * 0.6));
        const nadir = Math.min(...readings.slice(0, splitIdx).map(r => r.glucose));
        const peak  = Math.max(...readings.slice(splitIdx).map(r => r.glucose));
        console.log(`[MealSpike] user=${userId}: nadir=${nadir} peak=${peak} rise=${Math.round(peak - nadir)} (threshold=${MEAL_RISE_THRESHOLD})`);
      } else {
        console.log(`[MealSpike] user=${userId}: only ${readings.length} readings in last ${WINDOW_MINUTES}min — skipping`);
      }
    }
  } catch (err) {
    console.error('[MealSpike] Error during spike detection:', err);
  }
}
