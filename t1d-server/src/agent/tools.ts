import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { query } from '../config/database.js';
import { discordService } from '../services/discord.js';
import { pushNotificationService } from '../services/push-notification-service.js';
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

/**
 * Tool: Get recent glucose readings
 */
export const getRecentGlucoseTool = new DynamicStructuredTool({
  name: 'get_recent_glucose',
  description: 'Get recent glucose readings for the user. Returns up to the specified number of recent readings.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    limit: z.number().default(20).describe('Number of readings to return (default 20)'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, limit, userTimezone }) => {
    const result = await query(
      `SELECT timestamp, glucose, device, trend
       FROM glucose_readings
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [userId, limit]
    );

    const timezone = userTimezone || 'America/New_York';

    return JSON.stringify({
      count: result.rows.length,
      readings: result.rows.map(r => ({
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
  description: 'Analyze overnight fasting glucose patterns (3am-7am). Returns average, trends, and stability metrics.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
    days: z.number().default(7).describe('Number of days to analyze'),
  }),
  func: async ({ userId, userTimezone, days }) => {
    const tz = userTimezone || 'America/New_York';
    const result = await query(
      `SELECT
        DATE(timezone($2, timestamp)) as date,
        AVG(glucose) as avg_fasting,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose,
        STDDEV(glucose) as stability,
        COUNT(*) as reading_count
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) >= 3
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) < 7
       GROUP BY DATE(timezone($2, timestamp))
       ORDER BY date DESC`,
      [userId, tz]
    );

    const nights = result.rows.map(r => ({
      date: r.date,
      avgFasting: parseFloat(r.avg_fasting).toFixed(1),
      minGlucose: parseFloat(r.min_glucose).toFixed(1),
      maxGlucose: parseFloat(r.max_glucose).toFixed(1),
      stability: parseFloat(r.stability || 0).toFixed(1),
      readingCount: parseInt(r.reading_count),
    }));

    const overallAvg = nights.reduce((sum, n) => sum + parseFloat(n.avgFasting), 0) / nights.length;

    return JSON.stringify({
      period: `${days} days`,
      nightsAnalyzed: nights.length,
      overallAvgFasting: overallAvg.toFixed(1),
      nights,
    });
  },
});

/**
 * Tool: Detect glucose patterns
 */
export const detectPatternsTool = new DynamicStructuredTool({
  name: 'detect_patterns',
  description: 'Detect common glucose patterns like dawn phenomenon, post-meal spikes, overnight lows, etc.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
    days: z.number().default(14).describe('Number of days to analyze'),
  }),
  func: async ({ userId, userTimezone, days }) => {
    const tz = userTimezone || 'America/New_York';
    const patterns: string[] = [];

    // Check for dawn phenomenon (rising glucose 4am-8am in user's LOCAL timezone)
    const dawnResult = await query(
      `WITH hourly_avg AS (
        SELECT
          EXTRACT(HOUR FROM timezone($2, timestamp)) as hour,
          AVG(glucose) as avg_glucose
        FROM glucose_readings
        WHERE user_id = $1
          AND timestamp >= NOW() - INTERVAL '${days} days'
          AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN 4 AND 8
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
        patterns.push(`Dawn Phenomenon: Glucose rises ${(last - first).toFixed(0)} mg/dL from 4am-8am`);
      }
    }

    // Check for overnight lows (below 70 between midnight-6am in user's LOCAL timezone)
    const lowsResult = await query(
      `SELECT COUNT(*) as low_count,
              COUNT(*) * 100.0 / NULLIF((
                SELECT COUNT(*)
                FROM glucose_readings
                WHERE user_id = $1
                  AND timestamp >= NOW() - INTERVAL '${days} days'
                  AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN 0 AND 6
              ), 0) as low_percentage
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
         AND EXTRACT(HOUR FROM timezone($2, timestamp)) BETWEEN 0 AND 6
         AND glucose < 70`,
      [userId, tz]
    );

    const lowCount = parseInt(lowsResult.rows[0].low_count);
    const lowPct = parseFloat(lowsResult.rows[0].low_percentage || 0);
    if (lowCount > 0 && lowPct > 5) {
      patterns.push(`Overnight Lows: ${lowPct.toFixed(1)}% of overnight readings below 70 mg/dL`);
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
  description: 'Compare glucose metrics between two time periods to track improvement or changes.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    recentDays: z.number().default(7).describe('Recent period (e.g., last 7 days)'),
    comparisonDays: z.number().default(14).describe('Comparison period (e.g., 7-14 days ago)'),
  }),
  func: async ({ userId, recentDays, comparisonDays }) => {
    // Recent period
    const recentResult = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${recentDays} days'`,
      [userId]
    );

    // Comparison period
    const compResult = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${comparisonDays} days'
         AND timestamp < NOW() - INTERVAL '${recentDays} days'`,
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
  description: 'Check if any conditions warrant proactive outreach (not critical alerts). Returns insights about patterns worth discussing.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    userTimezone: z.string().optional().describe('The user timezone (automatically provided)'),
  }),
  func: async ({ userId, userTimezone }) => {
    const tz = userTimezone || 'America/New_York';
    const conditions = [];

    // Check recent pattern (last 24 hours)
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
         AND timestamp >= NOW() - INTERVAL '24 hours'`,
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
    hours: z.number().default(24).describe('Hours to look back (default 24)'),
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
  description: 'Send a proactive message to the user via push notification and Discord. Use this to reach out with insights, questions, or suggestions.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    type: z.enum(['insight', 'question', 'suggestion', 'daily_summary'])
      .describe('Type of message'),
    title: z.string().describe('Message title'),
    content: z.string().describe('Message content (supports markdown)'),
    metadata: z.object({}).optional().describe('Optional metadata to store with message'),
  }),
  func: async ({ userId, type, title, content, metadata }) => {
    try {
      console.log('[Proactive Message] Preparing to send:', {
        type,
        title,
        preview: content.substring(0, 100),
      });

      // 1. Create conversation for proactive message
      const conversationTitle = `Proactive: ${title}`;
      const conversationResult = await query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, $2)
         RETURNING id`,
        [userId, conversationTitle]
      );
      const conversationId = conversationResult.rows[0].id;

      // 2. Store message in sage_messages with conversation_id
      const dbResult = await query(
        `INSERT INTO sage_messages (user_id, conversation_id, type, title, content, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, sent_at`,
        [userId, conversationId, type, title, content, metadata ? JSON.stringify(metadata) : null]
      );

      const messageId = dbResult.rows[0].id;

      // 3. Save to chat_messages as assistant message
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

      // 4. Check notification preferences
      const preferences = await pushNotificationService.getPreferences(userId);

      if (preferences.proactive_enabled) {
        // 5. Send push notification with deep-link
        await pushNotificationService.sendToUser(userId, {
          title: title,
          body: content.length > 100 ? content.substring(0, 97) + '...' : content,
          icon: '/sage-icon.png',
          badge: '/sage-badge.png',
          data: {
            conversationId,
            url: `/chat?conversation=${conversationId}`,
          },
        });

        console.log('[Proactive Message] Push notification sent');
      } else {
        console.log('[Proactive Message] Push notifications disabled for user');
      }

      // 6. Optionally still send to Discord if configured
      if (discordService.isConfigured()) {
        await discordService.sendSageMessage(type, title, content);
        console.log('[Proactive Message] Discord message sent');
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
  }),
  func: async ({ userId }) => {
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

    // Get recent stats (last 7 days)
    const statsResult = await query(
      `SELECT
        COUNT(*) as reading_count,
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '7 days'`,
      [userId]
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
  }),
  func: async ({ userId, days = 14, mealType }) => {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      // Get meals in the time period
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
          AND m.timestamp >= $2
      `;
      const params: any[] = [userId, startDate.toISOString()];

      if (mealType) {
        mealQuery += ` AND m.meal_type = $3`;
        params.push(mealType);
      }

      mealQuery += ` ORDER BY m.timestamp DESC`;

      const mealsResult = await query(mealQuery, params);

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
          carbs: m.estimated_carbs,
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
 * Tool: Analyze Basal Patterns
 * Analyzes overnight fasting patterns to assess basal insulin adequacy
 */
const analyzeBasalPatternsTool = new DynamicStructuredTool({
  name: 'analyze_basal_patterns',
  description:
    'Analyze overnight fasting patterns (3am-7am) to assess basal insulin adequacy. Returns drift analysis, stability metrics, and recommendations. Use this when discussing basal insulin doses or overnight glucose control.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    days: z.number().default(14).describe('Number of days to analyze (default: 14)'),
  }),
  func: async ({ userId, days = 14 }) => {
    try {
      const results = [];

      // Analyze each night in the period
      for (let i = 0; i < days; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const analysis = await detectBasalAdequacy(userId, dateStr);
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
    'Manually trigger pattern detection analysis for recent unanalyzed meals, exercise, or overnight periods. Useful after user logs new data and wants immediate pattern insights. Returns summary of what was analyzed.',
  schema: z.object({
    userId: z.string().describe('User ID (auto-injected by system)'),
    analysisType: z
      .enum(['meal', 'exercise', 'basal', 'all'])
      .default('all')
      .describe('Type of analysis to run (default: all)'),
  }),
  func: async ({ userId, analysisType = 'all' }) => {
    try {
      const results: any = {
        analyzed: [],
      };

      // Analyze meals without correlations (>4 hours old)
      if (analysisType === 'meal' || analysisType === 'all') {
        const fourHoursAgo = new Date();
        fourHoursAgo.setHours(fourHoursAgo.getHours() - 4);

        const mealsResult = await query(
          `
          SELECT id
          FROM meals
          WHERE user_id = $1
            AND correlation_id IS NULL
            AND timestamp <= $2
          ORDER BY timestamp DESC
          LIMIT 10
        `,
          [userId, fourHoursAgo.toISOString()]
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

      // Analyze exercise without correlations (>2 hours old)
      if (analysisType === 'exercise' || analysisType === 'all') {
        const twoHoursAgo = new Date();
        twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

        const exerciseResult = await query(
          `
          SELECT id
          FROM exercise_logs
          WHERE user_id = $1
            AND correlation_id IS NULL
            AND timestamp <= $2
          ORDER BY timestamp DESC
          LIMIT 10
        `,
          [userId, twoHoursAgo.toISOString()]
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

      // Analyze overnight basal for yesterday
      if (analysisType === 'basal' || analysisType === 'all') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const dateStr = yesterday.toISOString().split('T')[0];

        const basalAnalysis = await detectBasalAdequacy(userId, dateStr);

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
    days: z.number().default(7).describe('Number of days to analyze (default: 7)'),
    sensitivityLevel: z
      .enum(['low', 'medium', 'high'])
      .default('medium')
      .describe('Sensitivity level: low=only severe anomalies, medium=moderate+severe, high=all anomalies'),
  }),
  func: async ({ userId, days = 7, sensitivityLevel = 'medium' }) => {
    try {
      // Call advanced analysis function
      const anomalyDetection = await detectAnomalies(userId, days, sensitivityLevel);

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
 * Tool: Estimate meal carbs from description
 */
export const estimateMealCarbsTool = new DynamicStructuredTool({
  name: 'estimate_meal_carbs',
  description: 'Estimate carbohydrates and nutrition from a meal description. Uses food database and AI knowledge to estimate portions.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    description: z.string().describe('Meal description (e.g., "noodles and sausage", "bagel with cream cheese")'),
    portionHints: z.string().optional().describe('Optional portion hints (e.g., "large bowl", "2 cups", "small")'),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack']).optional()
      .describe('Optional meal type'),
  }),
  func: async ({ userId, description, portionHints, mealType }) => {
    try {
      // Search food database for matching items
      const searchTerms = description.toLowerCase().split(/\s+/);
      const foodMatches = [];

      for (const term of searchTerms) {
        const result = await query(
          `SELECT name, serving_size, carbs_per_serving, protein_per_serving, fat_per_serving, calories_per_serving
           FROM food_database
           WHERE LOWER(name) LIKE $1
           LIMIT 3`,
          [`%${term}%`]
        );

        if (result.rows.length > 0) {
          foodMatches.push(...result.rows);
        }
      }

      // Estimate totals from matched foods
      let totalCarbs = 0;
      let totalProtein = 0;
      let totalFat = 0;
      let totalCalories = 0;
      let confidence = 0.5; // Base confidence
      const breakdown = [];

      if (foodMatches.length > 0) {
        // Found matches in database
        for (const food of foodMatches) {
          const portionMultiplier = portionHints?.toLowerCase().includes('large') ? 1.5 :
                                   portionHints?.toLowerCase().includes('small') ? 0.75 : 1.0;

          const carbs = parseFloat(food.carbs_per_serving || 0) * portionMultiplier;
          const protein = parseFloat(food.protein_per_serving || 0) * portionMultiplier;
          const fat = parseFloat(food.fat_per_serving || 0) * portionMultiplier;
          const calories = parseFloat(food.calories_per_serving || 0) * portionMultiplier;

          totalCarbs += carbs;
          totalProtein += protein;
          totalFat += fat;
          totalCalories += calories;

          breakdown.push({
            name: food.name,
            serving: food.serving_size,
            carbsEstimate: Math.round(carbs),
          });
        }

        confidence = portionHints ? 0.75 : 0.65;
      } else {
        // No database matches - use heuristic estimates
        // This is a simple fallback - in production would use LLM here
        const hasCarbs = /bread|rice|pasta|noodle|potato|bagel|cereal|oat|pizza|taco|burrito/i.test(description);
        const hasProtein = /meat|chicken|beef|fish|egg|sausage|bacon|tofu/i.test(description);

        if (hasCarbs) {
          totalCarbs = 45; // Rough estimate for typical carb portion
          confidence = 0.4;
        }
        if (hasProtein) {
          totalProtein = 25;
          totalCarbs += 5; // Small carbs from protein source
        }

        breakdown.push({
          name: 'Estimated from description',
          carbsEstimate: Math.round(totalCarbs),
        });

        confidence = 0.3; // Low confidence without database match
      }

      const needsMoreInfo = confidence < 0.6 || breakdown.length === 0;

      return JSON.stringify({
        success: true,
        description,
        portionHints,
        mealType,
        estimates: {
          carbs: Math.round(totalCarbs),
          protein: Math.round(totalProtein),
          fat: Math.round(totalFat),
          calories: Math.round(totalCalories),
        },
        confidence,
        breakdown,
        needsMoreInfo,
        suggestedQuestions: needsMoreInfo ? [
          'How large was the portion?',
          'Can you describe the serving size?',
          'Was this a full meal or a snack?',
        ] : [],
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
 * Tool: Log a meal
 */
export const logMealTool = new DynamicStructuredTool({
  name: 'log_meal',
  description: 'Save a meal to the database with nutrition estimates. Always confirm with user before saving.',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    timestamp: z.string().optional().describe('Meal timestamp in ISO format (YYYY-MM-DDTHH:mm:ss.000Z). CRITICAL: Follow the "Timezone Conversion for Timestamps" instructions in User Context. User times are in their LOCAL timezone and MUST be converted to UTC. For "yesterday", subtract 1 day. Leave empty ONLY if user wants exact current time.'),
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
  func: async ({ userId, timestamp, description, estimatedCarbs, estimatedProtein, estimatedFat, estimatedCalories, carbConfidence, estimationMethod, mealType, tags, notes }) => {
    try {
      const mealTimestamp = timestamp || new Date().toISOString();

      const result = await query(
        `INSERT INTO meals (
          user_id, timestamp, description, carbs, notes, source
        )
        VALUES ($1, $2, $3, $4, $5, 'agent')
        RETURNING id, timestamp, description, carbs`,
        [
          userId, mealTimestamp, description, estimatedCarbs, notes,
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
 * Tool: Get meal history
 */
export const getMealHistoryTool = new DynamicStructuredTool({
  name: 'get_meal_history',
  description: 'Retrieve past meals for analysis or comparison',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    days: z.number().default(7).describe('Number of days to look back'),
    mealType: z.string().optional().describe('Filter by meal type'),
    limit: z.number().default(20).describe('Max meals to return'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, days, mealType, limit, userTimezone }) => {
    // Use provided timezone or fallback
    const timezone = userTimezone || 'America/New_York';

    // Use date arithmetic for full calendar days
    let queryText = `
      SELECT id, timestamp, description, estimated_carbs, meal_type, tags, notes
      FROM meals
      WHERE user_id = $1
        AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') - INTERVAL '${days} days'
        AND timestamp < DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') + INTERVAL '1 day'
    `;
    const params = [userId];

    if (mealType) {
      queryText += ` AND meal_type = $2`;
      params.push(mealType);
    }

    queryText += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await query(queryText, params);

    return JSON.stringify({
      count: result.rows.length,
      timezone: timezone,
      meals: result.rows.map(r => ({
        id: r.id,
        timestamp: convertToUserTimezone(r.timestamp, timezone),
        description: r.description,
        carbs: parseFloat(r.estimated_carbs || 0),
        mealType: r.meal_type,
        tags: r.tags,
        notes: r.notes,
      })),
    });
  },
});

/**
 * ============================================================================
 * EXERCISE LOGGING TOOLS
 * ============================================================================
 */

/**
 * Tool: Estimate exercise intensity from description
 */
export const estimateExerciseIntensityTool = new DynamicStructuredTool({
  name: 'estimate_exercise_intensity',
  description: 'Estimate exercise type, intensity, and duration from description',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    description: z.string().describe('Exercise description (e.g., "30 min run", "played basketball")'),
  }),
  func: async ({ userId, description }) => {
    const lower = description.toLowerCase();

    // Extract duration if mentioned
    let durationMinutes = null;
    const durationMatch = lower.match(/(\d+)\s*(min|minute|hour|hr)/i);
    if (durationMatch) {
      const value = parseInt(durationMatch[1]);
      const unit = durationMatch[2];
      durationMinutes = unit.startsWith('h') ? value * 60 : value;
    }

    // Estimate activity type
    let activityType = 'cardio'; // default
    if (/walk|jog|run|bike|cycle|swim/i.test(lower)) {
      activityType = 'cardio';
    } else if (/weight|lift|strength|gym/i.test(lower)) {
      activityType = 'strength';
    } else if (/yoga|stretch|flexibility/i.test(lower)) {
      activityType = 'flexibility';
    } else if (/basketball|soccer|tennis|sport|game/i.test(lower)) {
      activityType = 'sports';
    }

    // Estimate intensity
    let intensity: 'low' | 'moderate' | 'high' | 'intense' = 'moderate';
    if (/light|easy|gentle|slow/i.test(lower)) {
      intensity = 'low';
    } else if (/intense|hard|vigorous|sprint/i.test(lower)) {
      intensity = 'intense';
    } else if (/moderate|normal|regular/i.test(lower)) {
      intensity = 'moderate';
    } else if (/high|fast|quick/i.test(lower)) {
      intensity = 'high';
    }

    // If duration not specified, estimate based on activity
    if (!durationMinutes) {
      if (/quick|short/i.test(lower)) {
        durationMinutes = 15;
      } else if (/long/i.test(lower)) {
        durationMinutes = 60;
      } else {
        durationMinutes = 30; // Default estimate
      }
    }

    const needsMoreInfo = !durationMatch; // If duration wasn't explicitly stated

    return JSON.stringify({
      success: true,
      description,
      estimates: {
        activityType,
        durationMinutes,
        intensity,
      },
      needsMoreInfo,
      suggestedQuestions: needsMoreInfo ? [
        'How long did you exercise?',
        'Was it a short or long session?',
      ] : [],
    });
  },
});

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
 * Tool: Get exercise history
 */
export const getExerciseHistoryTool = new DynamicStructuredTool({
  name: 'get_exercise_history',
  description: 'Retrieve past exercise sessions for analysis',
  schema: z.object({
    userId: z.string().optional().describe('The user ID (automatically provided)'),
    days: z.number().default(7).describe('Number of days to look back'),
    limit: z.number().default(20).describe('Max sessions to return'),
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
    insulinType: z.enum(['rapid', 'long', 'ultra_long', 'mixed'])
      .describe('Insulin type'),
    brandName: z.string().optional().describe('Brand name (e.g., Humalog, Novolog, Lantus)'),
    units: z.number().describe('Number of units'),
    purpose: z.enum(['meal', 'correction', 'basal'])
      .describe('Purpose of dose'),
    relatedMealId: z.string().optional().describe('Related meal ID if meal bolus'),
    notes: z.string().optional().describe('Additional notes'),
  }),
  func: async ({ userId, timestamp, insulinType, brandName, units, purpose, relatedMealId, notes }) => {
    try {
      const doseTimestamp = timestamp || new Date().toISOString();

      const result = await query(
        `INSERT INTO insulin_doses (
          user_id, timestamp, insulin_type, brand_name, units, purpose, related_meal_id, notes, source
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'agent')
        RETURNING id, timestamp, insulin_type, units, purpose`,
        [userId, doseTimestamp, insulinType, brandName, units, purpose, relatedMealId, notes]
      );

      return JSON.stringify({
        success: true,
        dose: {
          id: result.rows[0].id,
          timestamp: result.rows[0].timestamp,
          type: result.rows[0].insulin_type,
          units: parseFloat(result.rows[0].units),
          purpose: result.rows[0].purpose,
        },
        message: `Logged: ${units} units ${insulinType} insulin (${purpose})`,
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
    days: z.number().default(7).describe('Number of days to look back'),
    purpose: z.string().optional().describe('Filter by purpose'),
    limit: z.number().default(20).describe('Max doses to return'),
    userTimezone: z.string().optional().describe('User timezone (automatically provided)'),
  }),
  func: async ({ userId, days, purpose, limit, userTimezone }) => {
    // Use provided timezone or fallback
    const timezone = userTimezone || 'America/New_York';

    // Use date arithmetic to get full calendar days, not just 24-hour periods
    // This ensures "yesterday" means "all of yesterday" not "last 24 hours"
    let queryText = `
      SELECT id, timestamp, insulin_type, brand_name, units, purpose, notes
      FROM insulin_doses
      WHERE user_id = $1
        AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') - INTERVAL '${days} days'
        AND timestamp < DATE_TRUNC('day', NOW() AT TIME ZONE '${timezone}') + INTERVAL '1 day'
    `;
    const params = [userId];

    if (purpose) {
      queryText += ` AND purpose = $2`;
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
        type: r.insulin_type,
        brand: r.brand_name,
        units: parseFloat(r.units),
        purpose: r.purpose,
        notes: r.notes,
      })),
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
  estimateMealCarbsTool,
  logMealTool,
  getMealHistoryTool,

  // Exercise logging tools
  estimateExerciseIntensityTool,
  logExerciseTool,
  getExerciseHistoryTool,

  // Insulin logging tools
  logInsulinTool,
  getInsulinHistoryTool,

  // Proactive monitoring tools
  getRecentSageMessagesTool,
  sendProactiveMessageTool,
  getUserContextTool,

  // Pattern analysis tools
  analyzeMealPatternsTool,
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
];
