import puppeteer from 'puppeteer';
import { ChartGenerator, GlucoseReading } from './chart-generator.js';
import { query } from '../config/database.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface ReportConfig {
  userId: string;
  reportType: 'general' | 'comparison' | 'decision-support';
  title: string;
  dateRangeStart: Date;
  dateRangeEnd: Date;
  comparisonRangeStart?: Date;
  comparisonRangeEnd?: Date;
  sections?: string[]; // e.g., ['summary', 'charts', 'patterns', 'recommendations']
  focusAreas?: string[]; // e.g., ['fasting', 'post-meal', 'overnight']
  notes?: string;
}

export interface GlucoseStats {
  average: number;
  median: number;
  max: number;
  min: number;
  stdDev: number;
  cv: number; // Coefficient of variation
  gmi: number; // Glucose Management Indicator
  timeInRange: {
    veryLow: number; // <54 mg/dL
    low: number; // 54-70 mg/dL
    inRange: number; // 70-140 mg/dL (Sage target)
    highNormal: number; // 140-180 mg/dL
    high: number; // 180-250 mg/dL
    veryHigh: number; // >250 mg/dL
  };
  totalReadings: number;
  overnightAvg?: number;
  overnightLow?: number;
  overnightHigh?: number;
  dailyMaxAvg?: number;
}

export interface LogData {
  meals: any[];
  insulin: any[];
  exercise: any[];
}

export interface LogStats {
  avgDailyCarbs: number;
  avgDailyInsulin: number;
  avgBasalInsulin: number;
  avgRapidInsulin: number;
  avgDailyExercise: number;
  avgCarbRatio: number | null;
  totalMeals: number;
  totalExerciseSessions: number;
  daysWithData: number;
}

/**
 * Service for generating medical reports as PDFs
 */
export class ReportGenerator {
  private reportsDir: string;
  private chartGenerator: ChartGenerator;

  constructor() {
    // Store reports in server/reports directory
    this.reportsDir = path.join(__dirname, '../../reports');
    // Larger charts to better utilize page space
    this.chartGenerator = new ChartGenerator({ width: 900, height: 500 });
  }

