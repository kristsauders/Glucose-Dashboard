/**
 * Pattern Detection Algorithms
 *
 * Core algorithms for detecting glucose patterns and correlations:
 * - Meal response detection (glucose spike analysis)
 * - Basal adequacy analysis (overnight drift)
 * - Exercise response detection (glucose drop analysis)
 */

import { query } from '../config/database.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface GlucoseReading {
  id: string;
  timestamp: Date;
  glucose: number;
}

interface Meal {
  id: string;
  user_id: string;
  timestamp: Date;
  description: string;
  estimated_carbs: number | null;
  meal_type: string | null;
}

interface Exercise {
  id: string;
  user_id: string;
  timestamp: Date;
  description: string | null;
  activity_type: string;
  duration_minutes: number;
  intensity: string;
}

interface Correlation {
  id: string;
  baseline_glucose: number;
  peak_glucose?: number;
  lowest_glucose?: number;
  time_to_peak_minutes?: number;
  time_to_lowest_minutes?: number;
  total_change: number;
  time_in_range_pct: number;
}

interface Pattern {
  id: string;
  pattern_type: string;
  pattern_name: string;
  typical_magnitude: number;
  occurrence_count: number;
  confidence: number;
  signature: any;
  example_event_ids: string[];
}

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = average(values);
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const variance = average(squareDiffs);
  return Math.sqrt(variance);
}

function linearRegression(xValues: number[], yValues: number[]): {
  slope: number;
  intercept: number;
  r2: number;
} {
  const n = xValues.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, r2: 0 };
  }

  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
  const sumY2 = yValues.reduce((sum, y) => sum + y * y, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const yMean = sumY / n;
  const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
  const ssResidual = yValues.reduce((sum, y, i) => {
    const yPred = slope * xValues[i] + intercept;
    return sum + Math.pow(y - yPred, 2);
  }, 0);
  const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

  return { slope, intercept, r2 };
}

// ============================================================================
// MEAL RESPONSE DETECTION
// ============================================================================

/**
 * Detect glucose response after a meal
 * Analyzes 4-hour window after meal to identify spike characteristics
 */
