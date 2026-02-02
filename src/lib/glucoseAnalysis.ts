import type {
  GlucoseReading,
  DailyMetrics,
  WeeklyMetrics,
  OvernightMetrics,
  BedtimeMetrics,
} from '@/types/glucose';
import {
  format,
  startOfDay,
  startOfWeek,
  getHours,
  isWithinInterval,
  endOfDay,
} from 'date-fns';

export function calculateDailyMetrics(readings: GlucoseReading[]): DailyMetrics[] {
  const dailyGroups = new Map<string, GlucoseReading[]>();

  // Group readings by day
  for (const reading of readings) {
    const dateKey = format(startOfDay(reading.timestamp), 'yyyy-MM-dd');
    if (!dailyGroups.has(dateKey)) {
      dailyGroups.set(dateKey, []);
    }
    dailyGroups.get(dateKey)!.push(reading);
  }

  const dailyMetrics: DailyMetrics[] = [];

  for (const [dateKey, dayReadings] of dailyGroups.entries()) {
    if (dayReadings.length === 0) continue;

    const values = dayReadings.map(r => r.glucose);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate standard deviation
    const squaredDiffs = values.map(val => Math.pow(val - average, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    const standardDeviation = Math.sqrt(variance);

    // Coefficient of variation (CV) = (SD / mean) * 100
    const coefficientOfVariation = (standardDeviation / average) * 100;

    // Time in range calculations
    const inRange70_180 = values.filter(v => v >= 70 && v <= 180).length;
    const inTarget70_140 = values.filter(v => v >= 70 && v <= 140).length;
    const timeInRange70_180 = (inRange70_180 / values.length) * 100;
    const timeInTarget70_140 = (inTarget70_140 / values.length) * 100;

    // Count spikes above 140
    let spikesAbove140 = 0;
    let inSpike = false;
    for (const value of values) {
      if (value > 140 && !inSpike) {
        spikesAbove140++;
        inSpike = true;
      } else if (value <= 140) {
        inSpike = false;
      }
    }

    dailyMetrics.push({
      date: dateKey,
      average,
      min,
      max,
      standardDeviation,
      coefficientOfVariation,
      timeInRange70_180,
      timeInTarget70_140,
      spikesAbove140,
      readingsCount: values.length,
    });
  }

  return dailyMetrics.sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateWeeklyMetrics(readings: GlucoseReading[]): WeeklyMetrics[] {
  const weeklyGroups = new Map<string, GlucoseReading[]>();

  // Group readings by week
  for (const reading of readings) {
    const weekStart = startOfWeek(reading.timestamp, { weekStartsOn: 0 });
    const weekKey = format(weekStart, 'yyyy-MM-dd');
    if (!weeklyGroups.has(weekKey)) {
      weeklyGroups.set(weekKey, []);
    }
    weeklyGroups.get(weekKey)!.push(reading);
  }

  const weeklyMetrics: WeeklyMetrics[] = [];

  for (const [weekKey, weekReadings] of weeklyGroups.entries()) {
    if (weekReadings.length === 0) continue;

    const values = weekReadings.map(r => r.glucose);
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);

    // Calculate standard deviation and CV
    const squaredDiffs = values.map(val => Math.pow(val - average, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    const standardDeviation = Math.sqrt(variance);
    const coefficientOfVariation = (standardDeviation / average) * 100;

    // Time in range calculations
    const inRange70_180 = values.filter(v => v >= 70 && v <= 180).length;
    const inTarget70_140 = values.filter(v => v >= 70 && v <= 140).length;
    const timeInRange70_180 = (inRange70_180 / values.length) * 100;
    const timeInTarget70_140 = (inTarget70_140 / values.length) * 100;

    weeklyMetrics.push({
      weekStart: weekKey,
      average,
      min,
      max,
      coefficientOfVariation,
      timeInRange70_180,
      timeInTarget70_140,
    });
  }

  return weeklyMetrics.sort((a, b) => a.weekStart.localeCompare(b.weekStart));
}

export function calculateOvernightMetrics(readings: GlucoseReading[]): OvernightMetrics[] {
  const dailyGroups = new Map<string, GlucoseReading[]>();

  // Group readings by day
  for (const reading of readings) {
    const dateKey = format(startOfDay(reading.timestamp), 'yyyy-MM-dd');
    if (!dailyGroups.has(dateKey)) {
      dailyGroups.set(dateKey, []);
    }
    dailyGroups.get(dateKey)!.push(reading);
  }

  const overnightMetrics: OvernightMetrics[] = [];

  for (const [dateKey, dayReadings] of dailyGroups.entries()) {
    // Get readings from 3am-7am (fasting window)
    const fastingReadings = dayReadings.filter(r => {
      const hour = getHours(r.timestamp);
      return hour >= 3 && hour < 7;
    }).sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // Get all overnight readings (midnight to 7am)
    const overnightReadings = dayReadings.filter(r => {
      const hour = getHours(r.timestamp);
      return hour >= 0 && hour < 7;
    });

    if (fastingReadings.length === 0) continue;

    const fastingValues = fastingReadings.map(r => r.glucose);
    const fastingGlucose = fastingValues.reduce((sum, val) => sum + val, 0) / fastingValues.length;

    const overnightValues = overnightReadings.map(r => r.glucose);
    const lowestOvernight = overnightValues.length > 0 ? Math.min(...overnightValues) : fastingGlucose;
    const highestOvernight = overnightValues.length > 0 ? Math.max(...overnightValues) : fastingGlucose;

    // Calculate trend metrics
    const startingGlucose = fastingReadings[0].glucose;
    const endingGlucose = fastingReadings[fastingReadings.length - 1].glucose;
    const trendChange = endingGlucose - startingGlucose;

    // Determine trend direction (using 10 mg/dL threshold for significance)
    let trend: 'rising' | 'falling' | 'stable';
    if (trendChange > 10) {
      trend = 'rising';
    } else if (trendChange < -10) {
      trend = 'falling';
    } else {
      trend = 'stable';
    }

    // Calculate stability (standard deviation)
    const squaredDiffs = fastingValues.map(val => Math.pow(val - fastingGlucose, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / fastingValues.length;
    const stability = Math.sqrt(variance);

    // Prepare individual readings for chart
    const readingsForChart = fastingReadings.map(r => ({
      time: format(r.timestamp, 'h:mm a'),
      glucose: r.glucose,
    }));

    overnightMetrics.push({
      date: dateKey,
      fastingGlucose,
      lowestOvernight,
      highestOvernight,
      readings: readingsForChart,
      startingGlucose,
      endingGlucose,
      trend,
      trendChange,
      stability,
    });
  }

  return overnightMetrics.sort((a, b) => a.date.localeCompare(b.date));
}

export function calculateBedtimeMetrics(readings: GlucoseReading[]): BedtimeMetrics[] {
  const dailyGroups = new Map<string, GlucoseReading[]>();

  // Group readings by day
  for (const reading of readings) {
    const dateKey = format(startOfDay(reading.timestamp), 'yyyy-MM-dd');
    if (!dailyGroups.has(dateKey)) {
      dailyGroups.set(dateKey, []);
    }
    dailyGroups.get(dateKey)!.push(reading);
  }

  const bedtimeMetrics: BedtimeMetrics[] = [];

  for (const [dateKey, dayReadings] of dailyGroups.entries()) {
    // Get readings from 10pm-midnight (bedtime window)
    const bedtimeReadings = dayReadings.filter(r => {
      const hour = getHours(r.timestamp);
      return hour >= 22;
    });

    if (bedtimeReadings.length === 0) continue;

    const bedtimeValues = bedtimeReadings.map(r => r.glucose);
    const bedtimeGlucose = bedtimeValues.reduce((sum, val) => sum + val, 0) / bedtimeValues.length;

    bedtimeMetrics.push({
      date: dateKey,
      bedtimeGlucose,
    });
  }

  return bedtimeMetrics.sort((a, b) => a.date.localeCompare(b.date));
}

export function filterReadingsByDateRange(
  readings: GlucoseReading[],
  startDate: Date,
  endDate: Date
): GlucoseReading[] {
  return readings.filter(reading =>
    isWithinInterval(reading.timestamp, { start: startDate, end: endOfDay(endDate) })
  );
}
