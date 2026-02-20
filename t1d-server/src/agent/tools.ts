import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import fetch from 'node-fetch';
import { query } from '../config/database.js';
import { env } from '../config/env.js';
import { discordService } from '../services/discord.js';
import { pushNotificationService, type ActionButton } from '../services/push-notification-service.js';
import { reportingService } from '../services/reporting-service.js';
import {
  detectMealResponse,
  detectBasalAdequacy,
  detectExerciseResponse,
} from '../services/pattern-algorithms.js';
import {
  analyzeTrend,
  detectAnomalies,
  comparePeriods,
} from '../services/advanced-analysis.js';
import { convertToUserTimezone } from '../utils/timezone.js';
import { researchService } from '../services/research-service.js';
import { researchMonitor } from '../services/research-monitor.js';
import { ReportGenerator } from '../services/report-generator.js';
import { executeSafeReadOnlyQuery } from '../utils/safe-sql-executor.js';
import { executePython } from '../services/python-executor.js';

// Helper to construct API URL using the correct port
const getApiUrl = () => `http://localhost:${env.PORT}`;

/**
 * Tool: Get recent glucose readings
 */
export const getRecentGlucoseTool = new DynamicStructuredTool({
  name: 'get_recent_glucose',
  description: `Get glucose readings for the user. Glucose history is NOT pre-loaded — always call this for past readings. All results returned oldest→newest.

Readings are stored at the sensor's native interval (up to 1/min for Libre 3 = ~60/hour, ~1440/day).

Two modes:
1. hoursBack — simple recent window. limit should be hoursBack * 60 to cover all readings.
2. startDate / endDate — time range in the user's local timezone:
   - "YYYY-MM-DD" covers the full calendar day; use limit=1440 for a full day
   - "YYYY-MM-DD HH:MM" (24h, NO timezone suffix) for an exact local time — use this for meal windows
   - A 3-hour meal window needs limit=180+

If this tool doesn't return the data you need on the first try, use execute_sql directly — do NOT retry with different arguments.

Examples:
- Last 2 hours → hoursBack=2, limit=120
- This morning overall → hoursBack=10, limit=600
- Yesterday's breakfast (7am-10am) → startDate="2026-02-19 07:00" endDate="2026-02-19 10:00" limit=200
- Yesterday's dinner (6pm-9pm) → startDate="2026-02-19 18:00" endDate="2026-02-19 21:00" limit=200
- All of yesterday → startDate="2026-02-19" endDate="2026-02-19" limit=1440`,
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    limit: z.number().default(120).describe('Number of readings to return (default 120 = ~2 hours, max 1440). Set to hoursBack*60 for hoursBack queries, or time-window-minutes for date range queries.'),
    hoursBack: z.number().optional().describe('Fetch readings from the last N hours. Takes precedence over startDate/endDate.'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
    startDate: z.string().optional().describe('Start of time range in user\'s local timezone. "YYYY-MM-DD" = midnight, "YYYY-MM-DD HH:MM" = exact time (no timezone suffix).'),
    endDate: z.string().optional().describe('End of time range in user\'s local timezone. "YYYY-MM-DD" = end of day, "YYYY-MM-DD HH:MM" = exact time (exclusive, no timezone suffix).'),
  }),
  func: async ({ userId, limit, hoursBack, userTimezone, startDate, endDate }) => {
    const timezone = userTimezone || 'America/New_York';

    // Detect if a date string includes a time component (length > 10 means "YYYY-MM-DD HH:MM" or similar)
    const hasTime = (s: string) => s.trim().length > 10;

    const queryParams: any[] = [userId];
    let paramIndex = 2;
    let dateFilter = '';

    if (hoursBack) {
      // hoursBack takes priority — fetch a specific recent window
      dateFilter += ` AND timestamp >= NOW() - INTERVAL '${Math.ceil(hoursBack)} hours'`;
    } else {
      if (startDate) {
        if (hasTime(startDate)) {
          // Exact local datetime — treat as wall-clock time in user's timezone
          dateFilter += ` AND timestamp >= ($${paramIndex}::timestamp) AT TIME ZONE '${timezone}'`;
        } else {
          // Date only — use midnight of that day in user's local timezone
          dateFilter += ` AND timestamp >= ($${paramIndex}::date::timestamp) AT TIME ZONE '${timezone}'`;
        }
        queryParams.push(startDate);
        paramIndex++;
      }
      if (endDate) {
        if (hasTime(endDate)) {
          // Exact local datetime — exclusive upper bound, no day offset needed
          dateFilter += ` AND timestamp < ($${paramIndex}::timestamp) AT TIME ZONE '${timezone}'`;
        } else {
          // Date only — end of that calendar day (midnight of next day) in user's local timezone
          dateFilter += ` AND timestamp < ($${paramIndex}::date::timestamp + INTERVAL '1 day') AT TIME ZONE '${timezone}'`;
        }
        queryParams.push(endDate);
        paramIndex++;
      }
    }

    const effectiveLimit = Math.min(limit, 1440);
    queryParams.push(effectiveLimit);

    // Date-range queries use ASC order so the limit cuts off the END of the period,
    // not the beginning — ensuring morning data (e.g. breakfast) is always included.
    // hoursBack and default queries use DESC + reverse to get most-recent-first then flip.
    const dateRangeMode = !hoursBack && (startDate || endDate);
    const orderDir = dateRangeMode ? 'ASC' : 'DESC';

    const result = await query(
      `SELECT timestamp, glucose, device, trend
       FROM glucose_readings
       WHERE user_id = $1
       ${dateFilter}
       ORDER BY timestamp ${orderDir}
       LIMIT $${paramIndex}`,
      queryParams
    );

    // Date-range results are already chronological (ASC). Other queries need reversal.
    const rows = dateRangeMode ? result.rows : [...result.rows].reverse();

    return JSON.stringify({
      count: rows.length,
      hoursBack: hoursBack || null,
      startDate: startDate || null,
      endDate: endDate || null,
      readings: rows.map(r => ({
        timestamp: convertToUserTimezone(r.timestamp, timezone),
        glucose: parseFloat(r.glucose),
        device: r.device,
        trend: r.trend,
      })),
    });
  },
});

/**
 * Tool: Get glucose statistics
 */
export const getGlucoseStatsTool = new DynamicStructuredTool({
  name: 'get_glucose_stats',
  description: 'Calculate glucose statistics (avg, min, max, std dev, time in range, etc.) for a specified time period.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    days: z.number().default(7).describe('Number of days to analyze (default 7)'),
  }),
  func: async ({ userId, days }) => {
    // Get statistics
    const statsResult = await query(
      `SELECT
        COUNT(*) as count,
        AVG(glucose) as avg_glucose,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose,
        STDDEV(glucose) as std_dev
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    // Get time in range
    const tirResult = await query(
      `SELECT
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) as in_range_70_180,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 140) as in_range_70_140,
        COUNT(*) FILTER (WHERE glucose < 70) as below_70,
        COUNT(*) FILTER (WHERE glucose > 180) as above_180
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    const stats = statsResult.rows[0];
    const tir = tirResult.rows[0];
    const total = parseInt(stats.count);

    const avgGlucose = parseFloat(stats.avg_glucose || 0);
    const stdDev = parseFloat(stats.std_dev || 0);

    return JSON.stringify({
      period: `${days} days`,
      totalReadings: total,
      avgGlucose: avgGlucose.toFixed(1),
      minGlucose: parseFloat(stats.min_glucose || 0).toFixed(1),
      maxGlucose: parseFloat(stats.max_glucose || 0).toFixed(1),
      stdDev: stdDev.toFixed(1),
      cv: avgGlucose ? ((stdDev / avgGlucose) * 100).toFixed(1) : 0,
      estimatedA1c: avgGlucose ? ((avgGlucose + 46.7) / 28.7).toFixed(1) : 0,
      timeInRange: {
        '70-180': total > 0 ? ((parseInt(tir.in_range_70_180) / total) * 100).toFixed(1) : 0,
        '70-140': total > 0 ? ((parseInt(tir.in_range_70_140) / total) * 100).toFixed(1) : 0,
        below70: total > 0 ? ((parseInt(tir.below_70) / total) * 100).toFixed(1) : 0,
        above180: total > 0 ? ((parseInt(tir.above_180) / total) * 100).toFixed(1) : 0,
      },
    });
  },
});

/**
 * Tool: Analyze overnight/fasting glucose
 */
export const analyzeOvernightTool = new DynamicStructuredTool({
  name: 'analyze_overnight',
  description: 'Analyze overnight glucose patterns. By default analyzes midnight-7am, but you can customize the time window. Returns trends (rising/falling/flat), stability metrics (CV, range), spikes/drops, and basal insulin insights.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
    days: z.number().default(7).describe('Number of days to analyze'),
    startHour: z.number().min(0).max(23).optional().describe('Start hour in 24-hour format (0-23), default 0 (midnight)'),
    endHour: z.number().min(0).max(23).optional().describe('End hour in 24-hour format (0-23), default 7 (7am)'),
    date: z.string().optional().describe('Specific date to analyze in YYYY-MM-DD format. If provided, only analyzes this single date instead of last N days.'),
  }),
  func: async ({ userId, userTimezone, days, startHour = 0, endHour = 7, date }) => {
    const tz = userTimezone || 'America/New_York';

    // Build date filter based on whether specific date is provided
    const dateFilter = date
      ? `AND DATE(timezone($2, timestamp)) = $3`
      : `AND timestamp >= NOW() - INTERVAL '${days} days'`;

    const queryParams = date ? [userId, tz, date] : [userId, tz];

    // Get all readings in the specified time window with timestamps
    const result = await query(
      `SELECT
        DATE(timezone($2, timestamp)) as date,
        timezone($2, timestamp) as local_time,
        glucose,
        EXTRACT(EPOCH FROM timezone($2, timestamp)) as epoch_time
       FROM glucose_readings
       WHERE user_id = $1
         ${dateFilter}
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) >= ${startHour}
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) < ${endHour}
       ORDER BY timestamp`,
      queryParams
    );

    if (result.rows.length === 0) {
      return JSON.stringify({ error: 'No overnight data found' });
    }

    // Group readings by night
    const nightsMap = new Map<string, Array<{ time: number; glucose: number }>>();
    for (const row of result.rows) {
      // CRITICAL: Convert date to string for Map key (Date objects don't work as Map keys)
      const date = row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date);
      if (!nightsMap.has(date)) {
        nightsMap.set(date, []);
      }
      nightsMap.get(date)!.push({
        time: parseFloat(row.epoch_time),
        glucose: parseFloat(row.glucose),
      });
    }

    // Analyze each night
    const nights = [];
    for (const [date, readings] of nightsMap.entries()) {
      if (readings.length < 4) continue; // Need at least 4 readings (1 hour of data)

      // Filter outliers using MAD (Median Absolute Deviation) - more robust than standard deviation
      // This removes occasional bad readings (sensor glitches) without skipping entire nights
      const glucoseValues = readings.map(r => r.glucose).sort((a, b) => a - b);
      const median = glucoseValues[Math.floor(glucoseValues.length / 2)];
      const deviations = glucoseValues.map(val => Math.abs(val - median));
      const mad = deviations.sort((a, b) => a - b)[Math.floor(deviations.length / 2)];

      // Filter out extreme outliers (>3.5 MAD from median, typical threshold for outlier detection)
      // But keep at least 4 readings to avoid removing real volatility
      let cleanedReadings = readings;
      if (mad > 0) { // Only filter if there's actual variation
        const filtered = readings.filter(r => Math.abs(r.glucose - median) <= 3.5 * mad);
        if (filtered.length >= 4) {
          cleanedReadings = filtered;
        }
      }

      // CRITICAL FIX: Normalize times to start from 0 to avoid numerical overflow
      // Sort by time and make times relative to first reading
      cleanedReadings = cleanedReadings.sort((a, b) => a.time - b.time);
      const startTime = cleanedReadings[0].time;
      const normalizedReadings = cleanedReadings.map(r => ({
        time: r.time - startTime, // Now in seconds from start of night
        glucose: r.glucose
      }));

      // Calculate linear regression slope to determine trend using normalized times
      const n = normalizedReadings.length;
      const sumX = normalizedReadings.reduce((sum, r) => sum + r.time, 0);
      const sumY = normalizedReadings.reduce((sum, r) => sum + r.glucose, 0);
      const sumXY = normalizedReadings.reduce((sum, r) => sum + r.time * r.glucose, 0);
      const sumX2 = normalizedReadings.reduce((sum, r) => sum + r.time * r.time, 0);

      // Calculate slope with safety check for division by zero
      const denominator = (n * sumX2 - sumX * sumX);
      let slope = 0;
      let slopePerHour = 0;

      if (Math.abs(denominator) > 0.0001) {
        slope = (n * sumXY - sumX * sumY) / denominator;
        slopePerHour = slope * 3600; // Convert from per-second to per-hour

        // Sanity check: if slope is unreasonably large, data quality issue
        if (!isFinite(slopePerHour) || Math.abs(slopePerHour) > 1000) {
          slopePerHour = 0;
        }
      }

      // Calculate stats
      const avgGlucose = sumY / n;
      const minGlucose = Math.min(...normalizedReadings.map(r => r.glucose));
      const maxGlucose = Math.max(...normalizedReadings.map(r => r.glucose));
      const range = maxGlucose - minGlucose;

      // Coefficient of variation for stability
      const stdDev = Math.sqrt(
        normalizedReadings.reduce((sum, r) => sum + Math.pow(r.glucose - avgGlucose, 2), 0) / n
      );

      // Calculate CV with safety check for division by zero
      let cv = 0;
      if (avgGlucose > 10) { // Only calculate CV if average glucose is reasonable
        cv = (stdDev / avgGlucose) * 100;
        // Sanity check: CV should not exceed 100% realistically for overnight glucose
        if (!isFinite(cv) || cv > 100) {
          cv = 100;
        }
      }

      // First hour vs last hour comparison (using first/last quarter of readings)
      const firstQuarterReadings = normalizedReadings.slice(0, Math.ceil(n / 4));
      const lastQuarterReadings = normalizedReadings.slice(-Math.ceil(n / 4));
      const firstQuarterAvg = firstQuarterReadings.reduce((sum, r) => sum + r.glucose, 0) / firstQuarterReadings.length;
      const lastQuarterAvg = lastQuarterReadings.reduce((sum, r) => sum + r.glucose, 0) / lastQuarterReadings.length;
      const change = lastQuarterAvg - firstQuarterAvg;

      // Determine trend category
      let trend: string;
      if (Math.abs(slopePerHour) < 3) {
        trend = 'flat';
      } else if (slopePerHour > 0) {
        trend = slopePerHour > 8 ? 'rising_fast' : 'rising';
      } else {
        trend = slopePerHour < -8 ? 'falling_fast' : 'falling';
      }

      // Detect spikes/drops (using 20mg/dL threshold - more meaningful than percentage)
      let hasSpikes = false;
      let hasDrops = false;
      for (const reading of normalizedReadings) {
        if (reading.glucose > avgGlucose + 20) hasSpikes = true;
        if (reading.glucose < avgGlucose - 20) hasDrops = true;
      }

      nights.push({
        date,
        avgGlucose: avgGlucose.toFixed(1),
        minGlucose: minGlucose.toFixed(1),
        maxGlucose: maxGlucose.toFixed(1),
        range: range.toFixed(1),
        trend,
        slopePerHour: slopePerHour.toFixed(2),
        firstQuarterAvg: firstQuarterAvg.toFixed(1),
        lastQuarterAvg: lastQuarterAvg.toFixed(1),
        change: change.toFixed(1),
        cv: cv.toFixed(1),
        stability: cv < 10 ? 'excellent' : cv < 15 ? 'good' : cv < 20 ? 'moderate' : 'poor',
        hasSpikes,
        hasDrops,
        readingCount: n,
      });
    }

    // Overall summary
    const overallAvg = nights.reduce((sum, n) => sum + parseFloat(n.avgGlucose), 0) / nights.length;
    const overallCV = nights.reduce((sum, n) => sum + parseFloat(n.cv), 0) / nights.length;
    const flatNights = nights.filter(n => n.trend === 'flat').length;
    const risingNights = nights.filter(n => n.trend === 'rising' || n.trend === 'rising_fast').length;
    const fallingNights = nights.filter(n => n.trend === 'falling' || n.trend === 'falling_fast').length;

    // Basal assessment
    let basalAssessment: string;
    if (risingNights > nights.length * 0.6) {
      basalAssessment = 'Basal likely too low - consistently rising overnight';
    } else if (fallingNights > nights.length * 0.6) {
      basalAssessment = 'Basal likely too high - consistently falling overnight';
    } else if (flatNights > nights.length * 0.7 && overallCV < 15) {
      basalAssessment = 'Basal appears well-tuned - stable and flat overnight';
    } else {
      basalAssessment = 'Basal needs evaluation - inconsistent overnight patterns';
    }

    return JSON.stringify({
      period: `${days} days`,
      nightsAnalyzed: nights.length,
      summary: {
        overallAvgGlucose: overallAvg.toFixed(1),
        overallCV: overallCV.toFixed(1),
        overallStability: overallCV < 10 ? 'excellent' : overallCV < 15 ? 'good' : overallCV < 20 ? 'moderate' : 'poor',
        flatNights,
        risingNights,
        fallingNights,
        basalAssessment,
      },
      nights,
    });
  },
});

/**
 * Tool: Detect glucose patterns
 */
