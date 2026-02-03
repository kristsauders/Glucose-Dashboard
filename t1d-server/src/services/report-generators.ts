/**
 * Multi-Timescale Report Generators
 *
 * Generates daily, weekly, and monthly health reports for users.
 * Reports include metrics, trends, patterns, and actionable insights.
 */

import { query } from '../config/database.js';
import { analyzeTrend } from './advanced-analysis.js';

interface DailyReport {
  user_id: string;
  report_date: string;
  avg_glucose: number;
  min_glucose: number;
  max_glucose: number;
  std_dev: number;
  cv: number;
  estimated_a1c: number;
  tir_70_180_pct: number;
  tir_70_140_pct: number;
  time_below_70_pct: number;
  time_above_180_pct: number;
  hypoglycemia_episodes: number;
  hyperglycemia_episodes: number;
  meals_logged: number;
  exercise_sessions: number;
  overnight_avg_glucose: number | null;
  overnight_stability: string | null;
  summary: string;
  highlights: any[];
  patterns_detected: any[];
}

interface WeeklyReport {
  user_id: string;
  week_start_date: string;
  week_end_date: string;
  avg_glucose_week: number;
  avg_tir_70_180_pct: number;
  avg_cv: number;
  estimated_a1c: number;
  trend_direction: string;
  trend_slope: number;
  trend_r_squared: number;
  vs_previous_week: any;
  best_day_date: string | null;
  best_day_avg: number | null;
  worst_day_date: string | null;
  worst_day_avg: number | null;
  patterns_summary: any;
  summary: string;
  highlights: any[];
  recommendations: any[];
}

interface MonthlyReport {
  user_id: string;
  month_start_date: string;
  month_end_date: string;
  avg_glucose_month: number;
  avg_tir_70_180_pct: number;
  avg_cv: number;
  estimated_a1c: number;
  a1c_confidence_interval_lower: number;
  a1c_confidence_interval_upper: number;
  total_hypoglycemia_episodes: number;
  total_hyperglycemia_episodes: number;
  total_meals_logged: number;
  total_exercise_sessions: number;
  total_insulin_doses: number;
  weekly_data: any[];
  patterns_summary: any;
  pattern_changes: any;
  vs_previous_month: any;
  vs_3_months_ago: any | null;
  long_term_trend: any | null;
  summary: string;
  highlights: any[];
  recommendations: any[];
  provider_summary: string;
}

/**
 * Daily Report Generator
 * Generates daily summaries at 8am
 */
