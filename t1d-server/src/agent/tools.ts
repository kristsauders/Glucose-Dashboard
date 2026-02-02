import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { query } from '../config/database.js';
import { discordService } from '../services/discord.js';

/**
 * Tool: Get recent glucose readings
 */
export const getRecentGlucoseTool = new DynamicStructuredTool({
  name: 'get_recent_glucose',
  description: 'Get recent glucose readings for the user. Returns up to the specified number of recent readings.',
  schema: z.object({
    userId: z.string().describe('The user ID'),
    limit: z.number().default(20).describe('Number of readings to return (default 20)'),
  }),
  func: async ({ userId, limit }) => {
    const result = await query(
      `SELECT timestamp, glucose, device, trend
       FROM glucose_readings
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [userId, limit]
    );

    return JSON.stringify({
      count: result.rows.length,
      readings: result.rows.map(r => ({
        timestamp: r.timestamp,
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
    userId: z.string().describe('The user ID'),
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
    userId: z.string().describe('The user ID'),
    days: z.number().default(7).describe('Number of days to analyze'),
  }),
  func: async ({ userId, days }) => {
    const result = await query(
      `SELECT
        DATE(timestamp) as date,
        AVG(glucose) as avg_fasting,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose,
        STDDEV(glucose) as stability,
        COUNT(*) as reading_count
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
         AND EXTRACT(HOUR FROM timestamp) >= 3
         AND EXTRACT(HOUR FROM timestamp) < 7
       GROUP BY DATE(timestamp)
       ORDER BY date DESC`,
      [userId]
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
    userId: z.string().describe('The user ID'),
    days: z.number().default(14).describe('Number of days to analyze'),
  }),
  func: async ({ userId, days }) => {
    const patterns: string[] = [];

    // Check for dawn phenomenon (rising glucose 4am-8am)
    const dawnResult = await query(
      `WITH hourly_avg AS (
        SELECT
          EXTRACT(HOUR FROM timestamp) as hour,
          AVG(glucose) as avg_glucose
        FROM glucose_readings
        WHERE user_id = $1
          AND timestamp >= NOW() - INTERVAL '${days} days'
          AND EXTRACT(HOUR FROM timestamp) BETWEEN 4 AND 8
        GROUP BY EXTRACT(HOUR FROM timestamp)
        ORDER BY hour
      )
      SELECT hour, avg_glucose FROM hourly_avg`,
      [userId]
    );

    if (dawnResult.rows.length >= 2) {
      const first = parseFloat(dawnResult.rows[0].avg_glucose);
      const last = parseFloat(dawnResult.rows[dawnResult.rows.length - 1].avg_glucose);
      if (last - first > 20) {
        patterns.push(`Dawn Phenomenon: Glucose rises ${(last - first).toFixed(0)} mg/dL from 4am-8am`);
      }
    }

    // Check for overnight lows (below 70 between midnight-6am)
    const lowsResult = await query(
      `SELECT COUNT(*) as low_count,
              COUNT(*) * 100.0 / NULLIF((
                SELECT COUNT(*)
                FROM glucose_readings
                WHERE user_id = $1
                  AND timestamp >= NOW() - INTERVAL '${days} days'
                  AND EXTRACT(HOUR FROM timestamp) BETWEEN 0 AND 6
              ), 0) as low_percentage
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '${days} days'
         AND EXTRACT(HOUR FROM timestamp) BETWEEN 0 AND 6
         AND glucose < 70`,
      [userId]
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
    userId: z.string().describe('The user ID'),
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
    userId: z.string().describe('The user ID'),
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
    userId: z.string().describe('The user ID'),
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
    userId: z.string().describe('The user ID'),
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
    userId: z.string().describe('The user ID'),
    hours: z.number().default(2).describe('Hours to analyze (default 2)'),
  }),
  func: async ({ userId, hours }) => {
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

    const readings = result.rows.map(r => ({
      timestamp: r.timestamp,
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
    userId: z.string().describe('The user ID'),
  }),
  func: async ({ userId }) => {
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

    // Check for repeated patterns (dawn phenomenon, post-meal spikes)
    const dawnCheck = await query(
      `SELECT AVG(glucose) as dawn_avg
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '7 days'
         AND EXTRACT(HOUR FROM timestamp) BETWEEN 5 AND 8`,
      [userId]
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
    userId: z.string().describe('The user ID'),
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
  description: 'Send a proactive message to the user via Discord. Use this to reach out with insights, questions, or suggestions.',
  schema: z.object({
    userId: z.string().describe('The user ID'),
    type: z.enum(['insight', 'question', 'suggestion', 'daily_summary'])
      .describe('Type of message'),
    title: z.string().describe('Message title'),
    content: z.string().describe('Message content (supports markdown)'),
    metadata: z.object({}).optional().describe('Optional metadata to store with message'),
  }),
  func: async ({ userId, type, title, content, metadata }) => {
    try {
      // Check if Discord is configured
      if (!discordService.isConfigured()) {
        return JSON.stringify({
          success: false,
          error: 'Discord webhook not configured',
        });
      }

      // Store message in database first
      const dbResult = await query(
        `INSERT INTO sage_messages (user_id, type, title, content, metadata)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, sent_at`,
        [userId, type, title, content, metadata ? JSON.stringify(metadata) : null]
      );

      const messageId = dbResult.rows[0].id;

      // Send to Discord
      await discordService.sendSageMessage(type, title, content);

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
        sentAt: dbResult.rows[0].sent_at,
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
 * Tool: Get user context for proactive analysis
 */
export const getUserContextTool = new DynamicStructuredTool({
  name: 'get_user_context',
  description: 'Get comprehensive user context including profile, recent stats, and stored memories. Use this when preparing proactive outreach.',
  schema: z.object({
    userId: z.string().describe('The user ID'),
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

export const allTools = [
  getRecentGlucoseTool,
  getGlucoseStatsTool,
  analyzeOvernightTool,
  detectPatternsTool,
  comparePeriodsTool,
  storeMemoryTool,
  retrieveMemoryTool,
  deleteMemoryTool,
  analyzeLiveTrendTool,
  checkAlertConditionsTool,
  getRecentSageMessagesTool,
  sendProactiveMessageTool,
  getUserContextTool,
];