  /**
   * Ensure reports directory exists
   */
  private async ensureReportsDir(): Promise<void> {
    try {
      await fs.access(this.reportsDir);
    } catch {
      await fs.mkdir(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Calculate glucose statistics from readings
   */
  private calculateStats(readings: GlucoseReading[]): GlucoseStats {
    if (readings.length === 0) {
      return {
        average: 0,
        median: 0,
        max: 0,
        min: 0,
        stdDev: 0,
        cv: 0,
        gmi: 0,
        timeInRange: {
          veryLow: 0,
          low: 0,
          inRange: 0,
          highNormal: 0,
          high: 0,
          veryHigh: 0,
        },
        totalReadings: 0,
      };
    }

    const values = readings.map(r => r.value);
    const total = readings.length;

    // Average, min, max
    const average = values.reduce((sum, v) => sum + v, 0) / total;
    const max = Math.max(...values);
    const min = Math.min(...values);

    // Median
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(total / 2)];

    // Standard deviation
    const variance = values.reduce((sum, v) => sum + Math.pow(v - average, 2), 0) / total;
    const stdDev = Math.sqrt(variance);

    // Coefficient of variation
    const cv = (stdDev / average) * 100;

    // GMI (Glucose Management Indicator) = 3.31 + (0.02392 × average glucose in mg/dL)
    const gmi = 3.31 + 0.02392 * average;

    // Time in Range (Sage's 70-140 target)
    const veryLow = readings.filter(r => r.value < 54).length;
    const low = readings.filter(r => r.value >= 54 && r.value < 70).length;
    const inRange = readings.filter(r => r.value >= 70 && r.value <= 140).length;
    const highNormal = readings.filter(r => r.value > 140 && r.value <= 180).length;
    const high = readings.filter(r => r.value > 180 && r.value <= 250).length;
    const veryHigh = readings.filter(r => r.value > 250).length;

    // Overnight metrics (10pm - 7am)
    const overnightReadings = readings.filter(r => {
      const hour = r.timestamp.getHours();
      return hour >= 22 || hour < 7;
    });

    let overnightAvg, overnightLow, overnightHigh;
    if (overnightReadings.length > 0) {
      const overnightValues = overnightReadings.map(r => r.value);
      overnightAvg = Math.round(overnightValues.reduce((sum, v) => sum + v, 0) / overnightValues.length);
      overnightLow = Math.min(...overnightValues);
      overnightHigh = Math.max(...overnightValues);
    }

    // Daily maximum average (group by day and get average of daily maximums)
    const dailyMaxes: number[] = [];
    const readingsByDay = new Map<string, GlucoseReading[]>();

    readings.forEach(r => {
      const day = r.timestamp.toISOString().split('T')[0];
      if (!readingsByDay.has(day)) {
        readingsByDay.set(day, []);
      }
      readingsByDay.get(day)!.push(r);
    });

    readingsByDay.forEach(dayReadings => {
      const dayMax = Math.max(...dayReadings.map(r => r.value));
      dailyMaxes.push(dayMax);
    });

    const dailyMaxAvg = dailyMaxes.length > 0
      ? Math.round(dailyMaxes.reduce((sum, v) => sum + v, 0) / dailyMaxes.length)
      : undefined;

    return {
      average: Math.round(average),
      median,
      max,
      min,
      stdDev: Math.round(stdDev),
      cv: Math.round(cv * 10) / 10,
      gmi: Math.round(gmi * 10) / 10,
      timeInRange: {
        veryLow: Math.round((veryLow / total) * 1000) / 10,
        low: Math.round((low / total) * 1000) / 10,
        inRange: Math.round((inRange / total) * 1000) / 10,
        highNormal: Math.round((highNormal / total) * 1000) / 10,
        high: Math.round((high / total) * 1000) / 10,
        veryHigh: Math.round((veryHigh / total) * 1000) / 10,
      },
      totalReadings: total,
      overnightAvg,
      overnightLow,
      overnightHigh,
      dailyMaxAvg,
    };
  }

  /**
   * Fetch log data (meals, insulin, exercise) for a date range
   */
  private async fetchLogData(userId: string, startDate: Date, endDate: Date): Promise<LogData> {
    const [meals, insulin, exercise] = await Promise.all([
      query(
        `SELECT id, user_id, timestamp, description, carbs, notes
         FROM meals
         WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
         ORDER BY timestamp ASC`,
        [userId, startDate, endDate]
      ),
      query(
        `SELECT id, user_id, timestamp, insulin_type, brand_name, units, purpose, notes
         FROM insulin_doses
         WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
         ORDER BY timestamp ASC`,
        [userId, startDate, endDate]
      ),
      query(
        `SELECT id, user_id, timestamp, description, duration_minutes, activity_type, intensity, notes
         FROM exercise_logs
         WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
         ORDER BY timestamp ASC`,
        [userId, startDate, endDate]
      ),
    ]);

    return {
      meals: meals.rows,
      insulin: insulin.rows,
      exercise: exercise.rows,
    };
  }

  /**
   * Check if an insulin type is a basal (long-acting) insulin
   */
  private isBasalInsulin(insulinType: string): boolean {
    const type = insulinType.toLowerCase();
    return type.includes('lantus') ||
           type.includes('basal') ||
           type.includes('tresiba') ||
           type.includes('levemir') ||
           type.includes('toujeo') ||
           type.includes('degludec') ||
           type.includes('glargine') ||
           type.includes('detemir') ||
           type.includes('long-acting') ||
           type.includes('long');
  }

  /**
   * Calculate log-based statistics
   */
  private calculateLogStats(logData: LogData, startDate: Date, endDate: Date): LogStats {
    const { meals, insulin, exercise } = logData;

    // Calculate number of days in range
    const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysWithData = Math.max(1, daysDiff);

    // Calculate total carbs
    const totalCarbs = meals.reduce((sum, meal) => {
      const carbs = Number(meal.carbs);
      return sum + (isNaN(carbs) ? 0 : carbs);
    }, 0);

    // Calculate insulin breakdown
    let totalBasal = 0;
    let totalRapid = 0;
    insulin.forEach(dose => {
      const units = Number(dose.units);
      if (!isNaN(units)) {
        if (this.isBasalInsulin(dose.insulin_type)) {
          totalBasal += units;
        } else {
          totalRapid += units;
        }
      }
    });
    const totalInsulin = totalBasal + totalRapid;

    // Calculate total exercise
    const totalExercise = exercise.reduce((sum, session) => {
      const minutes = Number(session.duration_minutes);
      return sum + (isNaN(minutes) ? 0 : minutes);
    }, 0);

    // Calculate carb ratios (match meals with insulin within 30 min)
    const carbRatios: number[] = [];
    meals.forEach(meal => {
      const mealTime = new Date(meal.timestamp).getTime();
      const mealCarbs = Number(meal.carbs);

      if (isNaN(mealCarbs) || mealCarbs === 0) return;

      // Find rapid insulin within 30 minutes before or after meal
      const matchingInsulin = insulin.find(dose => {
        if (this.isBasalInsulin(dose.insulin_type)) return false;
        const doseTime = new Date(dose.timestamp).getTime();
        const timeDiff = Math.abs(doseTime - mealTime);
        return timeDiff <= 30 * 60 * 1000; // 30 minutes in milliseconds
      });

      if (matchingInsulin) {
        const insulinUnits = Number(matchingInsulin.units);
        if (!isNaN(insulinUnits) && insulinUnits > 0) {
          carbRatios.push(mealCarbs / insulinUnits);
        }
      }
    });

    const avgCarbRatio = carbRatios.length > 0
      ? carbRatios.reduce((sum, r) => sum + r, 0) / carbRatios.length
      : null;

    return {
      avgDailyCarbs: totalCarbs / daysWithData,
      avgDailyInsulin: totalInsulin / daysWithData,
      avgBasalInsulin: totalBasal / daysWithData,
      avgRapidInsulin: totalRapid / daysWithData,
      avgDailyExercise: totalExercise / daysWithData,
      avgCarbRatio,
      totalMeals: meals.length,
      totalExerciseSessions: exercise.length,
      daysWithData,
    };
  }

  /**
   * Generate HTML for the report
   */
  private async generateHTML(
    config: ReportConfig,
    stats: GlucoseStats,
    chartImages: {
      trend?: string;
      agp?: string;
      timeInRange?: string;
      dailyPattern?: string;
      distribution?: string;
      weeklyOverview?: string;
      bedtimeGlucose?: string;
      dailyTrends?: string;
      overnightGlucose?: string;
      dailyCarbs?: string;
      insulinUsage?: string;
      carbRatio?: string;
      exercisePattern?: string;
    },
    comparisonStats?: GlucoseStats,
    logStats?: LogStats
  ): Promise<string> {
    const formatDate = (date: Date) => date.toLocaleDateString();

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${config.title}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.5;
      color: #1f2937;
      background: white;
      padding: 15px;
    }
    .header {
      text-align: center;
      margin-bottom: 15px;
      padding-bottom: 15px;
      border-bottom: 3px solid #3b82f6;
    }
    h1 {
      font-size: 28px;
      color: #1f2937;
      margin-bottom: 10px;
    }
    .subtitle {
      font-size: 16px;
      color: #6b7280;
      margin-bottom: 5px;
    }
    .report-info {
      display: flex;
      justify-content: center;
      gap: 30px;
      font-size: 14px;
      color: #6b7280;
      margin-top: 15px;
    }
    .section {
      margin-bottom: 20px;
      page-break-inside: avoid;
    }
    h2 {
      font-size: 20px;
      color: #1f2937;
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e5e7eb;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 12px;
      margin-bottom: 30px;
    }
    .stat-card {
      background: #f9fafb;
      padding: 12px;
      border-radius: 8px;
      border: 1px solid #e5e7eb;
    }
    .stat-label {
      font-size: 14px;
      color: #6b7280;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 22px;
      font-weight: bold;
      color: #1f2937;
    }
    .stat-unit {
      font-size: 14px;
      color: #6b7280;
      margin-left: 5px;
    }
    .tir-bars {
      margin: 15px 0;
    }
    .tir-bar {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
      font-size: 13px;
    }
    .tir-label {
      width: 150px;
      color: #4b5563;
    }
    .tir-progress {
      flex: 1;
      height: 20px;
      background: #e5e7eb;
      border-radius: 4px;
      overflow: hidden;
      margin: 0 8px;
    }
    .tir-fill {
      height: 100%;
      transition: width 0.3s;
    }
    .tir-value {
      width: 60px;
      text-align: right;
      font-weight: bold;
    }
    .chart-container {
      margin: 15px 0;
      text-align: center;
    }
    .chart-container img {
      max-width: 100%;
      height: auto;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
    }
    .comparison-section {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
      margin-top: 20px;
    }
    .comparison-column h3 {
      font-size: 18px;
      margin-bottom: 15px;
      color: #1f2937;
    }
    .notes {
      background: #fef3c7;
      border-left: 4px solid #f59e0b;
      padding: 20px;
      margin-top: 20px;
      border-radius: 4px;
    }
    .notes h3 {
      font-size: 16px;
      margin-bottom: 10px;
      color: #92400e;
    }
    .notes p {
      color: #78350f;
      font-size: 14px;
    }
    .chart-description {
      font-size: 11px;
      color: #6b7280;
      margin-top: 8px;
      font-style: italic;
      text-align: center;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      font-size: 12px;
      color: #9ca3af;
    }
    .page-break {
      page-break-after: always;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${config.title}</h1>
    <div class="subtitle">Type 1 Diabetes Management Report</div>
    <div class="report-info">
      <span>Report Type: ${config.reportType}</span>
      <span>Period: ${formatDate(config.dateRangeStart)} - ${formatDate(config.dateRangeEnd)}</span>
      <span>Generated: ${new Date().toLocaleString()}</span>
    </div>
  </div>

  <div class="section">
    <h2>Summary Statistics</h2>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Average Glucose</div>
        <div class="stat-value">${stats.average}<span class="stat-unit">mg/dL</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Time in Range (70-140)</div>
        <div class="stat-value">${stats.timeInRange.inRange}<span class="stat-unit">%</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Max / Min Glucose</div>
        <div class="stat-value">${stats.max} / ${stats.min}<span class="stat-unit">mg/dL</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Coefficient of Variation</div>
        <div class="stat-value">${stats.cv}<span class="stat-unit">%</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Standard Deviation</div>
        <div class="stat-value">${stats.stdDev}<span class="stat-unit">mg/dL</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">GMI (A1C Estimate)</div>
        <div class="stat-value">${stats.gmi}<span class="stat-unit">%</span></div>
      </div>
      ${stats.overnightAvg ? `
      <div class="stat-card">
        <div class="stat-label">Overnight Average (10pm-7am)</div>
        <div class="stat-value">${stats.overnightAvg}<span class="stat-unit">mg/dL</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Overnight Range</div>
        <div class="stat-value">${stats.overnightLow} - ${stats.overnightHigh}<span class="stat-unit">mg/dL</span></div>
      </div>
      ` : ''}
      ${stats.dailyMaxAvg ? `
      <div class="stat-card">
        <div class="stat-label">Avg Daily Maximum</div>
        <div class="stat-value">${stats.dailyMaxAvg}<span class="stat-unit">mg/dL</span></div>
      </div>
      ` : ''}
      <div class="stat-card">
        <div class="stat-label">Total Readings</div>
        <div class="stat-value">${stats.totalReadings}</div>
      </div>
    </div>

    <h3 style="font-size: 18px; margin: 30px 0 15px 0;">Time in Range Breakdown (Sage Target: 70-140 mg/dL)</h3>
    <div class="tir-bars">
      <div class="tir-bar">
        <div class="tir-label">Very Low (&lt;54)</div>
        <div class="tir-progress">
          <div class="tir-fill" style="width: ${stats.timeInRange.veryLow}%; background: #dc2626;"></div>
        </div>
        <div class="tir-value">${stats.timeInRange.veryLow}%</div>
      </div>
      <div class="tir-bar">
        <div class="tir-label">Low (54-70)</div>
        <div class="tir-progress">
          <div class="tir-fill" style="width: ${stats.timeInRange.low}%; background: #fb923c;"></div>
        </div>
        <div class="tir-value">${stats.timeInRange.low}%</div>
      </div>
      <div class="tir-bar">
        <div class="tir-label">In Range (70-140)</div>
        <div class="tir-progress">
          <div class="tir-fill" style="width: ${stats.timeInRange.inRange}%; background: #22c55e;"></div>
        </div>
        <div class="tir-value">${stats.timeInRange.inRange}%</div>
      </div>
      <div class="tir-bar">
        <div class="tir-label">High Normal (140-180)</div>
        <div class="tir-progress">
          <div class="tir-fill" style="width: ${stats.timeInRange.highNormal}%; background: #fbbf24;"></div>
        </div>
        <div class="tir-value">${stats.timeInRange.highNormal}%</div>
      </div>
      <div class="tir-bar">
        <div class="tir-label">High (180-250)</div>
        <div class="tir-progress">
          <div class="tir-fill" style="width: ${stats.timeInRange.high}%; background: #fb923c;"></div>
        </div>
        <div class="tir-value">${stats.timeInRange.high}%</div>
      </div>
      <div class="tir-bar">
        <div class="tir-label">Very High (&gt;250)</div>
        <div class="tir-progress">
          <div class="tir-fill" style="width: ${stats.timeInRange.veryHigh}%; background: #dc2626;"></div>
        </div>
        <div class="tir-value">${stats.timeInRange.veryHigh}%</div>
      </div>
    </div>
  </div>

  ${logStats && (logStats.totalMeals > 0 || logStats.totalExerciseSessions > 0) ? `
  <div class="section">
    <h2>Lifestyle Management</h2>
    <div class="stats-grid">
      ${logStats.totalMeals > 0 && logStats.avgDailyCarbs > 0 ? `
      <div class="stat-card">
        <div class="stat-label">Avg Daily Carbs</div>
        <div class="stat-value">${logStats.avgDailyCarbs.toFixed(0)}<span class="stat-unit">g</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Meals Logged</div>
        <div class="stat-value">${logStats.totalMeals}</div>
      </div>
      ` : ''}
      ${logStats.avgDailyInsulin > 0 ? `
      <div class="stat-card">
        <div class="stat-label">Avg Daily Insulin</div>
        <div class="stat-value">${logStats.avgDailyInsulin.toFixed(1)}<span class="stat-unit">u</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Basal vs Rapid</div>
        <div class="stat-value">${logStats.avgBasalInsulin.toFixed(1)}u / ${logStats.avgRapidInsulin.toFixed(1)}<span class="stat-unit">u</span></div>
      </div>
      ` : ''}
      ${logStats.avgCarbRatio !== null ? `
      <div class="stat-card">
        <div class="stat-label">Avg Carb Ratio</div>
        <div class="stat-value">1:${logStats.avgCarbRatio.toFixed(1)}</div>
      </div>
      ` : ''}
      ${logStats.totalExerciseSessions > 0 && logStats.avgDailyExercise > 0 ? `
      <div class="stat-card">
        <div class="stat-label">Avg Daily Exercise</div>
        <div class="stat-value">${logStats.avgDailyExercise.toFixed(0)}<span class="stat-unit">min</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Exercise Sessions</div>
        <div class="stat-value">${logStats.totalExerciseSessions}</div>
      </div>
      ` : ''}
    </div>
  </div>
  ` : ''}

  ${config.reportType === 'comparison' && comparisonStats ? `
  <div class="section page-break">
    <h2>Period Comparison</h2>
    <div class="comparison-section">
      <div class="comparison-column">
        <h3>Current Period (${formatDate(config.dateRangeStart)} - ${formatDate(config.dateRangeEnd)})</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Average</div>
            <div class="stat-value">${stats.average}<span class="stat-unit">mg/dL</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Time in Range</div>
            <div class="stat-value">${stats.timeInRange.inRange}<span class="stat-unit">%</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">GMI</div>
            <div class="stat-value">${stats.gmi}<span class="stat-unit">%</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Max / Min</div>
            <div class="stat-value">${stats.max} / ${stats.min}<span class="stat-unit">mg/dL</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Std Dev</div>
            <div class="stat-value">${stats.stdDev}<span class="stat-unit">mg/dL</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">CV</div>
            <div class="stat-value">${stats.cv}<span class="stat-unit">%</span></div>
          </div>
          ${stats.overnightAvg ? `
          <div class="stat-card">
            <div class="stat-label">Overnight Avg</div>
            <div class="stat-value">${stats.overnightAvg}<span class="stat-unit">mg/dL</span></div>
          </div>
          ` : ''}
          <div class="stat-card">
            <div class="stat-label">Total Readings</div>
            <div class="stat-value">${stats.totalReadings}</div>
          </div>
        </div>
      </div>
      <div class="comparison-column">
        <h3>Comparison Period (${formatDate(config.comparisonRangeStart!)} - ${formatDate(config.comparisonRangeEnd!)})</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Average</div>
            <div class="stat-value">${comparisonStats.average}<span class="stat-unit">mg/dL</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Time in Range</div>
            <div class="stat-value">${comparisonStats.timeInRange.inRange}<span class="stat-unit">%</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">GMI</div>
            <div class="stat-value">${comparisonStats.gmi}<span class="stat-unit">%</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Max / Min</div>
            <div class="stat-value">${comparisonStats.max} / ${comparisonStats.min}<span class="stat-unit">mg/dL</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Std Dev</div>
            <div class="stat-value">${comparisonStats.stdDev}<span class="stat-unit">mg/dL</span></div>
          </div>
          <div class="stat-card">
            <div class="stat-label">CV</div>
            <div class="stat-value">${comparisonStats.cv}<span class="stat-unit">%</span></div>
          </div>
          ${comparisonStats.overnightAvg ? `
          <div class="stat-card">
            <div class="stat-label">Overnight Avg</div>
            <div class="stat-value">${comparisonStats.overnightAvg}<span class="stat-unit">mg/dL</span></div>
          </div>
          ` : ''}
          <div class="stat-card">
            <div class="stat-label">Total Readings</div>
            <div class="stat-value">${comparisonStats.totalReadings}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h2>Glucose Analysis & Charts</h2>

    ${chartImages.agp ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.agp}" alt="Ambulatory Glucose Profile" />
      <div class="chart-description">Shows glucose patterns overlaid by time of day across all days. Bands represent 10th, 25th, 50th (median), 75th, and 90th percentiles.</div>
    </div>
    ` : ''}

    ${chartImages.trend ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.trend}" alt="Glucose Trend" />
      <div class="chart-description">Continuous glucose readings over time with target range shaded (70-140 mg/dL).</div>
    </div>
    ` : ''}

    ${chartImages.dailyTrends ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.dailyTrends}" alt="Daily Trends (Avg/Min/Max)" />
      <div class="chart-description">Shows average, minimum, and maximum glucose values for each day. Helps identify day-to-day patterns and variability.</div>
    </div>
    ` : ''}

    ${chartImages.timeInRange ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.timeInRange}" alt="Time in Range" />
      <div class="chart-description">Percentage of readings in each glucose range. Target is >70% in range (70-140 mg/dL).</div>
    </div>
    ` : ''}

    ${chartImages.distribution ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.distribution}" alt="Glucose Distribution" />
      <div class="chart-description">Histogram showing frequency of glucose values. Calculated by grouping all readings into 20 mg/dL bins.</div>
    </div>
    ` : ''}

    ${chartImages.weeklyOverview ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.weeklyOverview}" alt="Weekly Overview (Avg/Min/Max)" />
      <div class="chart-description">Average, minimum, and maximum glucose values grouped by week.</div>
    </div>
    ` : ''}

    ${chartImages.overnightGlucose ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.overnightGlucose}" alt="Overnight Glucose (10 PM - 7 AM)" />
      <div class="chart-description">Shows glucose levels during sleep hours (10 PM - 7 AM), with daily averages and min/max ranges.</div>
    </div>
    ` : ''}

