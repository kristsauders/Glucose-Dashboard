/**
 * Extended Pattern Detection Algorithms
 *
 * Eight deeper analysis algorithms that run periodically and cache results
 * in the analysis_cache table. Designed to complement the existing
 * meal/exercise/basal algorithms in pattern-algorithms.ts.
 *
 * Algorithms:
 *   1. dawn_phenomenon        — Consistent early-morning glucose rise 3-6am
 *   2. somogyi_rebound        — Nocturnal low followed by morning rebound high
 *   3. hourly_variability     — Per-hour mean/std/CV/TIR across 30 days
 *   4. tir_by_period          — TIR/TAR/TBR split by morning/afternoon/evening/overnight
 *   5. insulin_sensitivity    — Glucose drop per unit of rapid insulin
 *   6. glucose_momentum       — 7/14/30-day trend comparison and direction
 *   7. day_of_week            — Average glucose and variability by weekday
 *   8. rapid_glucose_changes  — Episodes of >50 mg/dL change within 60 minutes
 */

import { query } from '../config/database.js';

// ─── Shared helpers ───────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function cv(values: number[]): number {
  const m = mean(values);
  return m > 0 ? (stdDev(values) / m) * 100 : 0;
}

function tir(values: number[], lo = 70, hi = 180): number {
  if (!values.length) return 0;
  return (values.filter(v => v >= lo && v <= hi).length / values.length) * 100;
}

function percentile(sortedValues: number[], pct: number): number {
  if (!sortedValues.length) return 0;
  const idx = Math.floor((pct / 100) * (sortedValues.length - 1));
  return sortedValues[Math.max(0, Math.min(idx, sortedValues.length - 1))];
}

/** Simple linear regression — returns slope and intercept */
function linReg(xs: number[], ys: number[]): { slope: number; intercept: number; r2: number } {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const mx = mean(xs), my = mean(ys);
  let num = 0, den = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = my - slope * mx;
  const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i] + intercept)) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

/** Upsert a result into analysis_cache */
async function upsertCache(
  userId: string,
  analysisType: string,
  results: object,
  windowStart?: Date,
  windowEnd?: Date,
  metadata?: object
) {
  await query(
    `INSERT INTO analysis_cache
       (user_id, analysis_type, computed_at, data_window_start, data_window_end, results, metadata)
     VALUES ($1, $2, NOW(), $3, $4, $5, $6)
     ON CONFLICT (user_id, analysis_type)
     DO UPDATE SET
       computed_at = NOW(),
       data_window_start = EXCLUDED.data_window_start,
       data_window_end = EXCLUDED.data_window_end,
       results = EXCLUDED.results,
       metadata = EXCLUDED.metadata`,
    [
      userId,
      analysisType,
      windowStart?.toISOString() ?? null,
      windowEnd?.toISOString() ?? null,
      JSON.stringify(results),
      JSON.stringify(metadata ?? {}),
    ]
  );
}

// ─── Algorithm 1: Dawn Phenomenon ─────────────────────────────────────────────

/**
 * Dawn phenomenon: persistent glucose rise between 3–6am without bolus insulin.
 * Looks at nights where no rapid insulin was taken 10pm–3am and measures
 * average glucose rise rate from the 3am trough to the 6am level.
 */
