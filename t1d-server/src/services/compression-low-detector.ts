/**
 * Compression Low Detector
 *
 * Detects false hypoglycemia readings caused by physical pressure on a CGM sensor
 * (typically from sleeping on it). These create a characteristic V-shape in the
 * data: a supraphysiologically fast drop, a brief nadir below 70, then an equally
 * fast recovery — all while the surrounding context is completely normal.
 *
 * Conservative thresholds deliberately err toward NOT flagging. A real low that
 * happens to look like a V-shape is far less common than missing a compression
 * artifact, but the cost of incorrectly suppressing a real low is higher.
 */

import { query } from '../config/database.js';

// ── Detection thresholds ──────────────────────────────────────────────────────

/** Glucose must drop at least this fast (mg/dL/min) to be physiologically impossible. */
const DROP_RATE_MIN = 4.0;

/** Recovery from nadir must also be fast (confirms the V-shape). */
const RECOVERY_RATE_MIN = 3.0;

/** Readings during the event must dip below this threshold. */
const LOW_THRESHOLD = 70;

/** Pre-event context (20–60 min before) must average above this. */
const PRE_BASELINE_MIN = 75;

/** The entire episode (first low → last low) must resolve within this window. */
const MAX_EPISODE_DURATION_MIN = 40;

/**
 * How far back/forward to look for "anchor" readings (the last normal reading
 * before the drop, and the first normal reading after recovery).
 */
const ANCHOR_WINDOW_MIN = 30;

/** Max gap between consecutive low readings to still be the same episode. */
const GAP_TOLERANCE_MIN = 20;

// ── Types ─────────────────────────────────────────────────────────────────────

interface Reading {
  id: string;
  timestamp: Date;
  glucose: number;
}

// ── Core detection (pure, testable) ──────────────────────────────────────────

/**
 * Given a chronologically sorted array of readings, return the IDs of readings
 * that are very likely compression artifacts.
 */
export function findCompressionSuspects(readings: Reading[]): Set<string> {
  const suspects = new Set<string>();
  const n = readings.length;
  if (n < 4) return suspects;

  // ── Step 1: group consecutive low readings into episodes ──────────────────
  const episodes: Reading[][] = [];
  let i = 0;

  while (i < n) {
    if (readings[i].glucose < LOW_THRESHOLD) {
      const episode: Reading[] = [readings[i]];
      let j = i + 1;

      while (j < n) {
        const gapMin =
          (readings[j].timestamp.getTime() - readings[j - 1].timestamp.getTime()) / 60_000;
        if (gapMin <= GAP_TOLERANCE_MIN && readings[j].glucose < LOW_THRESHOLD) {
          episode.push(readings[j]);
          j++;
        } else {
          break;
        }
      }

      episodes.push(episode);
      i = j;
    } else {
      i++;
    }
  }

  // ── Step 2: evaluate each episode ────────────────────────────────────────
  for (const episode of episodes) {
    const firstLow = episode[0];
    const lastLow = episode[episode.length - 1];

    // Must resolve quickly
    const durationMin =
      (lastLow.timestamp.getTime() - firstLow.timestamp.getTime()) / 60_000;
    if (durationMin > MAX_EPISODE_DURATION_MIN) continue;

    // Find nadir
    const nadir = episode.reduce((min, r) => (r.glucose < min.glucose ? r : min), episode[0]);

    // Pre-anchor: last reading >= LOW_THRESHOLD just before the episode
    const preAnchor = readings
      .filter(
        r =>
          r.timestamp < firstLow.timestamp &&
          r.glucose >= LOW_THRESHOLD,
      )
      .at(-1); // last element (closest to episode start)

    if (!preAnchor) continue;

    const preGapMin =
      (firstLow.timestamp.getTime() - preAnchor.timestamp.getTime()) / 60_000;
    if (preGapMin > ANCHOR_WINDOW_MIN) continue;

    // Post-anchor: first reading >= LOW_THRESHOLD after the episode ends
    const postAnchor = readings.find(
      r => r.timestamp > lastLow.timestamp && r.glucose >= LOW_THRESHOLD,
    );

    if (!postAnchor) continue;

    const postGapMin =
      (postAnchor.timestamp.getTime() - lastLow.timestamp.getTime()) / 60_000;
    if (postGapMin > ANCHOR_WINDOW_MIN) continue;

    // Drop rate: pre-anchor → nadir
    const dropTimeMin =
      (nadir.timestamp.getTime() - preAnchor.timestamp.getTime()) / 60_000;
    if (dropTimeMin <= 0) continue;
    const dropRate = (preAnchor.glucose - nadir.glucose) / dropTimeMin;

    // Recovery rate: nadir → post-anchor
    const recoveryTimeMin =
      (postAnchor.timestamp.getTime() - nadir.timestamp.getTime()) / 60_000;
    if (recoveryTimeMin <= 0) continue;
    const recoveryRate = (postAnchor.glucose - nadir.glucose) / recoveryTimeMin;

    // Pre-event baseline: readings 5–60 min before episode must be normal
    const baselineReadings = readings.filter(r => {
      const minBefore =
        (firstLow.timestamp.getTime() - r.timestamp.getTime()) / 60_000;
      return minBefore >= 5 && minBefore <= 60;
    });

    if (baselineReadings.length === 0) continue;

    const baselineAvg =
      baselineReadings.reduce((s, r) => s + r.glucose, 0) / baselineReadings.length;

    // All criteria must pass
    if (
      dropRate >= DROP_RATE_MIN &&
      recoveryRate >= RECOVERY_RATE_MIN &&
      baselineAvg >= PRE_BASELINE_MIN
    ) {
      for (const r of episode) suspects.add(r.id);
    }
  }

  return suspects;
}