    ${chartImages.bedtimeGlucose ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.bedtimeGlucose}" alt="Bedtime Glucose (9-11 PM)" />
      <div class="chart-description">Average glucose at bedtime (9-11 PM) for each day. Helps assess if basal insulin adjustments are needed.</div>
    </div>
    ` : ''}
  </div>

  ${(chartImages.dailyCarbs || chartImages.insulinUsage || chartImages.carbRatio || chartImages.exercisePattern) ? `
  <div class="section">
    <h2>Lifestyle Management Charts</h2>

    ${chartImages.dailyCarbs ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.dailyCarbs}" alt="Daily Carbohydrate Intake" />
      <div class="chart-description">Total carbs consumed per day. Helps track dietary patterns and consistency.</div>
    </div>
    ` : ''}

    ${chartImages.insulinUsage ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.insulinUsage}" alt="Daily Insulin Usage" />
      <div class="chart-description">Basal vs rapid insulin usage per day. Shows insulin distribution and total daily doses.</div>
    </div>
    ` : ''}

    ${chartImages.carbRatio ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.carbRatio}" alt="Carb-to-Insulin Ratio" />
      <div class="chart-description">Grams of carbs per unit of rapid insulin over time. Target range is typically 8-15g per unit.</div>
    </div>
    ` : ''}

    ${chartImages.exercisePattern ? `
    <div class="chart-container">
      <img src="data:image/png;base64,${chartImages.exercisePattern}" alt="Exercise Patterns" />
      <div class="chart-description">Daily exercise duration by intensity level. Helps correlate physical activity with glucose patterns.</div>
    </div>
    ` : ''}
  </div>
  ` : ''}

  ${config.notes ? `
  <div class="notes">
    <h3>Notes</h3>
    <p>${config.notes}</p>
  </div>
  ` : ''}

  <div class="footer">
    <p>This report is generated from continuous glucose monitoring data for informational purposes.</p>
    <p>Please consult with your healthcare provider for medical advice.</p>
    <p>Generated by Sage T1D Management System - ${new Date().toLocaleString()}</p>
  </div>
