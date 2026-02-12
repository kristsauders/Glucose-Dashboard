import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../../config/database.js';
import type { AuthRequest } from '../../types/index.js';

const router = Router();
router.use(authMiddleware);

// Zod schema for Apple Health workout data
const appleHealthWorkoutSchema = z.object({
  workouts: z.array(z.object({
    id: z.string().describe('Apple Health workout UUID'),
    type: z.string().describe('HKWorkoutActivityType (e.g., HKWorkoutActivityTypeRunning)'),
    startDate: z.string().describe('ISO 8601 timestamp'),
    endDate: z.string().describe('ISO 8601 timestamp'),
    duration: z.number().positive().describe('Duration in minutes'),
    totalEnergyBurned: z.number().nonnegative().optional().describe('Calories burned (kcal)'),
    totalDistance: z.number().nonnegative().optional().describe('Distance in meters'),
    metadata: z.record(z.any()).optional().describe('Additional workout metadata'),
  })),
  lastSyncDate: z.string().optional().describe('Timestamp of last sync'),
});

/**
 * Map Apple Health workout types to Sage exercise categories
 * Reference: https://developer.apple.com/documentation/healthkit/hkworkoutactivitytype
 */
function mapWorkoutType(appleType: string): string {
  const mapping: Record<string, string> = {
    // Cardio
    'HKWorkoutActivityTypeRunning': 'cardio',
    'HKWorkoutActivityTypeWalking': 'cardio',
    'HKWorkoutActivityTypeCycling': 'cardio',
    'HKWorkoutActivityTypeSwimming': 'cardio',
    'HKWorkoutActivityTypeElliptical': 'cardio',
    'HKWorkoutActivityTypeRowing': 'cardio',
    'HKWorkoutActivityTypeStairClimbing': 'cardio',
    'HKWorkoutActivityTypeStepTraining': 'cardio',
    'HKWorkoutActivityTypeHiking': 'cardio',

    // Strength
    'HKWorkoutActivityTypeTraditionalStrengthTraining': 'strength',
    'HKWorkoutActivityTypeFunctionalStrengthTraining': 'strength',
    'HKWorkoutActivityTypeCoreTraining': 'strength',
    'HKWorkoutActivityTypeCrossTraining': 'strength',

    // Flexibility
    'HKWorkoutActivityTypeYoga': 'flexibility',
    'HKWorkoutActivityTypePilates': 'flexibility',
    'HKWorkoutActivityTypeFlexibility': 'flexibility',
    'HKWorkoutActivityTypeStretchin': 'flexibility',

    // Sports
    'HKWorkoutActivityTypeSoccer': 'sports',
    'HKWorkoutActivityTypeBasketball': 'sports',
    'HKWorkoutActivityTypeTennis': 'sports',
    'HKWorkoutActivityTypeGolf': 'sports',
    'HKWorkoutActivityTypeAmericanFootball': 'sports',
    'HKWorkoutActivityTypeBaseball': 'sports',
    'HKWorkoutActivityTypeVolleyball': 'sports',
    'HKWorkoutActivityTypeHockey': 'sports',
  };

  return mapping[appleType] || 'cardio'; // Default fallback to cardio
}

/**
 * Estimate exercise intensity from energy expenditure and duration
 * Based on kcal/minute thresholds
 */
function estimateIntensity(
  durationMinutes: number,
  energyKcal?: number
): 'light' | 'moderate' | 'intense' {
  if (!energyKcal || durationMinutes === 0) {
    return 'moderate'; // Default to moderate if no energy data
  }

  // Calculate kcal per minute
  const kcalPerMinute = energyKcal / durationMinutes;

  // Thresholds based on typical metabolic rates
  if (kcalPerMinute < 3) return 'light';      // < 180 kcal/hour
  if (kcalPerMinute < 6) return 'moderate';   // 180-360 kcal/hour
  return 'intense';                            // > 360 kcal/hour
}

/**
 * Format workout type for display
 * Removes HKWorkoutActivityType prefix and adds spaces before capitals
 */
