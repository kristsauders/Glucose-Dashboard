/**
 * Reporting Service
 *
 * Schedules and generates multi-timescale reports:
 * - Daily reports: 8am daily
 * - Weekly reports: Monday 8am
 * - Monthly reports: 1st of month, 9am
 */

import { query } from '../config/database.js';
import {
  DailyReportGenerator,
  WeeklyReportGenerator,
  MonthlyReportGenerator,
} from './report-generators.js';

class ReportingService {
  private dailyGenerator: DailyReportGenerator;
  private weeklyGenerator: WeeklyReportGenerator;
  private monthlyGenerator: MonthlyReportGenerator;

  private dailyInterval: NodeJS.Timeout | null = null;
  private weeklyInterval: NodeJS.Timeout | null = null;
  private monthlyInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.dailyGenerator = new DailyReportGenerator();
    this.weeklyGenerator = new WeeklyReportGenerator();
    this.monthlyGenerator = new MonthlyReportGenerator();
  }

  /**
   * Start the reporting service
   */
  start(): void {
    console.log('📊 Starting reporting service...');

    // Schedule daily reports at 8am
    this.scheduleDailyReports();

    // Schedule weekly reports at Monday 8am
    this.scheduleWeeklyReports();

    // Schedule monthly reports at 1st of month, 9am
    this.scheduleMonthlyReports();

    console.log('  ✓ Reporting service started');
  }

  /**
   * Stop the reporting service
   */
  stop(): void {
    console.log('  ⏳ Stopping reporting service...');

    if (this.dailyInterval) {
      clearInterval(this.dailyInterval);
      this.dailyInterval = null;
    }

    if (this.weeklyInterval) {
      clearInterval(this.weeklyInterval);
      this.weeklyInterval = null;
    }

    if (this.monthlyInterval) {
      clearInterval(this.monthlyInterval);
      this.monthlyInterval = null;
    }

    console.log('  ✓ Reporting service stopped');
  }

  /**
   * Schedule daily reports at 8am
   */
  private scheduleDailyReports(): void {
    const timeUntil8am = this.calculateTimeUntil(8, 0);

    console.log(`  📅 Daily reports scheduled in ${Math.round(timeUntil8am / 1000 / 60)} minutes`);

    // Run first time after delay
    setTimeout(() => {
      this.runDailyReports();

      // Then run every 24 hours
      this.dailyInterval = setInterval(
        () => this.runDailyReports(),
        24 * 60 * 60 * 1000
      );
    }, timeUntil8am);
  }

  /**
   * Schedule weekly reports at Monday 8am
   */
  private scheduleWeeklyReports(): void {
    const timeUntilMondayAt8am = this.calculateTimeUntilMonday(8, 0);

    console.log(`  📅 Weekly reports scheduled in ${Math.round(timeUntilMondayAt8am / 1000 / 60 / 60)} hours`);

    // Run first time after delay
    setTimeout(() => {
      this.runWeeklyReports();

      // Then run every 7 days
      this.weeklyInterval = setInterval(
        () => this.runWeeklyReports(),
        7 * 24 * 60 * 60 * 1000
      );
    }, timeUntilMondayAt8am);
  }

  /**
   * Schedule monthly reports at 1st of month, 9am
   */
  private scheduleMonthlyReports(): void {
    const timeUntilFirstAt9am = this.calculateTimeUntilFirstOfMonth(9, 0);

    console.log(`  📅 Monthly reports scheduled in ${Math.round(timeUntilFirstAt9am / 1000 / 60 / 60 / 24)} days`);

    // Run first time after delay
    setTimeout(() => {
      this.runMonthlyReports();

      // Then check daily if it's the 1st of the month
      this.monthlyInterval = setInterval(() => {
        const now = new Date();
        if (now.getDate() === 1 && now.getHours() === 9) {
          this.runMonthlyReports();
        }
      }, 60 * 60 * 1000); // Check every hour
    }, timeUntilFirstAt9am);
  }

  /**
   * Run daily reports for all users
   */
  private async runDailyReports(): Promise<void> {
    try {
      console.log('\n📊 Running daily reports...');

      // Get all users with timezone
      const usersResult = await query('SELECT id, email, timezone FROM users');
      const users = usersResult.rows;

      console.log(`  Processing ${users.length} users...`);

      // Generate yesterday's report (reports run in the morning for previous day)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const reportDate = yesterday.toISOString().split('T')[0];

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          const userTimezone = user.timezone || 'America/New_York';
          const report = await this.dailyGenerator.generateReport(user.id, reportDate, userTimezone);
          await this.dailyGenerator.storeReport(report);

          // Update monitoring state
          await query(
            `INSERT INTO glucose_monitoring_state (user_id, last_daily_report_at)
             VALUES ($1, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET last_daily_report_at = NOW(), updated_at = NOW()`,
            [user.id]
          );

          successCount++;
        } catch (error) {
          console.error(`  ❌ Error generating daily report for ${user.email}:`, error);
          errorCount++;
        }
      }

      console.log(`  ✅ Daily reports complete: ${successCount} success, ${errorCount} errors\n`);
    } catch (error) {
      console.error('❌ Failed to run daily reports:', error);
    }
  }

  /**
   * Run weekly reports for all users
   */
  private async runWeeklyReports(): Promise<void> {
    try {
      console.log('\n📊 Running weekly reports...');

      // Get all users
      const usersResult = await query('SELECT id, email FROM users');
      const users = usersResult.rows;

      console.log(`  Processing ${users.length} users...`);

      // Calculate last week's start date (Monday of last week)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 0 = Sunday
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
      const weekStart = lastMonday.toISOString().split('T')[0];

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          const report = await this.weeklyGenerator.generateReport(user.id, weekStart);
          await this.weeklyGenerator.storeReport(report);

          // Update monitoring state
          await query(
            `INSERT INTO glucose_monitoring_state (user_id, last_weekly_report_at)
             VALUES ($1, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET last_weekly_report_at = NOW(), updated_at = NOW()`,
            [user.id]
          );

          successCount++;
        } catch (error) {
          console.error(`  ❌ Error generating weekly report for ${user.email}:`, error);
          errorCount++;
        }
      }

      console.log(`  ✅ Weekly reports complete: ${successCount} success, ${errorCount} errors\n`);
    } catch (error) {
      console.error('❌ Failed to run weekly reports:', error);
    }
  }

  /**
   * Run monthly reports for all users
   */
  private async runMonthlyReports(): Promise<void> {
    try {
      console.log('\n📊 Running monthly reports...');

      // Get all users
      const usersResult = await query('SELECT id, email FROM users');
      const users = usersResult.rows;

      console.log(`  Processing ${users.length} users...`);

      // Calculate last month's start date (1st of last month)
      const today = new Date();
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const monthStart = lastMonthStart.toISOString().split('T')[0];

      let successCount = 0;
      let errorCount = 0;

      for (const user of users) {
        try {
          const report = await this.monthlyGenerator.generateReport(user.id, monthStart);
          await this.monthlyGenerator.storeReport(report);

          // Update monitoring state
          await query(
            `INSERT INTO glucose_monitoring_state (user_id, last_monthly_report_at)
             VALUES ($1, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET last_monthly_report_at = NOW(), updated_at = NOW()`,
            [user.id]
          );

          successCount++;
        } catch (error) {
          console.error(`  ❌ Error generating monthly report for ${user.email}:`, error);
          errorCount++;
        }
      }

      console.log(`  ✅ Monthly reports complete: ${successCount} success, ${errorCount} errors\n`);
    } catch (error) {
      console.error('❌ Failed to run monthly reports:', error);
    }
  }

  /**
   * Calculate milliseconds until target time today (or tomorrow if already passed)
   */
  private calculateTimeUntil(hour: number, minute: number): number {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );

    // If target time has passed today, schedule for tomorrow
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1);
    }

    return target.getTime() - now.getTime();
  }

  /**
   * Calculate milliseconds until next Monday at target time
   */
  private calculateTimeUntilMonday(hour: number, minute: number): number {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0
    );

    // Calculate days until Monday (1 = Monday, 0 = Sunday)
    const currentDay = now.getDay();
    const daysUntilMonday = currentDay === 0 ? 1 : currentDay === 1 ? 0 : 8 - currentDay;

    target.setDate(now.getDate() + daysUntilMonday);

    // If it's Monday but the time has passed, schedule for next Monday
    if (currentDay === 1 && target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 7);
    }

    return target.getTime() - now.getTime();
  }

  /**
   * Calculate milliseconds until 1st of next month at target time
   */
  private calculateTimeUntilFirstOfMonth(hour: number, minute: number): number {
    const now = new Date();
    const target = new Date(
      now.getFullYear(),
      now.getMonth(),
      1,
      hour,
      minute,
      0,
      0
    );

    // If it's past the 1st or past the target time on the 1st, go to next month
    if (now.getDate() > 1 || (now.getDate() === 1 && now.getTime() >= target.getTime())) {
      target.setMonth(target.getMonth() + 1);
    }

    return target.getTime() - now.getTime();
  }

  /**
   * Manually trigger daily report generation for a specific user
   */
  async generateDailyReportNow(userId: string, date?: string): Promise<void> {
    const reportDate = date || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`📊 Manually generating daily report for ${userId} on ${reportDate}`);

    // Get user's timezone
    const userResult = await query('SELECT timezone FROM users WHERE id = $1', [userId]);
    const userTimezone = userResult.rows[0]?.timezone || 'America/New_York';

    const report = await this.dailyGenerator.generateReport(userId, reportDate, userTimezone);
    await this.dailyGenerator.storeReport(report);

    console.log('  ✓ Daily report generated');
  }

  /**
   * Manually trigger weekly report generation for a specific user
   */
  async generateWeeklyReportNow(userId: string, weekStart?: string): Promise<void> {
    // Calculate last Monday if not provided
    const start = weekStart || (() => {
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToLastMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const lastMonday = new Date(today);
      lastMonday.setDate(today.getDate() - daysToLastMonday - 7);
      return lastMonday.toISOString().split('T')[0];
    })();

    console.log(`📊 Manually generating weekly report for ${userId} starting ${start}`);

    const report = await this.weeklyGenerator.generateReport(userId, start);
    await this.weeklyGenerator.storeReport(report);

    console.log('  ✓ Weekly report generated');
  }

  /**
   * Manually trigger monthly report generation for a specific user
   */
  async generateMonthlyReportNow(userId: string, monthStart?: string): Promise<void> {
    // Calculate 1st of last month if not provided
    const start = monthStart || (() => {
      const today = new Date();
      const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      return lastMonthStart.toISOString().split('T')[0];
    })();

    console.log(`📊 Manually generating monthly report for ${userId} starting ${start}`);

    const report = await this.monthlyGenerator.generateReport(userId, start);
    await this.monthlyGenerator.storeReport(report);

    console.log('  ✓ Monthly report generated');
  }
}

// Export singleton instance
export const reportingService = new ReportingService();