</body>
</html>
    `;
  }

  /**
   * Generate a report and save as PDF
   */
  async generateReport(config: ReportConfig): Promise<string> {
    await this.ensureReportsDir();

    // Create report record
    const reportResult = await query(
      `INSERT INTO reports (user_id, title, report_type, date_range_start, date_range_end,
                            comparison_range_start, comparison_range_end, config, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'generating')
       RETURNING id`,
      [
        config.userId,
        config.title,
        config.reportType,
        config.dateRangeStart,
        config.dateRangeEnd,
        config.comparisonRangeStart || null,
        config.comparisonRangeEnd || null,
        JSON.stringify({
          sections: config.sections || [],
          focusAreas: config.focusAreas || [],
          notes: config.notes || '',
        }),
      ]
    );

    const reportId = reportResult.rows[0].id;

    try {
      // Fetch readings for primary period
      const readings = await ChartGenerator.fetchReadings(
        config.userId,
        config.dateRangeStart,
        config.dateRangeEnd
      );

      if (readings.length === 0) {
        throw new Error('No glucose readings found for the specified date range');
      }

      // Calculate glucose stats
      const stats = this.calculateStats(readings);

      // Fetch log data
      const logData = await this.fetchLogData(config.userId, config.dateRangeStart, config.dateRangeEnd);
      const logStats = this.calculateLogStats(logData, config.dateRangeStart, config.dateRangeEnd);

      // Fetch comparison data if needed
      let comparisonStats: GlucoseStats | undefined;
      if (
        config.reportType === 'comparison' &&
        config.comparisonRangeStart &&
        config.comparisonRangeEnd
      ) {
        const comparisonReadings = await ChartGenerator.fetchReadings(
          config.userId,
          config.comparisonRangeStart,
          config.comparisonRangeEnd
        );
        comparisonStats = this.calculateStats(comparisonReadings);
      }

      // Generate charts
      const chartImages: any = {};

      // Limit readings for trend chart to avoid overcrowding (max 500 points)
      const trendReadings =
        readings.length > 500
          ? readings.filter((_, i) => i % Math.ceil(readings.length / 500) === 0)
          : readings;

      chartImages.trend = (
        await this.chartGenerator.generateTrendChart(
          trendReadings,
          `Glucose Trend (${config.dateRangeStart.toLocaleDateString()} - ${config.dateRangeEnd.toLocaleDateString()})`
        )
      ).toString('base64');

      chartImages.agp = (await this.chartGenerator.generateAGPChart(readings)).toString(
        'base64'
      );

      chartImages.timeInRange = (
        await this.chartGenerator.generateTimeInRangeChart(readings)
      ).toString('base64');

      chartImages.distribution = (
        await this.chartGenerator.generateDistributionChart(readings)
      ).toString('base64');

      // Generate dashboard-style charts
      chartImages.weeklyOverview = (
        await this.chartGenerator.generateWeeklyOverviewChart(readings)
      ).toString('base64');

      chartImages.bedtimeGlucose = (
        await this.chartGenerator.generateBedtimeGlucoseChart(readings)
      ).toString('base64');

      chartImages.overnightGlucose = (
        await this.chartGenerator.generateOvernightGlucoseChart(readings)
      ).toString('base64');

      chartImages.dailyTrends = (
        await this.chartGenerator.generateDailyTrendsChart(readings)
      ).toString('base64');

      // Generate log analytics charts if we have log data
      if (logData.meals.length > 0) {
        chartImages.dailyCarbs = (
          await this.chartGenerator.generateDailyCarbsChart(logData.meals)
        ).toString('base64');
      }

      if (logData.insulin.length > 0) {
        chartImages.insulinUsage = (
          await this.chartGenerator.generateInsulinUsageChart(logData.insulin)
        ).toString('base64');
      }

      if (logData.meals.length > 0 && logData.insulin.length > 0) {
        chartImages.carbRatio = (
          await this.chartGenerator.generateCarbRatioChart(logData.meals, logData.insulin)
        ).toString('base64');
      }

      if (logData.exercise.length > 0) {
        chartImages.exercisePattern = (
          await this.chartGenerator.generateExercisePatternChart(logData.exercise)
        ).toString('base64');
      }

      // Generate HTML with log statistics
      const html = await this.generateHTML(config, stats, chartImages, comparisonStats, logStats);

      // Generate PDF using Puppeteer
      const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const pdfPath = path.join(this.reportsDir, `${reportId}.pdf`);
      await page.pdf({
        path: pdfPath,
        format: 'A4',
        printBackground: true,
        margin: {
          top: '12mm',
          right: '10mm',
          bottom: '12mm',
          left: '10mm',
        },
      });

      await browser.close();

      // Update report record with file path
      await query(
        `UPDATE reports
         SET file_path = $1, status = 'ready', generated_at = NOW()
         WHERE id = $2`,
        [`reports/${reportId}.pdf`, reportId]
      );

      return reportId;
    } catch (error) {
      // Update report record with error
      await query(
        `UPDATE reports
         SET status = 'error', error_message = $1
         WHERE id = $2`,
        [error instanceof Error ? error.message : 'Unknown error', reportId]
      );

      throw error;
    }
  }

  /**
   * Get report status and metadata
   */
  async getReport(reportId: string, userId: string): Promise<any> {
    const result = await query(
      `SELECT id, user_id, title, report_type, date_range_start, date_range_end,
              comparison_range_start, comparison_range_end, config, file_path,
              status, error_message, generated_at, created_at
       FROM reports
       WHERE id = $1 AND user_id = $2`,
      [reportId, userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Report not found');
    }

    return result.rows[0];
  }

  /**
   * Get all reports for a user
   */
  async getUserReports(userId: string): Promise<any[]> {
    const result = await query(
      `SELECT id, title, report_type, date_range_start, date_range_end,
              status, generated_at, created_at
       FROM reports
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Get file path for a report
   */
  async getReportFilePath(reportId: string, userId: string): Promise<string> {
    const report = await this.getReport(reportId, userId);

    if (report.status !== 'ready') {
      throw new Error('Report is not ready yet');
    }

    return path.join(__dirname, '../../', report.file_path);
  }

  /**
   * Delete a report
   */
  async deleteReport(reportId: string, userId: string): Promise<void> {
    const report = await this.getReport(reportId, userId);

    // Delete file if it exists
    if (report.file_path) {
      const filePath = path.join(__dirname, '../../', report.file_path);
      try {
        await fs.unlink(filePath);
      } catch (error) {
        console.error('Failed to delete report file:', error);
      }
    }

    // Delete database record
    await query('DELETE FROM reports WHERE id = $1 AND user_id = $2', [reportId, userId]);
  }
}