export const detectPatternsTool = new DynamicStructuredTool({
  name: 'detect_patterns',
  description: 'Detect common glucose patterns like dawn phenomenon, post-meal spikes, overnight lows, etc. Customize time windows for dawn and overnight periods.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
    days: z.number().default(14).describe('Number of days to analyze'),
    dawnStart: z.number().min(0).max(23).optional().describe('Start hour for dawn phenomenon detection (default 4am)'),
    dawnEnd: z.number().min(0).max(23).optional().describe('End hour for dawn phenomenon detection (default 8am)'),
    overnightStart: z.number().min(0).max(23).optional().describe('Start hour for overnight lows detection (default 0 midnight)'),
    overnightEnd: z.number().min(0).max(23).optional().describe('End hour for overnight lows detection (default 6am)'),
  }),
  func: async ({ userId, userTimezone, days, dawnStart = 4, dawnEnd = 8, overnightStart = 0, overnightEnd = 6 }) => {
    const tz = userTimezone || 'America/New_York';
    const patterns: string[] = [];

    // Check for dawn phenomenon (rising glucose during dawn window in user's LOCAL timezone)
    const dawnResult = await query(
      `WITH hourly_avg AS (
        SELECT
          EXTRACT(HOUR FROM timezone($2, timestamp)) as hour,
          AVG(glucose) as avg_glucose
        FROM glucose_readings
        WHERE user_id = $1
          AND timestamp >= NOW() - INTERVAL '${days} days'
          AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN ${dawnStart} AND ${dawnEnd}
        GROUP BY EXTRACT(HOUR FROM timezone($2, timestamp))
        ORDER BY hour
      )
      SELECT hour, avg_glucose FROM hourly_avg`,
      [userId, tz]
    );

    if (dawnResult.rows.length >= 2) {
      const first = parseFloat(dawnResult.rows[0].avg_glucose);
      const last = parseFloat(dawnResult.rows[dawnResult.rows.length - 1].avg_glucose);
      if (last - first > 20) {
        patterns.push(`Dawn Phenomenon: Glucose rises ${(last - first).toFixed(0)} mg/dL from ${dawnStart}am-${dawnEnd}am`);
      }
    }

    // Check for overnight lows (below 70 during overnight window in user's LOCAL timezone)
    const lowsResult = await query(
      `SELECT COUNT(*) as low_count,
              COUNT(*) * 100.0 / NULLIF((
                SELECT COUNT(*)
                FROM glucose_readings
                WHERE user_id = $1
                  AND timestamp >= NOW() - INTERVAL '${days} days'
                  AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN ${overnightStart} AND ${overnightEnd}
              ), 0) as low_percentage
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN ${overnightStart} AND ${overnightEnd}
         AND glucose < 70`,
      [userId, tz]
    );

    const lowCount = parseInt(lowsResult.rows[0].low_count);
    const lowPct = parseFloat(lowsResult.rows[0].low_percentage || 0);
    if (lowCount > 0 && lowPct > 5) {
      patterns.push(`Overnight Lows: ${lowPct.toFixed(1)}% of overnight readings (${overnightStart}-${overnightEnd}) below 70 mg/dL`);
    }

    // Check for high variability (CV > 36%)
    const cvResult = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'`,
      [userId]
    );

    const avg = parseFloat(cvResult.rows[0].avg_glucose || 0);
    const std = parseFloat(cvResult.rows[0].std_dev || 0);
    const cv = avg > 0 ? (std / avg) * 100 : 0;

    if (cv > 36) {
      patterns.push(`High Variability: CV of ${cv.toFixed(1)}% (target: <36%)`);
    }

    return JSON.stringify({
      period: `${days} days`,
      patternsDetected: patterns.length,
      patterns,
      cv: cv.toFixed(1),
    });
  },
});

/**
 * Tool: Compare time periods
 */
export const comparePeriodsTool = new DynamicStructuredTool({
  name: 'compare_periods',
  description: 'Compare glucose metrics between two time periods. Use either relative days or specific date ranges.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    recentDays: z.number().default(7).describe('Recent period in days (default: 7). Ignored if period1Start provided.'),
    comparisonDays: z.number().default(14).describe('Comparison period in days (default: 14). Ignored if period2Start provided.'),
    period1Start: z.string().optional().describe('Period 1 start date (YYYY-MM-DD)'),
    period1End: z.string().optional().describe('Period 1 end date (YYYY-MM-DD)'),
    period2Start: z.string().optional().describe('Period 2 start date (YYYY-MM-DD)'),
    period2End: z.string().optional().describe('Period 2 end date (YYYY-MM-DD)'),
  }),
  func: async ({ userId, recentDays, comparisonDays, period1Start, period1End, period2Start, period2End }) => {
    // Build period 1 filter
    const period1Filter = period1Start && period1End
      ? `AND timestamp >= '${period1Start}'::date AND timestamp < '${period1End}'::date + INTERVAL '1 day'`
      : `AND timestamp >= NOW() - INTERVAL '${recentDays} days'`;

    // Build period 2 filter
    const period2Filter = period2Start && period2End
      ? `AND timestamp >= '${period2Start}'::date AND timestamp < '${period2End}'::date + INTERVAL '1 day'`
      : `AND timestamp >= NOW() - INTERVAL '${comparisonDays} days' AND timestamp < NOW() - INTERVAL '${recentDays} days'`;

    // Recent/Period 1
    const recentResult = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         ${period1Filter}`,
      [userId]
    );

    // Comparison/Period 2
    const compResult = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         ${period2Filter}`,
      [userId]
    );

    const recent = recentResult.rows[0];
    const comparison = compResult.rows[0];

    const avgDiff = parseFloat(recent.avg_glucose) - parseFloat(comparison.avg_glucose);
    const tirDiff = parseFloat(recent.tir || 0) - parseFloat(comparison.tir || 0);

    return JSON.stringify({
      recentPeriod: {
        days: recentDays,
        avgGlucose: parseFloat(recent.avg_glucose).toFixed(1),
        stdDev: parseFloat(recent.std_dev).toFixed(1),
        timeInRange: parseFloat(recent.tir || 0).toFixed(1),
      },
      comparisonPeriod: {
        days: comparisonDays,
        avgGlucose: parseFloat(comparison.avg_glucose).toFixed(1),
        stdDev: parseFloat(comparison.std_dev).toFixed(1),
        timeInRange: parseFloat(comparison.tir || 0).toFixed(1),
      },
      changes: {
        avgGlucose: avgDiff > 0 ? `+${avgDiff.toFixed(1)}` : avgDiff.toFixed(1),
        timeInRange: tirDiff > 0 ? `+${tirDiff.toFixed(1)}%` : `${tirDiff.toFixed(1)}%`,
        trend: avgDiff < -5 ? 'improving' : avgDiff > 5 ? 'worsening' : 'stable',
      },
    });
  },
});

/**
 * Tool: Store user memory/fact
 */
export const storeMemoryTool = new DynamicStructuredTool({
  name: 'store_user_memory',
  description: 'Store a fact or preference about the user for long-term memory (habits, preferences, medical info). This persists across all conversations.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    key: z.string()
      .min(1)
      .max(50)
      .regex(/^[a-z0-9_]+$/)
      .describe('Memory key (lowercase, numbers, underscores only. e.g., "breakfast_time", "exercise_routine", "insulin_type")'),
    value: z.object({
      fact: z.string().describe('The fact or preference to store'),
      category: z.enum(['habit', 'medical', 'timing', 'preference', 'other'])
        .describe('Category of the memory'),
      confidence: z.number().min(0).max(1).default(0.8)
        .describe('How confident (0-1) you are in this memory'),
    }).describe('Memory data'),
  }),
  func: async ({ userId, key, value }) => {
    try {
      const result = await query(
        `INSERT INTO agent_memory (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT(user_id, key) DO UPDATE
         SET value = EXCLUDED.value,
             updated_at = NOW()
         RETURNING id, key, value, updated_at`,
        [userId, key, JSON.stringify(value)]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Failed to store memory',
        });
      }

      return JSON.stringify({
        success: true,
        key,
        stored: result.rows[0].value,
        timestamp: result.rows[0].updated_at,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Retrieve user memories
 */
export const retrieveMemoryTool = new DynamicStructuredTool({
  name: 'retrieve_user_memory',
  description: 'Retrieve stored facts/memories about the user. Can get specific memory by key or all memories. Always check this before giving advice.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    key: z.string().optional()
      .describe('Optional specific memory key. If omitted, returns all memories.'),
  }),
  func: async ({ userId, key }) => {
    try {
      let result;

      if (key) {
        // Get specific memory
        result = await query(
          `SELECT key, value, updated_at
           FROM agent_memory
           WHERE user_id = $1 AND key = $2`,
          [userId, key]
        );
      } else {
        // Get all memories
        result = await query(
          `SELECT key, value, updated_at
           FROM agent_memory
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [userId]
        );
      }

      if (result.rows.length === 0) {
        return JSON.stringify({
          found: false,
          message: key ? `No memory found for key: ${key}` : 'No memories stored',
        });
      }

      // Parse stored JSON values
      const memories = result.rows.map(row => ({
        key: row.key,
        ...row.value,
        updated_at: row.updated_at,
      }));

      return JSON.stringify({
        found: true,
        count: memories.length,
        memories: key ? memories[0] : memories,
      });
    } catch (error) {
      return JSON.stringify({
        found: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Delete user memory
 */
export const deleteMemoryTool = new DynamicStructuredTool({
  name: 'delete_user_memory',
  description: 'Delete a specific stored memory. Use when user asks to forget something or when correcting outdated information.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    key: z.string()
      .describe('Memory key to delete'),
  }),
  func: async ({ userId, key }) => {
    try {
      const result = await query(
        `DELETE FROM agent_memory
         WHERE user_id = $1 AND key = $2
         RETURNING key`,
        [userId, key]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          message: `No memory found with key: ${key}`,
        });
      }

      return JSON.stringify({
        success: true,
        deletedKey: result.rows[0].key,
        message: `Memory "${key}" deleted successfully`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Analyze live glucose trend
 */
export const analyzeLiveTrendTool = new DynamicStructuredTool({
  name: 'analyze_live_trend',
  description: 'Analyze recent glucose trend (last 1-3 hours) to detect rapid changes, patterns, or concerning trends.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    hours: z.number().default(2).describe('Hours to analyze (default 2)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, hours, userTimezone }) => {
    const result = await query(
      `SELECT timestamp, glucose, trend
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${hours} hours'
       ORDER BY timestamp ASC`,
      [userId]
    );

    if (result.rows.length === 0) {
      return JSON.stringify({
        hasData: false,
        message: 'No recent glucose readings available',
      });
    }

    const timezone = userTimezone || 'America/New_York';

    const readings = result.rows.map(r => ({
      timestamp: convertToUserTimezone(r.timestamp, timezone),
      glucose: parseFloat(r.glucose),
      trend: r.trend,
    }));

    const latest = readings[readings.length - 1];
    const oldest = readings[0];
    const change = latest.glucose - oldest.glucose;
    const changeRate = change / hours;

    // Calculate moving average
    const recentAvg = readings.slice(-6).reduce((sum, r) => sum + r.glucose, 0) / Math.min(6, readings.length);

    // Detect if rising or falling rapidly
    const isRapidRise = changeRate > 10; // Rising > 10 mg/dL per hour
    const isRapidFall = changeRate < -10; // Falling > 10 mg/dL per hour

    return JSON.stringify({
      hasData: true,
      period: `${hours} hours`,
      readingCount: readings.length,
      latest: {
        timestamp: latest.timestamp,
        glucose: latest.glucose,
        trend: latest.trend,
      },
      trend: {
        change: change.toFixed(1),
        changeRate: changeRate.toFixed(1),
        direction: change > 0 ? 'rising' : change < 0 ? 'falling' : 'stable',
        isRapidRise,
        isRapidFall,
      },
      recentAvg: recentAvg.toFixed(1),
      readings: readings.slice(-10), // Last 10 readings for context
    });
  },
});

/**
 * Tool: Check alert conditions
 */
export const checkAlertConditionsTool = new DynamicStructuredTool({
  name: 'check_alert_conditions',
  description: 'Check if any conditions warrant proactive outreach (not critical alerts). Customize the time window to check. Returns insights about patterns worth discussing.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
    hours: z.number().min(1).max(168).optional().describe('Number of hours to check (default: 24, max: 168 for 1 week)'),
  }),
  func: async ({ userId, userTimezone, hours = 24 }) => {
    const tz = userTimezone || 'America/New_York';
    const conditions = [];

    // Check recent pattern
    const recentStats = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir,
        COUNT(*) FILTER (WHERE glucose < 70) as low_count,
        COUNT(*) FILTER (WHERE glucose > 250) as high_count
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${hours} hours'`,
      [userId]
    );

    const stats = recentStats.rows[0];
    const avgGlucose = parseFloat(stats.avg_glucose || 0);
    const tir = parseFloat(stats.tir || 0);
    const lowCount = parseInt(stats.low_count || 0);
    const highCount = parseInt(stats.high_count || 0);

    // Check for patterns worth discussing
    if (tir > 0 && tir < 50) {
      conditions.push({
        type: 'low_tir',
        severity: 'medium',
        message: `Time in range is ${tir.toFixed(1)}% over the last 24 hours`,
        data: { tir, avgGlucose },
      });
    }

    if (lowCount > 3) {
      conditions.push({
        type: 'frequent_lows',
        severity: 'medium',
        message: `${lowCount} readings below 70 mg/dL in the last 24 hours`,
        data: { lowCount },
      });
    }

    if (highCount > 10) {
      conditions.push({
        type: 'frequent_highs',
        severity: 'low',
        message: `${highCount} readings above 250 mg/dL in the last 24 hours`,
        data: { highCount },
      });
    }

    // Check for repeated patterns (dawn phenomenon, post-meal spikes) - using user's LOCAL timezone
    const dawnCheck = await query(
      `SELECT AVG(glucose) as dawn_avg
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '7 days'
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN 5 AND 8`,
      [userId, tz]
    );

    const dawnAvg = parseFloat(dawnCheck.rows[0]?.dawn_avg || 0);
    if (dawnAvg > 150) {
      conditions.push({
        type: 'dawn_phenomenon',
        severity: 'low',
        message: `Morning glucose averaging ${dawnAvg.toFixed(1)} mg/dL`,
        data: { dawnAvg },
      });
    }

    return JSON.stringify({
      hasConditions: conditions.length > 0,
      conditionCount: conditions.length,
      conditions,
    });
  },
});

/**
 * Tool: Get recent Sage messages
 */
export const getRecentSageMessagesTool = new DynamicStructuredTool({
  name: 'get_recent_sage_messages',
  description: 'Get recent proactive messages sent to the user. Use this to avoid sending duplicate messages or spamming.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    hours: z.number().default(72).describe('Hours to look back (default 72 hours = 3 days for better repetition detection)'),
    type: z.string().optional().describe('Optional filter by message type'),
  }),
  func: async ({ userId, hours, type }) => {
    let queryText = `
      SELECT id, type, title, content, sent_at, acknowledged
      FROM sage_messages
      WHERE user_id = $1
        AND sent_at >= NOW() - INTERVAL '${hours} hours'
    `;
    const params = [userId];

    if (type) {
      queryText += ` AND type = $2`;
      params.push(type);
    }

    queryText += ` ORDER BY sent_at DESC`;

    const result = await query(queryText, params);

    return JSON.stringify({
      count: result.rows.length,
      messages: result.rows.map(r => ({
        id: r.id,
        type: r.type,
        title: r.title,
        content: r.content,
        sentAt: r.sent_at,
        acknowledged: r.acknowledged,
      })),
    });
  },
});

/**
 * Tool: Send proactive message
 */