export async function analyzeDawnPhenomenon(userId: string): Promise<void> {
  const lookbackDays = 30;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  // Fetch 3am–7am glucose readings for the last 30 days
  const result = await query(
    `SELECT DATE(timestamp AT TIME ZONE 'UTC') as day,
            EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') as hour,
            AVG(glucose) as avg_glucose,
            MIN(glucose) as min_glucose,
            MAX(glucose) as max_glucose,
            COUNT(*) as readings
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') BETWEEN 3 AND 6
     GROUP BY day, hour
     ORDER BY day, hour`,
    [userId, windowStart.toISOString()]
  );

  if (result.rows.length < 10) {
    await upsertCache(userId, 'dawn_phenomenon', {
      detected: false,
      reason: 'insufficient_data',
      daysAnalyzed: 0,
    }, windowStart, new Date());
    return;
  }

  // Group by day — get 3am and 6am averages for each day
  const byDay = new Map<string, { h3?: number; h4?: number; h5?: number; h6?: number }>();
  for (const row of result.rows) {
    const day = row.day;
    if (!byDay.has(day)) byDay.set(day, {});
    const entry = byDay.get(day)!;
    const h = Number(row.hour);
    if (h === 3) entry.h3 = Number(row.avg_glucose);
    if (h === 4) entry.h4 = Number(row.avg_glucose);
    if (h === 5) entry.h5 = Number(row.avg_glucose);
    if (h === 6) entry.h6 = Number(row.avg_glucose);
  }

  // Calculate rise from 3am to 6am for each day with both data points
  const rises: number[] = [];
  for (const [, d] of byDay) {
    if (d.h3 !== undefined && d.h6 !== undefined) {
      rises.push(d.h6 - d.h3);
    }
  }

  if (rises.length < 5) {
    await upsertCache(userId, 'dawn_phenomenon', {
      detected: false,
      reason: 'insufficient_paired_data',
      daysAnalyzed: byDay.size,
    }, windowStart, new Date());
    return;
  }

  const avgRise = mean(rises);
  const pctDaysWithRise = (rises.filter(r => r > 10).length / rises.length) * 100;
  const detected = avgRise > 15 && pctDaysWithRise > 50;

  await upsertCache(userId, 'dawn_phenomenon', {
    detected,
    avgRiseMgdl: Math.round(avgRise * 10) / 10,
    pctDaysWithRise: Math.round(pctDaysWithRise),
    daysAnalyzed: rises.length,
    severity: avgRise > 40 ? 'significant' : avgRise > 20 ? 'moderate' : 'mild',
    interpretation: detected
      ? `Glucose rises an average of ${Math.round(avgRise)} mg/dL between 3–6am on ${Math.round(pctDaysWithRise)}% of nights.`
      : `No consistent dawn phenomenon detected (avg rise: ${Math.round(avgRise)} mg/dL).`,
  }, windowStart, new Date(), { daysAnalyzed: rises.length });

  console.log(`    [dawn_phenomenon] detected=${detected} avgRise=${avgRise.toFixed(1)} days=${rises.length}`);
}

// ─── Algorithm 2: Somogyi Rebound ─────────────────────────────────────────────

/**
 * Somogyi rebound: nocturnal hypoglycemia (1–4am) followed by morning hyperglycemia.
 * Identifies nights with glucose < 70 between 1-4am and then > 140 by 6–8am.
 */
export async function analyzeSomogyiRebound(userId: string): Promise<void> {
  const lookbackDays = 30;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  const result = await query(
    `SELECT DATE(timestamp AT TIME ZONE 'UTC') as day,
            EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') as hour,
            MIN(glucose) as min_glucose,
            MAX(glucose) as max_glucose,
            COUNT(*) as readings
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') IN (1, 2, 3, 4, 6, 7, 8)
     GROUP BY day, hour
     ORDER BY day, hour`,
    [userId, windowStart.toISOString()]
  );

  const byDay = new Map<string, { lateNightMin?: number; morningMax?: number }>();
  for (const row of result.rows) {
    const day = row.day;
    if (!byDay.has(day)) byDay.set(day, {});
    const entry = byDay.get(day)!;
    const h = Number(row.hour);
    if (h >= 1 && h <= 4) {
      const minG = Number(row.min_glucose);
      entry.lateNightMin = entry.lateNightMin === undefined ? minG : Math.min(entry.lateNightMin, minG);
    }
    if (h >= 6 && h <= 8) {
      const maxG = Number(row.max_glucose);
      entry.morningMax = entry.morningMax === undefined ? maxG : Math.max(entry.morningMax, maxG);
    }
  }

  let reboundNights = 0;
  let totalNights = 0;
  const reboundMagnitudes: number[] = [];

  for (const [, d] of byDay) {
    if (d.lateNightMin !== undefined && d.morningMax !== undefined) {
      totalNights++;
      if (d.lateNightMin < 70 && d.morningMax > 140) {
        reboundNights++;
        reboundMagnitudes.push(d.morningMax - d.lateNightMin);
      }
    }
  }

  const pctNightsWithRebound = totalNights > 0 ? (reboundNights / totalNights) * 100 : 0;
  const detected = reboundNights >= 3 && pctNightsWithRebound > 20;

  await upsertCache(userId, 'somogyi_rebound', {
    detected,
    reboundNights,
    totalNightsAnalyzed: totalNights,
    pctNightsWithRebound: Math.round(pctNightsWithRebound),
    avgReboundMagnitude: reboundMagnitudes.length ? Math.round(mean(reboundMagnitudes)) : 0,
    interpretation: detected
      ? `Possible Somogyi rebound: ${reboundNights}/${totalNights} nights had late-night lows (<70) followed by morning highs (>140).`
      : `No consistent Somogyi rebound pattern detected (${reboundNights}/${totalNights} nights).`,
  }, windowStart, new Date());

  console.log(`    [somogyi_rebound] detected=${detected} rebounds=${reboundNights}/${totalNights}`);
}

