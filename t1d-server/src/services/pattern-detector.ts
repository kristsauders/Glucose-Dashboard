/**
 * Background Pattern Detection Service
 *
 * Runs periodically to:
 * - Analyze meals/exercise/insulin without correlations
 * - Detect and store glucose patterns
 * - Update pattern confidence scores
 * - Prune weak patterns
 */

import { query } from '../config/database.js';
import { env } from '../config/env.js';
import {
  detectMealResponse,
  detectExerciseResponse,
  detectBasalAdequacy,
  calculatePatternConfidence,
} from './pattern-algorithms.js';
import { runAllExtendedAnalyses } from './pattern-algorithms-extended.js';

export class PatternDetector {
  private checkInterval = Number(env.PATTERN_DETECTION_INTERVAL); // configurable via env
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  /**
   * Start the background pattern detection service
   */
  start() {
    if (this.intervalId) {
      console.log('⚠️  Pattern detector is already running');
      return;
    }

    const intervalMin = Math.round(this.checkInterval / 60000);
    console.log(`🔍 Starting pattern detector service (${intervalMin}-minute intervals)`);

    // Run after 2 minutes to avoid startup congestion (staggered from proactive monitor at 5 min)
    setTimeout(() => {
      this.detectPatternsForAllUsers();

      // Then run every 30 minutes
      this.intervalId = setInterval(() => {
        this.detectPatternsForAllUsers();
      }, this.checkInterval);
    }, 2 * 60 * 1000);
  }

