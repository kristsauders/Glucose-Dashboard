import { useCallback } from 'react';
import { NativeModules } from 'react-native';
import AppleHealthKit, {
  HealthKitPermissions,
} from 'react-native-health';

// In RN 0.74+ new architecture, NativeModules.XXX returns a JS Proxy.
// react-native-health does Object.assign({}, NativeModules.AppleHealthKit, {Constants})
// which reads own enumerable properties — Proxy traps are NOT own properties, so the
// native methods are lost in the spread. We bypass this by calling NativeModules directly.
const HKNative: Record<string, any> = NativeModules.AppleHealthKit ?? {};

// ── Permissions ───────────────────────────────────────────────────────────────

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.BloodGlucose,
      AppleHealthKit.Constants.Permissions.HeartRate,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.DietaryCarbohydrates,
      AppleHealthKit.Constants.Permissions.InsulinDelivery,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
  },
};

// ── Init singleton ────────────────────────────────────────────────────────────

let initialized = false;
let initPromise: Promise<boolean> | null = null;

function initHealthKit(): Promise<boolean> {
  if (initialized) return Promise.resolve(true);
  if (initPromise) return initPromise;

  // Guard: if the native module isn't registered (simulator, missing entitlement,
  // new-arch interop not yet ready), fail fast with a clear log rather than
  // leaving initPromise as a stuck rejected promise.
  if (typeof HKNative.initHealthKit !== 'function') {
    console.warn('[HealthKit] Native module not available – HKNative.initHealthKit is not a function');
    return Promise.resolve(false);   // don't cache this; allow retry later
  }

  initPromise = new Promise(resolve => {
    try {
      HKNative.initHealthKit(PERMISSIONS, (err: any) => {
        if (err) {
          console.warn('[HealthKit] Init failed:', err);
          initPromise = null;  // allow retry on next call
          resolve(false);
        } else {
          initialized = true;
          resolve(true);
        }
      });
    } catch (e) {
      console.warn('[HealthKit] initHealthKit threw:', e);
      initPromise = null;  // allow retry
      resolve(false);
    }
  });
  return initPromise;
}

// ── Activity name → Sage activity_type mapping ────────────────────────────────
// react-native-health returns activityName as a HealthKit activity string.

const HK_ACTIVITY_MAP: Record<string, string> = {
  Walking: 'walking',
  Hiking: 'walking',
  StairClimbing: 'walking',
  Stairs: 'walking',
  Elliptical: 'walking',
  Golf: 'walking',
  WheelchairWalkPace: 'walking',
  Running: 'running',
  TrackAndField: 'running',
  WheelchairRunPace: 'running',
  Cycling: 'cycling',
  HandCycling: 'cycling',
  Swimming: 'swimming',
  WaterFitness: 'swimming',
  WaterPolo: 'swimming',
  TraditionalStrengthTraining: 'gym',
  FunctionalStrengthTraining: 'gym',
  CrossTraining: 'gym',
  CoreTraining: 'gym',
  HighIntensityIntervalTraining: 'gym',
  JumpRope: 'gym',
  Kickboxing: 'gym',
  StepTraining: 'gym',
  Boxing: 'gym',
  Gymnastics: 'gym',
  MixedCardio: 'gym',
  MixedMetabolicCardioTraining: 'gym',
  Yoga: 'yoga',
  Pilates: 'yoga',
  MindAndBody: 'yoga',
  Barre: 'yoga',
  Flexibility: 'yoga',
  TaiChi: 'yoga',
};

function hkActivityToSage(activityName: string): string {
  return HK_ACTIVITY_MAP[activityName] ?? 'other';
}

// ── Public hook ───────────────────────────────────────────────────────────────

export interface HKGlucoseReading {
  timestamp: string;  // ISO UTC
  glucose: number;    // mg/dL
  sourceName: string;
}


export interface HKWorkoutReading {
  healthkitUUID: string;
  timestamp: string;        // start ISO
  endTimestamp: string;     // end ISO
  durationMinutes: number;
  activityType: string;     // Sage type
  activityName: string;     // raw HK name
  calories?: number;
  avgHeartRate?: number;
  maxHeartRate?: number;
}