export const sendProactiveMessageTool = new DynamicStructuredTool({
  name: 'send_proactive_message',
  description: 'Send a proactive message to the user via push notification and Discord. Use this to reach out with insights, questions, or suggestions. Optionally include quick action buttons for easy responses.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    type: z.enum(['insight', 'question', 'suggestion', 'daily_summary'])
      .describe('Type of message'),
    title: z.string().describe('Message title'),
    content: z.string().describe('Message content (supports markdown)'),
    actions: z.array(z.object({
      id: z.string().describe('Unique action ID'),
      label: z.string().describe('Button label (max 20 chars for push notifications)'),
      message: z.string().describe('Message to send when button is clicked'),
      style: z.enum(['primary', 'secondary', 'success', 'danger']).optional().describe('Button style (Discord only)')
    })).max(3).optional().describe('Quick action buttons (max 3 for good UX)'),
    metadata: z.object({}).optional().describe('Optional metadata to store with message'),
  }),
  func: async ({ userId, type, title, content, actions, metadata }) => {
    try {
      console.log('[Proactive Message] Preparing to send:', {
        type,
        title,
        preview: content.substring(0, 100),
        actionCount: actions?.length || 0,
      });

      // 1. Find or create conversation for proactive messages
      // Check if there's an existing "Proactive Check-ins" conversation with <50 messages
      const MAX_MESSAGES_PER_CONVERSATION = 50;

      const existingConversationResult = await query(
        `SELECT c.id, COUNT(cm.id) as message_count
         FROM conversations c
         LEFT JOIN chat_messages cm ON c.id = cm.conversation_id
         WHERE c.user_id = $1
           AND c.title = 'Proactive Check-ins'
         GROUP BY c.id
         HAVING COUNT(cm.id) < $2
         ORDER BY c.updated_at DESC
         LIMIT 1`,
        [userId, MAX_MESSAGES_PER_CONVERSATION]
      );

      let conversationId;
      let isNewConversation = false;

      if (existingConversationResult.rows.length > 0) {
        // Reuse existing conversation
        conversationId = existingConversationResult.rows[0].id;
        const messageCount = parseInt(existingConversationResult.rows[0].message_count);
        console.log(`[Proactive Message] Reusing existing conversation (${messageCount} messages)`);

        // Update the conversation timestamp
        await query(
          `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
          [conversationId]
        );
      } else {
        // Create new conversation
        const conversationResult = await query(
          `INSERT INTO conversations (user_id, title)
           VALUES ($1, 'Proactive Check-ins')
           RETURNING id`,
          [userId]
        );
        conversationId = conversationResult.rows[0].id;
        isNewConversation = true;
        console.log('[Proactive Message] Created new proactive conversation');
      }

      // 2. Store message in sage_messages with conversation_id and actions in metadata
      const messageMetadata = {
        ...metadata,
        actions: actions || []
      };

      const dbResult = await query(
        `INSERT INTO sage_messages (user_id, conversation_id, type, title, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sent_at`,
        [userId, conversationId, type, title, content, JSON.stringify(messageMetadata)]
      );

      const messageId = dbResult.rows[0].id;

      // 3. Add separator message if reusing conversation (to show where new session starts)
      if (!isNewConversation) {
        const now = new Date();
        const timeStr = now.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });

        await query(
          `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
           VALUES ($1, $2, 'system', $3, $4)`,
          [
            userId,
            conversationId,
            `─── ${timeStr} ───`,
            JSON.stringify({
              timestamp: now.toISOString(),
              type: 'session_separator',
            }),
          ]
        );
      }

      // 4. Save to chat_messages as assistant message
      await query(
        `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
         VALUES ($1, $2, 'assistant', $3, $4)`,
        [
          userId,
          conversationId,
          content,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            type: 'proactive',
            messageType: type,
            title,
          }),
        ]
      );

      // 5. Check notification preferences
      const preferences = await pushNotificationService.getPreferences(userId);

      if (preferences.proactive_enabled) {
        // 6. Send push notification with deep-link and action buttons
        // Add delay to ensure database transaction is fully committed before notifying user
        // 100ms was too short - user could click notification before messages are visible
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Format actions for Web Push Notifications API (max 2 for mobile UX)
        const formattedActions = actions?.slice(0, 2).map(a => ({
          action: a.id,
          title: a.label.substring(0, 20)  // Max 20 chars for notifications
        }));

        await pushNotificationService.sendToUser(userId, {
          title: title,
          body: content.length > 300
            ? (content.lastIndexOf(' ', 297) > 200
                ? content.substring(0, content.lastIndexOf(' ', 297)) + '…'
                : content.substring(0, 297) + '…')
            : content,
          icon: '/sage-icon.png',
          badge: '/sage-badge.png',
          data: {
            conversationId,
            messageId,  // Include messageId for action tracking
            url: `/chat?conversation=${conversationId}`,
            actions: formattedActions,  // Formatted actions for service worker to display
            actionDefinitions: actions  // Full definitions with messages for action handling
          },
        });

        console.log('[Proactive Message] Push notification sent with', actions?.length || 0, 'actions');
      } else {
        console.log('[Proactive Message] Push notifications disabled for user');
      }

      // 7. Optionally still send to Discord if configured
      if (discordService.isConfigured()) {
        await discordService.sendSageMessage(type, title, content, undefined, actions, messageId);
        console.log('[Proactive Message] Discord message sent with', actions?.length || 0, 'actions');
      }

      // Update monitoring state
      await query(
        `INSERT INTO glucose_monitoring_state (user_id, last_message_sent_at)
         VALUES ($1, NOW())
         ON CONFLICT (user_id) DO UPDATE
         SET last_message_sent_at = NOW(),
             updated_at = NOW()`,
        [userId]
      );

      return JSON.stringify({
        success: true,
        messageId,
        conversationId,
        sentAt: dbResult.rows[0].sent_at,
      });
    } catch (error) {
      console.error('[Proactive Message] Failed to send:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get user context for proactive analysis
 */
export const getUserContextTool = new DynamicStructuredTool({
  name: 'get_user_context',
  description: 'Get comprehensive user context including profile, recent stats, and stored memories. Use this when preparing proactive outreach.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    statsDays: z.number().positive().optional().describe('Number of days for recent stats, default 7'),
  }),
  func: async ({ userId, statsDays = 7 }) => {
    // Get user profile
    const userResult = await query(
      `SELECT email, diagnosis_type, diagnosis_date, timezone, preferences
       FROM users
       WHERE id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return JSON.stringify({
        found: false,
        error: 'User not found',
      });
    }

    const user = userResult.rows[0];

    // Get recent stats (last N days)
    const statsResult = await query(
      `SELECT
        COUNT(*) as reading_count,
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '1 day' * $2`,
      [userId, statsDays]
    );

    const stats = statsResult.rows[0];

    // Get stored memories
    const memoryResult = await query(
      `SELECT key, value, updated_at
       FROM agent_memory
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    );

    const memories = memoryResult.rows.map(r => ({
      key: r.key,
      ...r.value,
      updated_at: r.updated_at,
    }));

    // Get monitoring state
    const stateResult = await query(
      `SELECT last_check_timestamp, last_message_sent_at, last_daily_summary_at, state
       FROM glucose_monitoring_state
       WHERE user_id = $1`,
      [userId]
    );

    const monitoringState = stateResult.rows[0] || null;

    return JSON.stringify({
      found: true,
      user: {
        email: user.email,
        diagnosisType: user.diagnosis_type,
        diagnosisDate: user.diagnosis_date,
        timezone: user.timezone,
        preferences: user.preferences,
      },
      recentStats: {
        readingCount: parseInt(stats.reading_count || 0),
        avgGlucose: parseFloat(stats.avg_glucose || 0).toFixed(1),
        stdDev: parseFloat(stats.std_dev || 0).toFixed(1),
        timeInRange: parseFloat(stats.tir || 0).toFixed(1),
      },
      memories: {
        count: memories.length,
        items: memories,
      },
      monitoringState,
    });
  },
});

/**
 * ============================================================================
 * PATTERN ANALYSIS TOOLS
 * ============================================================================
 */

/**
 * Tool: Analyze Meal Patterns
 * Analyzes how meals affect glucose over a time period
 */
const analyzeMealPatternsTool = new DynamicStructuredTool({
  name: 'analyze_meal_patterns',
  description:
    'Analyze how meals affect glucose over a time period. Returns patterns for meal responses, typical spikes, and meal timing insights. Use this when discussing meal planning, carb counting, or identifying problematic meals.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    days: z.number().default(14).describe('Number of days to analyze (default: 14)'),
    mealType: z
      .enum(['breakfast', 'lunch', 'dinner', 'snack'])
      .optional()
      .describe('Filter by specific meal type'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, days = 14, mealType, userTimezone }) => {
    try {
      // Use provided timezone or fallback
      const timezone = userTimezone || 'America/New_York';

      console.log('[analyze_meal_patterns] Called with:', { userId, days, mealType, timezone });

      // Get meals in the time period using PostgreSQL timezone-aware date functions
      let mealQuery = `
        SELECT
          m.*,
          c.baseline_glucose,
          c.peak_glucose,
          c.time_to_peak_minutes,
          c.total_change,
          c.time_in_range_pct,
          c.matched_pattern_id
        FROM meals m
        LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
        WHERE m.user_id = $1
          AND m.timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') - INTERVAL '${days} days'
          AND m.timestamp < DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') + INTERVAL '1 day'
      `;
      const params: any[] = [userId];

      if (mealType) {
        mealQuery += ` AND m.meal_type = $2`;
        params.push(mealType);
      }

      mealQuery += ` ORDER BY m.timestamp DESC`;

      console.log('[analyze_meal_patterns] Executing with params:', params);
      console.log('[analyze_meal_patterns] Query:', mealQuery.replace(/\s+/g, ' ').trim());
      const mealsResult = await query(mealQuery, params);
      console.log('[analyze_meal_patterns] Found', mealsResult.rows.length, 'meals');

      if (mealsResult.rows.length === 0) {
        return JSON.stringify({
          hasMeals: false,
          message: `No meals logged in the past ${days} days.`,
        });
      }

      // Calculate summary statistics
      const mealsWithCorrelations = mealsResult.rows.filter((m) => m.correlation_id);
      const avgSpike =
        mealsWithCorrelations.length > 0
          ? (
              mealsWithCorrelations.reduce(
                (sum, m) => sum + parseFloat(m.total_change || 0),
                0
              ) / mealsWithCorrelations.length
            ).toFixed(1)
          : null;

      const avgTimeToPeak =
        mealsWithCorrelations.length > 0
          ? Math.round(
              mealsWithCorrelations.reduce(
                (sum, m) => sum + (m.time_to_peak_minutes || 0),
                0
              ) / mealsWithCorrelations.length
            )
          : null;

      const avgTIR =
        mealsWithCorrelations.length > 0
          ? (
              mealsWithCorrelations.reduce(
                (sum, m) => sum + parseFloat(m.time_in_range_pct || 0),
                0
              ) / mealsWithCorrelations.length
            ).toFixed(1)
          : null;

      // Get detected patterns
      let patternQuery = `
        SELECT *
        FROM glucose_patterns
        WHERE user_id = $1
          AND pattern_type = 'meal_response'
          AND confidence >= 0.4
      `;
      const patternParams: any[] = [userId];

      if (mealType) {
        patternQuery += ` AND trigger_event_details->>'meal_type' = $2`;
        patternParams.push(mealType);
      }

      patternQuery += ` ORDER BY confidence DESC`;

      const patternsResult = await query(patternQuery, patternParams);

      return JSON.stringify({
        hasMeals: true,
        period: `${days} days`,
        summary: {
          totalMeals: mealsResult.rows.length,
          mealsAnalyzed: mealsWithCorrelations.length,
          avgSpike,
          avgTimeToPeak,
          avgTimeInRangePostMeal: avgTIR,
        },
        patterns: patternsResult.rows.map((p) => ({
          id: p.id,
          name: p.pattern_name,
          description: p.description,
          typicalSpike: p.typical_magnitude,
          typicalDuration: p.typical_duration,
          occurrences: p.occurrence_count,
          confidence: parseFloat(p.confidence).toFixed(2),
          lastSeen: p.last_seen,
        })),
        recentMeals: mealsResult.rows.slice(0, 10).map((m) => ({
          id: m.id,
          timestamp: m.timestamp,
          description: m.description,
          carbs: m.carbs,
          mealType: m.meal_type,
          spike: m.total_change,
          timeToPeak: m.time_to_peak_minutes,
          timeInRange: m.time_in_range_pct,
        })),
      });
    } catch (error) {
      console.error('Error analyzing meal patterns:', error);
      return JSON.stringify({
        error: 'Failed to analyze meal patterns',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Analyze Individual Meal
 * Provides comprehensive coaching on a specific meal's glucose response with personalized recommendations
 */
const analyzeIndividualMealTool = new DynamicStructuredTool({
  name: 'analyze_individual_meal',
  description:
    'Analyze a specific meal to show glucose response, insulin dose, and meal details. For meals eaten <3 hours ago, provides real-time analysis (current glucose, peak, baseline). For older meals, provides full coaching with performance comparison, dose/timing assessment, and recommendations. Use when user asks about a specific meal or "how did I do after [meal]?".',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    mealId: z.string().optional().describe('Specific meal ID to analyze'),
    mealTime: z.string().optional().describe('ISO timestamp of the meal if no meal ID provided'),
    lookbackDays: z.number().default(30).describe('Days to look back for comparison data (default: 30)'),
  }),
  func: async ({ userId, mealId, mealTime, lookbackDays = 30 }) => {
    console.log('[analyze_individual_meal] Called with:', { userId, mealId, mealTime, lookbackDays });
    try {
      // Get the specific meal
      let targetMeal;
      if (mealId) {
        const mealResult = await query(
          `
          SELECT
            m.*,
            c.baseline_glucose,
            c.peak_glucose,
            c.time_to_peak_minutes,
            c.total_change,
            c.time_in_range_pct
          FROM meals m
          LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
          WHERE m.id = $1 AND m.user_id = $2
        `,
          [mealId, userId]
        );
        targetMeal = mealResult.rows[0];
      } else if (mealTime) {
        const mealResult = await query(
          `
          SELECT
            m.*,
            c.baseline_glucose,
            c.peak_glucose,
            c.time_to_peak_minutes,
            c.total_change,
            c.time_in_range_pct
          FROM meals m
          LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
          WHERE m.user_id = $1
            AND m.timestamp >= $2::timestamptz - interval '5 minutes'
            AND m.timestamp <= $2::timestamptz + interval '5 minutes'
          ORDER BY ABS(EXTRACT(EPOCH FROM (m.timestamp - $2::timestamptz)))
          LIMIT 1
        `,
          [userId, mealTime]
        );
        targetMeal = mealResult.rows[0];
      } else {
        return JSON.stringify({
          error: 'Must provide either mealId or mealTime',
        });
      }

      if (!targetMeal) {
        console.log('[analyze_individual_meal] Meal not found');
        return JSON.stringify({
          error: 'Meal not found',
        });
      }

      // Get insulin doses within 30 minutes before or after this meal
      const insulinResult = await query(
        `SELECT insulin_type, units, timestamp, purpose, notes
         FROM insulin_doses
         WHERE user_id = $1
           AND timestamp >= $2::timestamptz - INTERVAL '30 minutes'
           AND timestamp <= $2::timestamptz + INTERVAL '30 minutes'
         ORDER BY timestamp ASC`,
        [userId, targetMeal.timestamp]
      );

      const insulinDoses = insulinResult.rows;
      const totalInsulin = insulinDoses.reduce((sum, d) => sum + parseFloat(d.units), 0);

      console.log('[analyze_individual_meal] Found meal:', {
        id: targetMeal.id,
        description: targetMeal.description,
        timestamp: targetMeal.timestamp,
        insulin_doses: insulinDoses.length,
        total_insulin: totalInsulin,
        carbs: targetMeal.carbs,
        has_correlation: !!targetMeal.correlation_id
      });

      // If no correlation data yet, provide real-time analysis instead
      if (!targetMeal.correlation_id) {
        // Get glucose readings since the meal (limit to 3 hours for meal response window)
        const mealTime = new Date(targetMeal.timestamp);
        const now = new Date();
        const hoursSinceMeal = (now.getTime() - mealTime.getTime()) / (1000 * 60 * 60);

        // CRITICAL: Only look at 3-hour post-meal window to find the meal's glucose response
        // Don't query all the way to NOW() as that includes unrelated readings (overnight, next morning, etc.)
        const threeHoursAfterMeal = new Date(mealTime.getTime() + (3 * 60 * 60 * 1000));
        const queryEndTime = hoursSinceMeal < 3 ? now : threeHoursAfterMeal;

        const glucoseResult = await query(
          `SELECT glucose, timestamp
           FROM glucose_readings
           WHERE user_id = $1
             AND timestamp >= $2
             AND timestamp <= $3
           ORDER BY timestamp ASC`,
          [userId, targetMeal.timestamp, queryEndTime.toISOString()]
        );

        const readings = glucoseResult.rows;
        let currentGlucose = null;
        let peakGlucose = null;
        let baseline = null;

        if (readings.length > 0) {
          // First reading after meal is baseline
          baseline = readings[0].glucose;
          // Find peak within the 3-hour post-meal window
          peakGlucose = Math.max(...readings.map(r => r.glucose));
          // Last reading in window is current
          currentGlucose = readings[readings.length - 1].glucose;
        }

        return JSON.stringify({
          realTimeAnalysis: true,
          meal: {
            timestamp: targetMeal.timestamp,
            mealType: targetMeal.meal_type,
            description: targetMeal.description,
            carbs: targetMeal.carbs,
            fat: targetMeal.fat_grams,
            protein: targetMeal.protein_grams,
            insulinDoses: insulinDoses.map(d => ({
              type: d.insulin_type,
              units: parseFloat(d.units),
              timestamp: d.timestamp,
            })),
            totalInsulin: totalInsulin > 0 ? totalInsulin : null,
          },
          currentStatus: {
            hoursSinceMeal: hoursSinceMeal.toFixed(1),
            baseline: baseline,
            peak: peakGlucose,
            current: currentGlucose,
            change: baseline && currentGlucose ? (currentGlucose - baseline).toFixed(1) : null,
            readingsCount: readings.length,
          },
          message: hoursSinceMeal < 3
            ? 'Real-time analysis (full correlation analysis available after 3 hours)'
            : 'Correlation data not yet computed. Showing real-time analysis.',
          note: totalInsulin > 0
            ? `Took ${totalInsulin} units of insulin for this meal (${insulinDoses.map(d => `${d.units}u ${d.insulin_type}`).join(', ')}).`
            : 'No insulin was logged for this meal.',
        });
      }

      // Get similar historical meals (same meal type, similar carbs ±20g)
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - lookbackDays);

      const carbMin = Math.max(0, (targetMeal.carbs || 0) - 20);
      const carbMax = (targetMeal.carbs || 0) + 20;

      const similarMealsResult = await query(
        `
        SELECT
          m.*,
          c.baseline_glucose,
          c.peak_glucose,
          c.time_to_peak_minutes,
          c.total_change,
          c.time_in_range_pct
        FROM meals m
        LEFT JOIN glucose_correlations c ON m.correlation_id = c.id
        WHERE m.user_id = $1
          AND m.id != $2
          AND m.meal_type = $3
          AND m.correlation_id IS NOT NULL
          AND m.timestamp >= $4
          AND m.carbs BETWEEN $5 AND $6
        ORDER BY m.timestamp DESC
      `,
        [userId, targetMeal.id, targetMeal.meal_type, startDate.toISOString(), carbMin, carbMax]
      );

      const similarMeals = similarMealsResult.rows;

      // Calculate typical response for similar meals
      let typicalResponse = null;
      if (similarMeals.length >= 2) {
        const avgPeak = similarMeals.reduce((sum, m) => sum + (parseFloat(m.peak_glucose) || 0), 0) / similarMeals.length;
        const avgChange = similarMeals.reduce((sum, m) => sum + (parseFloat(m.total_change) || 0), 0) / similarMeals.length;
        const avgTimeToPeak = similarMeals.reduce((sum, m) => sum + (m.time_to_peak_minutes || 0), 0) / similarMeals.length;
        const avgTimeInRange = similarMeals.reduce((sum, m) => sum + (parseFloat(m.time_in_range_pct) || 0), 0) / similarMeals.length;

        typicalResponse = {
          avgPeak: avgPeak.toFixed(1),
          avgChange: avgChange.toFixed(1),
          avgTimeToPeak: Math.round(avgTimeToPeak),
          avgTimeInRange: avgTimeInRange.toFixed(1),
          sampleSize: similarMeals.length,
        };
      }

      // Performance assessment
      let performanceAssessment = '';
      let performanceScore = 0; // 0-100

      if (typicalResponse) {
        const thisPeak = parseFloat(targetMeal.peak_glucose);
        const thisChange = parseFloat(targetMeal.total_change);
        const thisTimeInRange = parseFloat(targetMeal.time_in_range_pct);

        // Score based on peak glucose
        if (thisPeak < parseFloat(typicalResponse.avgPeak) - 20) {
          performanceScore += 35;
          performanceAssessment += 'Peak glucose was significantly lower than typical. ';
        } else if (thisPeak < parseFloat(typicalResponse.avgPeak)) {
          performanceScore += 25;
          performanceAssessment += 'Peak glucose was slightly lower than typical. ';
        } else if (thisPeak > parseFloat(typicalResponse.avgPeak) + 20) {
          performanceScore += 5;
          performanceAssessment += 'Peak glucose was higher than typical. ';
        } else {
          performanceScore += 15;
          performanceAssessment += 'Peak glucose was similar to typical. ';
        }

        // Score based on time in range
        if (thisTimeInRange > parseFloat(typicalResponse.avgTimeInRange) + 10) {
          performanceScore += 35;
          performanceAssessment += 'Time in range improved significantly. ';
        } else if (thisTimeInRange > parseFloat(typicalResponse.avgTimeInRange)) {
          performanceScore += 25;
          performanceAssessment += 'Time in range improved slightly. ';
        } else if (thisTimeInRange < parseFloat(typicalResponse.avgTimeInRange) - 10) {
          performanceScore += 5;
          performanceAssessment += 'Time in range was worse than typical. ';
        } else {
          performanceScore += 15;
          performanceAssessment += 'Time in range was similar to typical. ';
        }

        // Score based on overall control
        if (thisPeak < 140 && thisTimeInRange > 80) {
          performanceScore += 30;
          performanceAssessment += 'Excellent control overall!';
        } else if (thisPeak < 180 && thisTimeInRange > 70) {
          performanceScore += 20;
          performanceAssessment += 'Good control overall.';
        } else {
          performanceScore += 10;
          performanceAssessment += 'Room for improvement.';
        }
      } else {
        // No comparison data
        const thisPeak = parseFloat(targetMeal.peak_glucose);
        const thisTimeInRange = parseFloat(targetMeal.time_in_range_pct);

        if (thisPeak < 140 && thisTimeInRange > 80) {
          performanceScore = 85;
          performanceAssessment = 'Excellent control! Peak stayed below 140 and you were in range >80% of the time.';
        } else if (thisPeak < 180 && thisTimeInRange > 70) {
          performanceScore = 70;
          performanceAssessment = 'Good control. Peak stayed below 180 and you were in range >70% of the time.';
        } else if (thisPeak < 200) {
          performanceScore = 50;
          performanceAssessment = 'Moderate control. Peak was below 200 but there\'s room for improvement.';
        } else {
          performanceScore = 30;
          performanceAssessment = 'Challenging meal. Peak exceeded 200 mg/dL.';
        }
      }

      // Dose assessment
      let doseAssessment = '';
      const thisPeak = parseFloat(targetMeal.peak_glucose);
      const thisChange = parseFloat(targetMeal.total_change);
      const thisTimeInRange = parseFloat(targetMeal.time_in_range_pct);
      const insulinDose = totalInsulin;

      if (!insulinDose || insulinDose === 0) {
        doseAssessment = 'No insulin logged for this meal. Consider logging insulin doses for better analysis.';
      } else if (thisPeak > 180 && thisChange > 80) {
        doseAssessment = `Dose may be too low. Peak of ${thisPeak.toFixed(0)} mg/dL suggests more insulin may be needed. Consider increasing by 0.5-1 unit.`;
      } else if (thisPeak < 100 || thisChange < -20) {
        doseAssessment = `Dose may be too high. ${thisPeak < 100 ? 'Low peak glucose' : 'Significant drop'} suggests less insulin may be needed. Consider decreasing by 0.5-1 unit.`;
      } else if (thisPeak < 140) {
        doseAssessment = `Dose appears well-tuned. Peak of ${thisPeak.toFixed(0)} mg/dL is excellent.`;
      } else {
        doseAssessment = `Dose is close but could be refined. Peak of ${thisPeak.toFixed(0)} mg/dL is acceptable but not ideal.`;
      }

      // Timing assessment
      let timingAssessment = '';
      const timeToPeak = targetMeal.time_to_peak_minutes;

      if (!insulinDose || insulinDose === 0) {
        timingAssessment = 'Cannot assess timing without insulin dose information.';
      } else if (timeToPeak < 30) {
        timingAssessment = 'Very fast rise - consider dosing 15-20 minutes earlier to give insulin more time to work.';
      } else if (timeToPeak < 60) {
        timingAssessment = 'Timing appears good. Glucose peaked within 30-60 minutes, which is typical.';
      } else if (timeToPeak < 90) {
        timingAssessment = 'Slower rise than typical - this could be due to fat/protein slowing absorption. Current timing seems appropriate.';
      } else {
        timingAssessment = 'Very slow rise - likely due to high fat/protein content. Consider dosing later or splitting the dose.';
      }

      // Composition insights
      let compositionInsights = '';
      const fat = targetMeal.fat_grams;
      const protein = targetMeal.protein_grams;
      const carbs = targetMeal.carbs;

      if (fat && protein && carbs) {
        const fatProteinRatio = (fat + protein) / carbs;

        if (fatProteinRatio > 2) {
          compositionInsights = `High fat/protein meal (${fat}g fat, ${protein}g protein vs ${carbs}g carbs). `;
          if (timeToPeak > 90) {
            compositionInsights += 'The slow glucose rise confirms this is a slow-digesting meal. Consider extended bolus or split dosing.';
          } else {
            compositionInsights += 'Despite high fat/protein, glucose rose quickly. May need to adjust dose rather than timing.';
          }
        } else if (fatProteinRatio > 1) {
          compositionInsights = `Moderate fat/protein meal (${fat}g fat, ${protein}g protein vs ${carbs}g carbs). `;
          compositionInsights += 'This balance is reasonable. Watch for extended glucose rise 2-3 hours post-meal.';
        } else {
          compositionInsights = `Carb-heavy meal (${carbs}g carbs vs ${fat}g fat, ${protein}g protein). `;
          if (timeToPeak < 60) {
            compositionInsights += 'Fast rise is expected with high carbs. Timing and dose appear appropriate for this composition.';
          }
        }
      } else {
        compositionInsights = 'Log fat and protein content for more detailed composition analysis.';
      }

      // Improvement tracking
      let improvementTracking = null;
      if (similarMeals.length >= 3) {
        // Get the 3 most recent similar meals before this one
        const recentSimilar = similarMeals.slice(0, 3);
        const avgRecentPeak = recentSimilar.reduce((sum, m) => sum + (parseFloat(m.peak_glucose) || 0), 0) / recentSimilar.length;
        const avgRecentTimeInRange = recentSimilar.reduce((sum, m) => sum + (parseFloat(m.time_in_range_pct) || 0), 0) / recentSimilar.length;

        const peakImprovement = avgRecentPeak - thisPeak;
        const timeInRangeImprovement = thisTimeInRange - avgRecentTimeInRange;

        let trend = '';
        if (peakImprovement > 15 && timeInRangeImprovement > 5) {
          trend = 'improving_significantly';
        } else if (peakImprovement > 5 || timeInRangeImprovement > 3) {
          trend = 'improving';
        } else if (peakImprovement < -15 || timeInRangeImprovement < -10) {
          trend = 'worsening';
        } else {
          trend = 'stable';
        }

        improvementTracking = {
          trend,
          peakChange: peakImprovement.toFixed(1),
          timeInRangeChange: timeInRangeImprovement.toFixed(1),
          comparedToLast3Meals: true,
        };
      }

      // Actionable recommendations
      const recommendations = [];

      // Dose recommendations
      if (thisPeak > 180 && thisChange > 80) {
        recommendations.push({
          category: 'dose',
          priority: 'high',
          recommendation: `Increase insulin dose by 0.5-1 unit (current: ${insulinDose} units)`,
          reasoning: `Peak of ${thisPeak.toFixed(0)} mg/dL indicates insufficient insulin coverage`,
        });
      } else if (thisPeak < 100) {
        recommendations.push({
          category: 'dose',
          priority: 'high',
          recommendation: `Decrease insulin dose by 0.5-1 unit (current: ${insulinDose} units)`,
          reasoning: `Peak of ${thisPeak.toFixed(0)} mg/dL indicates too much insulin`,
        });
      }

      // Timing recommendations
      if (insulinDose && timeToPeak < 30) {
        recommendations.push({
          category: 'timing',
          priority: 'medium',
          recommendation: 'Dose insulin 15-20 minutes before eating',
          reasoning: 'Fast glucose rise suggests insulin needs more time to start working',
        });
      } else if (insulinDose && timeToPeak > 120 && fat && protein && (fat + protein) / carbs > 2) {
        recommendations.push({
          category: 'timing',
          priority: 'medium',
          recommendation: 'Consider extended/dual-wave bolus or split dosing (50% now, 50% in 1 hour)',
          reasoning: 'High fat/protein content is causing very slow glucose rise',
        });
      }

      // Composition recommendations
      if (fat && protein && carbs && (fat + protein) / carbs > 2.5) {
        recommendations.push({
          category: 'composition',
          priority: 'low',
          recommendation: 'Consider reducing fat content or adding more carbs to balance the meal',
          reasoning: 'Very high fat/protein ratio makes glucose management more complex',
        });
      }

      // General improvement recommendations
      if (performanceScore < 50 && parseFloat(targetMeal.peak_glucose) > 200) {
        recommendations.push({
          category: 'general',
          priority: 'high',
          recommendation: 'Review this meal composition and consider alternatives',
          reasoning: `Peak glucose exceeded 200 mg/dL - this meal type may be challenging`,
        });
      }

      return JSON.stringify({
        meal: {
          timestamp: targetMeal.timestamp,
          mealType: targetMeal.meal_type,
          description: targetMeal.description,
          carbs: targetMeal.carbs,
          fat: targetMeal.fat_grams,
          protein: targetMeal.protein_grams,
          insulinDoses: insulinDoses.map(d => ({
            type: d.insulin_type,
            units: parseFloat(d.units),
            timestamp: d.timestamp,
          })),
          totalInsulin: totalInsulin > 0 ? totalInsulin : null,
        },
        glucoseResponse: {
          baseline: parseFloat(targetMeal.baseline_glucose).toFixed(1),
          peak: parseFloat(targetMeal.peak_glucose).toFixed(1),
          change: parseFloat(targetMeal.total_change).toFixed(1),
          timeToPeak: targetMeal.time_to_peak_minutes,
          timeInRange: parseFloat(targetMeal.time_in_range_pct).toFixed(1),
        },
        performance: {
          score: performanceScore,
          assessment: performanceAssessment,
          comparisonAvailable: typicalResponse !== null,
        },
        typicalResponse,
        doseAssessment,
        timingAssessment,
        compositionInsights,
        improvementTracking,
        recommendations,
        metadata: {
          similarMealsAnalyzed: similarMeals.length,
          lookbackDays,
        },
      });
    } catch (error) {
      console.error('Error analyzing individual meal:', error);
      return JSON.stringify({
        error: 'Failed to analyze individual meal',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Analyze Basal Patterns
 * Analyzes overnight fasting patterns to assess basal insulin adequacy
 */
const analyzeBasalPatternsTool = new DynamicStructuredTool({
  name: 'analyze_basal_patterns',
  description:
    'Analyze overnight fasting patterns to assess basal insulin adequacy. By default analyzes 3am-7am but you can customize the fasting window. Returns drift analysis, stability metrics, and recommendations. Use this when discussing basal insulin doses or overnight glucose control.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    userTimezone: z.string().optional().describe('User timezone (auto-injected by system)'),
    days: z.number().default(14).describe('Number of days to analyze (default: 14)'),
    fastingStart: z.number().min(0).max(23).optional().describe('Start hour for fasting period in 24-hour format (default: 3)'),
    fastingEnd: z.number().min(0).max(23).optional().describe('End hour for fasting period in 24-hour format (default: 7)'),
  }),
  func: async ({ userId, userTimezone = 'America/New_York', days = 14, fastingStart = 3, fastingEnd = 7 }) => {
    try {
      const results = [];

      // Get dates in user's timezone by querying the database
      // This ensures dates match the timezone used in detectBasalAdequacy
      const datesResult = await query(
        `SELECT DISTINCT DATE(timezone($2, timestamp)) as date
         FROM glucose_readings
         WHERE user_id = $1
           AND timestamp >= NOW() - INTERVAL '${days} days'
         ORDER BY date DESC
         LIMIT ${days}`,
        [userId, userTimezone]
      );

      // Analyze each night in the period
      for (const row of datesResult.rows) {
        const dateStr = row.date instanceof Date
          ? row.date.toISOString().split('T')[0]
          : String(row.date);

        const analysis = await detectBasalAdequacy(userId, dateStr, userTimezone, fastingStart, fastingEnd);
        if (analysis) {
          results.push({
            date: dateStr,
            ...analysis,
          });
        }
      }

      if (results.length === 0) {
        return JSON.stringify({
          hasData: false,
          message: `No overnight glucose data found in the past ${days} days.`,
        });
      }

      // Calculate summary statistics
      const avgDrift =
        results.reduce((sum, r) => sum + r.driftRate, 0) / results.length;
      const avgConfidence =
        results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

      // Count adequacy classifications
      const adequacyCounts = results.reduce(
        (acc, r) => {
          acc[r.adequacy] = (acc[r.adequacy] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      const mostCommon = Object.entries(adequacyCounts).sort(
        (a, b) => b[1] - a[1]
      )[0];

      // Generate recommendation
      let recommendation = '';
      if (mostCommon[0] === 'adequate') {
        recommendation =
          'Basal insulin appears adequate - overnight glucose is generally stable.';
      } else if (mostCommon[0] === 'basal_too_low') {
        recommendation =
          'Basal insulin may be too low - glucose tends to rise overnight. Consider discussing with your healthcare provider.';
      } else if (mostCommon[0] === 'basal_too_high') {
        recommendation =
          'Basal insulin may be too high - glucose tends to fall overnight. Consider discussing with your healthcare provider.';
      } else {
        recommendation =
          'Overnight glucose is unstable. Consider factors like late meals, evening exercise, or alcohol consumption.';
      }

      // Get stored pattern if it exists
      const patternResult = await query(
        `
        SELECT *
        FROM glucose_patterns
        WHERE user_id = $1
          AND pattern_type = 'basal_drift'
        ORDER BY confidence DESC
        LIMIT 1
      `,
        [userId]
      );

      return JSON.stringify({
        hasData: true,
        nightsAnalyzed: results.length,
        summary: {
          avgDriftPerHour: avgDrift.toFixed(1),
          avgConfidence: avgConfidence.toFixed(2),
          basalAssessment: mostCommon[0],
          nightsWithIssue: results.length - (adequacyCounts.adequate || 0),
          recommendation,
        },
        adequacyBreakdown: adequacyCounts,
        pattern: patternResult.rows[0] || null,
        recentNights: results.slice(0, 7),
      });
    } catch (error) {
      console.error('Error analyzing basal patterns:', error);
      return JSON.stringify({
        error: 'Failed to analyze basal patterns',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Analyze Exercise Patterns
 * Analyzes how exercise affects glucose
 */
const analyzeExercisePatternsTool = new DynamicStructuredTool({
  name: 'analyze_exercise_patterns',
  description:
    'Analyze how exercise affects glucose over a time period. Returns typical drops, timing, rebound patterns, and recommendations. Use this when discussing exercise planning or glucose management during physical activity.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    days: z.number().default(14).describe('Number of days to analyze (default: 14)'),
    activityType: z
      .string()
      .optional()
      .describe('Filter by specific activity type (e.g., "cardio", "strength")'),
  }),
  func: async ({ userId, days = 14, activityType }) => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get exercise sessions in the time period
      let exerciseQuery = `
        SELECT
          e.*,
          c.baseline_glucose,
          c.lowest_glucose,
          c.time_to_lowest_minutes,
          c.total_change,
          c.time_in_range_pct,
          c.matched_pattern_id
        FROM exercise_logs e
        LEFT JOIN glucose_correlations c ON e.correlation_id = c.id
        WHERE e.user_id = $1
          AND e.timestamp >= $2
      `;
      const params: any[] = [userId, startDate.toISOString()];

      if (activityType) {
        exerciseQuery += ` AND e.activity_type = $3`;
        params.push(activityType);
      }

      exerciseQuery += ` ORDER BY e.timestamp DESC`;

      const exerciseResult = await query(exerciseQuery, params);

      if (exerciseResult.rows.length === 0) {
        return JSON.stringify({
          hasExercise: false,
          message: `No exercise logged in the past ${days} days.`,
        });
      }

      // Calculate summary statistics
      const exerciseWithCorrelations = exerciseResult.rows.filter(
        (e) => e.correlation_id
      );
      const avgDrop =
        exerciseWithCorrelations.length > 0
          ? (
              exerciseWithCorrelations.reduce(
                (sum, e) => sum + Math.abs(parseFloat(e.total_change || 0)),
                0
              ) / exerciseWithCorrelations.length
            ).toFixed(1)
          : null;

      const avgTimeToLowest =
        exerciseWithCorrelations.length > 0
          ? Math.round(
              exerciseWithCorrelations.reduce(
                (sum, e) => sum + (e.time_to_lowest_minutes || 0),
                0
              ) / exerciseWithCorrelations.length
            )
          : null;

      const avgTIR =
        exerciseWithCorrelations.length > 0
          ? (
              exerciseWithCorrelations.reduce(
                (sum, e) => sum + parseFloat(e.time_in_range_pct || 0),
                0
              ) / exerciseWithCorrelations.length
            ).toFixed(1)
          : null;

      // Get detected patterns
      let patternQuery = `
        SELECT *
        FROM glucose_patterns
        WHERE user_id = $1
          AND pattern_type = 'exercise_response'
          AND confidence >= 0.4
      `;
      const patternParams: any[] = [userId];

      if (activityType) {
        patternQuery += ` AND trigger_event_details->>'activity_type' = $2`;
        patternParams.push(activityType);
      }

      patternQuery += ` ORDER BY confidence DESC`;

      const patternsResult = await query(patternQuery, patternParams);

      return JSON.stringify({
        hasExercise: true,
        period: `${days} days`,
        summary: {
          totalSessions: exerciseResult.rows.length,
          sessionsAnalyzed: exerciseWithCorrelations.length,
          avgDrop,
          avgTimeToLowest,
          avgTimeInRangeDuringExercise: avgTIR,
        },
        patterns: patternsResult.rows.map((p) => ({
          id: p.id,
          name: p.pattern_name,
          description: p.description,
          typicalDrop: Math.abs(parseFloat(p.typical_magnitude)),
          typicalDuration: p.typical_duration,
          occurrences: p.occurrence_count,
          confidence: parseFloat(p.confidence).toFixed(2),
          lastSeen: p.last_seen,
        })),
        recentSessions: exerciseResult.rows.slice(0, 10).map((e) => ({
          id: e.id,
          timestamp: e.timestamp,
          description: e.description,
          duration: e.duration_minutes,
          intensity: e.intensity,
          activityType: e.activity_type,
          drop: e.total_change ? Math.abs(parseFloat(e.total_change)) : null,
          timeToLowest: e.time_to_lowest_minutes,
          timeInRange: e.time_in_range_pct,
        })),
      });
    } catch (error) {
      console.error('Error analyzing exercise patterns:', error);
      return JSON.stringify({
        error: 'Failed to analyze exercise patterns',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get Detected Patterns
 * Retrieves all detected glucose patterns for the user
 */
const getDetectedPatternsTool = new DynamicStructuredTool({
  name: 'get_detected_patterns',
  description:
    'Get all detected glucose patterns for the user, sorted by confidence. Returns pattern library with details about recurring glucose behaviors. Use this to understand what patterns have been identified overall.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    patternType: z
      .enum(['meal_response', 'basal_drift', 'exercise_response', 'time_of_day'])
      .optional()
      .describe('Filter by specific pattern type'),
    minConfidence: z
      .number()
      .default(0.3)
      .describe('Minimum confidence threshold (0-1, default: 0.3)'),
  }),
  func: async ({ userId, patternType, minConfidence = 0.3 }) => {
    try {
      let patternQuery = `
        SELECT
          p.*,
          COUNT(pe.id) as recent_events
        FROM glucose_patterns p
        LEFT JOIN pattern_events pe ON p.id = pe.pattern_id
          AND pe.event_timestamp >= NOW() - INTERVAL '7 days'
        WHERE p.user_id = $1
          AND p.confidence >= $2
      `;
      const params: any[] = [userId, minConfidence];

      if (patternType) {
        patternQuery += ` AND p.pattern_type = $3`;
        params.push(patternType);
      }

      patternQuery += `
        GROUP BY p.id
        ORDER BY p.confidence DESC, p.last_seen DESC
      `;

      const result = await query(patternQuery, params);

      if (result.rows.length === 0) {
        return JSON.stringify({
          hasPatterns: false,
          message: `No patterns detected with confidence >= ${minConfidence}.`,
        });
      }

      return JSON.stringify({
        hasPatterns: true,
        totalPatterns: result.rows.length,
        patterns: result.rows.map((p) => ({
          id: p.id,
          type: p.pattern_type,
          name: p.pattern_name,
          description: p.description,
          typicalMagnitude: p.typical_magnitude,
          typicalDuration: p.typical_duration,
          timeOfDay: p.time_of_day_start
            ? `${p.time_of_day_start} - ${p.time_of_day_end}`
            : null,
          triggerEventType: p.trigger_event_type,
          triggerDetails: p.trigger_event_details,
          firstDetected: p.first_detected,
          lastSeen: p.last_seen,
          occurrenceCount: p.occurrence_count,
          confidence: parseFloat(p.confidence).toFixed(2),
          recentEvents: parseInt(p.recent_events),
        })),
      });
    } catch (error) {
      console.error('Error getting detected patterns:', error);
      return JSON.stringify({
        error: 'Failed to get detected patterns',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Run Pattern Detection
 * Manually trigger pattern detection analysis
 */
const runPatternDetectionTool = new DynamicStructuredTool({
  name: 'run_pattern_detection',
  description:
    'Manually trigger pattern detection analysis for recent unanalyzed meals, exercise, or overnight periods. Customize how far back to look and how many items to analyze. Useful after user logs new data and wants immediate pattern insights.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    userTimezone: z.string().optional().describe('User timezone (auto-injected by system)'),
    analysisType: z
      .enum(['meal', 'exercise', 'basal', 'all'])
      .default('all')
      .describe('Type of analysis to run (default: all)'),
    mealHoursAgo: z.number().min(1).optional().describe('How many hours old meals must be for analysis (default: 4)'),
    exerciseHoursAgo: z.number().min(1).optional().describe('How many hours old exercise must be for analysis (default: 2)'),
    limit: z.number().min(1).max(50).optional().describe('Maximum number of items to analyze per type (default: 10)'),
  }),
  func: async ({ userId, userTimezone = 'America/New_York', analysisType = 'all', mealHoursAgo = 4, exerciseHoursAgo = 2, limit = 10 }) => {
    try {
      const results: any = {
        analyzed: [],
      };

      // Analyze meals without correlations
      if (analysisType === 'meal' || analysisType === 'all') {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - mealHoursAgo);

        const mealsResult = await query(
          `
          SELECT id
          FROM meals
          WHERE user_id = $1
            AND correlation_id IS NULL
            AND timestamp <= $2
          ORDER BY timestamp DESC
          LIMIT $3
        `,
          [userId, cutoffTime.toISOString(), limit]
        );

        let mealsAnalyzed = 0;
        for (const meal of mealsResult.rows) {
          const correlation = await detectMealResponse(userId, meal.id);
          if (correlation) mealsAnalyzed++;
        }

        results.analyzed.push({
          type: 'meal',
          count: mealsAnalyzed,
        });
      }

      // Analyze exercise without correlations
      if (analysisType === 'exercise' || analysisType === 'all') {
        const cutoffTime = new Date();
        cutoffTime.setHours(cutoffTime.getHours() - exerciseHoursAgo);

        const exerciseResult = await query(
          `
          SELECT id
          FROM exercise_logs
          WHERE user_id = $1
            AND correlation_id IS NULL
            AND timestamp <= $2
          ORDER BY timestamp DESC
          LIMIT $3
        `,
          [userId, cutoffTime.toISOString(), limit]
        );

        let exerciseAnalyzed = 0;
        for (const exercise of exerciseResult.rows) {
          const correlation = await detectExerciseResponse(userId, exercise.id);
          if (correlation) exerciseAnalyzed++;
        }

        results.analyzed.push({
          type: 'exercise',
          count: exerciseAnalyzed,
        });
      }

      // Analyze overnight basal for yesterday (in user's timezone)
      if (analysisType === 'basal' || analysisType === 'all') {
        // Get yesterday's date in user's timezone from database
        const yesterdayResult = await query(
          `SELECT DATE(timezone($1, NOW() - INTERVAL '1 day')) as date`,
          [userTimezone]
        );
        const dateStr = yesterdayResult.rows[0].date instanceof Date
          ? yesterdayResult.rows[0].date.toISOString().split('T')[0]
          : String(yesterdayResult.rows[0].date);

        const basalAnalysis = await detectBasalAdequacy(userId, dateStr, userTimezone);

        results.analyzed.push({
          type: 'basal',
          count: basalAnalysis ? 1 : 0,
          adequacy: basalAnalysis?.adequacy,
        });
      }

      const totalAnalyzed = results.analyzed.reduce(
        (sum: number, r: any) => sum + r.count,
        0
      );

      return JSON.stringify({
        success: true,
        totalAnalyzed,
        breakdown: results.analyzed,
        message:
          totalAnalyzed > 0
            ? `Successfully analyzed ${totalAnalyzed} events.`
            : 'No new events to analyze at this time.',
      });
    } catch (error) {
      console.error('Error running pattern detection:', error);
      return JSON.stringify({
        error: 'Failed to run pattern detection',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * ============================================================================
 * ADVANCED STATISTICAL ANALYSIS TOOLS
 * ============================================================================
 */

/**
 * Tool: Analyze Trends
 * Detect glucose trends and forecast future values
 */
const analyzeTrendsTool = new DynamicStructuredTool({
  name: 'analyze_trends',
  description:
    'Detect glucose trends over time and forecast future values. Returns trend direction (improving/worsening/stable), linear regression analysis, and predictions for next few days. Use this when discussing long-term glucose control trends or predicting future patterns.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
    days: z.number().default(14).describe('Number of days to analyze (default: 14, max: 90)'),
    metricType: z
      .enum(['average_glucose', 'time_in_range', 'cv', 'fasting_glucose'])
      .default('average_glucose')
      .describe('Which metric to analyze for trends'),
    forecastDays: z
      .number()
      .default(3)
      .describe('Number of days to forecast (default: 3, max: 7)'),
  }),
  func: async ({ userId, userTimezone, days = 14, metricType = 'average_glucose', forecastDays = 3 }) => {
    const tz = userTimezone || 'America/New_York';
    try {
      // Validate inputs
      if (days > 90) days = 90;
      if (forecastDays > 7) forecastDays = 7;

      // Fetch daily metrics for the specified period
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      let metricColumn: string;
      let metricLabel: string;

      switch (metricType) {
        case 'time_in_range':
          metricColumn = 'COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*)';
          metricLabel = 'Time in Range %';
          break;
        case 'cv':
          metricColumn = '(STDDEV(glucose) / NULLIF(AVG(glucose), 0)) * 100';
          metricLabel = 'Coefficient of Variation %';
          break;
        case 'fasting_glucose':
          metricColumn = `AVG(CASE WHEN EXTRACT(HOUR FROM timezone('${tz}', timestamp)) BETWEEN 3 AND 7 THEN glucose END)`;
          metricLabel = 'Fasting Glucose (mg/dL)';
          break;
        default: // average_glucose
          metricColumn = 'AVG(glucose)';
          metricLabel = 'Average Glucose (mg/dL)';
      }

      const metricsResult = await query(
        `SELECT
          DATE(timezone($3, timestamp)) as date,
          ${metricColumn} as value
         FROM glucose_readings
         WHERE user_id = $1
           AND timestamp >= $2
         GROUP BY DATE(timezone($3, timestamp))
         HAVING COUNT(*) >= 10
         ORDER BY date ASC`,
        [userId, startDate.toISOString(), tz]
      );

      if (metricsResult.rows.length < 3) {
        return JSON.stringify({
          hasData: false,
          message: `Not enough data for trend analysis. Need at least 3 days with data, found ${metricsResult.rows.length}.`,
        });
      }

      // Prepare data for analysis
      const data = metricsResult.rows.map((r) => ({
        date: r.date,
        value: parseFloat(r.value || 0),
      }));

      // Call advanced analysis function
      const trendAnalysis = await analyzeTrend(data, metricType, forecastDays);

      return JSON.stringify(trendAnalysis);
    } catch (error) {
      console.error('Error analyzing trends:', error);
      return JSON.stringify({
        error: 'Failed to analyze trends',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Detect Anomalies
 * Identify unusual glucose events that deviate from established patterns
 */
const detectAnomaliesTool = new DynamicStructuredTool({
  name: 'detect_anomalies',
  description:
    'Identify unusual glucose events that deviate from your established patterns. Returns anomalies with severity levels, possible causes, and recommendations. Use this when investigating unexpected glucose readings or trying to identify problems.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
    days: z.number().default(7).describe('Number of days to analyze (default: 7)'),
    sensitivityLevel: z
      .enum(['low', 'medium', 'high'])
      .default('medium')
      .describe('Sensitivity level: low=only severe anomalies, medium=moderate+severe, high=all anomalies'),
    limit: z.number().default(10).describe('Maximum number of anomalies to return (default: 10, max: 50)'),
  }),
  func: async ({ userId, userTimezone, days = 7, sensitivityLevel = 'medium', limit = 10 }) => {
    try {
      const timezone = userTimezone || 'America/New_York';
      const maxLimit = Math.min(limit, 50); // Cap at 50 to prevent context explosion

      // Call advanced analysis function
      const anomalyDetection = await detectAnomalies(userId, days, sensitivityLevel, timezone);

      // Limit the number of anomalies returned to prevent context explosion
      if (anomalyDetection.anomalies && anomalyDetection.anomalies.length > maxLimit) {
        const truncatedAnomalies = anomalyDetection.anomalies.slice(0, maxLimit);
        return JSON.stringify({
          ...anomalyDetection,
          anomalies: truncatedAnomalies,
          anomaliesDetected: anomalyDetection.anomaliesDetected,
          anomaliesReturned: truncatedAnomalies.length,
          truncated: true,
          note: `Showing top ${maxLimit} of ${anomalyDetection.anomaliesDetected} anomalies detected`,
        });
      }

      return JSON.stringify(anomalyDetection);
    } catch (error) {
      console.error('Error detecting anomalies:', error);
      return JSON.stringify({
        error: 'Failed to detect anomalies',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Compare Periods (Statistical)
 * Statistical comparison between two time periods or contexts
 */
const comparePeriodsStatisticalTool = new DynamicStructuredTool({
  name: 'compare_periods_statistical',
  description:
    'Perform statistical comparison between time periods or contexts (weekday vs weekend, before/after event). Returns detailed metrics comparison, statistical significance (t-test), and interpretation. Use this when comparing different time periods to identify meaningful changes.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    comparisonType: z
      .enum(['time_periods', 'weekday_vs_weekend', 'before_after_event'])
      .describe('Type of comparison to perform'),
    period1Start: z.string().optional().describe('Start date for period 1 (ISO date, YYYY-MM-DD)'),
    period1End: z.string().optional().describe('End date for period 1 (ISO date, YYYY-MM-DD)'),
    period2Start: z.string().optional().describe('Start date for period 2 (ISO date, YYYY-MM-DD)'),
    period2End: z.string().optional().describe('End date for period 2 (ISO date, YYYY-MM-DD)'),
    eventDate: z
      .string()
      .optional()
      .describe('Event date for before/after comparison (ISO date, YYYY-MM-DD)'),
  }),
  func: async ({
    userId,
    comparisonType,
    period1Start,
    period1End,
    period2Start,
    period2End,
    eventDate,
  }) => {
    try {
      // Call advanced analysis function
      const periodComparison = await comparePeriods(userId, comparisonType, {
        period1Start,
        period1End,
        period2Start,
        period2End,
        eventDate,
      });

      return JSON.stringify(periodComparison);
    } catch (error) {
      console.error('Error comparing periods:', error);
      return JSON.stringify({
        error: 'Failed to compare periods',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * ============================================================================
 * MEAL LOGGING TOOLS
 * ============================================================================
 */

/**
 * Tool: Log a meal
 */
export const logMealTool = new DynamicStructuredTool({
  name: 'log_meal',
  description: 'Save a meal to the database with nutrition estimates. Always confirm with user before saving.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    timezone: z.string().optional().describe('User timezone (automatically provided from context)'),
    timestamp: z.string().optional().describe('Meal timestamp in USER\'S LOCAL TIMEZONE in format "YYYY-MM-DD HH:MM" (24-hour format). Examples: "2026-02-07 18:30" for 6:30 PM, "2026-02-07 08:15" for 8:15 AM. Server will convert to UTC. Leave empty for current time. For "yesterday", use yesterday\'s date. DO NOT manually convert to UTC - just provide the local time.'),
    description: z.string().describe('Meal description'),
    estimatedCarbs: z.number().describe('Estimated carbohydrates (grams)'),
    estimatedProtein: z.number().optional().describe('Estimated protein (grams)'),
    estimatedFat: z.number().optional().describe('Estimated fat (grams)'),
    estimatedCalories: z.number().optional().describe('Estimated calories'),
    carbConfidence: z.number().min(0).max(1).describe('Confidence in carb estimate (0-1)'),
    estimationMethod: z.string().describe('How carbs were estimated'),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional()
      .describe('Meal type'),
    tags: z.array(z.string()).optional().describe('Tags for categorization'),
    notes: z.string().optional().describe('Additional notes'),
  }),
  func: async ({ userId, timezone, timestamp, description, estimatedCarbs, estimatedProtein, estimatedFat, estimatedCalories, carbConfidence, estimationMethod, mealType, tags, notes }) => {
    try {
      let mealTimestamp: string;

      if (timestamp) {
        // Parse local timestamp and convert to UTC
        // Expected format: "YYYY-MM-DD HH:MM" or ISO string
        const userTimezone = timezone || 'America/New_York';

        try {
          // Check if it's already an ISO string (has 'T' or 'Z')
          if (timestamp.includes('T') || timestamp.includes('Z')) {
            // Already in UTC ISO format
            mealTimestamp = timestamp;
          } else {
            // Parse as local time and convert to UTC
            // Format: "YYYY-MM-DD HH:MM"
            const [datePart, timePart] = timestamp.split(' ');
            const [year, month, day] = datePart.split('-').map(Number);
            const [hour, minute] = timePart.split(':').map(Number);

            // Create date in user's timezone
            const localTimeStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;

            // Convert to UTC using PostgreSQL's AT TIME ZONE
            // This interprets the timestamp AS being in the user's timezone and returns UTC
            const tzResult = await query(
              `SELECT ($2::timestamp AT TIME ZONE $1) as utc_time`,
              [userTimezone, localTimeStr]
            );

            mealTimestamp = tzResult.rows[0].utc_time.toISOString();
            console.log(`[log_meal] Converted ${timestamp} (${userTimezone}) -> ${mealTimestamp} (UTC)`);
          }
        } catch (parseError) {
          console.error(`[log_meal] Error parsing timestamp "${timestamp}":`, parseError);
          // Fallback to current time
          mealTimestamp = new Date().toISOString();
        }
      } else {
        mealTimestamp = new Date().toISOString();
      }

      const result = await query(
        `INSERT INTO meals (
          user_id, timestamp, description, carbs, meal_type, notes, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'agent')
        RETURNING id, timestamp, description, carbs, meal_type`,
        [
          userId, mealTimestamp, description, estimatedCarbs, mealType, notes,
        ]
      );

      return JSON.stringify({
        success: true,
        meal: {
          id: result.rows[0].id,
          timestamp: result.rows[0].timestamp,
          description: result.rows[0].description,
          carbs: parseFloat(result.rows[0].carbs),
        },
        message: `Logged: ${description} (~${estimatedCarbs}g carbs)`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Update an existing meal
 */
export const updateMealTool = new DynamicStructuredTool({
  name: 'update_meal',
  description: 'Update an existing meal log. Use this to fix incorrect information or add more details. Always confirm changes with user first.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    mealId: z.string().describe('The ID of the meal to update'),
    timestamp: z.string().optional().describe('New timestamp in ISO format if changing time'),
    description: z.string().optional().describe('Updated meal description'),
    carbs: z.number().optional().describe('Updated carbohydrates (grams)'),
    notes: z.string().optional().describe('Updated or additional notes'),
  }),
  func: async ({ userId, mealId, timestamp, description, carbs, notes }) => {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (timestamp !== undefined) {
        updates.push(`timestamp = $${paramIndex}`);
        params.push(timestamp);
        paramIndex++;
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }
      if (carbs !== undefined) {
        updates.push(`carbs = $${paramIndex}`);
        params.push(carbs);
        paramIndex++;
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramIndex}`);
        params.push(notes);
        paramIndex++;
      }

      if (updates.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'No fields to update',
        });
      }

      // Verify ownership and update
      const result = await query(
        `UPDATE meals SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
         RETURNING id, timestamp, description, carbs, meal_type, notes`,
        [...params, mealId, userId]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Meal not found or unauthorized',
        });
      }

      const meal = result.rows[0];
      return JSON.stringify({
        success: true,
        meal,
        message: `Updated meal: ${meal.description}`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Delete a meal
 */
export const deleteMealTool = new DynamicStructuredTool({
  name: 'delete_meal',
  description: 'Delete a meal log. Always confirm with user before deleting.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    mealId: z.string().describe('The ID of the meal to delete'),
  }),
  func: async ({ userId, mealId }) => {
    try {
      // Verify ownership before deleting
      const result = await query(
        'DELETE FROM meals WHERE id = $1 AND user_id = $2 RETURNING id',
        [mealId, userId]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Meal not found or unauthorized',
        });
      }

      return JSON.stringify({
        success: true,
        message: 'Meal deleted successfully',
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get meal history
 */
export const getMealHistoryTool = new DynamicStructuredTool({
  name: 'get_meal_history',
  description: 'Retrieve past meals for analysis or comparison',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    days: z.number().default(14).describe('Number of days to look back (default 14 for better coverage)'),
    mealType: z.string().optional().describe('Filter by meal type'),
    limit: z.number().default(100).describe('Max meals to return (default 100 for comprehensive analysis)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, days, mealType, limit, userTimezone }) => {
    // Use provided timezone or fallback
    const timezone = userTimezone || 'America/New_York';

    console.log('[get_meal_history] Called with:', { userId, days, mealType, limit, timezone });

    // Use date arithmetic for full calendar days
    let queryText = `
      SELECT id, timestamp, description, carbs, meal_type, tags, notes
      FROM meals
      WHERE user_id = $1
        AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') - INTERVAL '${days} days'
        AND timestamp < DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') + INTERVAL '1 day'
        AND timestamp <= NOW()
    `;
    const params = [userId];

    if (mealType) {
      queryText += ` AND meal_type = $2`;
      params.push(mealType);
    }

    queryText += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    console.log('[get_meal_history] Executing query with params:', params);
    console.log('[get_meal_history] Query:', queryText.replace(/\s+/g, ' ').trim());

    const result = await query(queryText, params);

    console.log('[get_meal_history] Found', result.rows.length, 'meals');
    if (result.rows.length > 0) {
      console.log('[get_meal_history] First meal:', {
        description: result.rows[0].description,
        timestamp: result.rows[0].timestamp,
        meal_type: result.rows[0].meal_type
      });
    }

    const meals = result.rows.map(r => ({
      id: r.id,
      timestamp: convertToUserTimezone(r.timestamp, timezone),
      description: r.description,
      carbs: parseFloat(r.carbs || 0),
      mealType: r.meal_type,
      tags: r.tags,
      notes: r.notes,
    }));

    return JSON.stringify({
      count: result.rows.length,
      timezone: timezone,
      meals: meals,
    });
  },
});

/**
 * ============================================================================
 * EXERCISE LOGGING TOOLS
 * ============================================================================
 */


/**
 * Tool: Log exercise
 */
export const logExerciseTool = new DynamicStructuredTool({
  name: 'log_exercise',
  description: 'Save an exercise session to the database. Always confirm with user before saving.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    timestamp: z.string().optional().describe('Exercise timestamp in ISO format (YYYY-MM-DDTHH:mm:ss.000Z). CRITICAL: Follow the "Timezone Conversion for Timestamps" instructions in User Context. Convert user\'s local time to UTC. Leave empty ONLY if user wants exact current time.'),
    description: z.string().describe('Exercise description'),
    activityType: z.enum(['cardio', 'strength', 'flexibility', 'sports'])
      .describe('Activity type'),
    durationMinutes: z.number().describe('Duration in minutes'),
    intensity: z.enum(['low', 'moderate', 'high', 'intense'])
      .describe('Exercise intensity'),
    notes: z.string().optional().describe('Additional notes'),
  }),
  func: async ({ userId, timestamp, description, activityType, durationMinutes, intensity, notes }) => {
    try {
      const exerciseTimestamp = timestamp || new Date().toISOString();

      const result = await query(
        `INSERT INTO exercise_logs (
          user_id, timestamp, description, activity_type, duration_minutes, intensity, notes, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'agent')
        RETURNING id, timestamp, description, duration_minutes, intensity`,
        [userId, exerciseTimestamp, description, activityType, durationMinutes, intensity, notes]
      );

      return JSON.stringify({
        success: true,
        exercise: {
          id: result.rows[0].id,
          timestamp: result.rows[0].timestamp,
          description: result.rows[0].description,
          duration: result.rows[0].duration_minutes,
          intensity: result.rows[0].intensity,
        },
        message: `Logged: ${description} (${durationMinutes} min, ${intensity} intensity)`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Update an existing exercise log
 */
export const updateExerciseTool = new DynamicStructuredTool({
  name: 'update_exercise',
  description: 'Update an existing exercise log. Use this to fix incorrect information or add more details. Always confirm changes with user first.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    exerciseId: z.string().describe('The ID of the exercise log to update'),
    timestamp: z.string().optional().describe('New timestamp in ISO format if changing time'),
    description: z.string().optional().describe('Updated exercise description'),
    activityType: z.enum(['cardio', 'strength', 'flexibility', 'sports']).optional()
      .describe('Updated activity type'),
    durationMinutes: z.number().optional().describe('Updated duration in minutes'),
    intensity: z.enum(['low', 'moderate', 'high', 'intense']).optional()
      .describe('Updated exercise intensity'),
    notes: z.string().optional().describe('Updated or additional notes'),
  }),
  func: async ({ userId, exerciseId, timestamp, description, activityType, durationMinutes, intensity, notes }) => {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (timestamp !== undefined) {
        updates.push(`timestamp = $${paramIndex}`);
        params.push(timestamp);
        paramIndex++;
      }
      if (description !== undefined) {
        updates.push(`description = $${paramIndex}`);
        params.push(description);
        paramIndex++;
      }
      if (activityType !== undefined) {
        updates.push(`activity_type = $${paramIndex}`);
        params.push(activityType);
        paramIndex++;
      }
      if (durationMinutes !== undefined) {
        updates.push(`duration_minutes = $${paramIndex}`);
        params.push(durationMinutes);
        paramIndex++;
      }
      if (intensity !== undefined) {
        updates.push(`intensity = $${paramIndex}`);
        params.push(intensity);
        paramIndex++;
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramIndex}`);
        params.push(notes);
        paramIndex++;
      }

      if (updates.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'No fields to update',
        });
      }

      // Verify ownership and update
      const result = await query(
        `UPDATE exercise_logs SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
         RETURNING id, timestamp, description, activity_type, duration_minutes, intensity, notes`,
        [...params, exerciseId, userId]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Exercise log not found or unauthorized',
        });
      }

      const exercise = result.rows[0];
      return JSON.stringify({
        success: true,
        exercise,
        message: `Updated exercise: ${exercise.description}`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Delete an exercise log
 */
export const deleteExerciseTool = new DynamicStructuredTool({
  name: 'delete_exercise',
  description: 'Delete an exercise log. Always confirm with user before deleting.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    exerciseId: z.string().describe('The ID of the exercise log to delete'),
  }),
  func: async ({ userId, exerciseId }) => {
    try {
      // Verify ownership before deleting
      const result = await query(
        'DELETE FROM exercise_logs WHERE id = $1 AND user_id = $2 RETURNING id',
        [exerciseId, userId]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Exercise log not found or unauthorized',
        });
      }

      return JSON.stringify({
        success: true,
        message: 'Exercise log deleted successfully',
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get exercise history
 */
export const getExerciseHistoryTool = new DynamicStructuredTool({
  name: 'get_exercise_history',
  description: 'Retrieve past exercise sessions for analysis',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    days: z.number().default(14).describe('Number of days to look back (default 14 for better coverage)'),
    limit: z.number().default(100).describe('Max sessions to return (default 100 for comprehensive analysis)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, days, limit, userTimezone }) => {
    // Use provided timezone or fallback
    const timezone = userTimezone || 'America/New_York';

    // Use date arithmetic for full calendar days
    const result = await query(
      `SELECT id, timestamp, description, activity_type, duration_minutes, intensity, notes
       FROM exercise_logs
       WHERE user_id = $1
         AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') - INTERVAL '${days} days'
         AND timestamp < DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') + INTERVAL '1 day'
         AND timestamp <= NOW()
       ORDER BY timestamp DESC
       LIMIT $2`,
      [userId, limit]
    );

    return JSON.stringify({
      count: result.rows.length,
      timezone: timezone,
      sessions: result.rows.map(r => ({
        id: r.id,
        timestamp: convertToUserTimezone(r.timestamp, timezone),
        description: r.description,
        activityType: r.activity_type,
        duration: r.duration_minutes,
        intensity: r.intensity,
        notes: r.notes,
      })),
    });
  },
});

/**
 * ============================================================================
 * INSULIN LOGGING TOOLS
 * ============================================================================
 */

/**
 * Tool: Log insulin dose
 */
export const logInsulinTool = new DynamicStructuredTool({
  name: 'log_insulin',
  description: 'Log an insulin dose. Always confirm exact details with user before saving.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    timestamp: z.string().optional().describe('Insulin dose timestamp in ISO format (YYYY-MM-DDTHH:mm:ss.000Z). CRITICAL: Follow the "Timezone Conversion for Timestamps" instructions in User Context. Convert user\'s local time to UTC. Leave empty ONLY if user wants exact current time.'),
    insulinType: z.string()
      .describe('Insulin brand/type (e.g., Humalog, Novolog, Lantus, Fiasp)'),
    units: z.number().describe('Number of units'),
    purpose: z.enum(['meal', 'correction', 'basal'])
      .describe('Purpose of dose'),
    notes: z.string().optional().describe('Additional notes'),
  }),
  func: async ({ userId, timestamp, insulinType, units, purpose, notes }) => {
    try {
      const doseTimestamp = timestamp || new Date().toISOString();

      const result = await query(
        `INSERT INTO insulin_doses (
          user_id, timestamp, type, insulin_type, units, notes, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'agent')
        RETURNING id, timestamp, type, insulin_type, units`,
        [userId, doseTimestamp, purpose, insulinType, units, notes]
      );

      return JSON.stringify({
        success: true,
        dose: {
          id: result.rows[0].id,
          timestamp: result.rows[0].timestamp,
          type: result.rows[0].type,
          insulinType: result.rows[0].insulin_type,
          units: parseFloat(result.rows[0].units),
        },
        message: `Logged: ${units} units of ${insulinType} (${purpose})`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Update an existing insulin dose
 */
export const updateInsulinTool = new DynamicStructuredTool({
  name: 'update_insulin',
  description: 'Update an existing insulin dose log. Use this to fix incorrect information or add more details. Always confirm changes with user first.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    doseId: z.string().describe('The ID of the insulin dose to update'),
    timestamp: z.string().optional().describe('New timestamp in ISO format if changing time'),
    insulinType: z.string().optional()
      .describe('Updated insulin brand/type (e.g., Humalog, Novolog, Lantus, Fiasp)'),
    units: z.number().optional().describe('Updated number of units'),
    purpose: z.enum(['meal', 'correction', 'basal']).optional()
      .describe('Updated purpose of dose'),
    notes: z.string().optional().describe('Updated or additional notes'),
  }),
  func: async ({ userId, doseId, timestamp, insulinType, units, purpose, notes }) => {
    try {
      // Build dynamic update query
      const updates: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      if (timestamp !== undefined) {
        updates.push(`timestamp = $${paramIndex}`);
        params.push(timestamp);
        paramIndex++;
      }
      if (insulinType !== undefined) {
        updates.push(`insulin_type = $${paramIndex}`);
        params.push(insulinType);
        paramIndex++;
      }
      if (units !== undefined) {
        updates.push(`units = $${paramIndex}`);
        params.push(units);
        paramIndex++;
      }
      if (purpose !== undefined) {
        updates.push(`purpose = $${paramIndex}`);
        params.push(purpose);
        paramIndex++;
      }
      if (notes !== undefined) {
        updates.push(`notes = $${paramIndex}`);
        params.push(notes);
        paramIndex++;
      }

      if (updates.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'No fields to update',
        });
      }

      // Verify ownership and update
      const result = await query(
        `UPDATE insulin_doses SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
         RETURNING id, timestamp, insulin_type, brand_name, units, purpose, notes`,
        [...params, doseId, userId]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Insulin dose not found or unauthorized',
        });
      }

      const dose = result.rows[0];
      return JSON.stringify({
        success: true,
        dose,
        message: `Updated insulin dose: ${dose.units} units of ${dose.insulin_type}`,
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Delete an insulin dose
 */
export const deleteInsulinTool = new DynamicStructuredTool({
  name: 'delete_insulin',
  description: 'Delete an insulin dose log. Always confirm with user before deleting.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    doseId: z.string().describe('The ID of the insulin dose to delete'),
  }),
  func: async ({ userId, doseId }) => {
    try {
      // Verify ownership before deleting
      const result = await query(
        'DELETE FROM insulin_doses WHERE id = $1 AND user_id = $2 RETURNING id',
        [doseId, userId]
      );

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          error: 'Insulin dose not found or unauthorized',
        });
      }

      return JSON.stringify({
        success: true,
        message: 'Insulin dose deleted successfully',
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get insulin history
 */
export const getInsulinHistoryTool = new DynamicStructuredTool({
  name: 'get_insulin_history',
  description: 'Retrieve past insulin doses for analysis',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    days: z.number().default(14).describe('Number of days to look back (default 14 for better coverage)'),
    purpose: z.string().optional().describe('Filter by purpose'),
    limit: z.number().default(100).describe('Max doses to return (default 100 for comprehensive analysis)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, days, purpose, limit, userTimezone }) => {
    // Use provided timezone or fallback
    const timezone = userTimezone || 'America/New_York';

    // Use date arithmetic to get full calendar days, not just 24-hour periods
    // This ensures "yesterday" means "all of yesterday" not "last 24 hours"
    let queryText = `
      SELECT id, timestamp, type, insulin_type, units, notes
      FROM insulin_doses
      WHERE user_id = $1
        AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') - INTERVAL '${days} days'
        AND timestamp < DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') + INTERVAL '1 day'
        AND timestamp <= NOW()
    `;
    const params = [userId];

    if (purpose) {
      queryText += ` AND type = $2`;
      params.push(purpose);
    }

    queryText += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    return JSON.stringify({
      count: result.rows.length,
      timezone: timezone,
      doses: result.rows.map(r => ({
        id: r.id,
        timestamp: convertToUserTimezone(r.timestamp, timezone),
        insulinType: r.insulin_type,
        units: parseFloat(r.units),
        purpose: r.type,
        notes: r.notes,
      })),
    });
  },
});

/**
 * ============================================================================
 * ROUTINE PATTERN DETECTION & PROACTIVE LOGGING
 * ============================================================================
 */

/**
 * Tool: Detect Routine Patterns
 * Analyze user's regular meal, insulin, and exercise patterns
 */
export const detectRoutinePatternsTool = new DynamicStructuredTool({
  name: 'detect_routine_patterns',
  description: 'Analyze the user\'s regular meal, insulin, and exercise patterns over the last 30 days. Returns high-confidence patterns (>70% consistency) with typical timing, amounts, and descriptions. Use this to understand their routine and suggest missing logs.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
    days: z.number().default(30).describe('Number of days to analyze (default 30)'),
  }),
  func: async ({ userId, userTimezone, days }) => {
    const timezone = userTimezone || 'America/New_York';

    // Analyze meal patterns grouped by time of day
    const mealResult = await query(
      `SELECT
        EXTRACT(HOUR FROM timezone($2, timestamp)) as hour,
        description,
        carbs,
        COUNT(*) as frequency,
        AVG(carbs) as avg_carbs,
        ARRAY_AGG(DISTINCT description) as descriptions
       FROM meals
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
       GROUP BY EXTRACT(HOUR FROM timezone($2, timestamp)), description, carbs
       HAVING COUNT(*) >= ${Math.ceil(days * 0.7 / 7)} -- At least 70% of weeks
       ORDER BY hour, frequency DESC`,
      [userId, timezone]
    );

    // Group meals by time slot (breakfast, lunch, dinner, snack)
    const mealPatterns: any[] = [];
    const hourGroups = new Map<string, any[]>();

    for (const row of mealResult.rows) {
      const hour = parseInt(row.hour);
      let slot = '';
      if (hour >= 5 && hour < 10) slot = 'breakfast';
      else if (hour >= 11 && hour < 14) slot = 'lunch';
      else if (hour >= 17 && hour < 21) slot = 'dinner';
      else slot = 'snack';

      if (!hourGroups.has(slot)) hourGroups.set(slot, []);
      hourGroups.get(slot)!.push({
        hour: row.hour,
        description: row.description,
        avgCarbs: parseFloat(row.avg_carbs).toFixed(0),
        frequency: parseInt(row.frequency),
        daysAnalyzed: days,
      });
    }

    // For each slot, pick the most common meal
    for (const [slot, meals] of hourGroups.entries()) {
      if (meals.length > 0) {
        const topMeal = meals[0]; // Already sorted by frequency DESC
        const consistency = (topMeal.frequency / days) * 100;

        if (consistency >= 70) { // Only high-confidence patterns
          mealPatterns.push({
            type: 'meal',
            slot,
            typicalTime: `${topMeal.hour}:00`,
            description: topMeal.description || `usual ${slot}`,
            avgCarbs: topMeal.avgCarbs,
            frequency: topMeal.frequency,
            consistency: consistency.toFixed(0) + '%',
          });
        }
      }
    }

    // Analyze insulin patterns (basal doses are very regular)
    const insulinResult = await query(
      `SELECT
        EXTRACT(HOUR FROM timezone($2, timestamp)) as hour,
        insulin_type,
        type as purpose,
        AVG(units) as avg_units,
        COUNT(*) as frequency
       FROM insulin_doses
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
       GROUP BY EXTRACT(HOUR FROM timezone($2, timestamp)), insulin_type, type
       HAVING COUNT(*) >= ${Math.ceil(days * 0.7 / 7)}
       ORDER BY hour, frequency DESC`,
      [userId, timezone]
    );

    const insulinPatterns = insulinResult.rows
      .map((row: any) => {
        const consistency = (parseInt(row.frequency) / days) * 100;
        if (consistency >= 70) {
          return {
            type: 'insulin',
            typicalTime: `${row.hour}:00`,
            insulinType: row.insulin_type,
            avgUnits: parseFloat(row.avg_units).toFixed(1),
            purpose: row.purpose,
            frequency: parseInt(row.frequency),
            consistency: consistency.toFixed(0) + '%',
          };
        }
        return null;
      })
      .filter((p: any) => p !== null);

    // Analyze exercise patterns (grouped by day of week and time)
    const exerciseResult = await query(
      `SELECT
        EXTRACT(DOW FROM timezone($2, timestamp)) as day_of_week,
        EXTRACT(HOUR FROM timezone($2, timestamp)) as hour,
        activity_type,
        AVG(duration_minutes) as avg_duration,
        intensity,
        COUNT(*) as frequency
       FROM exercise_logs
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
       GROUP BY day_of_week, hour, activity_type, intensity
       HAVING COUNT(*) >= ${Math.ceil(days * 0.5 / 7)} -- 50% consistency for exercise
       ORDER BY frequency DESC`,
      [userId, timezone]
    );

    const exercisePatterns = exerciseResult.rows
      .map((row: any) => {
        const weeksInPeriod = days / 7;
        const consistency = (parseInt(row.frequency) / weeksInPeriod) * 100;
        if (consistency >= 50) {
          const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
          return {
            type: 'exercise',
            dayOfWeek: dayNames[parseInt(row.day_of_week)],
            typicalTime: `${row.hour}:00`,
            activityType: row.activity_type,
            avgDuration: Math.round(parseFloat(row.avg_duration)),
            intensity: row.intensity,
            frequency: parseInt(row.frequency),
            consistency: consistency.toFixed(0) + '%',
          };
        }
        return null;
      })
      .filter((p: any) => p !== null);

    return JSON.stringify({
      analysisWindow: `${days} days`,
      mealPatterns,
      insulinPatterns,
      exercisePatterns,
      summary: `Found ${mealPatterns.length} meal patterns, ${insulinPatterns.length} insulin patterns, ${exercisePatterns.length} exercise patterns with ≥70% consistency`,
    });
  },
});

/**
 * Tool: Get Missing Logs Suggestions
 * Check for missing logs based on detected routine patterns
 */
export const getMissingLogsSuggestionsTool = new DynamicStructuredTool({
  name: 'get_missing_logs_suggestions',
  description: 'Check what meals, insulin doses, or exercise sessions might be missing based on the user\'s routine patterns. Compares today\'s or a specific day\'s logs against their typical schedule. Use this proactively to help users log their data.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
    targetDate: z.string().optional().describe('Date to check (ISO date, YYYY-MM-DD). Defaults to today.'),
    includeToday: z.boolean().default(true).describe('Include today in the check (default true)'),
  }),
  func: async ({ userId, userTimezone, targetDate, includeToday }) => {
    const timezone = userTimezone || 'America/New_York';

    // First, detect routine patterns
    const patternsResult = await detectRoutinePatternsTool.func({ userId, userTimezone, days: 30 });
    const patterns = JSON.parse(patternsResult);

    // Determine target date
    const checkDate = targetDate || new Date().toLocaleDateString('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).split('/').reverse().join('-'); // Convert MM/DD/YYYY to YYYY-MM-DD

    // Get current hour in user's timezone
    const currentHour = parseInt(new Date().toLocaleString('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false
    }));

    const suggestions: any[] = [];

    // Check meal patterns
    for (const pattern of patterns.mealPatterns) {
      const patternHour = parseInt(pattern.typicalTime.split(':')[0]);

      // Only check if the time has passed (or it's close)
      if (!includeToday || currentHour >= patternHour - 1) {
        // Check if this meal was logged
        const mealCheck = await query(
          `SELECT COUNT(*) as count FROM meals
           WHERE user_id = $1
             AND DATE(timezone($2, timestamp)) = $3
             AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN $4 AND $5`,
          [userId, timezone, checkDate, patternHour - 1, patternHour + 1]
        );

        if (parseInt(mealCheck.rows[0].count) === 0) {
          suggestions.push({
            type: 'meal',
            slot: pattern.slot,
            description: pattern.description,
            typicalTime: pattern.typicalTime,
            avgCarbs: pattern.avgCarbs,
            confidence: pattern.consistency,
            suggestion: `I'd like to log your ${pattern.slot} for you. Did you eat around ${pattern.typicalTime} (usual ~${pattern.avgCarbs}g carbs)?`,
          });
        }
      }
    }

    // Check insulin patterns
    for (const pattern of patterns.insulinPatterns) {
      const patternHour = parseInt(pattern.typicalTime.split(':')[0]);

      if (!includeToday || currentHour >= patternHour - 1) {
        const insulinCheck = await query(
          `SELECT COUNT(*) as count FROM insulin_doses
           WHERE user_id = $1
             AND DATE(timezone($2, timestamp)) = $3
             AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN $4 AND $5
             AND insulin_type = $6`,
          [userId, timezone, checkDate, patternHour - 1, patternHour + 1, pattern.insulinType]
        );

        if (parseInt(insulinCheck.rows[0].count) === 0) {
          suggestions.push({
            type: 'insulin',
            insulinType: pattern.insulinType,
            brandName: pattern.brandName,
            typicalTime: pattern.typicalTime,
            avgUnits: pattern.avgUnits,
            purpose: pattern.purpose,
            confidence: pattern.consistency,
            suggestion: `Did you take your usual ${pattern.avgUnits} units of ${pattern.brandName || pattern.insulinType} around ${pattern.typicalTime}?`,
          });
        }
      }
    }

    return JSON.stringify({
      targetDate: checkDate,
      suggestionsCount: suggestions.length,
      suggestions,
      message: suggestions.length === 0
        ? 'All regular logs appear to be up to date!'
        : `Found ${suggestions.length} potential missing log(s) based on your routine.`,
    });
  },
});

