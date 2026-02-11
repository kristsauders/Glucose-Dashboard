import { query } from '../config/database.js';

export interface QuickAction {
  id: string;
  type: 'insulin' | 'meal' | 'exercise';
  label: string;
  icon: string;
  frequency: number;
  lastUsed: string;
  metadata: {
    // For insulin
    insulinType?: string;
    units?: number;
    purpose?: string;
    // For meal
    carbs?: number;
    description?: string;
    mealType?: string;
    // For exercise
    activityType?: string;
    duration?: number;
    intensity?: string;
  };
}

export class QuickActionsAnalyzer {
  /**
   * Get personalized quick action suggestions for a user
   */
  async getSuggestionsForUser(userId: string): Promise<QuickAction[]> {
    const [insulinSuggestions, mealSuggestions, exerciseSuggestions] = await Promise.all([
      this.getTopInsulinDoses(userId),
      this.getTopMealPatterns(userId),
      this.getTopExercisePatterns(userId),
    ]);

    // Combine and sort by weighted frequency (recent items get 1.5x boost)
    const allSuggestions = [
      ...insulinSuggestions,
      ...mealSuggestions,
      ...exerciseSuggestions,
    ].sort((a, b) => {
      const aRecent = this.isRecent(a.lastUsed) ? a.frequency * 1.5 : a.frequency;
      const bRecent = this.isRecent(b.lastUsed) ? b.frequency * 1.5 : b.frequency;
      return bRecent - aRecent;
    });

    // Return top 6 suggestions
    return allSuggestions.slice(0, 6);
  }

  /**
   * Get most common insulin doses from last 30 days
   */
  private async getTopInsulinDoses(userId: string): Promise<QuickAction[]> {
    const result = await query(
      `SELECT
        insulin_type,
        units,
        purpose,
        COUNT(*) as frequency,
        MAX(timestamp) as last_used
      FROM insulin_doses
      WHERE user_id = $1
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY insulin_type, units, purpose
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 3`,
      [userId]
    );

    return result.rows.map((row) => ({
      id: `insulin_${row.insulin_type}_${row.units}_${row.purpose}`.toLowerCase().replace(/\s+/g, '_'),
      type: 'insulin' as const,
      label: `${row.units}u ${row.insulin_type}`,
      icon: 'syringe',
      frequency: parseInt(row.frequency),
      lastUsed: row.last_used.toISOString(),
      metadata: {
        insulinType: row.insulin_type,
        units: parseInt(row.units),
        purpose: row.purpose,
      },
    }));
  }

  /**
   * Get most common meal/carb amounts from last 30 days
   */
  private async getTopMealPatterns(userId: string): Promise<QuickAction[]> {
    const result = await query(
      `SELECT
        ROUND(carbs / 10) * 10 as rounded_carbs,
        meal_type,
        COUNT(*) as frequency,
        MAX(timestamp) as last_used
      FROM meals
      WHERE user_id = $1
        AND timestamp >= NOW() - INTERVAL '30 days'
        AND carbs IS NOT NULL
      GROUP BY rounded_carbs, meal_type
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 2`,
      [userId]
    );

    return result.rows.map((row) => {
      const carbs = parseInt(row.rounded_carbs);
      return {
        id: `meal_${carbs}g_${row.meal_type || 'snack'}`.toLowerCase().replace(/\s+/g, '_'),
        type: 'meal' as const,
        label: `${carbs}g Carbs`,
        icon: 'utensils',
        frequency: parseInt(row.frequency),
        lastUsed: row.last_used.toISOString(),
        metadata: {
          carbs,
          description: `${carbs}g carbs`,
          mealType: row.meal_type || 'snack',
        },
      };
    });
  }

  /**
   * Get most common exercise patterns from last 30 days
   */
  private async getTopExercisePatterns(userId: string): Promise<QuickAction[]> {
    const result = await query(
      `SELECT
        activity_type,
        ROUND(duration_minutes / 15) * 15 as rounded_duration,
        intensity,
        COUNT(*) as frequency,
        MAX(timestamp) as last_used
      FROM exercise_logs
      WHERE user_id = $1
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY activity_type, rounded_duration, intensity
      HAVING COUNT(*) >= 2
      ORDER BY COUNT(*) DESC
      LIMIT 2`,
      [userId]
    );

    return result.rows.map((row) => {
      const duration = parseInt(row.rounded_duration);
      return {
        id: `exercise_${row.activity_type}_${duration}`.toLowerCase().replace(/\s+/g, '_'),
        type: 'exercise' as const,
        label: `${row.activity_type} ${duration}m`,
        icon: 'activity',
        frequency: parseInt(row.frequency),
        lastUsed: row.last_used.toISOString(),
        metadata: {
          activityType: row.activity_type,
          duration,
          intensity: row.intensity,
          description: `${row.activity_type} (${duration} min)`,
        },
      };
    });
  }

  /**
   * Check if a timestamp is within the last 7 days (for recency boost)
   */
  private isRecent(timestamp: string): boolean {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    return new Date(timestamp) >= sevenDaysAgo;
  }
}

export const quickActionsAnalyzer = new QuickActionsAnalyzer();
