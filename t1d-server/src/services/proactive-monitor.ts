import { query } from '../config/database.js';
import { createAgentGraph } from '../agent/graph.js';
import { HumanMessage } from '@langchain/core/messages';

/**
 * ProactiveMonitor service
 * Monitors glucose data and proactively reaches out with insights, questions, and suggestions
 */
export class ProactiveMonitor {
  private agent: any;
  private isRunning: boolean = false;
  private checkInterval: number = 30 * 60 * 1000; // 30 minutes
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.agent = createAgentGraph();
  }

  /**
   * Start the proactive monitoring service
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️  ProactiveMonitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('✓ ProactiveMonitor started');
    console.log(`  Checking every ${this.checkInterval / 60000} minutes`);

    // Run initial check after 5 minutes
    setTimeout(() => this.checkAllUsers(), 5 * 60 * 1000);

    // Then run on interval
    this.intervalId = setInterval(() => this.checkAllUsers(), this.checkInterval);
  }

  /**
   * Stop the proactive monitoring service
   */
  stop() {
    if (!this.isRunning) {
      return;
    }

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.isRunning = false;
    console.log('✓ ProactiveMonitor stopped');
  }

  /**
   * Check all users for proactive outreach opportunities
   */
  private async checkAllUsers() {
    try {
      console.log(`[${new Date().toISOString()}] Running proactive check...`);

      // Get all users with LibreView OR Discord connected
      const usersResult = await query(
        `SELECT id, email, diagnosis_type, diagnosis_date, timezone, discord_user_id
         FROM users
         WHERE (libreview_email IS NOT NULL AND libreview_password_encrypted IS NOT NULL)
            OR discord_user_id IS NOT NULL`,
        []
      );

      console.log(`  Found ${usersResult.rows.length} users to check`);

      for (const user of usersResult.rows) {
        try {
          await this.checkUser(user);
        } catch (error) {
          console.error(`  Error checking user ${user.email}:`, error);
        }
      }

      console.log('✓ Proactive check completed');
    } catch (error) {
      console.error('ProactiveMonitor error:', error);
    }
  }

  /**
   * Check a specific user for proactive outreach
   */
  private async checkUser(user: any) {
    const userId = user.id;

    // Check if we should skip this user (cooldown period)
    const shouldSkip = await this.shouldSkipUser(userId);
    if (shouldSkip) {
      return;
    }

    // Check if user has recent glucose data
    const hasRecentData = await this.hasRecentGlucoseData(userId);
    if (!hasRecentData) {
      console.log(`  ${user.email}: No recent glucose data`);
      return;
    }

    // Update monitoring state
    await query(
      `INSERT INTO glucose_monitoring_state (user_id, last_check_timestamp)
       VALUES ($1, NOW())
       ON CONFLICT (user_id) DO UPDATE
       SET last_check_timestamp = NOW(),
           updated_at = NOW()`,
      [userId]
    );

    // Use the agent to analyze and decide on outreach
    await this.runProactiveAnalysis(user);
  }

  /**
   * Check if we should skip this user (cooldown)
   */
  private async shouldSkipUser(userId: string): Promise<boolean> {
    const stateResult = await query(
      `SELECT last_message_sent_at, last_daily_summary_at
       FROM glucose_monitoring_state
       WHERE user_id = $1`,
      [userId]
    );

    if (stateResult.rows.length === 0) {
      return false; // New user, don't skip
    }

    const state = stateResult.rows[0];
    const now = new Date();

    // Don't send more than 1 message per 4 hours (except daily summaries)
    if (state.last_message_sent_at) {
      const hoursSinceLastMessage =
        (now.getTime() - new Date(state.last_message_sent_at).getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastMessage < 4) {
        return true; // Skip - too soon since last message
      }
    }

    return false;
  }

  /**
   * Check if user has recent glucose data (within last 2 hours)
   */
  private async hasRecentGlucoseData(userId: string): Promise<boolean> {
    const result = await query(
      `SELECT COUNT(*) as count
       FROM glucose_readings
       WHERE user_id = $1
         AND timestamp >= NOW() - INTERVAL '2 hours'`,
      [userId]
    );

    return parseInt(result.rows[0].count) > 0;
  }

  /**
   * Run proactive analysis using the agent
   */
  private async runProactiveAnalysis(user: any) {
    try {
      console.log(`  Analyzing ${user.email}...`);

      const prompt = `You are analyzing glucose data for proactive outreach. Your goal is to identify patterns, trends, or insights worth sharing with the user.

**Guidelines:**
- Check for patterns worth discussing (NOT critical alerts - Libre handles those)
- Look for insights, trends, or questions that could help the user
- Use the tools to analyze recent data and check conditions
- If you find something worth sharing, use send_proactive_message
- Check recent messages first to avoid spam
- Be helpful and conversational, not alarmist

**Your task:**
1. Use get_user_context to understand the user
2. Use analyze_live_trend to see recent patterns
3. Use check_alert_conditions to identify discussion points
4. Use get_recent_sage_messages to avoid duplicates (check last 24 hours)
5. If you find something worth sharing, use send_proactive_message

If nothing significant is happening, it's okay to not send a message.`;

      const stream = await this.agent.stream({
        messages: [new HumanMessage(prompt)],
        userId: user.id,
        userContext: {
          email: user.email,
          diagnosisType: user.diagnosis_type || undefined,
          diagnosisDate: user.diagnosis_date || undefined,
          timezone: user.timezone || undefined,
        },
      });

      // Process the stream (we don't need the response, just let it run)
      let messageCount = 0;
      for await (const chunk of stream) {
        // Count messages sent (look for tool calls to send_proactive_message)
        const nodeUpdate = chunk.agent || chunk.tools;
        if (nodeUpdate?.messages) {
          const lastMessage = nodeUpdate.messages[nodeUpdate.messages.length - 1];
          if (lastMessage.tool_calls) {
            const sentMessage = lastMessage.tool_calls.find(
              (tc: any) => tc.name === 'send_proactive_message'
            );
            if (sentMessage) {
              messageCount++;
            }
          }
        }
      }

      if (messageCount > 0) {
        console.log(`  ✓ Sent ${messageCount} proactive message(s) to ${user.email}`);
      } else {
        console.log(`  ${user.email}: No outreach needed`);
      }
    } catch (error) {
      console.error(`  Error analyzing ${user.email}:`, error);
    }
  }

  /**
   * Check if it's time for daily summary (8am in user's timezone)
   */
  private shouldSendDailySummary(user: any, lastSummaryAt: Date | null): boolean {
    const now = new Date();
    const userHour = now.getHours(); // TODO: Adjust for user timezone

    // Send at 8am
    if (userHour !== 8) {
      return false;
    }

    // Check if we already sent today
    if (lastSummaryAt) {
      const hoursSince = (now.getTime() - lastSummaryAt.getTime()) / (1000 * 60 * 60);
      if (hoursSince < 20) { // At least 20 hours since last summary
        return false;
      }
    }

    return true;
  }
}

// Singleton instance
export const proactiveMonitor = new ProactiveMonitor();