/**
 * Apply linear interpolation to compression-suspect readings.
 * Input readings must be in chronological order with `is_compression_suspect` set.
 * Returns a new array where suspect readings have a `smoothed_glucose` field
 * interpolated between the nearest non-suspect anchors.
 */
export function smoothCompressionLows<T extends { timestamp: Date; glucose: number; is_compression_suspect: boolean }>(
  readings: T[],
): (T & { smoothed_glucose: number })[] {
  const result: (T & { smoothed_glucose: number })[] = readings.map(r => ({
    ...r,
    smoothed_glucose: r.glucose,
  }));

  const n = result.length;

  for (let i = 0; i < n; i++) {
    if (!result[i].is_compression_suspect) continue;

    // Find nearest non-suspect readings before and after
    let preIdx = i - 1;
    while (preIdx >= 0 && result[preIdx].is_compression_suspect) preIdx--;

    let postIdx = i + 1;
    while (postIdx < n && result[postIdx].is_compression_suspect) postIdx++;

    if (preIdx < 0 && postIdx >= n) continue; // entire dataset is suspect — skip

    if (preIdx < 0) {
      result[i].smoothed_glucose = result[postIdx].glucose;
      continue;
    }
    if (postIdx >= n) {
      result[i].smoothed_glucose = result[preIdx].glucose;
      continue;
    }

    // Linear interpolation between anchors
    const preTime = result[preIdx].timestamp.getTime();
    const postTime = result[postIdx].timestamp.getTime();
    const currTime = result[i].timestamp.getTime();
    const t = (currTime - preTime) / (postTime - preTime);
    result[i].smoothed_glucose = Math.round(
      result[preIdx].glucose + t * (result[postIdx].glucose - result[preIdx].glucose),
    );
  }

  return result;
}

// ── DB operations ─────────────────────────────────────────────────────────────

/**
 * Scan glucose readings for a user, flag compression suspects in the DB, and
 * return the count of newly-flagged readings.
 *
 * Pass `since` to only scan a recent window (for post-import incremental runs).
 * Omit `since` to scan the full history (for the retroactive migration script).
 */
export async function detectAndFlagCompressionLows(
  userId: string,
  since?: Date,
): Promise<number> {
  // Load slightly more context than the window so episode boundaries are correct
  const contextBuffer = since
    ? new Date(since.getTime() - 2 * 60 * 60_000) // 2h before `since`
    : undefined;

  const sinceClause = contextBuffer ? `AND timestamp >= $2` : '';
  const params: any[] = contextBuffer ? [userId, contextBuffer.toISOString()] : [userId];

  const result = await query(
    `SELECT id, timestamp, glucose
     FROM glucose_readings
     WHERE user_id = $1
       ${sinceClause}
       AND record_type IS DISTINCT FROM 0
     ORDER BY timestamp ASC`,
    params,
  );

  const readings: Reading[] = result.rows.map(r => ({
    id: r.id,
    timestamp: new Date(r.timestamp),
    glucose: Number(r.glucose),
  }));

  const suspectIds = findCompressionSuspects(readings);

  if (since) {
    // Reset flags in the scanned window so re-runs are idempotent
    await query(
      `UPDATE glucose_readings
       SET is_compression_suspect = FALSE
       WHERE user_id = $1
         AND timestamp >= $2
         AND is_compression_suspect = TRUE`,
      [userId, contextBuffer!.toISOString()],
    );
  }

  if (suspectIds.size > 0) {
    await query(
      `UPDATE glucose_readings
       SET is_compression_suspect = TRUE
       WHERE id = ANY($1)`,
      [[...suspectIds]],
    );
  }

  return suspectIds.size;
}