function formatWorkoutType(appleType: string): string {
  return appleType
    .replace('HKWorkoutActivityType', '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
}

/**
 * POST /api/apple-health/workouts
 * Syncs workouts from Apple Health to Sage exercise logs
 */
router.post('/workouts', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    // Validate request body
    const { workouts, lastSyncDate } = appleHealthWorkoutSchema.parse(req.body);

    if (workouts.length === 0) {
      return res.json({
        success: true,
        imported: 0,
        total: 0,
        skipped: 0,
        message: 'No new workouts to sync'
      });
    }

    console.log(`[Apple Health] Syncing ${workouts.length} workouts for user ${userId}`);
    console.log(`[Apple Health] Last sync date: ${lastSyncDate || 'N/A'}`);

    // Transform workouts to exercise_logs format
    const exercises = workouts.map(w => {
      const durationMinutes = Math.round(w.duration);
      const activityType = mapWorkoutType(w.type);
      const intensity = estimateIntensity(durationMinutes, w.totalEnergyBurned);
      const formattedType = formatWorkoutType(w.type);

      // Build description with duration
      let description = `${formattedType} (${durationMinutes} min)`;

      // Build notes with additional metadata
      const noteParts: string[] = [];
      if (w.totalEnergyBurned) {
        noteParts.push(`${Math.round(w.totalEnergyBurned)} kcal burned`);
      }
      if (w.totalDistance) {
        const distanceKm = (w.totalDistance / 1000).toFixed(2);
        noteParts.push(`${distanceKm} km`);
      }
      const notes = noteParts.length > 0 ? noteParts.join(' • ') : null;

      return {
        user_id: userId,
        timestamp: w.startDate,
        workout_id: w.id,
        activity_type: activityType,
        duration_minutes: durationMinutes,
        intensity,
        description,
        notes,
        source: 'apple_health',
      };
    });

    // Build batch insert query with ON CONFLICT for deduplication
    // Parameterized query: 9 values per workout
    const values = exercises.map((_, i) => {
      const offset = i * 9;
      return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9})`;
    }).join(', ');

    const params = exercises.flatMap(e => [
      e.user_id,
      e.timestamp,
      e.workout_id,
      e.activity_type,
      e.duration_minutes,
      e.intensity,
      e.description,
      e.notes,
      e.source,
    ]);

    const insertQuery = `
      INSERT INTO exercise_logs
        (user_id, timestamp, workout_id, activity_type, duration_minutes, intensity, description, notes, source)
      VALUES ${values}
      ON CONFLICT (user_id, workout_id) DO NOTHING
      RETURNING id
    `;

    const result = await query(insertQuery, params);

    const imported = result.rowCount || 0;
    const skipped = workouts.length - imported;

    console.log(`[Apple Health] ✓ Imported ${imported}/${workouts.length} workouts (${skipped} duplicates skipped)`);

    res.json({
      success: true,
      imported,
      total: workouts.length,
      skipped,
      message: imported > 0
        ? `Successfully synced ${imported} new workout${imported === 1 ? '' : 's'}`
        : 'All workouts already synced',
    });
  } catch (error) {
    console.error('[Apple Health] Error syncing workouts:', error);
    next(error);
  }
});

/**
 * GET /api/apple-health/status
 * Returns Apple Health connection status and sync statistics
 */
router.get('/status', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const userId = authReq.user!.id;

    const result = await query(
      `SELECT
        COUNT(*) as total_workouts,
        MAX(timestamp) as last_workout,
        MIN(timestamp) as first_workout
       FROM exercise_logs
       WHERE user_id = $1 AND source = 'apple_health'`,
      [userId]
    );

    const stats = result.rows[0];
    const totalWorkouts = parseInt(stats.total_workouts);

    res.json({
      connected: totalWorkouts > 0,
      totalWorkouts,
      lastWorkout: stats.last_workout,
      firstWorkout: stats.first_workout,
    });
  } catch (error) {
    console.error('[Apple Health] Error fetching status:', error);
    next(error);
  }
});

export default router;
