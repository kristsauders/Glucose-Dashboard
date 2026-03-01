import { useQuery } from '@tanstack/react-query';
import { getReadings, getLatestReading, getGlucoseSummary, getReadingsForRange } from '../services/api';
import { GLUCOSE_POLL_INTERVAL_MS } from '../constants/config';
import { subDays, subHours, startOfDay, endOfDay, startOfWeek, format } from 'date-fns';
import type { GlucoseReading } from '../types/glucose';

// ── Shared types for history analytics ───────────────────────────────────────

export type DayMetrics = {
  dateIso: string;
  label: string;
  avg: number;
  min: number;
  max: number;
  below70: number;   // % of readings
  tir70_180: number;
  above180: number;
  count: number;
  cv: number;                  // coefficient of variation (%)
  spikesAbove180: number;      // raw count of readings > 180
  overnightAvg: number | null; // 3am–7am avg; null if < 2 readings
  bedtimeAvg: number | null;   // 10pm–midnight avg; null if < 2 readings
};

export type WeekMetrics = {
  weekLabel: string;
  avg: number;
  min: number;
  max: number;
  below70: number;
  tir70_180: number;
  above180: number;
  count: number;
  cv: number;
  estA1c: number;
};

export type BucketData = {
  low: number;
  high: number;
  label: string;
  count: number;
  pct: number;
};

// ── Computation helpers ───────────────────────────────────────────────────────

function computeStdDev(vals: number[]): number {
  if (vals.length < 2) return 0;
  const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
  const variance = vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length;
  return Math.sqrt(variance);
}

function computeDailyMetrics(readings: GlucoseReading[]): DayMetrics[] {
  const byDay = new Map<string, GlucoseReading[]>();
  for (const r of readings) {
    const key = format(new Date(r.timestamp), 'yyyy-MM-dd');
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateIso, rds]) => {
      const vals = rds.map(r => Number(r.glucose));
      const n = vals.length;
      const avg = vals.reduce((s, v) => s + v, 0) / n;
      const sd = computeStdDev(vals);
      const cv = avg > 0 ? (sd / avg) * 100 : 0;

      // Overnight: 3am–7am
      const overnightVals = rds
        .filter(r => { const h = new Date(r.timestamp).getHours(); return h >= 3 && h < 7; })
        .map(r => Number(r.glucose));
      const overnightAvg = overnightVals.length >= 2
        ? Math.round(overnightVals.reduce((s, v) => s + v, 0) / overnightVals.length)
        : null;

      // Bedtime: 10pm–midnight
      const bedtimeVals = rds
        .filter(r => { const h = new Date(r.timestamp).getHours(); return h >= 22; })
        .map(r => Number(r.glucose));
      const bedtimeAvg = bedtimeVals.length >= 2
        ? Math.round(bedtimeVals.reduce((s, v) => s + v, 0) / bedtimeVals.length)
        : null;

      return {
        dateIso,
        label: format(new Date(dateIso + 'T12:00:00'), 'M/d'),
        avg: Math.round(avg),
        min: Math.min(...vals),
        max: Math.max(...vals),
        below70:   Math.round((vals.filter(v => v < 70).length / n) * 100),
        tir70_180: Math.round((vals.filter(v => v >= 70 && v <= 180).length / n) * 100),
        above180:  Math.round((vals.filter(v => v > 180).length / n) * 100),
        count: n,
        cv: Math.round(cv * 10) / 10,
        spikesAbove180: vals.filter(v => v > 180).length,
        overnightAvg,
        bedtimeAvg,
      };
    });
}