export class DailyReportGenerator {
  async generateReport(userId: string, date: string): Promise<DailyReport> {
    console.log(`📊 Generating daily report for ${userId} on ${date}`);

    const reportDate = new Date(date);
    const nextDay = new Date(reportDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Fetch glucose data for the day
    const glucoseResult = await query(
      `SELECT
        COUNT(*) as count,
        AVG(glucose) as avg_glucose,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir_70_180,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 140) * 100.0 / COUNT(*) as tir_70_140,
        COUNT(*) FILTER (WHERE glucose < 70) * 100.0 / COUNT(*) as time_below_70,
        COUNT(*) FILTER (WHERE glucose > 180) * 100.0 / COUNT(*) as time_above_180
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= $2
         AND timestamp < $3`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    const stats = glucoseResult.rows[0];
    const avgGlucose = parseFloat(stats.avg_glucose || 0);
    const stdDev = parseFloat(stats.std_dev || 0);
    const cv = avgGlucose > 0 ? (stdDev / avgGlucose) * 100 : 0;
    const estimatedA1c = avgGlucose > 0 ? (avgGlucose + 46.7) / 28.7 : 0;

    // Count hypoglycemia episodes (<70 for >15 min)
    const hypoResult = await query(
      `WITH lows AS (
        SELECT timestamp, glucose,
          LAG(glucose) OVER (ORDER BY timestamp) as prev_glucose,
          LEAD(glucose) OVER (ORDER BY timestamp) as next_glucose
        FROM glucose_readings
        WHERE user_id = $1
          AND timestamp >= $2
          AND timestamp < $3
          AND glucose < 70
      )
      SELECT COUNT(*) as episodes
      FROM lows
      WHERE prev_glucose >= 70 OR prev_glucose IS NULL`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    // Count hyperglycemia episodes (>180 for >1 hour)
    const hyperResult = await query(
      `WITH highs AS (
        SELECT timestamp, glucose,
          LAG(glucose) OVER (ORDER BY timestamp) as prev_glucose
        FROM glucose_readings
        WHERE user_id = $1
          AND timestamp >= $2
          AND timestamp < $3
          AND glucose > 180
      )
      SELECT COUNT(*) as episodes
      FROM highs
      WHERE prev_glucose <= 180 OR prev_glucose IS NULL`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    // Count meals and exercise logged
    const mealsResult = await query(
      `SELECT COUNT(*) as count FROM meals
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp < $3`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    const exerciseResult = await query(
      `SELECT COUNT(*) as count FROM exercise_logs
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp < $3`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    // Overnight analysis (3am-7am)
    const overnightResult = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        MIN(glucose) as min_glucose,
        MAX(glucose) as max_glucose
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= $2
         AND timestamp < $3
         AND EXTRACT(HOUR FROM timestamp) >= 3
         AND EXTRACT(HOUR FROM timestamp) < 7`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    const overnight = overnightResult.rows[0];
    const overnightAvg = overnight.avg_glucose ? parseFloat(overnight.avg_glucose) : null;
    const overnightMin = overnight.min_glucose ? parseFloat(overnight.min_glucose) : null;
    const overnightMax = overnight.max_glucose ? parseFloat(overnight.max_glucose) : null;

    let overnightStability: string | null = null;
    if (overnightAvg && overnightMin && overnightMax) {
      const overnightRange = overnightMax - overnightMin;
      if (overnightRange < 30) {
        overnightStability = 'stable';
      } else if (overnightMax - overnightAvg > overnightAvg - overnightMin) {
        overnightStability = 'rising';
      } else {
        overnightStability = 'falling';
      }
    }

    // Get detected patterns for the day
    const patternsResult = await query(
      `SELECT DISTINCT
        p.pattern_name,
        p.pattern_type,
        p.description
       FROM pattern_events pe
       JOIN glucose_patterns p ON pe.pattern_id = p.id
       WHERE pe.user_id = $1
         AND pe.event_timestamp >= $2
         AND pe.event_timestamp < $3
       ORDER BY p.pattern_type`,
      [userId, date, nextDay.toISOString().split('T')[0]]
    );

    // Generate summary
    const summary = this.generateSummary({
      avgGlucose,
      tir: parseFloat(stats.tir_70_180 || 0),
      mealsLogged: parseInt(mealsResult.rows[0].count),
      exerciseSessions: parseInt(exerciseResult.rows[0].count),
      overnightAvg,
      overnightStability,
    });

    // Generate highlights
    const highlights = this.generateHighlights({
      avgGlucose,
      tir: parseFloat(stats.tir_70_180 || 0),
      cv,
      hypoEpisodes: parseInt(hypoResult.rows[0].episodes),
      hyperEpisodes: parseInt(hyperResult.rows[0].episodes),
      overnightStability,
    });

    return {
      user_id: userId,
      report_date: date,
      avg_glucose: avgGlucose,
      min_glucose: parseFloat(stats.min_glucose || 0),
      max_glucose: parseFloat(stats.max_glucose || 0),
      std_dev: stdDev,
      cv,
      estimated_a1c: estimatedA1c,
      tir_70_180_pct: parseFloat(stats.tir_70_180 || 0),
      tir_70_140_pct: parseFloat(stats.tir_70_140 || 0),
      time_below_70_pct: parseFloat(stats.time_below_70 || 0),
      time_above_180_pct: parseFloat(stats.time_above_180 || 0),
      hypoglycemia_episodes: parseInt(hypoResult.rows[0].episodes),
      hyperglycemia_episodes: parseInt(hyperResult.rows[0].episodes),
      meals_logged: parseInt(mealsResult.rows[0].count),
      exercise_sessions: parseInt(exerciseResult.rows[0].count),
      overnight_avg_glucose: overnightAvg,
      overnight_stability: overnightStability,
      summary,
      highlights,
      patterns_detected: patternsResult.rows,
    };
  }

  async storeReport(report: DailyReport): Promise<void> {
    await query(
      `INSERT INTO daily_reports (
        user_id, report_date, avg_glucose, min_glucose, max_glucose, std_dev, cv,
        estimated_a1c, tir_70_180_pct, tir_70_140_pct, time_below_70_pct, time_above_180_pct,
        hypoglycemia_episodes, hyperglycemia_episodes, meals_logged, exercise_sessions,
        overnight_avg_glucose, overnight_stability, summary, highlights, patterns_detected
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      ON CONFLICT (user_id, report_date) DO UPDATE SET
        avg_glucose = EXCLUDED.avg_glucose,
        min_glucose = EXCLUDED.min_glucose,
        max_glucose = EXCLUDED.max_glucose,
        std_dev = EXCLUDED.std_dev,
        cv = EXCLUDED.cv,
        estimated_a1c = EXCLUDED.estimated_a1c,
        tir_70_180_pct = EXCLUDED.tir_70_180_pct,
        tir_70_140_pct = EXCLUDED.tir_70_140_pct,
        time_below_70_pct = EXCLUDED.time_below_70_pct,
        time_above_180_pct = EXCLUDED.time_above_180_pct,
        hypoglycemia_episodes = EXCLUDED.hypoglycemia_episodes,
        hyperglycemia_episodes = EXCLUDED.hyperglycemia_episodes,
        meals_logged = EXCLUDED.meals_logged,
        exercise_sessions = EXCLUDED.exercise_sessions,
        overnight_avg_glucose = EXCLUDED.overnight_avg_glucose,
        overnight_stability = EXCLUDED.overnight_stability,
        summary = EXCLUDED.summary,
        highlights = EXCLUDED.highlights,
        patterns_detected = EXCLUDED.patterns_detected,
        generated_at = NOW()`,
      [
        report.user_id,
        report.report_date,
        report.avg_glucose,
        report.min_glucose,
        report.max_glucose,
        report.std_dev,
        report.cv,
        report.estimated_a1c,
        report.tir_70_180_pct,
        report.tir_70_140_pct,
        report.time_below_70_pct,
        report.time_above_180_pct,
        report.hypoglycemia_episodes,
        report.hyperglycemia_episodes,
        report.meals_logged,
        report.exercise_sessions,
        report.overnight_avg_glucose,
        report.overnight_stability,
        report.summary,
        JSON.stringify(report.highlights),
        JSON.stringify(report.patterns_detected),
      ]
    );

    console.log(`  ✓ Daily report stored for ${report.report_date}`);
  }

  private generateSummary(data: {
    avgGlucose: number;
    tir: number;
    mealsLogged: number;
    exerciseSessions: number;
    overnightAvg: number | null;
    overnightStability: string | null;
  }): string {
    const parts = [];

    parts.push(
      `Your glucose averaged ${data.avgGlucose.toFixed(0)} mg/dL with ${data.tir.toFixed(0)}% time in range.`
    );

    if (data.mealsLogged > 0) {
      parts.push(`${data.mealsLogged} meals logged.`);
    }

    if (data.exerciseSessions > 0) {
      parts.push(`${data.exerciseSessions} exercise sessions.`);
    }

    if (data.overnightAvg) {
      parts.push(
        `Overnight glucose was ${data.overnightStability || 'monitored'} at ${data.overnightAvg.toFixed(0)} mg/dL.`
      );
    }

    return parts.join(' ');
  }

  private generateHighlights(data: {
    avgGlucose: number;
    tir: number;
    cv: number;
    hypoEpisodes: number;
    hyperEpisodes: number;
    overnightStability: string | null;
  }): any[] {
    const highlights = [];

    if (data.tir >= 70) {
      highlights.push({ type: 'metric', text: `Time in range: ${data.tir.toFixed(0)}% (target: 70%)` });
    } else if (data.tir < 50) {
      highlights.push({ type: 'concern', text: `Time in range: ${data.tir.toFixed(0)}% (below 50%)` });
    } else {
      highlights.push({ type: 'metric', text: `Time in range: ${data.tir.toFixed(0)}% (below 70% target)` });
    }

    if (data.cv < 36) {
      highlights.push({ type: 'metric', text: `Glucose variability: CV ${data.cv.toFixed(0)}% (within target <36%)` });
    } else if (data.cv > 50) {
      highlights.push({ type: 'concern', text: `High glucose variability: CV ${data.cv.toFixed(0)}% (target: <36%)` });
    } else {
      highlights.push({ type: 'metric', text: `Glucose variability: CV ${data.cv.toFixed(0)}% (target: <36%)` });
    }

    if (data.hypoEpisodes > 0) {
      highlights.push({
        type: 'warning',
        text: `${data.hypoEpisodes} hypoglycemic episode${data.hypoEpisodes > 1 ? 's' : ''} (<70 mg/dL)`,
      });
    }

    if (data.overnightStability === 'stable') {
      highlights.push({ type: 'metric', text: 'Overnight glucose: stable (3am-7am)' });
    } else if (data.overnightStability === 'rising') {
      highlights.push({ type: 'info', text: 'Overnight glucose: rising trend (possible dawn phenomenon)' });
    } else if (data.overnightStability === 'falling') {
      highlights.push({ type: 'warning', text: 'Overnight glucose: falling trend (monitor for nocturnal hypoglycemia)' });
    }

    return highlights;
  }
}

/**
 * Weekly Report Generator
 * Generates weekly insights on Monday at 8am
 */
export class WeeklyReportGenerator {
  async generateReport(userId: string, weekStart: string): Promise<WeeklyReport> {
    console.log(`📊 Generating weekly report for ${userId} starting ${weekStart}`);

    const startDate = new Date(weekStart);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 7);

    // Try to use daily_reports if available, otherwise aggregate from glucose_readings
    const dailyReportsResult = await query(
      `SELECT * FROM daily_reports
       WHERE user_id = $1
         AND report_date >= $2
         AND report_date < $3
       ORDER BY report_date ASC`,
      [userId, weekStart, endDate.toISOString().split('T')[0]]
    );

    let weeklyMetrics;
    if (dailyReportsResult.rows.length >= 5) {
      // Use daily reports
      weeklyMetrics = this.calculateMetricsFromDailyReports(dailyReportsResult.rows);
    } else {
      // Fallback to raw glucose data
      weeklyMetrics = await this.calculateMetricsFromRawData(
        userId,
        weekStart,
        endDate.toISOString().split('T')[0]
      );
    }

    // Trend analysis
    const trendData = dailyReportsResult.rows.map((r: any) => ({
      date: r.report_date,
      value: parseFloat(r.avg_glucose),
    }));

    let trendAnalysis = null;
    if (trendData.length >= 3) {
      trendAnalysis = await analyzeTrend(trendData, 'average_glucose', 0);
    }

    // Compare with previous week
    const prevWeekStart = new Date(startDate);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);

    const prevWeekResult = await query(
      `SELECT AVG(avg_glucose) as avg_glucose, AVG(tir_70_180_pct) as tir
       FROM daily_reports
       WHERE user_id = $1
         AND report_date >= $2
         AND report_date < $3`,
      [userId, prevWeekStart.toISOString().split('T')[0], weekStart]
    );

    const vsPreviousWeek =
      prevWeekResult.rows.length > 0 && prevWeekResult.rows[0].avg_glucose
        ? {
            avgGlucoseChange: (
              weeklyMetrics.avgGlucose - parseFloat(prevWeekResult.rows[0].avg_glucose)
            ).toFixed(1),
            tirChange: (weeklyMetrics.avgTir - parseFloat(prevWeekResult.rows[0].tir || 0)).toFixed(1),
          }
        : null;

    // Find best and worst days
    let bestDay = null;
    let worstDay = null;
    if (dailyReportsResult.rows.length > 0) {
      const sorted = [...dailyReportsResult.rows].sort(
        (a, b) => parseFloat(a.avg_glucose) - parseFloat(b.avg_glucose)
      );
      bestDay = { date: sorted[0].report_date, avg: parseFloat(sorted[0].avg_glucose) };
      worstDay = {
        date: sorted[sorted.length - 1].report_date,
        avg: parseFloat(sorted[sorted.length - 1].avg_glucose),
      };
    }

    // Get pattern summary
    const patternsResult = await query(
      `SELECT p.pattern_type, COUNT(*) as occurrences
       FROM pattern_events pe
       JOIN glucose_patterns p ON pe.pattern_id = p.id
       WHERE pe.user_id = $1
         AND pe.event_timestamp >= $2
         AND pe.event_timestamp < $3
       GROUP BY p.pattern_type`,
      [userId, weekStart, endDate.toISOString().split('T')[0]]
    );

    const patternsSummary = patternsResult.rows.reduce((acc: any, row: any) => {
      acc[row.pattern_type] = parseInt(row.occurrences);
      return acc;
    }, {});

    // Generate summary and recommendations
    const summary = this.generateSummary(weeklyMetrics, trendAnalysis, vsPreviousWeek);
    const highlights = this.generateHighlights(weeklyMetrics, vsPreviousWeek);
    const recommendations = this.generateRecommendations(weeklyMetrics, trendAnalysis);

    return {
      user_id: userId,
      week_start_date: weekStart,
      week_end_date: endDate.toISOString().split('T')[0],
      avg_glucose_week: weeklyMetrics.avgGlucose,
      avg_tir_70_180_pct: weeklyMetrics.avgTir,
      avg_cv: weeklyMetrics.avgCv,
      estimated_a1c: (weeklyMetrics.avgGlucose + 46.7) / 28.7,
      trend_direction: trendAnalysis?.trendDirection || 'stable',
      trend_slope: trendAnalysis?.slope || 0,
      trend_r_squared: trendAnalysis?.rSquared || 0,
      vs_previous_week: vsPreviousWeek,
      best_day_date: bestDay?.date || null,
      best_day_avg: bestDay?.avg || null,
      worst_day_date: worstDay?.date || null,
      worst_day_avg: worstDay?.avg || null,
      patterns_summary: patternsSummary,
      summary,
      highlights,
      recommendations,
    };
  }

  async storeReport(report: WeeklyReport): Promise<void> {
    await query(
      `INSERT INTO weekly_reports (
        user_id, week_start_date, week_end_date, avg_glucose_week, avg_tir_70_180_pct, avg_cv,
        estimated_a1c, trend_direction, trend_slope, trend_r_squared, vs_previous_week,
        best_day_date, best_day_avg, worst_day_date, worst_day_avg, patterns_summary,
        summary, highlights, recommendations
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
      ON CONFLICT (user_id, week_start_date) DO UPDATE SET
        week_end_date = EXCLUDED.week_end_date,
        avg_glucose_week = EXCLUDED.avg_glucose_week,
        avg_tir_70_180_pct = EXCLUDED.avg_tir_70_180_pct,
        avg_cv = EXCLUDED.avg_cv,
        estimated_a1c = EXCLUDED.estimated_a1c,
        trend_direction = EXCLUDED.trend_direction,
        trend_slope = EXCLUDED.trend_slope,
        trend_r_squared = EXCLUDED.trend_r_squared,
        vs_previous_week = EXCLUDED.vs_previous_week,
        best_day_date = EXCLUDED.best_day_date,
        best_day_avg = EXCLUDED.best_day_avg,
        worst_day_date = EXCLUDED.worst_day_date,
        worst_day_avg = EXCLUDED.worst_day_avg,
        patterns_summary = EXCLUDED.patterns_summary,
        summary = EXCLUDED.summary,
        highlights = EXCLUDED.highlights,
        recommendations = EXCLUDED.recommendations,
        generated_at = NOW()`,
      [
        report.user_id,
        report.week_start_date,
        report.week_end_date,
        report.avg_glucose_week,
        report.avg_tir_70_180_pct,
        report.avg_cv,
        report.estimated_a1c,
        report.trend_direction,
        report.trend_slope,
        report.trend_r_squared,
        JSON.stringify(report.vs_previous_week),
        report.best_day_date,
        report.best_day_avg,
        report.worst_day_date,
        report.worst_day_avg,
        JSON.stringify(report.patterns_summary),
        report.summary,
        JSON.stringify(report.highlights),
        JSON.stringify(report.recommendations),
      ]
    );

    console.log(`  ✓ Weekly report stored for week starting ${report.week_start_date}`);
  }

  private calculateMetricsFromDailyReports(dailyReports: any[]): any {
    const avgGlucose =
      dailyReports.reduce((sum, r) => sum + parseFloat(r.avg_glucose), 0) / dailyReports.length;
    const avgTir =
      dailyReports.reduce((sum, r) => sum + parseFloat(r.tir_70_180_pct), 0) / dailyReports.length;
    const avgCv = dailyReports.reduce((sum, r) => sum + parseFloat(r.cv), 0) / dailyReports.length;

    return { avgGlucose, avgTir, avgCv };
  }

  private async calculateMetricsFromRawData(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
    const result = await query(
      `SELECT
        AVG(glucose) as avg_glucose,
        STDDEV(glucose) as std_dev,
        COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= $2
         AND timestamp < $3`,
      [userId, startDate, endDate]
    );

    const avgGlucose = parseFloat(result.rows[0].avg_glucose || 0);
    const stdDev = parseFloat(result.rows[0].std_dev || 0);
    const avgCv = avgGlucose > 0 ? (stdDev / avgGlucose) * 100 : 0;
    const avgTir = parseFloat(result.rows[0].tir || 0);

    return { avgGlucose, avgTir, avgCv };
  }

  private generateSummary(
    metrics: any,
    trendAnalysis: any,
    vsPreviousWeek: any
  ): string {
    const parts = [];

    parts.push(`This week: ${metrics.avgGlucose.toFixed(0)} mg/dL avg, ${metrics.avgTir.toFixed(0)}% TIR.`);

    if (trendAnalysis) {
      parts.push(`Trend: ${trendAnalysis.trendDirection}.`);
    }

    if (vsPreviousWeek) {
      const change = parseFloat(vsPreviousWeek.avgGlucoseChange);
      if (Math.abs(change) > 5) {
        parts.push(
          `${change > 0 ? '+' : ''}${change} mg/dL vs last week.`
        );
      }
    }

    return parts.join(' ');
  }

  private generateHighlights(metrics: any, vsPreviousWeek: any): any[] {
    const highlights = [];

    // Always report TIR with context
    if (metrics.avgTir >= 70) {
      highlights.push({ type: 'metric', text: `TIR: ${metrics.avgTir.toFixed(0)}% (meets 70% target)` });
    } else {
      highlights.push({ type: 'metric', text: `TIR: ${metrics.avgTir.toFixed(0)}% (below 70% target, gap: ${(70 - metrics.avgTir).toFixed(0)}%)` });
    }

    // Report week-over-week changes
    if (vsPreviousWeek) {
      const tirChange = parseFloat(vsPreviousWeek.tirChange);
      const avgGlucoseChange = parseFloat(vsPreviousWeek.avgGlucoseChange);

      if (Math.abs(tirChange) > 5) {
        highlights.push({
          type: tirChange > 0 ? 'info' : 'concern',
          text: `TIR ${tirChange > 0 ? 'increased' : 'decreased'} ${Math.abs(tirChange).toFixed(0)}% vs previous week`
        });
      }

      if (Math.abs(avgGlucoseChange) > 5) {
        highlights.push({
          type: 'metric',
          text: `Average glucose ${avgGlucoseChange > 0 ? '+' : ''}${avgGlucoseChange.toFixed(0)} mg/dL vs previous week`
        });
      }
    }

    return highlights;
  }

  private generateRecommendations(metrics: any, trendAnalysis: any): any[] {
    const recommendations = [];

    if (metrics.avgTir < 60) {
      recommendations.push({
        priority: 'high',
        text: `TIR at ${metrics.avgTir.toFixed(0)}% suggests reviewing meal timing, carb ratios, and basal rates. Target: 70%.`,
      });
    }

    if (metrics.avgCv > 40) {
      recommendations.push({
        priority: 'medium',
        text: `CV at ${metrics.avgCv.toFixed(0)}% indicates high variability (target: <36%). Review carb counting accuracy and insulin-to-carb ratios.`,
      });
    }

    if (trendAnalysis?.trendDirection === 'worsening') {
      const slope = trendAnalysis.slope ? `(${trendAnalysis.slope.toFixed(1)} mg/dL/day)` : '';
      recommendations.push({
        priority: 'high',
        text: `Glucose trending upward ${slope}. Investigate: recent medication changes, illness, stress, or basal inadequacy.`,
      });
    } else if (trendAnalysis?.trendDirection === 'improving') {
      const slope = trendAnalysis.slope ? `(${Math.abs(trendAnalysis.slope).toFixed(1)} mg/dL/day decrease)` : '';
      recommendations.push({
        priority: 'info',
        text: `Glucose trending downward ${slope}. Monitor for hypoglycemia risk if trend continues.`,
      });
    }

    return recommendations;
  }
}

/**
 * Monthly Report Generator
 * Generates comprehensive monthly reports on the 1st at 9am
 */
export class MonthlyReportGenerator {
  async generateReport(userId: string, monthStart: string): Promise<MonthlyReport> {
    console.log(`📊 Generating monthly report for ${userId} for month starting ${monthStart}`);

    const startDate = new Date(monthStart);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    // Get daily reports for the month
    const dailyReportsResult = await query(
      `SELECT * FROM daily_reports
       WHERE user_id = $1
         AND report_date >= $2
         AND report_date < $3
       ORDER BY report_date ASC`,
      [userId, monthStart, endDate.toISOString().split('T')[0]]
    );

    // Calculate monthly metrics
    const monthlyMetrics = this.calculateMonthlyMetrics(dailyReportsResult.rows, userId, monthStart, endDate.toISOString().split('T')[0]);

    // Get weekly breakdown
    const weeklyData = await this.getWeeklyBreakdown(userId, monthStart, endDate.toISOString().split('T')[0]);

    // Pattern evolution
    const patternChanges = await this.analyzePatternEvolution(userId, monthStart);

    // Compare with previous month
    const vsPreviousMonth = await this.compareWithPreviousMonth(userId, monthStart);

    // Compare with 3 months ago if data available
    const vs3MonthsAgo = await this.compareWith3MonthsAgo(userId, monthStart);

    // Long-term trend if enough data
    const longTermTrend = await this.calculateLongTermTrend(userId, monthStart);

    // Generate summaries
    const monthlyMetricsResolved = await monthlyMetrics;
    const summary = this.generateSummary(monthlyMetricsResolved);
    const highlights = this.generateHighlights(monthlyMetricsResolved, vsPreviousMonth);
    const recommendations = this.generateRecommendations(monthlyMetricsResolved);
    const providerSummary = this.generateProviderSummary(monthlyMetricsResolved);

    return {
      user_id: userId,
      month_start_date: monthStart,
      month_end_date: endDate.toISOString().split('T')[0],
      ...(await monthlyMetrics),
      weekly_data: weeklyData,
      patterns_summary: {}, // Populated by pattern analysis
      pattern_changes: patternChanges,
      vs_previous_month: vsPreviousMonth,
      vs_3_months_ago: vs3MonthsAgo,
      long_term_trend: longTermTrend,
      summary,
      highlights,
      recommendations,
      provider_summary: providerSummary,
    };
  }

  async storeReport(report: MonthlyReport): Promise<void> {
    await query(
      `INSERT INTO monthly_reports (
        user_id, month_start_date, month_end_date, avg_glucose_month, avg_tir_70_180_pct, avg_cv,
        estimated_a1c, a1c_confidence_interval_lower, a1c_confidence_interval_upper,
        total_hypoglycemia_episodes, total_hyperglycemia_episodes, total_meals_logged,
        total_exercise_sessions, total_insulin_doses, weekly_data, patterns_summary,
        pattern_changes, vs_previous_month, vs_3_months_ago, long_term_trend,
        summary, highlights, recommendations, provider_summary
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
      ON CONFLICT (user_id, month_start_date) DO UPDATE SET
        month_end_date = EXCLUDED.month_end_date,
        avg_glucose_month = EXCLUDED.avg_glucose_month,
        avg_tir_70_180_pct = EXCLUDED.avg_tir_70_180_pct,
        avg_cv = EXCLUDED.avg_cv,
        estimated_a1c = EXCLUDED.estimated_a1c,
        a1c_confidence_interval_lower = EXCLUDED.a1c_confidence_interval_lower,
        a1c_confidence_interval_upper = EXCLUDED.a1c_confidence_interval_upper,
        total_hypoglycemia_episodes = EXCLUDED.total_hypoglycemia_episodes,
        total_hyperglycemia_episodes = EXCLUDED.total_hyperglycemia_episodes,
        total_meals_logged = EXCLUDED.total_meals_logged,
        total_exercise_sessions = EXCLUDED.total_exercise_sessions,
        total_insulin_doses = EXCLUDED.total_insulin_doses,
        weekly_data = EXCLUDED.weekly_data,
        patterns_summary = EXCLUDED.patterns_summary,
        pattern_changes = EXCLUDED.pattern_changes,
        vs_previous_month = EXCLUDED.vs_previous_month,
        vs_3_months_ago = EXCLUDED.vs_3_months_ago,
        long_term_trend = EXCLUDED.long_term_trend,
        summary = EXCLUDED.summary,
        highlights = EXCLUDED.highlights,
        recommendations = EXCLUDED.recommendations,
        provider_summary = EXCLUDED.provider_summary,
        generated_at = NOW()`,
      [
        report.user_id,
        report.month_start_date,
        report.month_end_date,
        report.avg_glucose_month,
        report.avg_tir_70_180_pct,
        report.avg_cv,
        report.estimated_a1c,
        report.a1c_confidence_interval_lower,
        report.a1c_confidence_interval_upper,
        report.total_hypoglycemia_episodes,
        report.total_hyperglycemia_episodes,
        report.total_meals_logged,
        report.total_exercise_sessions,
        report.total_insulin_doses,
        JSON.stringify(report.weekly_data),
        JSON.stringify(report.patterns_summary),
        JSON.stringify(report.pattern_changes),
        JSON.stringify(report.vs_previous_month),
        JSON.stringify(report.vs_3_months_ago),
        JSON.stringify(report.long_term_trend),
        report.summary,
        JSON.stringify(report.highlights),
        JSON.stringify(report.recommendations),
        report.provider_summary,
      ]
    );

    console.log(`  ✓ Monthly report stored for month starting ${report.month_start_date}`);
  }

  private async calculateMonthlyMetrics(dailyReports: any[], userId: string, startDate: string, endDate: string): Promise<any> {
    if (dailyReports.length >= 20) {
      // Use daily reports
      const avgGlucose =
        dailyReports.reduce((sum, r) => sum + parseFloat(r.avg_glucose), 0) / dailyReports.length;
      const avgTir =
        dailyReports.reduce((sum, r) => sum + parseFloat(r.tir_70_180_pct), 0) / dailyReports.length;
      const avgCv =
        dailyReports.reduce((sum, r) => sum + parseFloat(r.cv), 0) / dailyReports.length;
      const estimatedA1c = (avgGlucose + 46.7) / 28.7;
      const stdDevA1c = avgCv * 0.01; // Rough estimate

      const totalHypo = dailyReports.reduce((sum, r) => sum + (r.hypoglycemia_episodes || 0), 0);
      const totalHyper = dailyReports.reduce((sum, r) => sum + (r.hyperglycemia_episodes || 0), 0);
      const totalMeals = dailyReports.reduce((sum, r) => sum + (r.meals_logged || 0), 0);
      const totalExercise = dailyReports.reduce((sum, r) => sum + (r.exercise_sessions || 0), 0);

      return {
        avg_glucose_month: avgGlucose,
        avg_tir_70_180_pct: avgTir,
        avg_cv: avgCv,
        estimated_a1c: estimatedA1c,
        a1c_confidence_interval_lower: estimatedA1c - 1.96 * stdDevA1c,
        a1c_confidence_interval_upper: estimatedA1c + 1.96 * stdDevA1c,
        total_hypoglycemia_episodes: totalHypo,
        total_hyperglycemia_episodes: totalHyper,
        total_meals_logged: totalMeals,
        total_exercise_sessions: totalExercise,
        total_insulin_doses: 0, // Need to query separately
      };
    } else {
      // Fallback to raw data
      const result = await query(
        `SELECT
          AVG(glucose) as avg_glucose,
          STDDEV(glucose) as std_dev,
          COUNT(*) FILTER (WHERE glucose >= 70 AND glucose <= 180) * 100.0 / COUNT(*) as tir
         FROM glucose_readings
         WHERE user_id = $1
           AND timestamp >= $2
           AND timestamp < $3`,
        [userId, startDate, endDate]
      );

      const avgGlucose = parseFloat(result.rows[0].avg_glucose || 0);
      const stdDev = parseFloat(result.rows[0].std_dev || 0);
      const cv = avgGlucose > 0 ? (stdDev / avgGlucose) * 100 : 0;
      const estimatedA1c = (avgGlucose + 46.7) / 28.7;
      const stdDevA1c = cv * 0.01;

      return {
        avg_glucose_month: avgGlucose,
        avg_tir_70_180_pct: parseFloat(result.rows[0].tir || 0),
        avg_cv: cv,
        estimated_a1c: estimatedA1c,
        a1c_confidence_interval_lower: estimatedA1c - 1.96 * stdDevA1c,
        a1c_confidence_interval_upper: estimatedA1c + 1.96 * stdDevA1c,
        total_hypoglycemia_episodes: 0,
        total_hyperglycemia_episodes: 0,
        total_meals_logged: 0,
        total_exercise_sessions: 0,
        total_insulin_doses: 0,
      };
    }
  }

  private async getWeeklyBreakdown(userId: string, startDate: string, endDate: string): Promise<any[]> {
    const weeklyReports = await query(
      `SELECT * FROM weekly_reports
       WHERE user_id = $1
         AND week_start_date >= $2
         AND week_start_date < $3
       ORDER BY week_start_date ASC`,
      [userId, startDate, endDate]
    );

    return weeklyReports.rows.map((r: any) => ({
      weekStart: r.week_start_date,
      avgGlucose: parseFloat(r.avg_glucose_week),
      tir: parseFloat(r.avg_tir_70_180_pct),
      trend: r.trend_direction,
    }));
  }

  private async analyzePatternEvolution(userId: string, monthStart: string): Promise<any> {
    // Get patterns from start and end of month
    const startDate = new Date(monthStart);
    const midDate = new Date(startDate);
    midDate.setDate(midDate.getDate() + 15);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const earlyPatterns = await query(
      `SELECT pattern_id, AVG(confidence) as avg_confidence
       FROM pattern_events
       WHERE user_id = $1
         AND event_timestamp >= $2
         AND event_timestamp < $3
       GROUP BY pattern_id`,
      [userId, monthStart, midDate.toISOString()]
    );

    const latePatterns = await query(
      `SELECT pattern_id, AVG(confidence) as avg_confidence
       FROM pattern_events
       WHERE user_id = $1
         AND event_timestamp >= $2
         AND event_timestamp < $3
       GROUP BY pattern_id`,
      [userId, midDate.toISOString(), endDate.toISOString().split('T')[0]]
    );

    // Analyze changes
    const strengthened = [];
    const weakened = [];
    const newPatterns = [];

    // Simplified analysis
    return { strengthened, weakened, new: newPatterns };
  }

  private async compareWithPreviousMonth(userId: string, monthStart: string): Promise<any> {
    const startDate = new Date(monthStart);
    const prevMonthStart = new Date(startDate);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);

    const prevReport = await query(
      `SELECT * FROM monthly_reports
       WHERE user_id = $1
         AND month_start_date = $2`,
      [userId, prevMonthStart.toISOString().split('T')[0]]
    );

    if (prevReport.rows.length === 0) return null;

    const prev = prevReport.rows[0];
    return {
      avgGlucoseChange: null, // Calculate when current month data available
      tirChange: null,
      a1cChange: null,
    };
  }

  private async compareWith3MonthsAgo(userId: string, monthStart: string): Promise<any | null> {
    const startDate = new Date(monthStart);
    const threeMonthsAgo = new Date(startDate);
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const oldReport = await query(
      `SELECT * FROM monthly_reports
       WHERE user_id = $1
         AND month_start_date = $2`,
      [userId, threeMonthsAgo.toISOString().split('T')[0]]
    );

    if (oldReport.rows.length === 0) return null;

    return {
      avgGlucoseChange: null,
      tirChange: null,
    };
  }

  private async calculateLongTermTrend(userId: string, monthStart: string): Promise<any | null> {
    // Get last 3 months of monthly reports
    const reports = await query(
      `SELECT * FROM monthly_reports
       WHERE user_id = $1
         AND month_start_date < $2
       ORDER BY month_start_date DESC
       LIMIT 3`,
      [userId, monthStart]
    );

    if (reports.rows.length < 2) return null;

    const data = reports.rows.reverse().map((r: any, i: number) => ({
      date: r.month_start_date,
      value: parseFloat(r.avg_glucose_month),
    }));

    const trendAnalysis = await analyzeTrend(data, 'average_glucose', 0);

    return {
      direction: trendAnalysis.trendDirection,
      slope: trendAnalysis.slope,
    };
  }

  private generateSummary(metrics: any): string {
    return `Monthly average: ${metrics.avg_glucose_month.toFixed(0)} mg/dL, ${metrics.avg_tir_70_180_pct.toFixed(0)}% TIR. Estimated A1C: ${metrics.estimated_a1c.toFixed(1)}%.`;
  }

  private generateHighlights(metrics: any, vsPreviousMonth: any): any[] {
    const highlights = [];

    // TIR with target comparison
    const tirGap = metrics.avg_tir_70_180_pct < 70 ? `, ${(70 - metrics.avg_tir_70_180_pct).toFixed(0)}% below target` : '';
    highlights.push({
      type: metrics.avg_tir_70_180_pct >= 70 ? 'metric' : 'concern',
      text: `Time in range: ${metrics.avg_tir_70_180_pct.toFixed(0)}%${tirGap}`,
    });

    // A1C with confidence interval
    highlights.push({
      type: 'metric',
      text: `Estimated A1C: ${metrics.estimated_a1c.toFixed(1)}% (95% CI: ${metrics.a1c_confidence_interval_lower.toFixed(1)}-${metrics.a1c_confidence_interval_upper.toFixed(1)}%)`,
    });

    // CV analysis
    highlights.push({
      type: metrics.avg_cv < 36 ? 'metric' : 'concern',
      text: `Glucose variability: CV ${metrics.avg_cv.toFixed(0)}% (target: <36%)`,
    });

    // Hypoglycemia burden
    if (metrics.total_hypoglycemia_episodes > 0) {
      const rate = (metrics.total_hypoglycemia_episodes / 30).toFixed(1);
      highlights.push({
        type: metrics.total_hypoglycemia_episodes > 4 ? 'warning' : 'info',
        text: `${metrics.total_hypoglycemia_episodes} hypoglycemic episodes (${rate} per day average)`,
      });
    }

    // Month-over-month comparison if available
    if (vsPreviousMonth?.avgGlucoseChange) {
      const change = parseFloat(vsPreviousMonth.avgGlucoseChange);
      if (Math.abs(change) > 5) {
        highlights.push({
          type: 'comparison',
          text: `Average glucose ${change > 0 ? '+' : ''}${change.toFixed(0)} mg/dL vs previous month`,
        });
      }
    }

    return highlights;
  }

  private generateRecommendations(metrics: any): any[] {
    const recommendations = [];

    if (metrics.avg_tir_70_180_pct < 70) {
      const gap = (70 - metrics.avg_tir_70_180_pct).toFixed(0);
      recommendations.push({
        priority: 'high',
        text: `TIR ${gap}% below target. Analysis suggests reviewing: (1) basal rates for overnight stability, (2) insulin-to-carb ratios for meal coverage, (3) correction factors for high glucose.`,
      });
    }

    if (metrics.total_hypoglycemia_episodes > 4) {
      const rate = (metrics.total_hypoglycemia_episodes / 30).toFixed(1);
      recommendations.push({
        priority: 'high',
        text: `Hypoglycemia rate: ${rate} episodes/day. Investigate: insulin stacking, insufficient carb intake, exercise timing, or basal over-insulinization. Consider 14-day pattern review.`,
      });
    }

    if (metrics.avg_cv > 40) {
      recommendations.push({
        priority: 'medium',
        text: `High glucose variability (CV ${metrics.avg_cv.toFixed(0)}%) indicates inconsistent control. Review: meal timing regularity, carb counting accuracy, stress patterns, and basal adequacy across different times of day.`,
      });
    }

    // Always provide data logging feedback
    const loggingRate = (metrics.total_meals_logged / 30).toFixed(1);
    if (metrics.total_meals_logged < 60) { // Less than 2 meals/day
      recommendations.push({
        priority: 'low',
        text: `Meal logging: ${loggingRate} entries/day. Increased logging enables more accurate pattern detection and correlation analysis.`,
      });
    }

    return recommendations;
  }

  private generateProviderSummary(metrics: any): string {
    return `Patient Summary: Avg glucose ${metrics.avg_glucose_month.toFixed(0)} mg/dL, TIR ${metrics.avg_tir_70_180_pct.toFixed(0)}%, CV ${metrics.avg_cv.toFixed(0)}%. Est A1C ${metrics.estimated_a1c.toFixed(1)}% (CI: ${metrics.a1c_confidence_interval_lower.toFixed(1)}-${metrics.a1c_confidence_interval_upper.toFixed(1)}%). ${metrics.total_hypoglycemia_episodes} hypoglycemic episodes. ${metrics.total_meals_logged} meals logged, ${metrics.total_exercise_sessions} exercise sessions.`;
  }
}
