/**
 * Meal Spike Detector
 *
 * Two entry points:
 *
 *   detectAndLogMealSpike(userId, timezone?)
 *     Called after every LibreView poll. Checks the last 2 hours for a new spike.
 *
 *   detectMealSpikesInRange(userId, rangeStart, rangeEnd, timezone?)
 *     Scans an arbitrary time range for ALL meal spikes. Returns detected spikes
 *     without writing anything — callers decide whether to persist them.
 *
 *   detectAndLogMealSpikesInRange(userId, rangeStart, rangeEnd, timezone?)
 *     Batch version: detects all spikes, cross-checks existing logs, inserts new
 *     ones as source='sage_detected'. Returns a summary for the Sage agent.
 *
 * Detection logic:
 *   1. Split window into oldest 60% (nadir zone) / newest 40% (peak zone)
 *   2. Nadir  = actual minimum reading in the older portion
 *   3. STABILITY CHECK: if glucose was declining faster than 0.5 mg/dL/min into
 *      the nadir (i.e. the nadir is at the bottom of a downward trend, not a
 *      stable pre-meal baseline), the spike is rejected. This filters overnight
 *      glucose declines and dawn-phenomenon false positives.
 *   4. Peak   = maximum in the newer portion
 *   5. Rise   = peak − nadir (must be ≥ 25 mg/dL)
 *   6. Rise start = first point after nadir where glucose > nadir + 5 AND the next
 *                   reading also goes up (two-point slope confirmation)
 *   7. Meal time  = rise start − 20 min (gastric emptying delay)
 *   8. NIGHTTIME GUARD: estimated meal times between midnight and 5am local time
 *      are rejected (glucose can naturally rise during these hours; people rarely
 *      eat then and the false-positive rate is high).
 *
 * Carb estimate: rise × 3g, capped at 150g.
 */

import { query } from '../config/database.js';
import { pushNotificationService } from './push-notification-service.js';

const MEAL_RISE_THRESHOLD   = 25;   // mg/dL minimum qualifying rise
const WINDOW_MINUTES        = 120;  // 2-hour detection window
const DEDUP_HOURS           = 2;    // minimum time between separate meal detections
const RISE_NOISE_MARGIN     = 5;    // mg/dL above nadir before counting as real rise
const MAX_DECLINE_PER_MIN   = 0.5;  // mg/dL/min — steeper decline → reject as baseline
const MIN_RISE_RATE_PER_MIN = 0.5;  // mg/dL/min — slower rise → gradual drift, not a meal
const NIGHTTIME_START_HOUR  = 0;    // midnight
const NIGHTTIME_END_HOUR    = 5;    // 5am — no meals detected in this local-hour range
const DEFAULT_CARB_RATIO    = 1.5;  // mg/dL per gram — fallback when no personal history
const MIN_CARB_RATIO_MEALS  = 5;    // minimum logged meals required to use personal ratio

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Returns the local hour (0-23) for a UTC Date in the given IANA timezone.
 * Falls back to UTC if the timezone is unrecognised.
 */
function localHour(utcDate: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).formatToParts(utcDate);
    const h = parts.find(p => p.type === 'hour');
    return h ? parseInt(h.value, 10) % 24 : utcDate.getUTCHours();
  } catch {
    return utcDate.getUTCHours();
  }
}

// ─── Personal carb ratio ──────────────────────────────────────────────────────

/**
 * Derives the user's personal mg/dL-per-gram ratio from their logged meal history.
 *
 * For each manually-logged meal with carbs > 0, we find the glucose nadir in the
 * 30 min around meal time and the peak in the 15–120 min after, compute
 * rise / carbs, and return the median. Falls back to DEFAULT_CARB_RATIO if there
 * are fewer than MIN_CARB_RATIO_MEALS usable data points.
 */