/**
 * ============================================================================
 * REPORT ACCESS TOOLS
 * ============================================================================
 */

/**
 * Tool: Get Daily Report
 * Retrieve a specific daily report
 */
const getDailyReportTool = new DynamicStructuredTool({
  name: 'get_daily_report',
  description:
    'Retrieve a daily health report for a specific date. Returns comprehensive daily metrics, patterns, and insights.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    date: z.string().optional().describe('Report date (ISO date, YYYY-MM-DD). Defaults to yesterday if not specified.'),
  }),
  func: async ({ userId, date }) => {
    try {
      // Default to yesterday if no date specified
      const reportDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      let result = await query(
        `SELECT * FROM daily_reports
         WHERE user_id = $1 AND report_date = $2`,
        [userId, reportDate]
      );

      // If report doesn't exist, generate it on-demand
      if (result.rows.length === 0) {
        console.log(`📊 Daily report for ${reportDate} not found, generating on-demand...`);
        try {
          await reportingService.generateDailyReportNow(userId, reportDate);

          // Fetch the newly generated report
          result = await query(
            `SELECT * FROM daily_reports
             WHERE user_id = $1 AND report_date = $2`,
            [userId, reportDate]
          );

          if (result.rows.length === 0) {
            return JSON.stringify({
              found: false,
              message: `Unable to generate daily report for ${reportDate}. There may be insufficient data for that date.`,
            });
          }
        } catch (error) {
          console.error('Error generating daily report on-demand:', error);
          return JSON.stringify({
            found: false,
            message: `Failed to generate daily report for ${reportDate}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      const report = result.rows[0];

      return JSON.stringify({
        found: true,
        report: {
          date: report.report_date,
          metrics: {
            avgGlucose: parseFloat(report.avg_glucose).toFixed(1),
            minGlucose: parseFloat(report.min_glucose).toFixed(1),
            maxGlucose: parseFloat(report.max_glucose).toFixed(1),
            stdDev: parseFloat(report.std_dev).toFixed(1),
            cv: parseFloat(report.cv).toFixed(1),
            estimatedA1c: parseFloat(report.estimated_a1c).toFixed(1),
          },
          timeInRange: {
            tir_70_180: parseFloat(report.tir_70_180_pct).toFixed(1) + '%',
            tir_70_140: parseFloat(report.tir_70_140_pct).toFixed(1) + '%',
            timeBelow70: parseFloat(report.time_below_70_pct).toFixed(1) + '%',
            timeAbove180: parseFloat(report.time_above_180_pct).toFixed(1) + '%',
          },
          events: {
            hypoEpisodes: report.hypoglycemia_episodes,
            hyperEpisodes: report.hyperglycemia_episodes,
            mealsLogged: report.meals_logged,
            exerciseSessions: report.exercise_sessions,
          },
          overnight: {
            avgGlucose: report.overnight_avg_glucose ? parseFloat(report.overnight_avg_glucose).toFixed(1) : null,
            stability: report.overnight_stability,
          },
          summary: report.summary,
          highlights: report.highlights,
          patternsDetected: report.patterns_detected,
          generatedAt: report.generated_at,
        },
      });
    } catch (error) {
      console.error('Error retrieving daily report:', error);
      return JSON.stringify({
        error: 'Failed to retrieve daily report',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get Weekly Report
 * Retrieve a specific weekly report
 */
const getWeeklyReportTool = new DynamicStructuredTool({
  name: 'get_weekly_report',
  description:
    'Retrieve a weekly health report for a specific week. Returns weekly trends, comparisons, and recommendations.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    weekStart: z
      .string()
      .optional()
      .describe('Week start date (ISO date, YYYY-MM-DD, should be a Monday). Defaults to last Monday if not specified.'),
  }),
  func: async ({ userId, weekStart }) => {
    try {
      // Default to last Monday if no date specified
      const start = weekStart || (() => {
        const today = new Date();
        const dayOfWeek = today.getDay();
        const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const lastMonday = new Date(today);
        lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
        return lastMonday.toISOString().split('T')[0];
      })();

      let result = await query(
        `SELECT * FROM weekly_reports
         WHERE user_id = $1 AND week_start_date = $2`,
        [userId, start]
      );

      // If report doesn't exist, generate it on-demand
      if (result.rows.length === 0) {
        console.log(`📊 Weekly report for week starting ${start} not found, generating on-demand...`);
        try {
          await reportingService.generateWeeklyReportNow(userId, start);

          // Fetch the newly generated report
          result = await query(
            `SELECT * FROM weekly_reports
             WHERE user_id = $1 AND week_start_date = $2`,
            [userId, start]
          );

          if (result.rows.length === 0) {
            return JSON.stringify({
              found: false,
              message: `Unable to generate weekly report for week starting ${start}. There may be insufficient data for that week.`,
            });
          }
        } catch (error) {
          console.error('Error generating weekly report on-demand:', error);
          return JSON.stringify({
            found: false,
            message: `Failed to generate weekly report for week starting ${start}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      const report = result.rows[0];

      return JSON.stringify({
        found: true,
        report: {
          weekStart: report.week_start_date,
          weekEnd: report.week_end_date,
          metrics: {
            avgGlucose: parseFloat(report.avg_glucose_week).toFixed(1),
            avgTir: parseFloat(report.avg_tir_70_180_pct).toFixed(1) + '%',
            avgCv: parseFloat(report.avg_cv).toFixed(1) + '%',
            estimatedA1c: parseFloat(report.estimated_a1c).toFixed(1),
          },
          trend: {
            direction: report.trend_direction,
            slope: parseFloat(report.trend_slope || 0).toFixed(2),
            rSquared: parseFloat(report.trend_r_squared || 0).toFixed(2),
          },
          comparison: report.vs_previous_week,
          bestDay: {
            date: report.best_day_date,
            avg: report.best_day_avg ? parseFloat(report.best_day_avg).toFixed(1) : null,
          },
          worstDay: {
            date: report.worst_day_date,
            avg: report.worst_day_avg ? parseFloat(report.worst_day_avg).toFixed(1) : null,
          },
          patterns: report.patterns_summary,
          summary: report.summary,
          highlights: report.highlights,
          recommendations: report.recommendations,
          generatedAt: report.generated_at,
        },
      });
    } catch (error) {
      console.error('Error retrieving weekly report:', error);
      return JSON.stringify({
        error: 'Failed to retrieve weekly report',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get Monthly Report
 * Retrieve a specific monthly report
 */
const getMonthlyReportTool = new DynamicStructuredTool({
  name: 'get_monthly_report',
  description:
    'Retrieve a comprehensive monthly health report. Returns monthly metrics, weekly breakdown, pattern evolution, and healthcare provider summary.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    monthStart: z
      .string()
      .optional()
      .describe('Month start date (ISO date, YYYY-MM-DD, should be 1st of month). Defaults to 1st of last month if not specified.'),
  }),
  func: async ({ userId, monthStart }) => {
    try {
      // Default to 1st of last month if no date specified
      const start = monthStart || (() => {
        const today = new Date();
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        return lastMonthStart.toISOString().split('T')[0];
      })();

      let result = await query(
        `SELECT * FROM monthly_reports
         WHERE user_id = $1 AND month_start_date = $2`,
        [userId, start]
      );

      // If report doesn't exist, generate it on-demand
      if (result.rows.length === 0) {
        console.log(`📊 Monthly report for month starting ${start} not found, generating on-demand...`);
        try {
          await reportingService.generateMonthlyReportNow(userId, start);

          // Fetch the newly generated report
          result = await query(
            `SELECT * FROM monthly_reports
             WHERE user_id = $1 AND month_start_date = $2`,
            [userId, start]
          );

          if (result.rows.length === 0) {
            return JSON.stringify({
              found: false,
              message: `Unable to generate monthly report for month starting ${start}. There may be insufficient data for that month.`,
            });
          }
        } catch (error) {
          console.error('Error generating monthly report on-demand:', error);
          return JSON.stringify({
            found: false,
            message: `Failed to generate monthly report for month starting ${start}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      const report = result.rows[0];

      return JSON.stringify({
        found: true,
        report: {
          monthStart: report.month_start_date,
          monthEnd: report.month_end_date,
          metrics: {
            avgGlucose: parseFloat(report.avg_glucose_month).toFixed(1),
            avgTir: parseFloat(report.avg_tir_70_180_pct).toFixed(1) + '%',
            avgCv: parseFloat(report.avg_cv).toFixed(1) + '%',
            estimatedA1c: parseFloat(report.estimated_a1c).toFixed(1),
            a1cConfidenceInterval: {
              lower: parseFloat(report.a1c_confidence_interval_lower).toFixed(1),
              upper: parseFloat(report.a1c_confidence_interval_upper).toFixed(1),
            },
          },
          totals: {
            hypoEpisodes: report.total_hypoglycemia_episodes,
            hyperEpisodes: report.total_hyperglycemia_episodes,
            mealsLogged: report.total_meals_logged,
            exerciseSessions: report.total_exercise_sessions,
            insulinDoses: report.total_insulin_doses,
          },
          weeklyBreakdown: report.weekly_data,
          patterns: {
            summary: report.patterns_summary,
            changes: report.pattern_changes,
          },
          comparisons: {
            vsPreviousMonth: report.vs_previous_month,
            vs3MonthsAgo: report.vs_3_months_ago,
          },
          longTermTrend: report.long_term_trend,
          summary: report.summary,
          highlights: report.highlights,
          recommendations: report.recommendations,
          providerSummary: report.provider_summary,
          generatedAt: report.generated_at,
        },
      });
    } catch (error) {
      console.error('Error retrieving monthly report:', error);
      return JSON.stringify({
        error: 'Failed to retrieve monthly report',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Search research papers
 */
export const searchResearchPapersTool = new DynamicStructuredTool({
  name: 'search_research_papers',
  description: 'Search for recent diabetes research papers on a specific topic. Use this when user asks about research or scientific studies.',
  schema: z.object({
    query: z.string().describe('Search query for research papers'),
    maxResults: z.number().default(5).describe('Maximum number of results (default 5)'),
    startYear: z.number().optional().describe('Only include papers from this year onwards'),
  }),
  func: async ({ query, maxResults, startYear }) => {
    try {
      const papers = await researchService.searchPapers(query, maxResults, startYear);

      if (papers.length === 0) {
        return JSON.stringify({
          found: 0,
          message: `No research papers found for "${query}". Try broadening the search terms.`
        });
      }

      const results = papers.map(p => ({
        title: p.title,
        authors: p.authors.slice(0, 3).join(', ') + (p.authors.length > 3 ? ' et al.' : ''),
        journal: p.journal,
        year: p.publishedDate.getFullYear(),
        abstract: p.abstract.substring(0, 300) + '...',
        url: p.url
      }));

      return JSON.stringify({
        found: papers.length,
        query,
        papers: results
      });
    } catch (error) {
      console.error('Search research papers error:', error);
      return JSON.stringify({
        error: 'Failed to search research papers',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },
});

/**
 * Tool: Request research on a topic (async)
 */
export const requestResearchTool = new DynamicStructuredTool({
  name: 'request_research',
  description: 'Request in-depth research on a diabetes topic. This will search, analyze, and send findings to the user proactively. Use when user asks to "research" something.',
  schema: z.object({
    userId: z.string().optional().describe('User ID (automatically provided)'),
    topic: z.string().describe('Research topic to investigate'),
  }),
  func: async ({ userId, topic }) => {
    try {
      // Acknowledge request immediately
      const response = await researchMonitor.handleOnDemandRequest(userId!, topic);

      return JSON.stringify({
        success: true,
        message: response
      });
    } catch (error) {
      console.error('Request research error:', error);
      return JSON.stringify({
        error: 'Failed to process research request',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },
});

/**
 * Tool: Generate medical report
 */
export const generateReportTool = new DynamicStructuredTool({
  name: 'generate_report',
  description: 'Generate a comprehensive medical report (PDF) for the user to share with their healthcare provider. Includes glucose charts, statistics, and analysis. Use when user asks to create/generate a report.',
  schema: z.object({
    userId: z.string().optional().describe('User ID (automatically provided)'),
    title: z.string().describe('Report title (e.g., "Weekly Review - December 2024")'),
    reportType: z.enum(['general', 'comparison', 'decision-support']).default('general').describe('Type of report: general (overview), comparison (compare periods), decision-support (specific question)'),
    dateRangeStart: z.string().describe('Start date for primary period (ISO format YYYY-MM-DD)'),
    dateRangeEnd: z.string().describe('End date for primary period (ISO format YYYY-MM-DD)'),
    comparisonRangeStart: z.string().optional().describe('Start date for comparison period (required for comparison reports)'),
    comparisonRangeEnd: z.string().optional().describe('End date for comparison period (required for comparison reports)'),
    notes: z.string().optional().describe('Optional notes or questions for healthcare provider'),
  }),
  func: async ({ userId, title, reportType, dateRangeStart, dateRangeEnd, comparisonRangeStart, comparisonRangeEnd, notes }) => {
    try {
      const reportGenerator = new ReportGenerator();

      // Validate dates
      const startDate = new Date(dateRangeStart);
      const endDate = new Date(dateRangeEnd);

      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        return JSON.stringify({
          error: 'Invalid date format. Please use YYYY-MM-DD format.'
        });
      }

      // Validate comparison dates if provided
      let compStartDate: Date | undefined;
      let compEndDate: Date | undefined;

      if (reportType === 'comparison') {
        if (!comparisonRangeStart || !comparisonRangeEnd) {
          return JSON.stringify({
            error: 'Comparison report requires both comparisonRangeStart and comparisonRangeEnd'
          });
        }

        compStartDate = new Date(comparisonRangeStart);
        compEndDate = new Date(comparisonRangeEnd);

        if (isNaN(compStartDate.getTime()) || isNaN(compEndDate.getTime())) {
          return JSON.stringify({
            error: 'Invalid comparison date format. Please use YYYY-MM-DD format.'
          });
        }
      }

      // Generate report
      const reportId = await reportGenerator.generateReport({
        userId: userId!,
        title,
        reportType,
        dateRangeStart: startDate,
        dateRangeEnd: endDate,
        comparisonRangeStart: compStartDate,
        comparisonRangeEnd: compEndDate,
        notes,
      });

      return JSON.stringify({
        success: true,
        reportId,
        title,
        message: `Report "${title}" is being generated. It will be available for download shortly in the Reports page. The report includes glucose charts, statistics, and analysis for ${dateRangeStart} to ${dateRangeEnd}.`
      });
    } catch (error) {
      console.error('Generate report error:', error);
      return JSON.stringify({
        error: 'Failed to generate report',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  },
});

/**
 * Tool: Execute SQL Query
 *
 * Allows the agent to run custom read-only SQL queries for flexible analysis
 * that existing tools don't support. Implements strict security controls.
 */
export const executeSqlQueryTool = new DynamicStructuredTool({
  name: 'execute_sql_query',
  description: `Execute a READ-ONLY SQL query against the database for custom analysis.

Use this when existing tools don't provide the flexibility needed, such as:
- Custom time ranges or date windows
- Complex correlations between multiple data types
- Aggregate calculations with specific groupings
- Pattern detection outside predefined windows

IMPORTANT: This is READ-ONLY access. Only SELECT queries are allowed.
All queries are automatically filtered to the current user's data.

Available tables (all prefixed with user_):
- user_glucose_readings: id, timestamp, glucose, device, record_type, trend, source, created_at
- user_meals: id, timestamp, description, carbs, meal_type, notes, source, created_at
- user_insulin_doses: id, timestamp, units, insulin_type, brand_name, purpose, notes, source, created_at
- user_exercise_logs: id, timestamp, duration_minutes, activity_type, intensity, description, notes, source, created_at
- user_glucose_patterns: id, pattern_type, time_of_day, avg_glucose, occurrences, last_seen
- user_glucose_correlations: id, factor_type, correlation_strength, confidence, last_updated
- user_sage_messages: id, type, title, content, sent_at

Common query patterns:
- Glucose during custom window: SELECT * FROM user_glucose_readings WHERE timestamp BETWEEN '2026-02-10' AND '2026-02-11'
- Meal impact correlation: SELECT m.*, AVG(gr.glucose) FROM user_meals m JOIN user_glucose_readings gr ON gr.timestamp BETWEEN m.timestamp AND m.timestamp + INTERVAL '2 hours' GROUP BY m.id
- Hourly averages: SELECT DATE_TRUNC('hour', timestamp) AS hour, AVG(glucose) AS avg_glucose FROM user_glucose_readings GROUP BY hour ORDER BY hour`,

  schema: z.object({
    query: z.string().describe('The SQL SELECT query to execute. Reference tables with user_ prefix (e.g., user_glucose_readings)'),
    description: z.string().describe('Human-readable description of what this query analyzes'),
    userId: z.string().optional().describe('User ID (automatically provided)'),
  }),

  func: async ({ query: sqlQuery, description, userId }) => {
    console.log(`[execute_sql_query] Running: ${description}`);
    console.log(`[execute_sql_query] SQL: ${sqlQuery.trim().replace(/\s+/g, ' ')}`);
    try {
      const result = await executeSafeReadOnlyQuery(userId!, sqlQuery, description);
      const parsed = JSON.parse(result);
      console.log(`[execute_sql_query] Returned ${parsed.rowCount ?? 0} rows`);
      return result;
    } catch (error) {
      console.error('[execute_sql_query] Error:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        description
      });
    }
  },
});

/**
 * Side-channel storage for charts produced by execute_python.
 * Charts are large base64 strings that shouldn't appear in the LLM context.
 * chat.ts calls collectPendingCharts() after graph execution to emit them as SSE events.
 */
const _pendingChartsByUser = new Map<string, string[]>();

export function collectPendingCharts(userId: string): string[] {
  const charts = _pendingChartsByUser.get(userId) ?? [];
  _pendingChartsByUser.delete(userId);
  return charts;
}

/**
 * Tool: Execute Python
 *
 * Runs arbitrary Python analysis code in a sandboxed subprocess.
 * Data is pre-injected as pandas DataFrames — no DB credentials reach Python.
 */
export const executePythonTool = new DynamicStructuredTool({
  name: 'execute_python',
  description: `Run Python for statistical analysis or chart generation. Data is pre-loaded as pandas DataFrames.

IMPORTANT: Do NOT use import statements in your code — all libraries are already available:
- pd (pandas), np (numpy), plt (matplotlib.pyplot), mdates (matplotlib.dates), mticker (matplotlib.ticker)
- stats (scipy.stats), math, statistics, datetime, json

Pre-loaded DataFrames (timestamps in user's local timezone):
- df_glucose: timestamp, glucose (mg/dL), trend, device
- df_meals: timestamp, description, carbs (g), meal_type
- df_insulin: timestamp, insulin_type, units, type
- df_exercise: timestamp, activity_type, description, duration_minutes, intensity
- df_sleep: timestamp, duration_minutes, quality
- user_tz: timezone string (e.g. "America/New_York")

Chart generation: call plt.show() after creating a figure — charts appear inline below your response.

Use this tool for:
- Statistical correlations (e.g. sleep duration vs next-morning glucose)
- Rolling averages, variability profiles, coefficient of variation
- Regression analysis (scipy.stats.linregress)
- Any visualization (time series, scatter plots, histograms, heatmaps)
- Complex analysis that execute_sql can't express as a single query

Example:
  mean = df_glucose['glucose'].mean()
  std = df_glucose['glucose'].std()
  print(f"Mean: {mean:.1f}, CV: {std/mean*100:.1f}%")

  fig, ax = plt.subplots(figsize=(10, 4))
  ax.plot(df_glucose['timestamp'], df_glucose['glucose'])
  plt.tight_layout()
  plt.show()`,

  schema: z.object({
    code: z.string().describe('Python code to execute. Do not use import statements.'),
    lookbackDays: z.number().default(60).describe('Days of history to load (max 180)'),
    userId: z.string().optional().describe('Injected automatically'),
    userTimezone: z.string().optional().describe('Injected automatically'),
  }),

  func: async ({ code, lookbackDays, userId, userTimezone }) => {
    const timezone = userTimezone ?? 'America/New_York';
    console.log(`[execute_python] User=${userId?.slice(0, 8)} lookbackDays=${lookbackDays} codeLines=${code.split('\n').length}`);

    try {
      const result = await executePython(userId!, timezone, code, { lookbackDays });

      // Store charts in side-channel — don't include base64 in LLM context
      if (result.charts.length > 0 && userId) {
        const existing = _pendingChartsByUser.get(userId) ?? [];
        _pendingChartsByUser.set(userId, [...existing, ...result.charts]);
        console.log(`[execute_python] Stored ${result.charts.length} chart(s) for user ${userId.slice(0, 8)}`);
      }

      return JSON.stringify({
        output: result.output,
        executionMs: result.executionMs,
        chartsGenerated: result.charts.length,
        error: result.error ?? null,
      });
    } catch (error) {
      console.error('[execute_python] Unexpected error:', error);
      return JSON.stringify({
        output: '',
        executionMs: 0,
        chartsGenerated: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

/**
 * Tool: Get Cached Analysis
 *
 * Retrieves pre-computed extended pattern analysis results from the analysis_cache table.
 * Results are refreshed by the background pattern detector on a configurable schedule.
 */
const getCachedAnalysisTool = new DynamicStructuredTool({
  name: 'get_cached_analysis',
  description: `Retrieve pre-computed deep analysis results from the background pattern detector.

Available analysis types (computed from last 30-60 days of data):
- "dawn_phenomenon"      — Whether glucose rises consistently 3–6am (even without food/insulin)
- "somogyi_rebound"      — Nocturnal lows followed by morning hyperglycemia rebounds
- "hourly_variability"   — Per-hour mean, std, CV, TIR across all 24 hours of the day
- "tir_by_period"        — TIR/TAR/TBR split by overnight/morning/afternoon/evening + overall GMI
- "insulin_sensitivity"  — Estimated ISF (mg/dL per unit) from correction bolus events
- "glucose_momentum"     — 7/14/30-day average glucose and trend slope comparison
- "day_of_week_patterns" — Glucose by day of week, weekday vs. weekend comparison
- "rapid_glucose_changes"— Episodes of >50 mg/dL change within 60 minutes (rises and drops)

Use this tool for questions like:
- "Do I have dawn phenomenon?" → get_cached_analysis(analysisType="dawn_phenomenon")
- "What's my insulin sensitivity?" → get_cached_analysis(analysisType="insulin_sensitivity")
- "When is my glucose most variable?" → get_cached_analysis(analysisType="hourly_variability")
- "How is my glucose trending?" → get_cached_analysis(analysisType="glucose_momentum")
- "What's my GMI / estimated A1c?" → get_cached_analysis(analysisType="tir_by_period")

To get ALL analysis types at once, call without specifying analysisType.`,

  schema: z.object({
    analysisType: z.string().optional().describe(
      'Which analysis to fetch. Omit to get all cached analyses at once.'
    ),
    userId: z.string().optional().describe('Injected automatically'),
  }),

  func: async ({ analysisType, userId }) => {
    console.log(`[get_cached_analysis] user=${userId?.slice(0, 8)} type=${analysisType ?? 'all'}`);
    try {
      let result;
      if (analysisType) {
        result = await query(
          `SELECT analysis_type, computed_at, data_window_start, data_window_end, results, metadata
           FROM analysis_cache
           WHERE user_id = $1 AND analysis_type = $2`,
          [userId, analysisType]
        );
      } else {
        result = await query(
          `SELECT analysis_type, computed_at, data_window_start, data_window_end, results, metadata
           FROM analysis_cache
           WHERE user_id = $1
           ORDER BY computed_at DESC`,
          [userId]
        );
      }

      if (result.rows.length === 0) {
        return JSON.stringify({
          success: false,
          message: analysisType
            ? `No cached analysis found for type "${analysisType}". The background detector may not have run yet.`
            : 'No cached analyses found. The background detector may not have run yet.',
          availableTypes: [
            'dawn_phenomenon', 'somogyi_rebound', 'hourly_variability', 'tir_by_period',
            'insulin_sensitivity', 'glucose_momentum', 'day_of_week_patterns', 'rapid_glucose_changes',
          ],
        });
      }

      const analyses = result.rows.map(row => ({
        analysisType: row.analysis_type,
        computedAt: row.computed_at,
        windowStart: row.data_window_start,
        windowEnd: row.data_window_end,
        results: row.results,
        metadata: row.metadata,
      }));

      console.log(`[get_cached_analysis] Returned ${analyses.length} result(s)`);
      return JSON.stringify({ success: true, analyses });
    } catch (error) {
      console.error('[get_cached_analysis] Error:', error);
      return JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  },
});

export const allTools = [
  // Glucose analysis tools
  getRecentGlucoseTool,
  getGlucoseStatsTool,
  analyzeOvernightTool,
  detectPatternsTool,
  comparePeriodsTool,
  analyzeLiveTrendTool,
  checkAlertConditionsTool,

  // Memory tools
  storeMemoryTool,
  retrieveMemoryTool,
  deleteMemoryTool,

  // Meal logging tools
  logMealTool,
  updateMealTool,
  deleteMealTool,
  getMealHistoryTool,

  // Exercise logging tools
  logExerciseTool,
  updateExerciseTool,
  deleteExerciseTool,
  getExerciseHistoryTool,

  // Insulin logging tools
  logInsulinTool,
  updateInsulinTool,
  deleteInsulinTool,
  getInsulinHistoryTool,

  // Proactive monitoring tools
  getRecentSageMessagesTool,
  sendProactiveMessageTool,
  getUserContextTool,

  // Routine pattern detection & proactive logging
  detectRoutinePatternsTool,
  getMissingLogsSuggestionsTool,

  // Pattern analysis tools
  analyzeMealPatternsTool,
  analyzeIndividualMealTool,
  analyzeBasalPatternsTool,
  analyzeExercisePatternsTool,
  getDetectedPatternsTool,
  runPatternDetectionTool,

  // Advanced statistical analysis tools
  analyzeTrendsTool,
  detectAnomaliesTool,
  comparePeriodsStatisticalTool,

  // Report access tools
  getDailyReportTool,
  getWeeklyReportTool,
  getMonthlyReportTool,

  // Research tools
  searchResearchPapersTool,
  requestResearchTool,

  // Report generation tools
  generateReportTool,

  // Advanced query tools
  executeSqlQueryTool,
  executePythonTool,

  // Extended cached analysis
  getCachedAnalysisTool,
];
