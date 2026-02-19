import { query } from '../config/database.js';
import { convertToUserTimezone } from './timezone.js';

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

/**
 * Pre-fetch commonly needed context data for Sage.
 * Returns a formatted string summarizing user memories, current glucose,
 * today's meals, insulin, and exercise. Runs all queries in parallel for speed.
 *
 * This is injected as a SystemMessage at the start of every chat request
 * so Sage can skip re-fetching this data and focus on deeper analysis.
 */
export async function buildCurrentContext(userId: string, timezone: string): Promise<string> {
  const tz = timezone || 'America/New_York';

  const [glucoseResult, mealsResult, insulinResult, exerciseResult, memoryResult] = await Promise.all([
    // Recent glucose - last 2 hours
    query(
      `SELECT timestamp, glucose, trend
       FROM glucose_readings
       WHERE user_id = $1 AND timestamp >= NOW() - INTERVAL '2 hours'
       ORDER BY timestamp ASC`,
      [userId]
    ),
    // Today's meals
    query(
      `SELECT timestamp, description, carbs, meal_type
       FROM meals
       WHERE user_id = $1
         AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${tz}')
         AND timestamp <= NOW()
       ORDER BY timestamp ASC`,
      [userId]
    ),
    // Today's insulin
    query(
      `SELECT timestamp, insulin_type, units, type as purpose, notes
       FROM insulin_doses
       WHERE user_id = $1
         AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${tz}')
         AND timestamp <= NOW()
       ORDER BY timestamp ASC`,
      [userId]
    ),
    // Today's exercise
    query(
      `SELECT timestamp, description, activity_type, duration_minutes, intensity
       FROM exercise_logs
       WHERE user_id = $1
         AND timestamp >= DATE_TRUNC('day', NOW() AT TIME ZONE '${tz}')
         AND timestamp <= NOW()
       ORDER BY timestamp ASC`,
      [userId]
    ),
    // All user memories
    query(
      `SELECT key, value
       FROM agent_memory
       WHERE user_id = $1
       ORDER BY updated_at DESC`,
      [userId]
    ),
  ]);

  const lines: string[] = [];

  // --- User memory section ---
  const memories = memoryResult.rows;
  if (memories.length > 0) {
    lines.push(`User memory (${memories.length} stored facts):`);
    memories.forEach(m => {
      const val = m.value;
      // value is a JSONB object — render the meaningful fields, skip metadata
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

  lines.push('');

  // --- Glucose section ---
  const readings = glucoseResult.rows;
  if (readings.length > 0) {
    const latest = readings[readings.length - 1];
    const latestGlucose = Math.round(parseFloat(latest.glucose));
    const trendStr = TREND_ARROWS[latest.trend] || '→ Flat';
    lines.push(`Current glucose: ${latestGlucose} mg/dL — ${trendStr}`);

    if (readings.length > 1) {
      // Show trajectory as a compact timeline (value every ~15min)
      const sampled = readings.filter((_, i) => i % 3 === 0 || i === readings.length - 1);
      const timeline = sampled
        .map(r => `${formatTime(r.timestamp, tz)} ${Math.round(parseFloat(r.glucose))}`)
        .join(' → ');
      lines.push(`Recent readings: ${timeline}`);
    }
  } else {
    lines.push(`Current glucose: No readings in the last 2 hours`);
  }

  lines.push('');

  // --- Meals section ---
  const meals = mealsResult.rows;
  if (meals.length > 0) {
    lines.push(`Today's meals (${meals.length}):`);
    meals.forEach(m => {
      const carbStr = m.carbs ? `, ${Math.round(parseFloat(m.carbs))}g carbs` : '';
      lines.push(`  ${formatTime(m.timestamp, tz)}: ${m.description || m.meal_type || 'Meal'}${carbStr}`);
    });
  } else {
    lines.push(`Today's meals: None logged yet`);
  }

  lines.push('');

  // --- Insulin section ---
  const insulin = insulinResult.rows;
  if (insulin.length > 0) {
    lines.push(`Today's insulin (${insulin.length} dose${insulin.length > 1 ? 's' : ''}):`);
    insulin.forEach(d => {
      const units = parseFloat(d.units);
      const type = d.insulin_type || 'insulin';
      const purpose = d.purpose || '';
      const purposeStr = purpose ? ` (${purpose})` : '';
      lines.push(`  ${formatTime(d.timestamp, tz)}: ${units}u ${type}${purposeStr}`);
    });
  } else {
    lines.push(`Today's insulin: None logged yet`);
  }

  lines.push('');

  // --- Exercise section ---
  const exercise = exerciseResult.rows;
  if (exercise.length > 0) {
    lines.push(`Today's exercise (${exercise.length} session${exercise.length > 1 ? 's' : ''}):`);
    exercise.forEach(e => {
      const durationStr = e.duration_minutes ? ` ${e.duration_minutes}min` : '';
      const intensityStr = e.intensity ? ` (${e.intensity})` : '';
      const label = e.description || e.activity_type || 'Exercise';
      lines.push(`  ${formatTime(e.timestamp, tz)}:${durationStr} ${label}${intensityStr}`);
    });
  } else {
    lines.push(`Today's exercise: None logged today`);
  }

  return lines.join('\n');
}