// ─── Algorithm 3: Hourly Variability ─────────────────────────────────────────

/**
 * Per-hour mean, std, CV, TIR, TAR, TBR across the last 30 days.
 * Returns 24 data points, one per hour.
 */
export async function analyzeHourlyVariability(userId: string): Promise<void> {
  const lookbackDays = 30;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  const result = await query(
    `SELECT EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') as hour,
            glucose
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
     ORDER BY hour`,
    [userId, windowStart.toISOString()]
  );

  // Group glucose values by hour
  const byHour: number[][] = Array.from({ length: 24 }, () => []);
  for (const row of result.rows) {
    byHour[Number(row.hour)].push(Number(row.glucose));
  }

  const hourlyStats = byHour.map((values, hour) => {
    const sorted = [...values].sort((a, b) => a - b);
    return {
      hour,
      readingCount: values.length,
      mean: Math.round(mean(values)),
      stdDev: Math.round(stdDev(values) * 10) / 10,
      cv: Math.round(cv(values) * 10) / 10,
      tir: Math.round(tir(values)),
      tar: Math.round((values.filter(v => v > 180).length / Math.max(values.length, 1)) * 100),
      tbr: Math.round((values.filter(v => v < 70).length / Math.max(values.length, 1)) * 100),
      p10: Math.round(percentile(sorted, 10)),
      p25: Math.round(percentile(sorted, 25)),
      p50: Math.round(percentile(sorted, 50)),
      p75: Math.round(percentile(sorted, 75)),
      p90: Math.round(percentile(sorted, 90)),
    };
  });

  // Find highest/lowest variability hours
  const hoursWithData = hourlyStats.filter(h => h.readingCount >= 5);
  const highVariabilityHours = hoursWithData
    .filter(h => h.cv > 20)
    .sort((a, b) => b.cv - a.cv)
    .slice(0, 3)
    .map(h => h.hour);

  const overallTIR = Math.round(tir(result.rows.map(r => Number(r.glucose))));

  await upsertCache(userId, 'hourly_variability', {
    overallTIR,
    hourlyStats,
    highVariabilityHours,
    totalReadings: result.rows.length,
    lookbackDays,
  }, windowStart, new Date(), { lookbackDays, readingCount: result.rows.length });

  console.log(`    [hourly_variability] ${result.rows.length} readings, overallTIR=${overallTIR}%`);
}

// ─── Algorithm 4: TIR by Period ───────────────────────────────────────────────

/**
 * Time-in-range split by named time periods.
 * Periods: overnight (0–5), morning (6–11), afternoon (12–17), evening (18–23)
 */
