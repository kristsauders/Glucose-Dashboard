/**
 * Advanced Statistical Analysis Utilities
 *
 * Provides sophisticated analysis capabilities:
 * - Trend analysis with linear regression and forecasting
 * - Anomaly detection with confidence scoring
 * - Period-to-period statistical comparison
 */

import { query } from '../config/database.js';
import { convertToUserTimezone } from '../utils/timezone.js';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface DataPoint {
  date: string;
  value: number;
}

interface TrendAnalysis {
  metric: string;
  period: string;
  trendDirection: 'improving' | 'worsening' | 'stable';
  slope: number;
  rSquared: number;
  interpretation: string;
  forecast?: ForecastPoint[];
  changePoints?: ChangePoint[];
}

interface ForecastPoint {
  date: string;
  predicted: number;
  confidenceInterval: [number, number];
}

interface ChangePoint {
  date: string;
  value: number;
  deviation: string;
}

interface Anomaly {
  timestamp: string;
  glucose: number;
  severity: 'low' | 'medium' | 'high';
  anomalyScore: number;
  reasons: string[];
  possibleCauses: string;
  recommendation?: string;
}

interface AnomalyDetectionResult {
  period: string;
  anomaliesDetected: number;
  anomalies: Anomaly[];
}

interface PeriodMetrics {
  avgGlucose: number;
  minGlucose: number;
  maxGlucose: number;
  stdDev: number;
  cv: number;
  timeInRange70_180: number;
  timeBelow70: number;
  timeAbove180: number;
  avgFastingGlucose: number;
  estimatedA1c: number;
  readingsCount: number;
}

interface PeriodComparison {
  comparisonType: string;
  period1: { label: string; daysAnalyzed: number };
  period2: { label: string; daysAnalyzed: number };
  significantChanges: ComparisonChange[];
  summary: string;
}

interface ComparisonChange {
  metric: string;
  period1Value: number;
  period2Value: number;
  absoluteDifference: number;
  percentChange: number;
  significance: 'major' | 'moderate' | 'minor' | 'negligible';
  pValue?: number;
  interpretation: string;
}

// ============================================================================
// STATISTICAL UTILITIES
// ============================================================================

/**
 * Calculate linear regression for trend analysis
 */
