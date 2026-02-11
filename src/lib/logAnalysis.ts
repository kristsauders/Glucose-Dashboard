import type { GlucoseReading } from '@/types/glucose';
import type { InsulinLog, MealLog, ExerciseLog } from '@/types/logs';

/**
 * Check if an insulin type is a basal (long-acting) insulin
 */
function isBasalInsulin(insulinType: string): boolean {
  const type = insulinType.toLowerCase();
  return type.includes('lantus') ||
         type.includes('basal') ||
         type.includes('tresiba') ||
         type.includes('levemir') ||
         type.includes('toujeo') ||
         type.includes('degludec') ||
         type.includes('glargine') ||
         type.includes('detemir') ||
         type.includes('long-acting') ||
         type.includes('long');
}

export interface DailyLogMetrics {
  date: string;
  totalCarbs: number;
  totalInsulin: number;
  basalInsulin: number;
  rapidInsulin: number;
  exerciseMinutes: number;
  mealCount: number;
  avgCarbsPerMeal: number;
}

export interface CarbRatioData {
  timestamp: Date;
  carbs: number;
  insulin: number;
  ratio: number;
}

export interface InsulinBreakdown {
  basal: number;
  rapid: number;
  total: number;
  basalPercentage: number;
  rapidPercentage: number;
}

export interface ExerciseMetrics {
  totalMinutes: number;
  sessionCount: number;
  avgDuration: number;
  byIntensity: {
    light: number;
    moderate: number;
    intense: number;
  };
  byType: Record<string, number>;
}

/**
 * Calculate daily aggregated metrics for logs
 */