export async function analyzeTIRByPeriod(userId: string): Promise<void> {
  const lookbackDays = 30;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  const result = await query(
    `SELECT EXTRACT(HOUR FROM timestamp AT TIME ZONE 'UTC') as hour,
            glucose
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2`,
    [userId, windowStart.toISOString()]
  );

  const periods: Record<string, { range: [number, number]; values: number[] }> = {
    overnight: { range: [0, 5], values: [] },
    morning:   { range: [6, 11], values: [] },
    afternoon: { range: [12, 17], values: [] },
    evening:   { range: [18, 23], values: [] },
  };

  for (const row of result.rows) {
    const h = Number(row.hour);
    const g = Number(row.glucose);
    for (const [, period] of Object.entries(periods)) {
      if (h >= period.range[0] && h <= period.range[1]) {
        period.values.push(g);
      }
    }
  }

  const periodStats: Record<string, object> = {};
  for (const [name, period] of Object.entries(periods)) {
    const values = period.values;
    periodStats[name] = {
      readingCount: values.length,
      mean: Math.round(mean(values)),
      stdDev: Math.round(stdDev(values) * 10) / 10,
      tir: Math.round(tir(values)),
      tar: Math.round((values.filter(v => v > 180).length / Math.max(values.length, 1)) * 100),
      tbr: Math.round((values.filter(v => v < 70).length / Math.max(values.length, 1)) * 100),
      tbrL2: Math.round((values.filter(v => v < 54).length / Math.max(values.length, 1)) * 100),
      tarL2: Math.round((values.filter(v => v > 250).length / Math.max(values.length, 1)) * 100),
    };
  }

  const allValues = result.rows.map(r => Number(r.glucose));
  const overallStats = {
    mean: Math.round(mean(allValues)),
    stdDev: Math.round(stdDev(allValues) * 10) / 10,
    cv: Math.round(cv(allValues) * 10) / 10,
    tir: Math.round(tir(allValues)),
    tar: Math.round((allValues.filter(v => v > 180).length / Math.max(allValues.length, 1)) * 100),
    tbr: Math.round((allValues.filter(v => v < 70).length / Math.max(allValues.length, 1)) * 100),
    gmi: Math.round((3.31 + 0.02392 * mean(allValues)) * 10) / 10,
  };

  await upsertCache(userId, 'tir_by_period', {
    overall: overallStats,
    periods: periodStats,
    lookbackDays,
    totalReadings: allValues.length,
  }, windowStart, new Date());

  console.log(`    [tir_by_period] overall TIR=${overallStats.tir}% GMI=${overallStats.gmi}`);
}

// ─── Algorithm 5: Insulin Sensitivity ────────────────────────────────────────

/**
 * Estimate insulin sensitivity (ISF) from correction bolus events.
 * For each rapid insulin dose, measures glucose drop in the 2–4h window after.
 * Sensitivity = (glucose drop) / (units of insulin)
 */
export async function analyzeInsulinSensitivity(userId: string): Promise<void> {
  const lookbackDays = 60;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  // Get rapid insulin doses
  const doses = await query(
    `SELECT id, timestamp, units, insulin_type, purpose
     FROM insulin_doses
     WHERE user_id = $1
       AND timestamp >= $2
       AND (insulin_type ILIKE '%rapid%' OR insulin_type ILIKE '%fast%'
            OR insulin_type ILIKE '%lispro%' OR insulin_type ILIKE '%aspart%'
            OR insulin_type ILIKE '%glulisine%' OR insulin_type ILIKE '%humalog%'
            OR insulin_type ILIKE '%novolog%' OR insulin_type ILIKE '%apidra%'
            OR insulin_type ILIKE '%fiasp%')
       AND units > 0
     ORDER BY timestamp ASC`,
    [userId, windowStart.toISOString()]
  );

  if (doses.rows.length < 3) {
    await upsertCache(userId, 'insulin_sensitivity', {
      estimatedISF: null,
      reason: 'insufficient_data',
      dosesAnalyzed: 0,
    }, windowStart, new Date());
    console.log(`    [insulin_sensitivity] insufficient doses (${doses.rows.length})`);
    return;
  }

  const sensitivities: number[] = [];
  const analyses: Array<{
    timestamp: string;
    units: number;
    glucoseBefore: number;
    glucoseAfter: number;
    drop: number;
    isf: number;
  }> = [];

  for (const dose of doses.rows) {
    const doseTime = new Date(dose.timestamp);
    const beforeStart = new Date(doseTime.getTime() - 15 * 60000);
    const beforeEnd = new Date(doseTime.getTime() + 15 * 60000);
    const afterStart = new Date(doseTime.getTime() + 90 * 60000);
    const afterEnd = new Date(doseTime.getTime() + 180 * 60000);

    const beforeResult = await query(
      `SELECT AVG(glucose) as avg_glucose FROM glucose_readings
       WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3`,
      [userId, beforeStart.toISOString(), beforeEnd.toISOString()]
    );
    const afterResult = await query(
      `SELECT AVG(glucose) as avg_glucose FROM glucose_readings
       WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3`,
      [userId, afterStart.toISOString(), afterEnd.toISOString()]
    );

    const glucoseBefore = beforeResult.rows[0]?.avg_glucose ? Number(beforeResult.rows[0].avg_glucose) : null;
    const glucoseAfter = afterResult.rows[0]?.avg_glucose ? Number(afterResult.rows[0].avg_glucose) : null;

    if (glucoseBefore && glucoseAfter && glucoseBefore > glucoseAfter) {
      const drop = glucoseBefore - glucoseAfter;
      const isf = drop / Number(dose.units);
      if (isf > 5 && isf < 300) { // Sanity check
        sensitivities.push(isf);
        analyses.push({
          timestamp: dose.timestamp,
          units: Number(dose.units),
          glucoseBefore: Math.round(glucoseBefore),
          glucoseAfter: Math.round(glucoseAfter),
          drop: Math.round(drop),
          isf: Math.round(isf),
        });
      }
    }
  }

  const estimatedISF = sensitivities.length >= 3
    ? Math.round(mean(sensitivities))
    : null;

  await upsertCache(userId, 'insulin_sensitivity', {
    estimatedISF,
    isfUnit: 'mg/dL per unit',
    dosesAnalyzed: doses.rows.length,
    validMeasurements: sensitivities.length,
    isfRange: sensitivities.length >= 2 ? {
      min: Math.round(Math.min(...sensitivities)),
      max: Math.round(Math.max(...sensitivities)),
      stdDev: Math.round(stdDev(sensitivities)),
    } : null,
    recentSamples: analyses.slice(-5),
    interpretation: estimatedISF
      ? `Estimated ISF: ${estimatedISF} mg/dL per unit (from ${sensitivities.length} correction events).`
      : `Could not estimate ISF — insufficient correction-only bolus data.`,
  }, windowStart, new Date(), { dosesAnalyzed: doses.rows.length });

  console.log(`    [insulin_sensitivity] ISF=${estimatedISF} from ${sensitivities.length} events`);
}