  /**
   * Stop the background pattern detection service
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 Pattern detector service stopped');
    }
  }

  /**
   * Detect patterns for all users
   */
  private async detectPatternsForAllUsers() {
    if (this.isRunning) {
      console.log('⏭️  Skipping pattern detection - previous run still in progress');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      console.log('\n🔍 Running pattern detection...');

      // Get all users
      const usersResult = await query('SELECT id FROM users');
      const users = usersResult.rows;

      if (users.length === 0) {
        console.log('  No users found');
        return;
      }

      console.log(`  Processing ${users.length} user(s)...`);

      let totalMealsAnalyzed = 0;
      let totalExerciseAnalyzed = 0;
      let totalBasalAnalyzed = 0;
      let totalPatternsUpdated = 0;
      let totalPatternsPruned = 0;

      // Process each user
      for (const user of users) {
        const userId = user.id;

        try {
          // 1. Analyze pending meals
          const mealsAnalyzed = await this.analyzePendingMeals(userId);
          totalMealsAnalyzed += mealsAnalyzed;

          // 2. Analyze pending exercise
          const exerciseAnalyzed = await this.analyzePendingExercise(userId);
          totalExerciseAnalyzed += exerciseAnalyzed;

          // 3. Analyze overnight basal
          const basalAnalyzed = await this.analyzeBasal(userId);
          totalBasalAnalyzed += basalAnalyzed;

          // 4. Update pattern confidence scores
          const patternsUpdated = await this.updatePatternConfidenceScores(userId);
          totalPatternsUpdated += patternsUpdated;

          // 5. Prune weak patterns
          const patternsPruned = await this.pruneWeakPatterns(userId);
          totalPatternsPruned += patternsPruned;

          // 6. Run extended analysis algorithms (caches to analysis_cache table)
          await runAllExtendedAnalyses(userId);
        } catch (error) {
          console.error(`  ❌ Error processing user ${userId}:`, error);
        }
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log('\n✅ Pattern detection complete');
      console.log(`  Duration: ${duration}s`);
      console.log(`  Meals analyzed: ${totalMealsAnalyzed}`);
      console.log(`  Exercise analyzed: ${totalExerciseAnalyzed}`);
      console.log(`  Basal nights analyzed: ${totalBasalAnalyzed}`);
      console.log(`  Patterns updated: ${totalPatternsUpdated}`);
      console.log(`  Patterns pruned: ${totalPatternsPruned}\n`);
    } catch (error) {
      console.error('❌ Pattern detection failed:', error);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Analyze meals without correlations (>4 hours old)
   */
  private async analyzePendingMeals(userId: string): Promise<number> {
    const fourHoursAgo = new Date();
    fourHoursAgo.setHours(fourHoursAgo.getHours() - 4);

    const result = await query(
      `
      SELECT id
      FROM meals
      WHERE user_id = $1
        AND correlation_id IS NULL
        AND timestamp <= $2
      ORDER BY timestamp DESC
      LIMIT 20
    `,
      [userId, fourHoursAgo.toISOString()]
    );

    let analyzed = 0;
    for (const meal of result.rows) {
      try {
        const correlation = await detectMealResponse(userId, meal.id);
        if (correlation) {
          analyzed++;
        }
      } catch (error) {
        console.error(`  ⚠️  Error analyzing meal ${meal.id}:`, error);
      }
    }

    return analyzed;
  }

  /**
   * Analyze exercise without correlations (>2 hours old)
   */
  private async analyzePendingExercise(userId: string): Promise<number> {
    const twoHoursAgo = new Date();
    twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

    const result = await query(
      `
      SELECT id
      FROM exercise_logs
      WHERE user_id = $1
        AND correlation_id IS NULL
        AND timestamp <= $2
      ORDER BY timestamp DESC
      LIMIT 20
    `,
      [userId, twoHoursAgo.toISOString()]
    );

    let analyzed = 0;
    for (const exercise of result.rows) {
      try {
        const correlation = await detectExerciseResponse(userId, exercise.id);
        if (correlation) {
          analyzed++;
        }
      } catch (error) {
        console.error(`  ⚠️  Error analyzing exercise ${exercise.id}:`, error);
      }
    }

    return analyzed;
  }

  /**
   * Analyze overnight basal for yesterday
   */
  private async analyzeBasal(userId: string): Promise<number> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    try {
      const analysis = await detectBasalAdequacy(userId, dateStr);
      return analysis ? 1 : 0;
    } catch (error) {
      console.error(`  ⚠️  Error analyzing basal for ${dateStr}:`, error);
      return 0;
    }
  }

  /**
   * Update confidence scores for all patterns
   */
  private async updatePatternConfidenceScores(userId: string): Promise<number> {
    const result = await query(
      `
      SELECT
        p.id,
        p.occurrence_count,
        p.last_seen,
        ARRAY_AGG(c.total_change) FILTER (WHERE c.total_change IS NOT NULL) as example_values
      FROM glucose_patterns p
      LEFT JOIN glucose_correlations c ON c.matched_pattern_id = p.id
      WHERE p.user_id = $1
      GROUP BY p.id
    `,
      [userId]
    );

    let updated = 0;
    for (const pattern of result.rows) {
      try {
        const newConfidence = calculatePatternConfidence({
          occurrence_count: pattern.occurrence_count,
          last_seen: new Date(pattern.last_seen),
          example_values: pattern.example_values || [],
        });

        await query(
          `
          UPDATE glucose_patterns
          SET confidence = $1, updated_at = NOW()
          WHERE id = $2
        `,
          [newConfidence, pattern.id]
        );

        updated++;
      } catch (error) {
        console.error(`  ⚠️  Error updating pattern ${pattern.id}:`, error);
      }
    }

    return updated;
  }

  /**
   * Prune weak patterns
   * Removes patterns with:
   * - Confidence < 0.2
   * - Last seen > 30 days ago
   * - Occurrence count < 3
   */
  private async pruneWeakPatterns(userId: string): Promise<number> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await query(
      `
      DELETE FROM glucose_patterns
      WHERE user_id = $1
        AND (
          confidence < 0.2
          OR (last_seen < $2 AND occurrence_count < 3)
        )
      RETURNING id
    `,
      [userId, thirtyDaysAgo.toISOString()]
    );

    return result.rows.length;
  }
}

// Export singleton instance
export const patternDetector = new PatternDetector();