export async function detectMealResponse(
  userId: string,
  mealId: string
): Promise<Correlation | null> {
  try {
    // 1. Get meal details
    const mealResult = await query<Meal>(
      `SELECT id, user_id, timestamp, description, estimated_carbs, meal_type
       FROM meals WHERE id = $1 AND user_id = $2`,
      [mealId, userId]
    );

    if (mealResult.rows.length === 0) {
      console.warn(`Meal ${mealId} not found for user ${userId}`);
      return null;
    }

    const meal = mealResult.rows[0];
    const mealTime = new Date(meal.timestamp);

    // 2. Get baseline glucose (30min before meal)
    const baselineStart = new Date(mealTime.getTime() - 30 * 60 * 1000);
    const baselineReadings = await getGlucoseWindow(userId, baselineStart, mealTime);

    if (baselineReadings.length === 0) {
      console.warn(`No baseline glucose readings for meal ${mealId}`);
      return null;
    }

    const baselineGlucose = average(baselineReadings.map(r => r.glucose));

    // 3. Get response window (3 hours after meal - standard post-meal analysis window)
    // CRITICAL: Use 3-hour window to avoid including unrelated readings (overnight lows, etc.)
    const responseEnd = new Date(mealTime.getTime() + 3 * 60 * 60 * 1000);
    const responseReadings = await getGlucoseWindow(userId, mealTime, responseEnd);

    if (responseReadings.length < 8) {
      console.warn(`Insufficient glucose readings for meal ${mealId}`);
      return null;
    }

    // 4. Identify peak
    let peakReading = responseReadings[0];
    for (const reading of responseReadings) {
      if (reading.glucose > peakReading.glucose) {
        peakReading = reading;
      }
    }

    const peakGlucose = peakReading.glucose;
    const timeToPeakMinutes = Math.round(
      (new Date(peakReading.timestamp).getTime() - mealTime.getTime()) / (60 * 1000)
    );

    // 5. Calculate metrics
    const totalRise = peakGlucose - baselineGlucose;
    const readingsInRange = responseReadings.filter(
      r => r.glucose >= 70 && r.glucose <= 180
    );
    const timeInRangePct = (readingsInRange.length / responseReadings.length) * 100;

    // 6. Store correlation
    const correlationResult = await query(
      `INSERT INTO glucose_correlations (
        user_id, trigger_event_type, trigger_event_id, trigger_timestamp,
        baseline_glucose, peak_glucose, time_to_peak_minutes,
        total_change, time_in_range_pct,
        window_start, window_end, glucose_readings_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        userId,
        'meal',
        mealId,
        mealTime,
        baselineGlucose,
        peakGlucose,
        timeToPeakMinutes,
        totalRise,
        timeInRangePct,
        mealTime,
        responseEnd,
        responseReadings.length,
      ]
    );

    const correlationId = correlationResult.rows[0].id;

    // 7. Update meal record
    await query(
      `UPDATE meals
       SET correlation_id = $1,
           observed_spike = $2,
           time_to_peak = make_interval(mins => $3)
       WHERE id = $4`,
      [correlationId, totalRise, timeToPeakMinutes, mealId]
    );

    // 8. Match or create pattern
    await matchOrCreateMealPattern(userId, meal, {
      id: correlationId,
      baseline_glucose: baselineGlucose,
      peak_glucose: peakGlucose,
      time_to_peak_minutes: timeToPeakMinutes,
      total_change: totalRise,
      time_in_range_pct: timeInRangePct,
    });

    return {
      id: correlationId,
      baseline_glucose: baselineGlucose,
      peak_glucose: peakGlucose,
      time_to_peak_minutes: timeToPeakMinutes,
      total_change: totalRise,
      time_in_range_pct: timeInRangePct,
    };
  } catch (error) {
    console.error(`Error detecting meal response for ${mealId}:`, error);
    return null;
  }
}

/**
 * Match correlation to existing pattern or create new pattern
 */
async function matchOrCreateMealPattern(
  userId: string,
  meal: Meal,
  correlation: Correlation
): Promise<void> {
  // Find similar patterns
  const mealType = meal.meal_type || 'unspecified';
  const carbRange = meal.estimated_carbs
    ? Math.floor(meal.estimated_carbs / 20) * 20  // Round to nearest 20g
    : null;

  const patternResult = await query<Pattern>(
    `SELECT id, pattern_name, typical_magnitude, occurrence_count,
            confidence, signature, example_event_ids
     FROM glucose_patterns
     WHERE user_id = $1
       AND pattern_type = 'meal_response'
       AND trigger_event_details->>'meal_type' = $2
       AND confidence >= 0.3
     ORDER BY confidence DESC, occurrence_count DESC
     LIMIT 3`,
    [userId, mealType]
  );

  let matchedPattern: Pattern | null = null;

  // Check if any pattern matches (within 30% magnitude difference)
  for (const pattern of patternResult.rows) {
    const magnitudeDiff = Math.abs(
      pattern.typical_magnitude - correlation.total_change
    );
    const magnitudePercent = (magnitudeDiff / pattern.typical_magnitude) * 100;

    if (magnitudePercent < 30) {
      matchedPattern = pattern;
      break;
    }
  }

  if (matchedPattern) {
    // Update existing pattern
    await query(
      `UPDATE glucose_patterns
       SET last_seen = NOW(),
           occurrence_count = occurrence_count + 1,
           example_event_ids = array_append(example_event_ids, $1::UUID)
       WHERE id = $2`,
      [meal.id, matchedPattern.id]
    );

    // Link correlation to pattern
    await query(
      'UPDATE glucose_correlations SET matched_pattern_id = $1 WHERE id = $2',
      [matchedPattern.id, correlation.id]
    );
  } else if (shouldCreateNewPattern(correlation)) {
    // Create new pattern
    const patternName = generateMealPatternName(mealType, correlation.total_change);
    const description = generateMealPatternDescription(mealType, correlation);

    await query(
      `INSERT INTO glucose_patterns (
        user_id, pattern_type, pattern_name, description,
        typical_duration, typical_magnitude,
        trigger_event_type, trigger_event_details,
        signature, example_event_ids, confidence
      ) VALUES ($1, $2, $3, $4, make_interval(mins => $5), $6, $7, $8, $9, $10, $11)`,
      [
        userId,
        'meal_response',
        patternName,
        description,
        240,  // 4 hours
        correlation.total_change,
        'meal',
        JSON.stringify({ meal_type: mealType, avg_carbs: meal.estimated_carbs }),
        JSON.stringify({
          mean_peak: correlation.peak_glucose,
          mean_time_to_peak: correlation.time_to_peak_minutes,
          mean_rise: correlation.total_change,
        }),
        [meal.id],
        0.3,  // Initial low confidence
      ]
    );
  }
}

function shouldCreateNewPattern(correlation: Correlation): boolean {
  // Create pattern if spike is significant
  return correlation.total_change > 50;
}

function generateMealPatternName(mealType: string, magnitude: number): string {
  const capitalizedMealType = mealType.charAt(0).toUpperCase() + mealType.slice(1);
  const magnitudeLabel =
    magnitude > 80 ? 'Large spike' :
    magnitude > 40 ? 'Moderate spike' : 'Small spike';
  return `${capitalizedMealType} - ${magnitudeLabel} (${Math.round(magnitude)} mg/dL)`;
}

function generateMealPatternDescription(mealType: string, correlation: Correlation): string {
  return `${mealType} meals typically cause ${Math.round(correlation.total_change)} mg/dL spike, peaking around ${correlation.time_to_peak_minutes} minutes`;
}

// ============================================================================
// BASAL ADEQUACY DETECTION
// ============================================================================

/**
 * Analyze overnight glucose drift to assess basal insulin adequacy
 * Uses configurable fasting window (default 3am-7am)
 */
export async function detectBasalAdequacy(
  userId: string,
  date: string,  // YYYY-MM-DD format
  timezone: string = 'America/New_York',
  fastingStart: number = 3,
  fastingEnd: number = 7
): Promise<{
  adequacy: 'adequate' | 'basal_too_low' | 'basal_too_high' | 'unstable';
  driftRate: number;
  totalDrift: number;
  avgGlucose: number;
  stdDev: number;
  cv: number;
  confidence: number;
} | null> {
  try {
    // Get overnight readings using timezone-aware query
    // Query for readings in the user's timezone, not UTC
    const result = await query(
      `SELECT timestamp, glucose
       FROM glucose_readings
       WHERE user_id = $1
         AND DATE(timezone($2, timestamp)) = $3
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) >= ${fastingStart}
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) < ${fastingEnd}
       ORDER BY timestamp ASC`,
      [userId, timezone, date]
    );

    const readings = result.rows.map((row: any) => ({
      timestamp: row.timestamp,
      glucose: parseFloat(row.glucose),
    }));

    if (readings.length < 8) {
      console.warn(`Insufficient overnight readings for ${date}`);
      return null;
    }

    // Calculate linear regression for drift
    // Normalize time to start from 0 (same fix as analyze_overnight)
    const sortedReadings = readings.sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const startTime = new Date(sortedReadings[0].timestamp).getTime();
    const xValues = sortedReadings.map(r => (new Date(r.timestamp).getTime() - startTime) / (60 * 1000));
    const yValues = sortedReadings.map(r => r.glucose);

    const { slope, r2 } = linearRegression(xValues, yValues);

    // slope is mg/dL per minute; convert to mg/dL per hour
    const driftRate = slope * 60;
    const totalDrift = driftRate * 4;  // 4-hour window

    // Assess stability
    const avgGlucose = average(yValues);
    const stdDev = standardDeviation(yValues);
    const cv = (stdDev / avgGlucose) * 100;

    // Classify basal adequacy
    let adequacy: 'adequate' | 'basal_too_low' | 'basal_too_high' | 'unstable';
    if (cv > 25) {
      adequacy = 'unstable';
    } else if (totalDrift > 20) {
      adequacy = 'basal_too_low';  // Rising
    } else if (totalDrift < -20) {
      adequacy = 'basal_too_high';  // Falling
    } else {
      adequacy = 'adequate';
    }

    const confidence = Math.min(r2, 1.0);

    // Store or update pattern
    await updateBasalPattern(userId, {
      adequacy,
      driftRate,
      totalDrift,
      avgGlucose,
      stdDev,
      cv,
      date: new Date(date + 'T03:00:00Z'), // Use the date as a reference
    });

    return {
      adequacy,
      driftRate,
      totalDrift,
      avgGlucose,
      stdDev,
      cv,
      confidence,
    };
  } catch (error) {
    console.error(`Error detecting basal adequacy for ${date}:`, error);
    return null;
  }
}

async function updateBasalPattern(
  userId: string,
  analysis: {
    adequacy: string;
    driftRate: number;
    totalDrift: number;
    avgGlucose: number;
    stdDev: number;
    cv: number;
    date: Date;
  }
): Promise<void> {
  const existingPattern = await query<Pattern>(
    `SELECT id, typical_magnitude, occurrence_count
     FROM glucose_patterns
     WHERE user_id = $1 AND pattern_type = 'basal_drift'
     LIMIT 1`,
    [userId]
  );

  if (existingPattern.rows.length > 0) {
    const pattern = existingPattern.rows[0];
    const newMagnitude =
      (pattern.typical_magnitude * pattern.occurrence_count + analysis.totalDrift) /
      (pattern.occurrence_count + 1);

    await query(
      `UPDATE glucose_patterns
       SET typical_magnitude = $1,
           last_seen = $2,
           occurrence_count = occurrence_count + 1,
           signature = $3
       WHERE id = $4`,
      [
        newMagnitude,
        analysis.date,
        JSON.stringify({
          drift_rate: analysis.driftRate,
          avg_glucose: analysis.avgGlucose,
          std_dev: analysis.stdDev,
          cv: analysis.cv,
          adequacy: analysis.adequacy,
        }),
        pattern.id,
      ]
    );
  } else {
    // Create new pattern
    const patternName = `Overnight basal ${analysis.adequacy}`;
    const description = `Overnight glucose ${
      analysis.adequacy === 'basal_too_low' ? 'rises' : 'falls'
    } by ${Math.abs(analysis.totalDrift).toFixed(0)} mg/dL on average`;

    await query(
      `INSERT INTO glucose_patterns (
        user_id, pattern_type, pattern_name, description,
        typical_duration, typical_magnitude,
        time_of_day_start, time_of_day_end,
        signature, confidence
      ) VALUES ($1, $2, $3, $4, make_interval(mins => $5), $6, $7, $8, $9, $10)`,
      [
        userId,
        'basal_drift',
        patternName,
        description,
        240,
        analysis.totalDrift,
        '03:00:00',
        '07:00:00',
        JSON.stringify({
          drift_rate: analysis.driftRate,
          avg_glucose: analysis.avgGlucose,
          std_dev: analysis.stdDev,
          cv: analysis.cv,
          adequacy: analysis.adequacy,
        }),
        0.3,
      ]
    );
  }
}

// ============================================================================
// EXERCISE RESPONSE DETECTION
// ============================================================================

/**
 * Detect glucose response during and after exercise
 */
export async function detectExerciseResponse(
  userId: string,
  exerciseId: string
): Promise<Correlation | null> {
  try {
    // 1. Get exercise details
    const exerciseResult = await query<Exercise>(
      `SELECT id, user_id, timestamp, description, activity_type, duration_minutes, intensity
       FROM exercise_logs WHERE id = $1 AND user_id = $2`,
      [exerciseId, userId]
    );

    if (exerciseResult.rows.length === 0) {
      console.warn(`Exercise ${exerciseId} not found`);
      return null;
    }

    const exercise = exerciseResult.rows[0];
    const exerciseTime = new Date(exercise.timestamp);

    // 2. Get baseline (15min before)
    const baselineStart = new Date(exerciseTime.getTime() - 15 * 60 * 1000);
    const baselineReadings = await getGlucoseWindow(userId, baselineStart, exerciseTime);

    if (baselineReadings.length === 0) {
      console.warn(`No baseline glucose for exercise ${exerciseId}`);
      return null;
    }

    const baselineGlucose = average(baselineReadings.map(r => r.glucose));

    // 3. Get response window (during + 2 hours after)
    const responseEnd = new Date(
      exerciseTime.getTime() +
      (exercise.duration_minutes * 60 * 1000) +
      (2 * 60 * 60 * 1000)
    );
    const responseReadings = await getGlucoseWindow(userId, exerciseTime, responseEnd);

    if (responseReadings.length < 4) {
      console.warn(`Insufficient readings for exercise ${exerciseId}`);
      return null;
    }

    // 4. Identify lowest point
    let lowestReading = responseReadings[0];
    for (const reading of responseReadings) {
      if (reading.glucose < lowestReading.glucose) {
        lowestReading = reading;
      }
    }

    const lowestGlucose = lowestReading.glucose;
    const timeToLowestMinutes = Math.round(
      (new Date(lowestReading.timestamp).getTime() - exerciseTime.getTime()) / (60 * 1000)
    );

    // 5. Calculate drop
    const totalDrop = baselineGlucose - lowestGlucose;

    // 6. Calculate TIR
    const readingsInRange = responseReadings.filter(
      r => r.glucose >= 70 && r.glucose <= 180
    );
    const timeInRangePct = (readingsInRange.length / responseReadings.length) * 100;

    // 7. Store correlation
    const correlationResult = await query(
      `INSERT INTO glucose_correlations (
        user_id, trigger_event_type, trigger_event_id, trigger_timestamp,
        baseline_glucose, lowest_glucose, time_to_lowest_minutes,
        total_change, time_in_range_pct,
        window_start, window_end, glucose_readings_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING id`,
      [
        userId,
        'exercise',
        exerciseId,
        exerciseTime,
        baselineGlucose,
        lowestGlucose,
        timeToLowestMinutes,
        -totalDrop,  // Negative for drop
        timeInRangePct,
        exerciseTime,
        responseEnd,
        responseReadings.length,
      ]
    );

    const correlationId = correlationResult.rows[0].id;

    // 8. Update exercise record
    await query(
      `UPDATE exercise_logs
       SET correlation_id = $1,
           observed_drop = $2,
           time_to_lowest = make_interval(mins => $3)
       WHERE id = $4`,
      [correlationId, totalDrop, timeToLowestMinutes, exerciseId]
    );

    return {
      id: correlationId,
      baseline_glucose: baselineGlucose,
      lowest_glucose: lowestGlucose,
      time_to_lowest_minutes: timeToLowestMinutes,
      total_change: -totalDrop,
      time_in_range_pct: timeInRangePct,
    };
  } catch (error) {
    console.error(`Error detecting exercise response for ${exerciseId}:`, error);
    return null;
  }
}

// ============================================================================
// CONFIDENCE CALCULATION
// ============================================================================

/**
 * Calculate confidence score for a pattern based on multiple factors
 */
export function calculatePatternConfidence(pattern: {
  occurrence_count: number;
  last_seen: Date;
  example_values?: number[];  // For magnitude consistency
}): number {
  let confidence = 0;

  // More occurrences = higher confidence
  if (pattern.occurrence_count >= 10) confidence += 0.3;
  else if (pattern.occurrence_count >= 5) confidence += 0.2;
  else if (pattern.occurrence_count >= 3) confidence += 0.1;

  // Consistency check (if example values provided)
  if (pattern.example_values && pattern.example_values.length > 1) {
    const stdDev = standardDeviation(pattern.example_values);
    const avg = average(pattern.example_values);
    const cv = (stdDev / avg) * 100;

    if (cv < 20) confidence += 0.3;  // Very consistent
    else if (cv < 35) confidence += 0.15;
  } else {
    // Default consistency bonus if no data
    confidence += 0.2;
  }

  // Recency check
  const daysSinceLastSeen =
    (Date.now() - new Date(pattern.last_seen).getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceLastSeen <= 7) confidence += 0.2;
  else if (daysSinceLastSeen <= 14) confidence += 0.1;

  return Math.min(confidence, 1.0);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get glucose readings within a time window
 */
async function getGlucoseWindow(
  userId: string,
  start: Date,
  end: Date
): Promise<GlucoseReading[]> {
  const result = await query<GlucoseReading>(
    `SELECT id, timestamp, glucose
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND timestamp < $3
     ORDER BY timestamp ASC`,
    [userId, start, end]
  );

  return result.rows.map(row => ({
    ...row,
    timestamp: new Date(row.timestamp),
    glucose: parseFloat(row.glucose as any), // Convert from string to number (pg returns NUMERIC as string)
  }));
}