// ─── Algorithm 6: Glucose Momentum ────────────────────────────────────────────

/**
 * Compare 7/14/30-day mean glucose trends to detect improvement or deterioration.
 * Uses linear regression to compute slope (mg/dL per day).
 */
export async function analyzeGlucoseMomentum(userId: string): Promise<void> {
  const lookbackDays = 30;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  const result = await query(
    `SELECT DATE(timestamp AT TIME ZONE 'UTC') as day,
            AVG(glucose) as avg_glucose,
            STDDEV(glucose) as std_glucose,
            COUNT(*) as readings
     FROM glucose_readings
     WHERE user_id = $1 AND timestamp >= $2
     GROUP BY day
     ORDER BY day ASC`,
    [userId, windowStart.toISOString()]
  );

  if (result.rows.length < 7) {
    await upsertCache(userId, 'glucose_momentum', {
      trend: 'insufficient_data',
    }, windowStart, new Date());
    return;
  }

  const rows = result.rows;
  const epoch = new Date(rows[0].day).getTime();
  const xs = rows.map(r => (new Date(r.day).getTime() - epoch) / 86400000); // days from first
  const ys = rows.map(r => Number(r.avg_glucose));

  const reg30 = linReg(xs, ys);

  // 14-day window
  const rows14 = rows.slice(-14);
  const xs14 = rows14.map(r => (new Date(r.day).getTime() - epoch) / 86400000);
  const ys14 = rows14.map(r => Number(r.avg_glucose));
  const reg14 = linReg(xs14, ys14);

  // 7-day window
  const rows7 = rows.slice(-7);
  const xs7 = rows7.map(r => (new Date(r.day).getTime() - epoch) / 86400000);
  const ys7 = rows7.map(r => Number(r.avg_glucose));
  const reg7 = linReg(xs7, ys7);

  const describe = (slope: number) =>
    Math.abs(slope) < 0.3 ? 'stable'
    : slope > 1.5 ? 'rising_fast'
    : slope > 0.3 ? 'rising'
    : slope < -1.5 ? 'falling_fast'
    : 'falling';

  await upsertCache(userId, 'glucose_momentum', {
    avg7d: Math.round(mean(ys7)),
    avg14d: Math.round(mean(ys14)),
    avg30d: Math.round(mean(ys)),
    trend7d: { slopeMgdlPerDay: Math.round(reg7.slope * 10) / 10, direction: describe(reg7.slope), r2: Math.round(reg7.r2 * 100) / 100 },
    trend14d: { slopeMgdlPerDay: Math.round(reg14.slope * 10) / 10, direction: describe(reg14.slope), r2: Math.round(reg14.r2 * 100) / 100 },
    trend30d: { slopeMgdlPerDay: Math.round(reg30.slope * 10) / 10, direction: describe(reg30.slope), r2: Math.round(reg30.r2 * 100) / 100 },
    daysWithData: rows.length,
    interpretation: `7-day avg: ${Math.round(mean(ys7))} mg/dL (${describe(reg7.slope)}). `
      + `30-day avg: ${Math.round(mean(ys))} mg/dL (${describe(reg30.slope)}).`,
  }, windowStart, new Date());

  console.log(`    [glucose_momentum] 7d=${Math.round(mean(ys7))} 30d=${Math.round(mean(ys))} slope=${reg7.slope.toFixed(2)}/day`);
}