async function getPersonalCarbRatio(userId: string): Promise<number> {
  const result = await query<{ carbs: number; nadir: number; peak: number }>(
    `WITH meal_windows AS (
       SELECT
         m.carbs,
         (SELECT MIN(g.glucose)
            FROM glucose_readings g
           WHERE g.user_id = m.user_id
             AND g.timestamp BETWEEN m.timestamp - INTERVAL '30 minutes'
                                 AND m.timestamp + INTERVAL '30 minutes'
             AND g.glucose > 0) AS nadir,
         (SELECT MAX(g.glucose)
            FROM glucose_readings g
           WHERE g.user_id = m.user_id
             AND g.timestamp BETWEEN m.timestamp + INTERVAL '15 minutes'
                                 AND m.timestamp + INTERVAL '120 minutes'
             AND g.glucose > 0) AS peak
       FROM meals m
       WHERE m.user_id   = $1
         AND m.source   != 'sage_detected'
         AND m.carbs     > 0
         AND m.timestamp > NOW() - INTERVAL '90 days'
     )
     SELECT carbs, nadir, peak
     FROM meal_windows
     WHERE nadir IS NOT NULL AND peak IS NOT NULL AND peak > nadir`,
    [userId],
  );

  const ratios = result.rows
    .map(r => (Number(r.peak) - Number(r.nadir)) / Number(r.carbs))
    .filter(r => r > 0.1 && r < 10); // discard obvious outliers

  if (ratios.length < MIN_CARB_RATIO_MEALS) return DEFAULT_CARB_RATIO;

  ratios.sort((a, b) => a - b);
  const mid = Math.floor(ratios.length / 2);
  const median = ratios.length % 2 === 0
    ? (ratios[mid - 1] + ratios[mid]) / 2
    : ratios[mid];

  console.log(`[MealSpike] Personal carb ratio: ${median.toFixed(2)} mg/dL/g (from ${ratios.length} meals)`);
  return median;
}

// ─── Core detection logic (stateless) ─────────────────────────────────────────

/**
 * Given a sorted (oldest→newest) array of readings, finds the meal spike if any.
 * Returns null if no qualifying spike is found.
 *
 * @param timezone  IANA timezone string used for the nighttime guard.
 */
