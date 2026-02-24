import { query } from '../config/database.js';

const TREND_ARROWS: Record<number, string> = {
  1: '↑↑ Rising Rapidly',
  2: '↑ Rising',
  3: '↗ Rising Slowly',
  4: '→ Flat',
  5: '↘ Falling Slowly',
  6: '↓ Falling',
  7: '↓↓ Falling Rapidly',
};

function formatTime(ts: Date | string, timezone: string): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: timezone,
    hour12: true,
  });
}

/** Returns the local date string "YYYY-MM-DD" for a timestamp in the given timezone. */
function localDateKey(ts: Date | string, timezone: string): string {
  return new Date(ts).toLocaleDateString('en-CA', { timeZone: timezone }); // "YYYY-MM-DD"
}

/** Human-readable day label relative to today. */
function dayLabel(dateKey: string, todayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  const date = new Date(`${dateKey}T12:00:00`); // noon avoids DST edge cases
  const today = new Date(`${todayKey}T12:00:00`);
  const diffDays = Math.round((today.getTime() - date.getTime()) / 86400000);
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Group an array of rows by local date (newest day first). */
function groupByDay<T extends { timestamp: Date | string }>(
  rows: T[],
  timezone: string
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = localDateKey(row.timestamp, timezone);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(row);
  }
  // Sort days descending (newest first)
  return new Map([...map.entries()].sort((a, b) => b[0].localeCompare(a[0])));
}

/**
 * Pre-fetch commonly needed context data for Sage.
 * Returns a formatted string summarizing user memories, current glucose,
 * and the last 7 days of meals, insulin, and exercise.
 *
 * This is injected as a SystemMessage at the start of every chat request
 * so Sage can skip re-fetching this data and focus on deeper analysis.
 */
/**
 * Run a query and return null on failure so one bad query can't kill the whole context.
 * null means "query failed" (distinct from { rows: [] } which means "no data found").
 * The caller uses null to emit a tool-fallback hint rather than a false "None logged".
 */
async function safeQuery(sql: string, params: any[], label: string): Promise<{ rows: any[] } | null> {
  try {
    return await query(sql, params);
  } catch (err: any) {
    console.error(`[context-prefetch] ${label} query failed:`, err?.message ?? err);
    return null;
  }
}