// ─── Algorithm 7: Day of Week Patterns ───────────────────────────────────────

/**
 * Compare glucose metrics by day of week.
 * Useful for detecting weekend vs. weekday patterns.
 */
export async function analyzeDayOfWeekPatterns(userId: string): Promise<void> {
  const lookbackDays = 60;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  const result = await query(
    `SELECT EXTRACT(DOW FROM timestamp AT TIME ZONE 'UTC') as dow,
            glucose
     FROM glucose_readings
     WHERE user_id = $1 AND timestamp >= $2`,
    [userId, windowStart.toISOString()]
  );

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const byDay: number[][] = Array.from({ length: 7 }, () => []);

  for (const row of result.rows) {
    byDay[Number(row.dow)].push(Number(row.glucose));
  }

  const dayStats = byDay.map((values, dow) => ({
    dayOfWeek: dow,
    dayName: DAY_NAMES[dow],
    readingCount: values.length,
    mean: Math.round(mean(values)),
    stdDev: Math.round(stdDev(values) * 10) / 10,
    cv: Math.round(cv(values) * 10) / 10,
    tir: Math.round(tir(values)),
    tar: Math.round((values.filter(v => v > 180).length / Math.max(values.length, 1)) * 100),
    tbr: Math.round((values.filter(v => v < 70).length / Math.max(values.length, 1)) * 100),
  }));

  // Weekend vs weekday comparison
  const weekdayValues = result.rows.filter(r => [1,2,3,4,5].includes(Number(r.dow))).map(r => Number(r.glucose));
  const weekendValues = result.rows.filter(r => [0,6].includes(Number(r.dow))).map(r => Number(r.glucose));

  const weekdayVsWeekend = {
    weekday: {
      mean: Math.round(mean(weekdayValues)),
      tir: Math.round(tir(weekdayValues)),
      cv: Math.round(cv(weekdayValues) * 10) / 10,
    },
    weekend: {
      mean: Math.round(mean(weekendValues)),
      tir: Math.round(tir(weekendValues)),
      cv: Math.round(cv(weekendValues) * 10) / 10,
    },
    weekdayHigherBy: Math.round(mean(weekdayValues) - mean(weekendValues)),
  };

  await upsertCache(userId, 'day_of_week_patterns', {
    dayStats,
    weekdayVsWeekend,
    lookbackDays,
    totalReadings: result.rows.length,
  }, windowStart, new Date());

  console.log(`    [day_of_week] weekday avg=${weekdayVsWeekend.weekday.mean} weekend avg=${weekdayVsWeekend.weekend.mean}`);
}

// ─── Algorithm 8: Rapid Glucose Changes ──────────────────────────────────────

/**
 * Detect episodes of rapid glucose changes (>50 mg/dL within 60 minutes).
 * Characterizes them as rapid rises (post-meal spikes) or rapid drops (insulin overcorrection, exercise).
 */