export function calculateDailyLogMetrics(
  insulin: InsulinLog[],
  meals: MealLog[],
  exercise: ExerciseLog[]
): DailyLogMetrics[] {
  const metricsMap = new Map<string, DailyLogMetrics>();

  // Process insulin doses
  insulin.forEach(dose => {
    const date = new Date(dose.timestamp).toISOString().split('T')[0];
    if (!metricsMap.has(date)) {
      metricsMap.set(date, {
        date,
        totalCarbs: 0,
        totalInsulin: 0,
        basalInsulin: 0,
        rapidInsulin: 0,
        exerciseMinutes: 0,
        mealCount: 0,
        avgCarbsPerMeal: 0,
      });
    }
    const metrics = metricsMap.get(date)!;

    // Convert to number to prevent string concatenation bug
    const units = Number(dose.units);
    if (isNaN(units)) {
      console.warn('[logAnalysis] Invalid insulin units:', dose.units, 'for dose:', dose);
    } else {
      metrics.totalInsulin += units;
      if (isBasalInsulin(dose.insulin_type)) {
        metrics.basalInsulin += units;
      } else {
        metrics.rapidInsulin += units;
      }
    }
  });

  // Process meals
  meals.forEach(meal => {
    const date = new Date(meal.timestamp).toISOString().split('T')[0];
    if (!metricsMap.has(date)) {
      metricsMap.set(date, {
        date,
        totalCarbs: 0,
        totalInsulin: 0,
        basalInsulin: 0,
        rapidInsulin: 0,
        exerciseMinutes: 0,
        mealCount: 0,
        avgCarbsPerMeal: 0,
      });
    }
    const metrics = metricsMap.get(date)!;

    // Convert to number to prevent string concatenation bug
    const carbs = Number(meal.carbs);
    if (isNaN(carbs)) {
      console.warn('[logAnalysis] Invalid carbs value:', meal.carbs, 'for meal:', meal);
    } else {
      metrics.totalCarbs += carbs;
    }
    metrics.mealCount += 1;
  });

  // Process exercise
  exercise.forEach(session => {
    const date = new Date(session.timestamp).toISOString().split('T')[0];
    if (!metricsMap.has(date)) {
      metricsMap.set(date, {
        date,
        totalCarbs: 0,
        totalInsulin: 0,
        basalInsulin: 0,
        rapidInsulin: 0,
        exerciseMinutes: 0,
        mealCount: 0,
        avgCarbsPerMeal: 0,
      });
    }
    const metrics = metricsMap.get(date)!;

    // Convert to number to prevent string concatenation bug
    const minutes = Number(session.duration_minutes);
    if (isNaN(minutes)) {
      console.warn('[logAnalysis] Invalid exercise minutes:', session.duration_minutes, 'for session:', session);
    } else {
      metrics.exerciseMinutes += minutes;
    }
  });

  // Calculate averages
  const results = Array.from(metricsMap.values());
  results.forEach(metrics => {
    if (metrics.mealCount > 0) {
      metrics.avgCarbsPerMeal = metrics.totalCarbs / metrics.mealCount;
    }
  });

  return results.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calculate carb-to-insulin ratios by matching meals with nearby insulin doses
 */
export function calculateCarbRatios(
  meals: MealLog[],
  insulin: InsulinLog[]
): CarbRatioData[] {
  const ratios: CarbRatioData[] = [];
  const WINDOW_MINUTES = 30; // Match insulin doses within 30 minutes of meal

  meals.forEach(meal => {
    if (meal.carbs === 0) return;

    const mealTime = new Date(meal.timestamp).getTime();

    // Find rapid insulin doses within time window
    const matchingDoses = insulin.filter(dose => {
      const doseTime = new Date(dose.timestamp).getTime();
      const timeDiff = Math.abs(doseTime - mealTime);
      // Exclude basal insulin types from carb ratio calculations
      const isRapid = !isBasalInsulin(dose.insulin_type);
      return isRapid && timeDiff <= WINDOW_MINUTES * 60 * 1000;
    });

    if (matchingDoses.length > 0) {
      const totalInsulin = matchingDoses.reduce((sum, dose) => sum + dose.units, 0);
      ratios.push({
        timestamp: new Date(meal.timestamp),
        carbs: meal.carbs,
        insulin: totalInsulin,
        ratio: meal.carbs / totalInsulin,
      });
    }
  });

  return ratios.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

/**
 * Calculate insulin breakdown (basal vs rapid)
 */
export function calculateInsulinBreakdown(insulin: InsulinLog[]): InsulinBreakdown {
  let basal = 0;
  let rapid = 0;

  insulin.forEach(dose => {
    if (isBasalInsulin(dose.insulin_type)) {
      basal += dose.units;
    } else {
      rapid += dose.units;
    }
  });

  const total = basal + rapid;
  const basalPercentage = total > 0 ? (basal / total) * 100 : 0;
  const rapidPercentage = total > 0 ? (rapid / total) * 100 : 0;

  return {
    basal,
    rapid,
    total,
    basalPercentage,
    rapidPercentage,
  };
}

/**
 * Calculate exercise metrics
 */
export function calculateExerciseMetrics(exercise: ExerciseLog[]): ExerciseMetrics {
  const totalMinutes = exercise.reduce((sum, e) => sum + e.duration_minutes, 0);
  const sessionCount = exercise.length;
  const avgDuration = sessionCount > 0 ? totalMinutes / sessionCount : 0;

  const byIntensity = {
    light: 0,
    moderate: 0,
    intense: 0,
  };

  const byType: Record<string, number> = {};

  exercise.forEach(e => {
    // Count by intensity
    const intensity = e.intensity?.toLowerCase() || 'moderate';
    if (intensity in byIntensity) {
      byIntensity[intensity as keyof typeof byIntensity] += e.duration_minutes;
    }

    // Count by type
    const type = e.activity_type || 'Other';
    byType[type] = (byType[type] || 0) + e.duration_minutes;
  });

  return {
    totalMinutes,
    sessionCount,
    avgDuration,
    byIntensity,
    byType,
  };
}

/**
 * Get today's log metrics (for live mode)
 */
export function getTodayLogMetrics(
  insulin: InsulinLog[],
  meals: MealLog[],
  exercise: ExerciseLog[]
): {
  carbs: number;
  insulin: number;
  basalInsulin: number;
  rapidInsulin: number;
  exerciseMinutes: number;
  carbRatio: number | null;
} {
  const today = new Date().toISOString().split('T')[0];

  const todayInsulin = insulin.filter(d =>
    new Date(d.timestamp).toISOString().split('T')[0] === today
  );
  const todayMeals = meals.filter(m =>
    new Date(m.timestamp).toISOString().split('T')[0] === today
  );
  const todayExercise = exercise.filter(e =>
    new Date(e.timestamp).toISOString().split('T')[0] === today
  );

  const carbs = todayMeals.reduce((sum, m) => sum + m.carbs, 0);
  const exerciseMinutes = todayExercise.reduce((sum, e) => sum + e.duration_minutes, 0);

  let basalInsulin = 0;
  let rapidInsulin = 0;
  todayInsulin.forEach(dose => {
    if (isBasalInsulin(dose.insulin_type)) {
      basalInsulin += dose.units;
    } else {
      rapidInsulin += dose.units;
    }
  });

  const totalInsulin = basalInsulin + rapidInsulin;

  // Calculate average carb ratio for today
  const ratios = calculateCarbRatios(todayMeals, todayInsulin);
  const carbRatio = ratios.length > 0
    ? ratios.reduce((sum, r) => sum + r.ratio, 0) / ratios.length
    : null;

  return {
    carbs,
    insulin: totalInsulin,
    basalInsulin,
    rapidInsulin,
    exerciseMinutes,
    carbRatio,
  };
}

/**
 * Match glucose readings with events for timeline annotations
 */
export interface TimelineEvent {
  timestamp: Date;
  type: 'insulin' | 'meal' | 'exercise';
  label: string;
  details: string;
  glucose?: number; // Nearest glucose reading
}

export interface MealImpact {
  meal: MealLog;
  baselineGlucose: number;
  peakGlucose: number;
  timeToPeakMinutes: number;
  totalRise: number;
  timeInRangePct: number;
  readingsCount: number;
}

/**
 * Analyze the glucose impact of a meal
 * Uses a 3-hour window after meal to calculate spike characteristics
 */
export function analyzeMealImpact(
  meal: MealLog,
  glucoseReadings: GlucoseReading[]
): MealImpact | null {
  const mealTime = new Date(meal.timestamp).getTime();

  // 1. Get baseline glucose (30 minutes before meal)
  const baselineStart = mealTime - 30 * 60 * 1000;
  const baselineEnd = mealTime;
  const baselineReadings = glucoseReadings.filter(r => {
    const time = new Date(r.timestamp).getTime();
    return time >= baselineStart && time < baselineEnd;
  });

  if (baselineReadings.length === 0) return null;

  const baselineGlucose = baselineReadings.reduce((sum, r) => sum + r.glucose, 0) / baselineReadings.length;

  // 2. Get response window (3 hours after meal)
  const responseEnd = mealTime + 3 * 60 * 60 * 1000;
  const responseReadings = glucoseReadings.filter(r => {
    const time = new Date(r.timestamp).getTime();
    return time >= mealTime && time <= responseEnd;
  });

  // Need at least 8 readings for reliable analysis
  if (responseReadings.length < 8) return null;

  // 3. Find peak glucose and time to peak
  const peakReading = responseReadings.reduce((max, r) =>
    r.glucose > max.glucose ? r : max
  , responseReadings[0]);

  const peakGlucose = peakReading.glucose;
  const timeToPeakMinutes = Math.round(
    (new Date(peakReading.timestamp).getTime() - mealTime) / (60 * 1000)
  );

  // 4. Calculate metrics
  const totalRise = peakGlucose - baselineGlucose;
  const inRangeCount = responseReadings.filter(r => r.glucose >= 70 && r.glucose <= 180).length;
  const timeInRangePct = (inRangeCount / responseReadings.length) * 100;

  return {
    meal,
    baselineGlucose,
    peakGlucose,
    timeToPeakMinutes,
    totalRise,
    timeInRangePct,
    readingsCount: responseReadings.length,
  };
}

/**
 * Analyze all meals and their glucose impacts
 */
export function analyzeMealsImpact(
  meals: MealLog[],
  glucoseReadings: GlucoseReading[]
): MealImpact[] {
  return meals
    .map(meal => analyzeMealImpact(meal, glucoseReadings))
    .filter((impact): impact is MealImpact => impact !== null)
    .sort((a, b) => new Date(b.meal.timestamp).getTime() - new Date(a.meal.timestamp).getTime());
}

export function createTimelineEvents(
  insulin: InsulinLog[],
  meals: MealLog[],
  exercise: ExerciseLog[],
  glucoseReadings: GlucoseReading[]
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // Helper to find nearest glucose reading
  const findNearestGlucose = (timestamp: Date): number | undefined => {
    const eventTime = timestamp.getTime();
    let nearest: GlucoseReading | undefined;
    let minDiff = Infinity;

    glucoseReadings.forEach(reading => {
      const readingTime = new Date(reading.timestamp).getTime();
      const diff = Math.abs(readingTime - eventTime);
      if (diff < minDiff) {
        minDiff = diff;
        nearest = reading;
      }
    });

    return nearest?.glucose;
  };

  // Add insulin events
  insulin.forEach(dose => {
    const timestamp = new Date(dose.timestamp);
    events.push({
      timestamp,
      type: 'insulin',
      label: `${dose.units}u ${dose.insulin_type}`,
      details: dose.purpose || '',
      glucose: findNearestGlucose(timestamp),
    });
  });

  // Add meal events
  meals.forEach(meal => {
    const timestamp = new Date(meal.timestamp);
    events.push({
      timestamp,
      type: 'meal',
      label: `${meal.carbs}g carbs`,
      details: meal.description || meal.meal_type || '',
      glucose: findNearestGlucose(timestamp),
    });
  });

  // Add exercise events
  exercise.forEach(session => {
    const timestamp = new Date(session.timestamp);
    events.push({
      timestamp,
      type: 'exercise',
      label: `${session.activity_type} (${session.duration_minutes}m)`,
      details: session.intensity || '',
      glucose: findNearestGlucose(timestamp),
    });
  });

  return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}