export async function buildCurrentContext(userId: string, timezone: string): Promise<string> {
  const tz = timezone || 'America/New_York';

  // Each query is independently fault-tolerant via safeQuery.
  // A failure in one section (e.g. a missing column, transient DB error) returns an empty
  // result for that section rather than throwing and wiping out the entire context.
  const [glucoseResult, mealsResult, insulinResult, exerciseResult, memoryResult] = await Promise.all([
    // Most recent glucose reading only — history is intentionally excluded so the model
    // always queries for specific values rather than anchoring on a stale snapshot
    safeQuery(
      `SELECT timestamp, glucose, trend
       FROM glucose_readings
       WHERE user_id = $1
       ORDER BY timestamp DESC
       LIMIT 1`,
      [userId],
      'glucose'
    ),
    // Last 7 days of meals
    safeQuery(
      `SELECT timestamp, description, carbs, meal_type
       FROM meals
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '7 days'
       ORDER BY timestamp ASC`,
      [userId],
      'meals'
    ),
    // Last 7 days of insulin
    safeQuery(
      `SELECT timestamp, insulin_type, units, purpose, notes
       FROM insulin_doses
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '7 days'
       ORDER BY timestamp ASC`,
      [userId],
      'insulin'
    ),
    // Last 7 days of exercise
    safeQuery(
      `SELECT timestamp, description, activity_type, duration_minutes, intensity
       FROM exercise_logs
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '7 days'
       ORDER BY timestamp ASC`,
      [userId],
      'exercise'
    ),
    // All user memories
    safeQuery(
      `SELECT key, value
       FROM agent_memory
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId],
      'memory'
    ),
  ]);

  // Log a single summary line so we can quickly spot failures or empty sections in the server log.
  const summarize = (label: string, result: { rows: any[] } | null) => {
    if (result === null) return `${label}=ERROR`;
    if (result.rows.length === 0) return `${label}=0`;
    return `${label}=${result.rows.length}`;
  };
  console.log(
    `[context-prefetch] user=${userId.slice(0, 8)} tz=${tz} | ` +
    [
      summarize('glucose', glucoseResult),
      summarize('meals', mealsResult),
      summarize('insulin', insulinResult),
      summarize('exercise', exerciseResult),
      summarize('memory', memoryResult),
    ].join(' ')
  );

  const todayKey = localDateKey(new Date(), tz);
  const lines: string[] = [];

  // --- User memory section ---
  if (memoryResult === null) {
    lines.push(`User memory: ⚠️ Could not load — use retrieve_user_memory tool`);
  } else {
    const memories = memoryResult.rows;
    if (memories.length > 0) {
      lines.push(`User memory (${memories.length} stored facts):`);
      memories.forEach(m => {
        const val = m.value;
        const summary = typeof val === 'object' && val !== null
          ? Object.entries(val)
              .filter(([k]) => k !== 'updated_at' && k !== 'timestamp')
              .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
              .join(', ')
          : String(val);
        lines.push(`  [${m.key}] ${summary}`);
      });
    } else {
      lines.push(`User memory: None stored yet`);
    }
  }

  lines.push('');

  // --- Glucose section ---
  // Only the single most recent reading is included. All glucose history must be
  // fetched via tools (get_recent_glucose / execute_sql) to avoid the model
  // anchoring on stale snapshot values when answering event-specific questions.
  if (glucoseResult === null) {
    lines.push(`Current glucose: ⚠️ Could not load — use get_recent_glucose tool`);
  } else {
    const readings = glucoseResult.rows;
    if (readings.length > 0) {
      const latest = readings[0];
      const latestGlucose = Math.round(parseFloat(latest.glucose));
      const trendStr = TREND_ARROWS[latest.trend] || '→ Flat';
      const readingAge = Math.round((Date.now() - new Date(latest.timestamp).getTime()) / 60000);
      lines.push(`Current glucose: ${latestGlucose} mg/dL — ${trendStr} (${readingAge} min ago)`);
      lines.push(`⚠️ Glucose history is NOT pre-loaded. Use get_recent_glucose or execute_sql for any past readings.`);
    } else {
      lines.push(`Current glucose: No recent readings available`);
    }
  }

  lines.push('');

  // --- Meals section ---
  if (mealsResult === null) {
    lines.push(`Meals — last 7 days: ⚠️ Could not load — use get_meal_history tool to check`);
  } else {
    const meals = mealsResult.rows;
    if (meals.length > 0) {
      lines.push(`Meals — last 7 days (${meals.length} entries):`);
      const byDay = groupByDay(meals, tz);
      for (const [dateKey, dayMeals] of byDay) {
        lines.push(`  ${dayLabel(dateKey, todayKey)}:`);
        for (const m of dayMeals) {
          const carbStr = m.carbs ? `, ${Math.round(parseFloat(m.carbs))}g carbs` : '';
          lines.push(`    ${formatTime(m.timestamp, tz)}: ${m.description || m.meal_type || 'Meal'}${carbStr}`);
        }
      }
    } else {
      lines.push(`Meals — last 7 days: None logged`);
    }
  }

  lines.push('');

  // --- Insulin section ---
  if (insulinResult === null) {
    lines.push(`Insulin — last 7 days: ⚠️ Could not load — use get_insulin_history tool to check`);
  } else {
    const insulin = insulinResult.rows;
    if (insulin.length > 0) {
      lines.push(`Insulin — last 7 days (${insulin.length} dose${insulin.length > 1 ? 's' : ''}):`);
      const byDay = groupByDay(insulin, tz);
      for (const [dateKey, dayDoses] of byDay) {
        lines.push(`  ${dayLabel(dateKey, todayKey)}:`);
        for (const d of dayDoses) {
          const units = parseFloat(d.units);
          const type = d.insulin_type || 'insulin';
          const purpose = d.purpose || '';
          const purposeStr = purpose ? ` (${purpose})` : '';
          lines.push(`    ${formatTime(d.timestamp, tz)}: ${units}u ${type}${purposeStr}`);
        }
      }
    } else {
      lines.push(`Insulin — last 7 days: None logged`);
    }
  }

  lines.push('');

  // --- Exercise section ---
  if (exerciseResult === null) {
    lines.push(`Exercise — last 7 days: ⚠️ Could not load — use get_exercise_history tool to check`);
  } else {
    const exercise = exerciseResult.rows;
    if (exercise.length > 0) {
      lines.push(`Exercise — last 7 days (${exercise.length} session${exercise.length > 1 ? 's' : ''}):`);
      const byDay = groupByDay(exercise, tz);
      for (const [dateKey, daySessions] of byDay) {
        lines.push(`  ${dayLabel(dateKey, todayKey)}:`);
        for (const e of daySessions) {
          const durationStr = e.duration_minutes ? ` ${e.duration_minutes}min` : '';
          const intensityStr = e.intensity ? ` (${e.intensity})` : '';
          const label = e.description || e.activity_type || 'Exercise';
          lines.push(`    ${formatTime(e.timestamp, tz)}:${durationStr} ${label}${intensityStr}`);
        }
      }
    } else {
      lines.push(`Exercise — last 7 days: None logged`);
    }
  }

  return lines.join('\n');
}