export async function analyzeRapidGlucoseChanges(userId: string): Promise<void> {
  const lookbackDays = 30;
  const windowStart = new Date(Date.now() - lookbackDays * 86400000);

  const result = await query(
    `SELECT timestamp, glucose, trend
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
     ORDER BY timestamp ASC`,
    [userId, windowStart.toISOString()]
  );

  if (result.rows.length < 20) {
    await upsertCache(userId, 'rapid_glucose_changes', {
      rapidRises: [], rapidDrops: [], summary: { totalRapidRises: 0, totalRapidDrops: 0 },
    }, windowStart, new Date());
    return;
  }

  const readings = result.rows.map(r => ({
    timestamp: new Date(r.timestamp),
    glucose: Number(r.glucose),
  }));

  const rapidRises: Array<{ timestamp: string; change: number; durationMinutes: number; startGlucose: number; endGlucose: number }> = [];
  const rapidDrops: Array<{ timestamp: string; change: number; durationMinutes: number; startGlucose: number; endGlucose: number }> = [];

  for (let i = 0; i < readings.length - 1; i++) {
    const start = readings[i];
    // Look ahead up to 60 minutes
    for (let j = i + 1; j < readings.length; j++) {
      const end = readings[j];
      const minutesDiff = (end.timestamp.getTime() - start.timestamp.getTime()) / 60000;
      if (minutesDiff > 65) break;

      const change = end.glucose - start.glucose;
      if (Math.abs(change) >= 50) {
        const event = {
          timestamp: start.timestamp.toISOString(),
          change: Math.round(change),
          durationMinutes: Math.round(minutesDiff),
          startGlucose: Math.round(start.glucose),
          endGlucose: Math.round(end.glucose),
        };
        if (change > 0) {
          // Avoid double-counting by checking if we already logged this start
          if (!rapidRises.some(r => r.timestamp === event.timestamp)) {
            rapidRises.push(event);
          }
        } else {
          if (!rapidDrops.some(r => r.timestamp === event.timestamp)) {
            rapidDrops.push(event);
          }
        }
        break; // Don't look further for this start point
      }
    }
  }

  // Sort by magnitude
  rapidRises.sort((a, b) => b.change - a.change);
  rapidDrops.sort((a, b) => a.change - b.change);

  const avgRiseMagnitude = rapidRises.length ? Math.round(mean(rapidRises.map(r => r.change))) : 0;
  const avgDropMagnitude = rapidDrops.length ? Math.round(mean(rapidDrops.map(r => Math.abs(r.change)))) : 0;

  await upsertCache(userId, 'rapid_glucose_changes', {
    summary: {
      totalRapidRises: rapidRises.length,
      totalRapidDrops: rapidDrops.length,
      avgRiseMagnitude,
      avgDropMagnitude,
      risesPerWeek: Math.round((rapidRises.length / lookbackDays) * 7 * 10) / 10,
      dropsPerWeek: Math.round((rapidDrops.length / lookbackDays) * 7 * 10) / 10,
    },
    top5Rises: rapidRises.slice(0, 5),
    top5Drops: rapidDrops.slice(0, 5),
    lookbackDays,
    interpretation: `${rapidRises.length} rapid rises and ${rapidDrops.length} rapid drops (>50 mg/dL in <60min) over the last ${lookbackDays} days.`,
  }, windowStart, new Date());

  console.log(`    [rapid_changes] rises=${rapidRises.length} drops=${rapidDrops.length}`);
}

// ─── Run all extended algorithms ─────────────────────────────────────────────

export async function runAllExtendedAnalyses(userId: string): Promise<void> {
  const t0 = Date.now();
  console.log(`  [extended-analysis] Running 8 algorithms for user ${userId.slice(0, 8)}...`);

  const algorithms: Array<[string, (uid: string) => Promise<void>]> = [
    ['dawn_phenomenon', analyzeDawnPhenomenon],
    ['somogyi_rebound', analyzeSomogyiRebound],
    ['hourly_variability', analyzeHourlyVariability],
    ['tir_by_period', analyzeTIRByPeriod],
    ['insulin_sensitivity', analyzeInsulinSensitivity],
    ['glucose_momentum', analyzeGlucoseMomentum],
    ['day_of_week_patterns', analyzeDayOfWeekPatterns],
    ['rapid_glucose_changes', analyzeRapidGlucoseChanges],
  ];

  for (const [name, fn] of algorithms) {
    try {
      await fn(userId);
    } catch (err) {
      console.error(`    [extended-analysis] ${name} failed:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`  [extended-analysis] Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