function linearRegression(xValues: number[], yValues: number[]): {
  slope: number;
  intercept: number;
  r2: number;
  residuals: number[];
} {
  const n = xValues.length;
  if (n < 2) {
    return { slope: 0, intercept: 0, r2: 0, residuals: [] };
  }

  const sumX = xValues.reduce((a, b) => a + b, 0);
  const sumY = yValues.reduce((a, b) => a + b, 0);
  const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
  const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
  const sumY2 = yValues.reduce((sum, y) => sum + y * y, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Calculate R²
  const yMean = sumY / n;
  const ssTotal = yValues.reduce((sum, y) => sum + Math.pow(y - yMean, 2), 0);
  const ssResidual = yValues.reduce((sum, y, i) => {
    const yPred = slope * xValues[i] + intercept;
    return sum + Math.pow(y - yPred, 2);
  }, 0);
  const r2 = ssTotal > 0 ? 1 - (ssResidual / ssTotal) : 0;

  // Calculate residuals for confidence intervals
  const residuals = yValues.map((y, i) => {
    const yPred = slope * xValues[i] + intercept;
    return y - yPred;
  });

  return { slope, intercept, r2, residuals };
}

/**
 * Calculate standard deviation
 */
function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Perform t-test for comparing two samples
 */
function tTest(sample1: number[], sample2: number[]): {
  tStatistic: number;
  pValue: number;
} {
  const n1 = sample1.length;
  const n2 = sample2.length;

  if (n1 < 2 || n2 < 2) {
    return { tStatistic: 0, pValue: 1.0 };
  }

  const mean1 = sample1.reduce((a, b) => a + b, 0) / n1;
  const mean2 = sample2.reduce((a, b) => a + b, 0) / n2;

  const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (n1 - 1);
  const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (n2 - 1);

  const pooledVar = ((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2);
  const standardError = Math.sqrt(pooledVar * (1 / n1 + 1 / n2));

  const tStatistic = (mean1 - mean2) / standardError;
  const degreesOfFreedom = n1 + n2 - 2;

  // Approximate p-value (simplified two-tailed test)
  const absT = Math.abs(tStatistic);
  let pValue;
  if (absT > 2.576) pValue = 0.01; // Significant at 1%
  else if (absT > 1.96) pValue = 0.05; // Significant at 5%
  else if (absT > 1.645) pValue = 0.10; // Significant at 10%
  else pValue = 0.20; // Not significant

  return { tStatistic, pValue };
}

// ============================================================================
// TREND ANALYSIS
// ============================================================================

/**
 * Analyze glucose trends and generate forecasts
 */
export async function analyzeTrend(
  data: DataPoint[],
  metricType: string,
  forecastDays: number = 3
): Promise<TrendAnalysis> {
  if (data.length < 7) {
    throw new Error('Insufficient data for trend analysis (minimum 7 days required)');
  }

  // Prepare data for regression
  const xValues = data.map((_, i) => i); // Day numbers: 0, 1, 2, ...
  const yValues = data.map(d => d.value);

  // Calculate linear regression
  const regression = linearRegression(xValues, yValues);
  const { slope, intercept, r2, residuals } = regression;

  // Classify trend direction
  let trendDirection: 'improving' | 'worsening' | 'stable';
  if (Math.abs(slope) <= 5 || r2 < 0.5) {
    trendDirection = 'stable';
  } else if (slope < -5) {
    trendDirection = 'improving'; // Glucose decreasing
  } else {
    trendDirection = 'worsening'; // Glucose increasing
  }

  // Generate interpretation
  const interpretation = generateTrendInterpretation(metricType, slope, r2, trendDirection);

  // Generate forecast if R² is good enough
  let forecast: ForecastPoint[] | undefined;
  if (r2 > 0.3) {
    forecast = generateForecast(data, slope, intercept, residuals, forecastDays);
  }

  // Identify change points (>20% deviation from regression)
  const changePoints = identifyChangePoints(data, xValues, slope, intercept);

  return {
    metric: metricType,
    period: `${data.length} days`,
    trendDirection,
    slope: parseFloat(slope.toFixed(2)),
    rSquared: parseFloat(r2.toFixed(3)),
    interpretation,
    forecast,
    changePoints: changePoints.length > 0 ? changePoints : undefined,
  };
}

function generateTrendInterpretation(
  metric: string,
  slope: number,
  r2: number,
  direction: string
): string {
  const metricLabel = metric.replace(/_/g, ' ');
  const absSlope = Math.abs(slope).toFixed(1);

  if (direction === 'stable') {
    return `${metricLabel} is stable with no significant trend`;
  } else if (direction === 'improving') {
    return `${metricLabel} is decreasing by ${absSlope} units per day`;
  } else {
    return `${metricLabel} is increasing by ${absSlope} units per day`;
  }
}

function generateForecast(
  data: DataPoint[],
  slope: number,
  intercept: number,
  residuals: number[],
  days: number
): ForecastPoint[] {
  const residualStdDev = standardDeviation(residuals);
  const lastIndex = data.length - 1;
  const lastDate = new Date(data[lastIndex].date);

  const forecast: ForecastPoint[] = [];

  for (let i = 1; i <= days; i++) {
    const futureX = lastIndex + i;
    const predicted = slope * futureX + intercept;

    // 95% confidence interval (±1.96 * std dev)
    const margin = 1.96 * residualStdDev;
    const confidenceInterval: [number, number] = [
      Math.round(Math.max(0, predicted - margin)),
      Math.round(predicted + margin)
    ];

    const futureDate = new Date(lastDate);
    futureDate.setDate(futureDate.getDate() + i);

    forecast.push({
      date: futureDate.toISOString().split('T')[0],
      predicted: Math.round(predicted),
      confidenceInterval,
    });
  }

  return forecast;
}

function identifyChangePoints(
  data: DataPoint[],
  xValues: number[],
  slope: number,
  intercept: number
): ChangePoint[] {
  const changePoints: ChangePoint[] = [];

  data.forEach((point, i) => {
    const predicted = slope * xValues[i] + intercept;
    const deviation = ((point.value - predicted) / predicted) * 100;

    if (Math.abs(deviation) > 20) {
      changePoints.push({
        date: point.date,
        value: point.value,
        deviation: `${deviation > 0 ? '+' : ''}${deviation.toFixed(1)}%`,
      });
    }
  });

  // Return only top 5 change points by absolute deviation
  return changePoints
    .sort((a, b) => Math.abs(parseFloat(b.deviation)) - Math.abs(parseFloat(a.deviation)))
    .slice(0, 5);
}

// ============================================================================
// ANOMALY DETECTION
// ============================================================================

/**
 * Detect glucose anomalies based on historical patterns
 */
export async function detectAnomalies(
  userId: string,
  days: number = 7,
  sensitivityLevel: 'low' | 'medium' | 'high' = 'medium',
  userTimezone: string = 'America/New_York'
): Promise<AnomalyDetectionResult> {
  // Step 1: Build baseline expectations from historical data (last 30 days before analysis window)
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - days);

  const baselineStart = new Date(startDate);
  baselineStart.setDate(baselineStart.getDate() - 30);

  // Get baseline data for building expectations (using user's local timezone)
  const baselineResult = await query(
    `SELECT
       EXTRACT(HOUR FROM timezone($4, timestamp)) as hour,
       AVG(glucose) as avg_glucose,
       STDDEV(glucose) as std_dev
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND timestamp < $3
     GROUP BY EXTRACT(HOUR FROM timezone($4, timestamp))
     ORDER BY hour`,
    [userId, baselineStart.toISOString(), startDate.toISOString(), userTimezone]
  );

  const hourlyBaselines = new Map<number, { mean: number; stdDev: number }>();
  baselineResult.rows.forEach((row: any) => {
    hourlyBaselines.set(parseInt(row.hour), {
      mean: parseFloat(row.avg_glucose),
      stdDev: parseFloat(row.std_dev) || 20, // Default to 20 if no std dev
    });
  });

  // Step 2: Get readings in analysis window
  const readingsResult = await query(
    `SELECT id, timestamp, glucose
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND timestamp <= $3
     ORDER BY timestamp ASC`,
    [userId, startDate.toISOString(), endDate.toISOString()]
  );

  const anomalies: Anomaly[] = [];

  // Step 3: Scan for anomalies
  for (let i = 0; i < readingsResult.rows.length; i++) {
    const reading = readingsResult.rows[i];
    const timestamp = new Date(reading.timestamp);
    const hour = timestamp.getHours();
    const glucose = parseFloat(reading.glucose);

    // Get baseline for this hour
    const baseline = hourlyBaselines.get(hour);
    if (!baseline) continue; // No baseline data for this hour

    const { mean, stdDev } = baseline;
    // Use 2.5 std devs (covers ~98.8% of normal distribution) to reduce false positives
    const expectedMin = mean - 2.5 * stdDev;
    const expectedMax = mean + 2.5 * stdDev;

    // Calculate anomaly score
    let anomalyScore = 0;
    const reasons: string[] = [];

    // Check if outside expected range
    if (glucose > expectedMax) {
      const zScore = (glucose - mean) / stdDev;
      anomalyScore += zScore;
      reasons.push(`Glucose ${Math.round(glucose - expectedMax)} mg/dL above expected range (${Math.round(expectedMin)}-${Math.round(expectedMax)})`);
    } else if (glucose < expectedMin) {
      const zScore = (mean - glucose) / stdDev;
      anomalyScore += zScore;
      reasons.push(`Glucose ${Math.round(expectedMin - glucose)} mg/dL below expected range (${Math.round(expectedMin)}-${Math.round(expectedMax)})`);
    }

    // Check rate of change if we have previous reading
    if (i > 0) {
      const prevReading = readingsResult.rows[i - 1];
      const prevTimestamp = new Date(prevReading.timestamp);
      const timeDiffMinutes = (timestamp.getTime() - prevTimestamp.getTime()) / (1000 * 60);

      if (timeDiffMinutes <= 10) {
        const rateOfChange = (glucose - parseFloat(prevReading.glucose)) / timeDiffMinutes;
        const absRate = Math.abs(rateOfChange);

        // Rate > 4 mg/dL/min is concerning (increased threshold to reduce noise)
        if (absRate > 4) {
          anomalyScore += 0.5;
          reasons.push(`Rapid ${rateOfChange > 0 ? 'rise' : 'drop'} (${Math.round(absRate)} mg/dL/min detected)`);
        }
      }
    }

    // Only process if we have a significant anomaly (minimum score of 1.0 to filter noise)
    if (anomalyScore < 1.0) continue;

    // Determine severity (adjusted thresholds for less noise)
    let severity: 'low' | 'medium' | 'high';
    if (anomalyScore > 4.0) severity = 'high';
    else if (anomalyScore > 2.5) severity = 'medium';
    else severity = 'low';

    // Step 4: Contextualize - check for logged events
    const contextStart = new Date(timestamp);
    contextStart.setMinutes(contextStart.getMinutes() - 30);
    const contextEnd = new Date(timestamp);
    contextEnd.setMinutes(contextEnd.getMinutes() + 30);

    const eventsResult = await query(
      `SELECT 'meal' as event_type, description FROM meals WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
       UNION ALL
       SELECT 'exercise' as event_type, description FROM exercise_logs WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3
       UNION ALL
       SELECT 'insulin' as event_type, units::text || ' units' as description FROM insulin_doses WHERE user_id = $1 AND timestamp BETWEEN $2 AND $3`,
      [userId, contextStart.toISOString(), contextEnd.toISOString()]
    );

    let possibleCauses: string;
    let recommendation: string | undefined;

    if (eventsResult.rows.length > 0) {
      const events = eventsResult.rows.map((e: any) => `${e.event_type}: ${e.description}`).join('; ');
      possibleCauses = `Likely explained by ${events}`;
    } else {
      possibleCauses = 'No logged meal, exercise, or insulin within 30 minutes';
      recommendation = 'Consider logging any forgotten meals, snacks, or activities';
    }

    anomalies.push({
      timestamp: convertToUserTimezone(timestamp, userTimezone),
      glucose: Math.round(glucose),
      severity,
      anomalyScore: parseFloat(anomalyScore.toFixed(2)),
      reasons,
      possibleCauses,
      recommendation,
    });
  }

  // Step 5: Filter by sensitivity
  let filteredAnomalies: Anomaly[];
  if (sensitivityLevel === 'low') {
    filteredAnomalies = anomalies.filter(a => a.severity === 'high');
  } else if (sensitivityLevel === 'medium') {
    filteredAnomalies = anomalies.filter(a => a.severity === 'high' || a.severity === 'medium');
  } else {
    filteredAnomalies = anomalies; // Show all
  }

  return {
    period: `${days} days`,
    anomaliesDetected: filteredAnomalies.length,
    anomalies: filteredAnomalies,
  };
}

// ============================================================================
// PERIOD COMPARISON
// ============================================================================

/**
 * Compare glucose metrics between two time periods
 */
export async function comparePeriods(
  userId: string,
  comparisonType: 'time_periods' | 'weekday_vs_weekend' | 'before_after_event',
  options: {
    period1Start?: string;
    period1End?: string;
    period2Start?: string;
    period2End?: string;
    eventDate?: string;
  },
  userTimezone: string = 'America/New_York'
): Promise<PeriodComparison> {
  let period1Start: Date, period1End: Date;
  let period2Start: Date, period2End: Date;
  let period1Label: string, period2Label: string;

  // Define comparison windows based on type
  if (comparisonType === 'time_periods') {
    if (!options.period1Start || !options.period1End || !options.period2Start || !options.period2End) {
      throw new Error('time_periods comparison requires all period dates');
    }
    period1Start = new Date(options.period1Start);
    period1End = new Date(options.period1End);
    period2Start = new Date(options.period2Start);
    period2End = new Date(options.period2End);
    period1Label = 'Period 1';
    period2Label = 'Period 2';
  } else if (comparisonType === 'weekday_vs_weekend') {
    // Last 4 weeks
    const now = new Date();
    const fourWeeksAgo = new Date(now);
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    period1Start = fourWeeksAgo;
    period1End = now;
    period2Start = fourWeeksAgo;
    period2End = now;
    period1Label = 'Weekdays';
    period2Label = 'Weekends';
  } else if (comparisonType === 'before_after_event') {
    if (!options.eventDate) {
      throw new Error('before_after_event comparison requires eventDate');
    }
    const eventDate = new Date(options.eventDate);
    period1Start = new Date(eventDate);
    period1Start.setDate(period1Start.getDate() - 7);
    period1End = eventDate;
    period2Start = eventDate;
    period2End = new Date(eventDate);
    period2End.setDate(period2End.getDate() + 7);
    period1Label = '7 days before';
    period2Label = '7 days after';
  } else {
    throw new Error(`Unknown comparison type: ${comparisonType}`);
  }

  // Calculate metrics for each period
  let metrics1: PeriodMetrics;
  let metrics2: PeriodMetrics;

  if (comparisonType === 'weekday_vs_weekend') {
    // Special handling: filter by day of week
    metrics1 = await calculatePeriodMetrics(userId, period1Start, period1End, [1, 2, 3, 4, 5], userTimezone); // Mon-Fri
    metrics2 = await calculatePeriodMetrics(userId, period2Start, period2End, [0, 6], userTimezone); // Sat-Sun
  } else {
    metrics1 = await calculatePeriodMetrics(userId, period1Start, period1End, undefined, userTimezone);
    metrics2 = await calculatePeriodMetrics(userId, period2Start, period2End, undefined, userTimezone);
  }

  // Perform statistical comparison
  const changes = compareMetrics(metrics1, metrics2);

  // Rank by significance
  changes.sort((a, b) => {
    const severityOrder = { major: 0, moderate: 1, minor: 2, negligible: 3 };
    return severityOrder[a.significance] - severityOrder[b.significance];
  });

  // Generate summary
  const summary = generateComparisonSummary(changes, period1Label, period2Label);

  // Calculate days analyzed
  const days1 = Math.ceil((period1End.getTime() - period1Start.getTime()) / (1000 * 60 * 60 * 24));
  const days2 = Math.ceil((period2End.getTime() - period2Start.getTime()) / (1000 * 60 * 60 * 24));

  return {
    comparisonType,
    period1: { label: period1Label, daysAnalyzed: days1 },
    period2: { label: period2Label, daysAnalyzed: days2 },
    significantChanges: changes.filter(c => c.significance !== 'negligible'),
    summary,
  };
}

async function calculatePeriodMetrics(
  userId: string,
  startDate: Date,
  endDate: Date,
  dayOfWeekFilter?: number[],
  userTimezone: string = 'America/New_York'
): Promise<PeriodMetrics> {
  let dayOfWeekClause = '';
  if (dayOfWeekFilter) {
    dayOfWeekClause = `AND EXTRACT(DOW FROM timestamp) IN (${dayOfWeekFilter.join(',')})`;
  }

  const result = await query(
    `SELECT
       AVG(glucose) as avg_glucose,
       MIN(glucose) as min_glucose,
       MAX(glucose) as max_glucose,
       STDDEV(glucose) as std_dev,
       COUNT(*) as readings_count,
       SUM(CASE WHEN glucose >= 70 AND glucose <= 180 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as tir_70_180,
       SUM(CASE WHEN glucose < 70 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as time_below_70,
       SUM(CASE WHEN glucose > 180 THEN 1 ELSE 0 END) * 100.0 / COUNT(*) as time_above_180
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND timestamp < $3
       ${dayOfWeekClause}`,
    [userId, startDate.toISOString(), endDate.toISOString()]
  );

  const row = result.rows[0];
  const avgGlucose = parseFloat(row.avg_glucose) || 0;
  const stdDev = parseFloat(row.std_dev) || 0;
  const cv = avgGlucose > 0 ? (stdDev / avgGlucose) * 100 : 0;
  const estimatedA1c = (avgGlucose + 46.7) / 28.7;

  // Get fasting glucose (3am-7am in user's LOCAL timezone)
  const fastingResult = await query(
    `SELECT AVG(glucose) as avg_fasting
     FROM glucose_readings
     WHERE user_id = $1
       AND timestamp >= $2
       AND timestamp < $3
       AND EXTRACT(HOUR FROM timezone($4, timestamp)) >= 3
       AND EXTRACT(HOUR FROM timezone($4, timestamp)) < 7
       ${dayOfWeekClause}`,
    [userId, startDate.toISOString(), endDate.toISOString(), userTimezone]
  );

  const avgFastingGlucose = parseFloat(fastingResult.rows[0]?.avg_fasting) || 0;

  return {
    avgGlucose: parseFloat(avgGlucose.toFixed(1)),
    minGlucose: parseFloat(row.min_glucose) || 0,
    maxGlucose: parseFloat(row.max_glucose) || 0,
    stdDev: parseFloat(stdDev.toFixed(1)),
    cv: parseFloat(cv.toFixed(1)),
    timeInRange70_180: parseFloat(row.tir_70_180) || 0,
    timeBelow70: parseFloat(row.time_below_70) || 0,
    timeAbove180: parseFloat(row.time_above_180) || 0,
    avgFastingGlucose: parseFloat(avgFastingGlucose.toFixed(1)),
    estimatedA1c: parseFloat(estimatedA1c.toFixed(2)),
    readingsCount: parseInt(row.readings_count) || 0,
  };
}

function compareMetrics(metrics1: PeriodMetrics, metrics2: PeriodMetrics): ComparisonChange[] {
  const changes: ComparisonChange[] = [];

  const metricsToCompare: Array<{
    key: keyof PeriodMetrics;
    label: string;
    higherIsBetter?: boolean;
  }> = [
    { key: 'avgGlucose', label: 'Average glucose', higherIsBetter: false },
    { key: 'timeInRange70_180', label: 'Time in range (70-180)', higherIsBetter: true },
    { key: 'timeBelow70', label: 'Time below 70', higherIsBetter: false },
    { key: 'timeAbove180', label: 'Time above 180', higherIsBetter: false },
    { key: 'cv', label: 'Coefficient of variation', higherIsBetter: false },
    { key: 'avgFastingGlucose', label: 'Fasting glucose', higherIsBetter: false },
    { key: 'estimatedA1c', label: 'Estimated A1C', higherIsBetter: false },
  ];

  metricsToCompare.forEach(({ key, label, higherIsBetter }) => {
    const value1 = metrics1[key] as number;
    const value2 = metrics2[key] as number;

    if (value1 === 0 || value2 === 0) return; // Skip if no data

    const absoluteDifference = value2 - value1;
    const percentChange = (absoluteDifference / value1) * 100;

    // Classify significance
    let significance: 'major' | 'moderate' | 'minor' | 'negligible';
    const absPercent = Math.abs(percentChange);

    if (absPercent > 20) significance = 'major';
    else if (absPercent > 10) significance = 'moderate';
    else if (absPercent > 5) significance = 'minor';
    else significance = 'negligible';

    // Generate interpretation
    const direction = absoluteDifference > 0 ? 'higher' : 'lower';
    const improving = higherIsBetter ? (absoluteDifference > 0) : (absoluteDifference < 0);
    const trend = improving ? '(improved)' : '(worsened)';

    const interpretation = `${label} is ${Math.abs(absoluteDifference).toFixed(1)} units ${direction} in period 2 ${trend}`;

    changes.push({
      metric: key as string,
      period1Value: parseFloat(value1.toFixed(1)),
      period2Value: parseFloat(value2.toFixed(1)),
      absoluteDifference: parseFloat(absoluteDifference.toFixed(1)),
      percentChange: parseFloat(percentChange.toFixed(1)),
      significance,
      interpretation,
    });
  });

  return changes;
}

function generateComparisonSummary(
  changes: ComparisonChange[],
  period1Label: string,
  period2Label: string
): string {
  const majorChanges = changes.filter(c => c.significance === 'major');
  const moderateChanges = changes.filter(c => c.significance === 'moderate');

  if (majorChanges.length === 0 && moderateChanges.length === 0) {
    return `No significant differences found between ${period1Label} and ${period2Label}`;
  }

  const improvements = [...majorChanges, ...moderateChanges].filter(c =>
    c.interpretation.includes('(improved)')
  );
  const worsenings = [...majorChanges, ...moderateChanges].filter(c =>
    c.interpretation.includes('(worsened)')
  );

  if (improvements.length > worsenings.length) {
    return `${period2Label} shows better glucose control compared to ${period1Label}`;
  } else if (worsenings.length > improvements.length) {
    return `${period2Label} shows worse glucose control compared to ${period1Label}`;
  } else {
    return `${period2Label} shows mixed results compared to ${period1Label}`;
  }
}
