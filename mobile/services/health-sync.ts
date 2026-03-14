/**
 * health-sync.ts
 *
 * Orchestrates Apple HealthKit → Sage server sync.
 *
 * Responsibilities:
 *  - Track last-sync timestamps (persisted in SecureStore) so each run only
 *    imports data newer than the previous successful sync.
 *  - Read blood glucose and workouts from HealthKit.
 *  - POST to /api/healthkit/sync; the server handles all deduplication.
 *  - Rate-limit: don't re-sync if the last sync was < SYNC_INTERVAL_MS ago.
 *
 * Safety guarantees:
 *  - Glucose is always requested in mgPerdL (explicit unit in useHealthKit).
 *  - Server rejects batches containing values outside 18–700 mg/dL, which
 *    catches accidental mmol/L values before they reach the DB.
 *  - Cross-source dedup on the server prevents importing LibreView readings
 *    that were written to HealthKit by the LibreLink app.
 *
 * Lookback behaviour:
 *  - Background sync (force=false): uses stored last-sync timestamp so only
 *    new data is fetched.
 *  - Pull-to-refresh (force=true): always uses the full initial lookback
 *    window (30d glucose / 90d workouts). Safe because the server deduplicates;
 *    ensures backfilled HealthKit data (e.g. LibreLink writing historical
 *    readings) is never missed due to a stale timestamp.
 *  - Timestamps are only advanced when data was actually received, so a
 *    zero-result sync never locks out future syncs.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { syncHealthKit } from './api';
import type { HKGlucoseReading, HKWorkoutReading } from '../hooks/useHealthKit';

const GLUCOSE_LAST_SYNC_KEY = 'hk_glucose_last_sync';
const WORKOUT_LAST_SYNC_KEY = 'hk_workout_last_sync';

// Minimum interval between background syncs (15 minutes).
const SYNC_INTERVAL_MS = 15 * 60 * 1000;

// How far back to look on first-ever sync or force refresh.
const GLUCOSE_INITIAL_LOOKBACK_DAYS = 30;
const WORKOUT_INITIAL_LOOKBACK_DAYS = 90;

async function getLastSync(key: string): Promise<Date> {
  try {
    const stored = await SecureStore.getItemAsync(key);
    if (stored) return new Date(stored);
  } catch { /* ignore */ }
  return new Date(0); // epoch = never synced
}

async function setLastSync(key: string, date: Date): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, date.toISOString());
  } catch { /* ignore */ }
}

// Single in-memory flag to prevent concurrent syncs from multiple useEffect
// triggers (e.g. if auth state flickers). One sync at a time.
let syncInProgress = false;

export interface HealthSyncResult {
  glucoseInserted: number;
  workoutsInserted: number;
  skipped?: boolean;  // true if rate-limited
}

/**
 * Run a full HealthKit → Sage sync.
 *
 * @param hk - the HealthKit hook instance (from useHealthKit())
 * @param force - bypass rate-limit and use full lookback window (pull-to-refresh)
 */
export async function runHealthKitSync(
  hk: { readBloodGlucose: (since: Date) => Promise<HKGlucoseReading[]>; readWorkouts: (since: Date) => Promise<HKWorkoutReading[]> },
  force = false,
): Promise<HealthSyncResult> {
  if (Platform.OS !== 'ios') return { glucoseInserted: 0, workoutsInserted: 0 };
  if (syncInProgress) return { glucoseInserted: 0, workoutsInserted: 0, skipped: true };

  // Rate-limit: check if either sync is due.
  const [glucoseLastSync, workoutLastSync] = await Promise.all([
    getLastSync(GLUCOSE_LAST_SYNC_KEY),
    getLastSync(WORKOUT_LAST_SYNC_KEY),
  ]);

  const now = Date.now();
  const glucoseDue = force || (now - glucoseLastSync.getTime()) >= SYNC_INTERVAL_MS;
  const workoutDue = force || (now - workoutLastSync.getTime()) >= SYNC_INTERVAL_MS;

  if (!glucoseDue && !workoutDue) {
    return { glucoseInserted: 0, workoutsInserted: 0, skipped: true };
  }

  syncInProgress = true;
  try {
    // force=true always uses full lookback; background uses stored timestamp.
    const glucoseSince = (!force && glucoseLastSync.getTime() !== 0)
      ? glucoseLastSync
      : new Date(Date.now() - GLUCOSE_INITIAL_LOOKBACK_DAYS * 86400_000);

    const workoutSince = (!force && workoutLastSync.getTime() !== 0)
      ? workoutLastSync
      : new Date(Date.now() - WORKOUT_INITIAL_LOOKBACK_DAYS * 86400_000);

    // Read from HealthKit in parallel.
    const [glucose, workouts] = await Promise.all([
      glucoseDue ? hk.readBloodGlucose(glucoseSince) : Promise.resolve<HKGlucoseReading[]>([]),
      workoutDue ? hk.readWorkouts(workoutSince) : Promise.resolve<HKWorkoutReading[]>([]),
    ]);

    // Skip the server call if there's nothing to sync.
    if (glucose.length === 0 && workouts.length === 0) {
      return { glucoseInserted: 0, workoutsInserted: 0 };
    }

    const result = await syncHealthKit({ glucose, workouts });

    // Only advance timestamps when data was actually received, so a zero-result
    // sync never locks future syncs into a narrow window.
    const syncTime = new Date();
    await Promise.all([
      (glucoseDue && glucose.length > 0) ? setLastSync(GLUCOSE_LAST_SYNC_KEY, syncTime) : Promise.resolve(),
      (workoutDue && workouts.length > 0) ? setLastSync(WORKOUT_LAST_SYNC_KEY, syncTime) : Promise.resolve(),
    ]);

    if (result.glucose.inserted > 0 || result.workouts.inserted > 0) {
      console.log(
        `[HealthSync] glucose +${result.glucose.inserted} (skipped ${result.glucose.skipped}),`,
        `workouts +${result.workouts.inserted} (skipped ${result.workouts.skipped})`,
      );
    }

    return {
      glucoseInserted: result.glucose.inserted,
      workoutsInserted: result.workouts.inserted,
    };
  } catch (err) {
    console.warn('[HealthSync] Sync failed:', err);
    return { glucoseInserted: 0, workoutsInserted: 0 };
  } finally {
    syncInProgress = false;
  }
}
