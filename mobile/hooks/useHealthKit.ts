import { useCallback, useRef } from 'react';
import AppleHealthKit, {
  HealthKitPermissions,
  HealthValue,
} from 'react-native-health';

const PERMISSIONS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.BloodGlucose,
      AppleHealthKit.Constants.Permissions.DietaryCarbohydrates,
      AppleHealthKit.Constants.Permissions.InsulinDelivery,
    ],
    write: [
      AppleHealthKit.Constants.Permissions.DietaryCarbohydrates,
      AppleHealthKit.Constants.Permissions.InsulinDelivery,
      AppleHealthKit.Constants.Permissions.Workout,
    ],
  },
};

let initialized = false;
let initPromise: Promise<boolean> | null = null;

function initHealthKit(): Promise<boolean> {
  if (initialized) return Promise.resolve(true);
  if (initPromise) return initPromise;
  initPromise = new Promise(resolve => {
    AppleHealthKit.initHealthKit(PERMISSIONS, err => {
      if (err) {
        console.warn('[HealthKit] Init failed:', err);
        resolve(false);
      } else {
        initialized = true;
        resolve(true);
      }
    });
  });
  return initPromise;
}

export function useHealthKit() {
  const ensureInit = useCallback(() => initHealthKit(), []);

  const writeMeal = useCallback(async (carbs: number, timestamp: string) => {
    try {
      const ok = await ensureInit();
      if (!ok) return;
      await new Promise<void>((resolve, reject) => {
        const options = {
          value: carbs,
          startDate: timestamp,
        };
        AppleHealthKit.saveFood(options as any, (err: any) => {
          if (err) reject(err);
          else resolve();
        });
      });
    } catch (err) {
      console.warn('[HealthKit] writeMeal failed:', err);
    }
  }, [ensureInit]);

  const writeInsulin = useCallback(
    async (units: number, type: 'bolus' | 'correction' | 'basal', timestamp: string) => {
      try {
        const ok = await ensureInit();
        if (!ok) return;
        // InsulinDelivery reason: 0 = basal, 1 = bolus
        const insulinType = type === 'basal' ? 0 : 1;
        await new Promise<void>((resolve, reject) => {
          const options = {
            value: units,
            startDate: timestamp,
            insulinDeliveryReason: insulinType,
          };
          (AppleHealthKit as any).saveInsulinDelivery(options, (err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (err) {
        console.warn('[HealthKit] writeInsulin failed:', err);
      }
    },
    [ensureInit],
  );

  const writeExercise = useCallback(
    async (
      activity: string,
      durationMinutes: number,
      intensity: 'low' | 'moderate' | 'high',
      timestamp: string,
    ) => {
      try {
        const ok = await ensureInit();
        if (!ok) return;

        // Map activity string to HealthKit workout type
        const activityMap: Record<string, string> = {
          walking: AppleHealthKit.Constants.Activities.Walking,
          running: AppleHealthKit.Constants.Activities.Running,
          cycling: AppleHealthKit.Constants.Activities.Cycling,
          swimming: AppleHealthKit.Constants.Activities.Swimming,
          gym: AppleHealthKit.Constants.Activities.TraditionalStrengthTraining,
          yoga: AppleHealthKit.Constants.Activities.Yoga,
          other: AppleHealthKit.Constants.Activities.Other,
        };

        const activityType = activityMap[activity] ?? AppleHealthKit.Constants.Activities.Other;
        const start = new Date(timestamp);
        const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

        await new Promise<void>((resolve, reject) => {
          const options = {
            type: activityType,
            startDate: start.toISOString(),
            endDate: end.toISOString(),
          };
          AppleHealthKit.saveWorkout(options as any, (err: any) => {
            if (err) reject(err);
            else resolve();
          });
        });
      } catch (err) {
        console.warn('[HealthKit] writeExercise failed:', err);
      }
    },
    [ensureInit],
  );

  return { writeMeal, writeInsulin, writeExercise };
}