function detectSpikeInWindow(windowReadings: Reading[], timezone: string, carbRatio: number): DetectedMeal | null {
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

  // ── Stability check ────────────────────────────────────────────────────────
  // Require that glucose was NOT in a steep decline approaching the nadir.
  // If glucose fell faster than MAX_DECLINE_PER_MIN before the nadir, this is
  // likely an overnight decline, correction, or recovery — not a pre-meal baseline.
  if (nadirIdx > 0) {
    const preNadir = older.slice(0, nadirIdx);
    if (preNadir.length >= 2) {
      const firstG    = preNadir[0].glucose;
      const lastG     = preNadir[preNadir.length - 1].glucose;
      const spanMin   = (preNadir[preNadir.length - 1].ts.getTime() - preNadir[0].ts.getTime()) / 60000;
      if (spanMin > 0) {
        const slopePerMin = (lastG - firstG) / spanMin; // negative = declining
        if (slopePerMin < -MAX_DECLINE_PER_MIN) return null; // steep decline → reject
      }
    }
  }

  const peakReading = newer.reduce((max, r) => r.glucose > max.glucose ? r : max, newer[0]);
  const peak = peakReading.glucose;
  const rise = peak - nadir;

  if (rise < MEAL_RISE_THRESHOLD) return null;

  // ── Rise-start detection ──────────────────────────────────────────────────
  // First reading after nadir that is above nadir+NOISE and is followed by
  // another increase (two-point slope confirmation).
  let riseStartTs: Date | null = null;
  for (let i = nadirIdx + 1; i <= windowReadings.length - 2; i++) {
    const curr = windowReadings[i];
    const next = windowReadings[i + 1];
    if (curr.glucose >= nadir + RISE_NOISE_MARGIN && next.glucose > curr.glucose) {
      riseStartTs = curr.ts;
      break;
    }
  }

  const riseStart  = riseStartTs ?? windowReadings[nadirIdx + 1]?.ts ?? nadirReading.ts;

  // ── Rise rate check ───────────────────────────────────────────────────────
  // A real meal spike rises steeply. Gradual drifts (e.g. 30 mg/dL over 90 min)
  // are filtered by requiring the average rate from rise start to peak to be
  // at least MIN_RISE_RATE_PER_MIN mg/dL/min.
  const riseMinutes = (peakReading.ts.getTime() - riseStart.getTime()) / 60000;
  if (riseMinutes > 0 && rise / riseMinutes < MIN_RISE_RATE_PER_MIN) return null;

  const mealTime   = new Date(riseStart.getTime() - 20 * 60 * 1000);

  // ── Nighttime guard ───────────────────────────────────────────────────────
  // Reject detections where the estimated meal time falls between midnight and
  // 5am in the user's local timezone (high false-positive zone).
  const hour = localHour(mealTime, timezone);
  if (hour >= NIGHTTIME_START_HOUR && hour < NIGHTTIME_END_HOUR) return null;

  const estCarbs = Math.min(120, Math.max(5, Math.round(rise / carbRatio)));
  return { nadir, peak, rise, riseStartTs: riseStart, estimatedMealTime: mealTime, estCarbs };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Scan [rangeStart, rangeEnd] for all meal spikes.
 * Does NOT write to the database.
 */
export async function detectMealSpikesInRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  timezone = 'America/New_York',
): Promise<DetectedMeal[]> {
  const fetchEnd = new Date(rangeEnd.getTime() + 60 * 60 * 1000);

  const [readingResult, carbRatio] = await Promise.all([
    query<{ glucose: number; timestamp: string }>(
      `SELECT glucose, timestamp
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= $2
         AND timestamp <= $3
         AND glucose > 0
       ORDER BY timestamp ASC`,
      [userId, rangeStart.toISOString(), fetchEnd.toISOString()],
    ),
    getPersonalCarbRatio(userId),
  ]);

  const readings: Reading[] = readingResult.rows.map(r => ({
    glucose: Number(r.glucose),
    ts: new Date(r.timestamp),
  }));

  const detected: DetectedMeal[] = [];
  let scanIdx = 0;

  while (scanIdx < readings.length) {
    const windowStart = readings[scanIdx].ts;
    const windowEnd   = new Date(windowStart.getTime() + WINDOW_MINUTES * 60 * 1000);

    let windowEnd2 = scanIdx;
    while (windowEnd2 < readings.length && readings[windowEnd2].ts <= windowEnd) {
      windowEnd2++;
    }
    const windowReadings = readings.slice(scanIdx, windowEnd2);

    const spike = detectSpikeInWindow(windowReadings, timezone, carbRatio);

    if (spike) {
      detected.push(spike);
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

// ─── Notification helpers ──────────────────────────────────────────────────────

/**
 * Format a UTC Date as a short local time string like "7:32 AM".
 */
function formatLocalTime(utcDate: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(utcDate);
  } catch {
    return utcDate.toLocaleTimeString();
  }
}

/**
 * Send the initial meal-detection push notification.
 * Marks detection_notification_sent_at so the follow-up job can find it later.
 */
async function sendMealDetectionNotification(
  userId: string,
  mealId: string,
  spike: DetectedMeal,
): Promise<void> {
  const tzResult = await query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
  const tz = tzResult.rows[0]?.timezone || 'America/New_York';
  const timeStr = formatLocalTime(spike.estimatedMealTime, tz);

  await pushNotificationService.sendToUser(userId, {
    title: 'Looks like you just ate 🍽️',
    body: `I caught a meal around ${timeStr} — estimating ~${spike.estCarbs}g carbs. Tap to confirm or adjust.`,
    categoryIdentifier: 'MEAL_DETECTED',
    data: {
      type: 'meal_detected',
      mealId,
      estCarbs: spike.estCarbs,
      rise: Math.round(spike.rise),
      mealTime: spike.estimatedMealTime.toISOString(),
    },
  });

  await query(
    `UPDATE meals SET detection_notification_sent_at = NOW() WHERE id = $1`,
    [mealId],
  );

  console.log(`[MealSpike] Detection notification sent for meal ${mealId}`);
}

/**
 * Send insulin follow-up notifications for any sage_detected meals that:
 *   - Had a detection notification sent 25–40 min ago
 *   - Have not yet had a follow-up sent
 *   - Have not been dismissed
 *
 * Called from the LibreView poller after each successful poll.
 */
export async function checkAndSendInsulinFollowUps(userId: string): Promise<void> {
  const tzResult = await query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
  const tz = tzResult.rows[0]?.timezone || 'America/New_York';

  const due = await query<{ id: string; timestamp: string; carbs: number }>(
    `SELECT id, timestamp, carbs FROM meals
     WHERE user_id = $1
       AND source = 'sage_detected'
       AND dismissed = FALSE
       AND insulin_followup_sent_at IS NULL
       AND detection_notification_sent_at IS NOT NULL
       AND detection_notification_sent_at < NOW() - INTERVAL '25 minutes'
       AND detection_notification_sent_at > NOW() - INTERVAL '40 minutes'`,
    [userId],
  );

  for (const meal of due.rows) {
    // Skip the follow-up if insulin was already logged near this meal time
    const alreadyDosed = await query(
      `SELECT id FROM insulin_doses
       WHERE user_id = $1
         AND insulin_type IN ('bolus', 'correction')
         AND timestamp BETWEEN $2::timestamptz - INTERVAL '45 minutes'
                            AND $2::timestamptz + INTERVAL '90 minutes'
       LIMIT 1`,
      [userId, meal.timestamp],
    );

    if (alreadyDosed.rows.length > 0) {
      await query(`UPDATE meals SET insulin_followup_sent_at = NOW() WHERE id = $1`, [meal.id]);
      console.log(`[MealSpike] Insulin already logged for meal ${meal.id}, skipping follow-up`);
      continue;
    }

    const timeStr = formatLocalTime(new Date(meal.timestamp), tz);

    await pushNotificationService.sendToUser(userId, {
      title: 'Don\'t forget your insulin 💉',
      body: `Did you dose for the ~${timeStr} meal? Tap to log it quickly.`,
      categoryIdentifier: 'INSULIN_FOLLOWUP',
      data: {
        type: 'insulin_followup',
        mealId: meal.id,
        mealTime: meal.timestamp,
        estCarbs: meal.carbs,
      },
    });

    await query(`UPDATE meals SET insulin_followup_sent_at = NOW() WHERE id = $1`, [meal.id]);
    console.log(`[MealSpike] Insulin follow-up notification sent for meal ${meal.id}`);
  }
}

/**
 * Detect all meal spikes in [rangeStart, rangeEnd], cross-check existing meal
 * logs, and insert new ones as source='sage_detected'.
 */
export async function detectAndLogMealSpikesInRange(
  userId: string,
  rangeStart: Date,
  rangeEnd: Date,
  timezone = 'America/New_York',
): Promise<Array<{ mealTime: Date; estCarbs: number; rise: number; alreadyExisted: boolean }>> {
  const spikes  = await detectMealSpikesInRange(userId, rangeStart, rangeEnd, timezone);
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
    const inserted = await query<{ id: string }>(
      `INSERT INTO meals (user_id, timestamp, description, carbs, source)
       VALUES ($1, $2, $3, $4, 'sage_detected')
       RETURNING id`,
      [userId, spike.estimatedMealTime.toISOString(), description, spike.estCarbs],
    );
    const mealId = inserted.rows[0].id;

    console.log(
      `[MealSpike] Batch-logged meal for user ${userId}: ` +
      `rise=${Math.round(spike.rise)} mg/dL, carbs=${spike.estCarbs}g, time=${spike.estimatedMealTime.toISOString()}`,
    );

    // Send detection notification (best-effort — don't let a push failure block the log)
    sendMealDetectionNotification(userId, mealId, spike).catch(err =>
      console.error('[MealSpike] Failed to send detection notification:', err),
    );

    summary.push({ mealTime: spike.estimatedMealTime, estCarbs: spike.estCarbs, rise: spike.rise, alreadyExisted: false });
  }

  return summary;
}

/**
 * Real-time entry point: check the last 2 hours for a single new spike.
 * Called after every LibreView poll.
 */
export async function detectAndLogMealSpike(userId: string, timezone?: string): Promise<void> {
  try {
    // Look up user's timezone from DB if not provided
    let tz = timezone;
    if (!tz) {
      const tzResult = await query<{ timezone: string }>(`SELECT timezone FROM users WHERE id = $1`, [userId]);
      tz = tzResult.rows[0]?.timezone || 'America/New_York';
    }

    const rangeEnd   = new Date();
    const rangeStart = new Date(rangeEnd.getTime() - WINDOW_MINUTES * 60 * 1000);
    const summary    = await detectAndLogMealSpikesInRange(userId, rangeStart, rangeEnd, tz);

    for (const s of summary) {
      if (!s.alreadyExisted) {
        console.log(`[MealSpike] Auto-logged: rise=${Math.round(s.rise)} mg/dL, carbs=${s.estCarbs}g`);
      }
    }

    if (summary.length === 0) {
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