function computeWeeklyMetrics(readings: GlucoseReading[]): WeekMetrics[] {
  const byWeek = new Map<string, number[]>();
  for (const r of readings) {
    const weekStart = startOfWeek(new Date(r.timestamp), { weekStartsOn: 1 });
    const key = format(weekStart, 'yyyy-MM-dd');
    const arr = byWeek.get(key) ?? [];
    arr.push(Number(r.glucose));
    byWeek.set(key, arr);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, vals]) => {
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      const n = vals.length;
      const sd = computeStdDev(vals);
      const cv = avg > 0 ? (sd / avg) * 100 : 0;
      return {
        weekLabel: format(new Date(key + 'T12:00:00'), 'M/d'),
        avg: Math.round(avg),
        min: Math.min(...vals),
        max: Math.max(...vals),
        below70:   Math.round((vals.filter(v => v < 70).length / n) * 100),
        tir70_180: Math.round((vals.filter(v => v >= 70 && v <= 180).length / n) * 100),
        above180:  Math.round((vals.filter(v => v > 180).length / n) * 100),
        count: n,
        cv: Math.round(cv * 10) / 10,
        estA1c: Math.round(((avg + 46.7) / 28.7) * 10) / 10,
      };
    });
}

function computeDistribution(readings: GlucoseReading[]): BucketData[] {
  const STEP = 20, LO = 40, HI = 400;
  const buckets: number[] = new Array((HI - LO) / STEP).fill(0);
  let total = 0;
  for (const r of readings) {
    const v = Number(r.glucose);
    const i = Math.floor((v - LO) / STEP);
    if (i >= 0 && i < buckets.length) { buckets[i]++; total++; }
  }
  return buckets.map((count, i) => ({
    low: LO + i * STEP,
    high: LO + (i + 1) * STEP - 1,
    label: `${LO + i * STEP}`,
    count,
    pct: total > 0 ? (count / total) * 100 : 0,
  }));
}

// ── Hooks ─────────────────────────────────────────────────────────────────────

export function useLatestGlucose() {
  return useQuery({
    queryKey: ['glucose', 'latest'],
    queryFn: getLatestReading,
    refetchInterval: GLUCOSE_POLL_INTERVAL_MS,
    staleTime: 60_000,
  });
}

export function useGlucoseReadings(limit = 288) {
  return useQuery({
    queryKey: ['glucose', 'readings', limit],
    queryFn: () => getReadings(limit),
    refetchInterval: GLUCOSE_POLL_INTERVAL_MS,
    staleTime: 60_000,
  });
}

export function useGlucoseSummary(period: '7d' | '30d' | '90d' = '7d') {
  return useQuery({
    queryKey: ['glucose', 'summary', period],
    queryFn: () => getGlucoseSummary(period),
    staleTime: 5 * 60_000,
  });
}

/**
 * Fetches today's readings from 7am to now, matching the web UI live view.
 * If it's before 7am, falls back to the previous 12 hours so the chart isn't empty.
 * Filters to trend readings (record_type '1') — 5-min CGM intervals.
 */
export function useGlucose24h() {
  return useQuery({
    queryKey: ['glucose', '24h'],
    queryFn: async () => {
      const now      = new Date();
      const start7am = new Date(now);
      start7am.setHours(7, 0, 0, 0);
      // Before 7am: show last 12h so the chart isn't empty
      const start = now < start7am
        ? subHours(now, 12).toISOString()
        : start7am.toISOString();
      const { readings } = await getReadingsForRange(start, now.toISOString());
      const chron = [...readings].reverse();
      // record_type comes from the server as a number (0 or 1); use loose comparison
      const trend = chron.filter(r => r.record_type == null || Number(r.record_type) === 1);
      return { readings: trend.length > 0 ? trend : chron };
    },
    refetchInterval: GLUCOSE_POLL_INTERVAL_MS,
    staleTime: 60_000,
  });
}

export function useGlucoseHistory(days: 7 | 30 | 90) {
  const end   = endOfDay(new Date()).toISOString();
  const start = startOfDay(subDays(new Date(), days - 1)).toISOString();
  return useQuery({
    queryKey: ['glucose', 'history', days],
    queryFn: async () => {
      const { readings } = await getReadingsForRange(start, end);
      const chron = [...readings].reverse(); // server returns DESC
      return {
        daily:        computeDailyMetrics(chron),
        weekly:       computeWeeklyMetrics(chron),
        distribution: computeDistribution(chron),
        totalReadings: chron.length,
        readings:     chron, // expose raw readings for MealImpactChart
      };
    },
    staleTime: 5 * 60_000,
  });
}