export function useHealthKit() {
  const ensureInit = useCallback(() => initHealthKit(), []);

  // ── WRITE: meal carbs ────────────────────────────────────────────────────────

  const writeMeal = useCallback(async (carbs: number, timestamp: string) => {
    try {
      const ok = await ensureInit();
      if (!ok) return;
      if (typeof HKNative.saveFood !== 'function') {
        console.warn('[HealthKit] saveFood not available on this device');
        return;
      }
      await new Promise<void>((resolve, reject) => {
        HKNative.saveFood({ value: carbs, unit: 'gram', startDate: timestamp, endDate: timestamp }, (err: any) => {
          if (err) reject(err); else resolve();
        });
      });
    } catch (err) {
      console.warn('[HealthKit] writeMeal failed:', err);
    }
  }, [ensureInit]);

  // ── WRITE: insulin ────────────────────────────────────────────────────────────

  const writeInsulin = useCallback(
    async (units: number, type: 'bolus' | 'correction' | 'basal', timestamp: string) => {
      try {
        const ok = await ensureInit();
        if (!ok) return;
        await new Promise<void>((resolve, reject) => {
          HKNative.saveInsulinDelivery(
            { value: units, startDate: timestamp, insulinDeliveryReason: type === 'basal' ? 0 : 1 },
            (err: any) => { if (err) reject(err); else resolve(); },
          );
        });
      } catch (err) {
        console.warn('[HealthKit] writeInsulin failed:', err);
      }
    },
    [ensureInit],
  );

  // ── WRITE: workout ────────────────────────────────────────────────────────────

  const writeExercise = useCallback(
    async (activity: string, durationMinutes: number, intensity: 'low' | 'moderate' | 'high', timestamp: string) => {
      try {
        const ok = await ensureInit();
        if (!ok) return;
        const activityMap: Record<string, string> = {
          walking: AppleHealthKit.Constants.Activities.Walking,
          running: AppleHealthKit.Constants.Activities.Running,
          cycling: AppleHealthKit.Constants.Activities.Cycling,
          swimming: AppleHealthKit.Constants.Activities.Swimming,
          gym: AppleHealthKit.Constants.Activities.TraditionalStrengthTraining,
          yoga: AppleHealthKit.Constants.Activities.Yoga,
          other: AppleHealthKit.Constants.Activities.Other,
        };
        const start = new Date(timestamp);
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
        await new Promise<void>((resolve, reject) => {
          HKNative.saveWorkout(
            { type: activityMap[activity] ?? AppleHealthKit.Constants.Activities.Other, startDate: start.toISOString(), endDate: end.toISOString() },
            (err: any) => { if (err) reject(err); else resolve(); },
          );
        });
      } catch (err) {
        console.warn('[HealthKit] writeExercise failed:', err);
      }
    },
    [ensureInit],
  );

  // ── READ: blood glucose ───────────────────────────────────────────────────────
  //
  // IMPORTANT: always request unit 'mg/dL'.
  // Without this, react-native-health returns whatever unit HealthKit stores
  // on the device (mmol/L in non-US locales), which would appear as values
  // like 7.2 on a chart expecting 70–180 and corrupt all stats.

  const readBloodGlucose = useCallback(
    async (since: Date): Promise<HKGlucoseReading[]> => {
      try {
        const ok = await ensureInit();
        if (!ok) return [];

        return await new Promise<HKGlucoseReading[]>((resolve, reject) => {
          const options = {
            unit: 'mgPerdL', // native Utils.m only recognizes 'mgPerdL', not 'mg/dL'
            startDate: since.toISOString(),
            endDate: new Date().toISOString(),
            ascending: true,
            limit: 2000,
          };
          HKNative.getBloodGlucoseSamples(options, (err: any, results: any[]) => {
            if (err) { reject(err); return; }
            const readings: HKGlucoseReading[] = (results ?? [])
              .filter(r => r.value > 18 && r.value < 700)  // sanity: must be in mg/dL range
              .map(r => ({
                timestamp: r.startDate,
                glucose: r.value,
                sourceName: r.sourceName ?? 'Apple Health',
              }));
            resolve(readings);
          });
        });
      } catch (err) {
        console.warn('[HealthKit] readBloodGlucose failed:', err);
        return [];
      }
    },
    [ensureInit],
  );

  // ── READ: workouts + heart rate ───────────────────────────────────────────────
  //
  // Fetches workouts since `since`, then batch-fetches heart rate samples over
  // the combined time range and assigns them per workout. One HR API call total.

  const readWorkouts = useCallback(
    async (since: Date): Promise<HKWorkoutReading[]> => {
      try {
        const ok = await ensureInit();
        if (!ok) return [];

        const now = new Date();

        // getAnchoredWorkouts returns { anchor, data: HKWorkout[] }
        const rawWorkouts: any[] = await new Promise((resolve, reject) => {
          HKNative.getAnchoredWorkouts(
            { startDate: since.toISOString(), endDate: now.toISOString(), limit: 200 },
            (err: any, result: any) => {
              if (err) { reject(err); return; }
              resolve(result?.data ?? []);
            },
          );
        });

        if (rawWorkouts.length === 0) return [];

        // Batch-fetch heart rate for the entire window covered by all workouts.
        const windowStart = rawWorkouts[0].start;
        const windowEnd = rawWorkouts[rawWorkouts.length - 1].end;

        const heartRateSamples: { startDate: string; value: number }[] = await new Promise(
          (resolve) => {
            HKNative.getHeartRateSamples(
              { startDate: windowStart, endDate: windowEnd, ascending: true, limit: 10000 },
              (err: any, results: any[]) => resolve(err ? [] : (results ?? [])),
            );
          },
        );

        return rawWorkouts.map(w => {
          const startMs = new Date(w.start).getTime();
          const endMs = new Date(w.end).getTime();
          const durationMin = Math.round((endMs - startMs) / 60000);

          // Heart rate samples that fall within this workout's time window
          const workoutHR = heartRateSamples
            .filter(s => {
              const t = new Date(s.startDate).getTime();
              return t >= startMs && t <= endMs;
            })
            .map(s => s.value);

          const avgHR = workoutHR.length > 0
            ? Math.round(workoutHR.reduce((a, b) => a + b, 0) / workoutHR.length)
            : undefined;
          const maxHR = workoutHR.length > 0 ? Math.max(...workoutHR) : undefined;

          const activityName: string = w.activityName ?? 'Other';

          return {
            healthkitUUID: w.id,
            timestamp: w.start,
            endTimestamp: w.end,
            durationMinutes: Math.max(1, durationMin),
            activityType: hkActivityToSage(activityName),
            activityName,
            calories: w.calories ?? undefined,
            avgHeartRate: avgHR,
            maxHeartRate: maxHR,
          };
        });
      } catch (err) {
        console.warn('[HealthKit] readWorkouts failed:', err);
        return [];
      }
    },
    [ensureInit],
  );

  return { writeMeal, writeInsulin, writeExercise, readBloodGlucose, readWorkouts };
}
