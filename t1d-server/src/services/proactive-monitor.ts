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
  private checkInterval: number = 10 * 60 * 1000; // 10 minutes (reduced for testing)
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

    // Check sleep hours (10pm-7am) - skip unless it's goodnight/good morning time
    const shouldSkipForSleep = await this.shouldSkipDuringSleep(userId);
    if (shouldSkipForSleep) {
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

    // Don't send more than 1 message per 1.5 hours (reduced for testing)
    if (state.last_message_sent_at) {
      const hoursSinceLastMessage =
        (now.getTime() - new Date(state.last_message_sent_at).getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastMessage < 1.5) {
        return true; // Skip - too soon since last message
      }
    }

    return false;
  }

  /**
   * Check if we should skip during sleep hours (10pm-7am)
   * Allow goodnight message around 10pm and good morning around 7am
   */
  private async shouldSkipDuringSleep(userId: string): Promise<boolean> {
    const now = new Date();
    const hour = now.getHours(); // TODO: Adjust for user timezone

    // Sleep hours: 10pm (22) to 7am (7)
    const isSleepTime = hour >= 22 || hour < 7;

    if (!isSleepTime) {
      return false; // Not sleep time, don't skip
    }

    // During sleep time, only allow messages at specific times
    const isGoodnightTime = hour === 22; // 10pm hour
    const isGoodMorningTime = hour === 6; // 6am hour (sends before 7am wake)

    if (!isGoodnightTime && !isGoodMorningTime) {
      return true; // Sleep time but not goodnight/good morning - skip
    }

    // Check if we already sent a goodnight or good morning today
    const stateResult = await query(
      `SELECT state
       FROM glucose_monitoring_state
       WHERE user_id = $1`,
      [userId]
    );

    if (stateResult.rows.length === 0) {
      return false; // New user, allow message
    }

    const state = stateResult.rows[0].state || {};
    const today = now.toISOString().split('T')[0];

    if (isGoodnightTime && state.lastGoodnightDate === today) {
      return true; // Already sent goodnight today
    }

    if (isGoodMorningTime && state.lastGoodMorningDate === today) {
      return true; // Already sent good morning today
    }

    // Update state to mark that we're sending this message
    const updatedState = { ...state };
    if (isGoodnightTime) {
      updatedState.lastGoodnightDate = today;
    }
    if (isGoodMorningTime) {
      updatedState.lastGoodMorningDate = today;
    }

    await query(
      `INSERT INTO glucose_monitoring_state (user_id, state)
       VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE
       SET state = $2, updated_at = NOW()`,
      [userId, JSON.stringify(updatedState)]
    );

    return false; // Allow goodnight/good morning message
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
   * Run proactive analysis using the agent - TWO PHASE APPROACH
   * Phase 1: Analyze and generate message
   * Phase 2: Decide whether to send
   */
  private async runProactiveAnalysis(user: any) {
    try {
      console.log(`  Analyzing ${user.email}...`);

      // PHASE 1: Analyze data and generate a message
      const now = new Date();
      const hour = now.getHours();

      // Time-based context for more relevant insights
      let timeContext = "";
      if (hour === 6) {
        timeContext = "It's early morning (6am). Write a good morning message reviewing overnight glucose and preparing for the day.";
      } else if (hour >= 7 && hour < 10) {
        timeContext = "It's morning (7-10am). Consider breakfast patterns if relevant - post-meal spikes typically happen 1-2 hours after eating.";
      } else if (hour >= 10 && hour < 12) {
        timeContext = "It's late morning (10am-12pm). Good time to review breakfast impact and morning patterns.";
      } else if (hour >= 12 && hour < 14) {
        timeContext = "It's lunch time (12-2pm). Consider recent patterns and how lunch might affect glucose.";
      } else if (hour >= 14 && hour < 17) {
        timeContext = "It's afternoon (2-5pm). Good time to review lunch impact and afternoon patterns.";
      } else if (hour >= 17 && hour < 20) {
        timeContext = "It's evening (5-8pm). Consider dinner patterns and end-of-day trends.";
      } else if (hour >= 20 && hour < 22) {
        timeContext = "It's late evening (8-10pm). Review dinner impact and prepare for overnight stability.";
      } else if (hour === 22) {
        timeContext = "It's bedtime (10pm). Write a goodnight message reviewing today's glucose and overnight preparation.";
      }

      const analysisPrompt = `Analyze my glucose data and write a proactive message. ${timeContext}

Use tools to analyze: get_user_context, analyze_live_trend, check_alert_conditions, get_recent_sage_messages

**IMPORTANT - Message Format:**
Start with a brief, notification-friendly summary line (1-2 sentences, no emojis or headers). This shows up on phone notifications.

Example openings:
- "Your glucose is at 102 and stable. Noticed 6 readings below 70 today though."
- "Good morning! Overnight glucose was steady averaging 98. Ready for the day?"
- "Goodnight! Today your glucose averaged 105 with good stability."

After the opening, use formatting, emojis, sections as you like.

Write a complete, thoughtful message with:
- Current observations (glucose level, trends, patterns)
- Any spikes, drops, or interesting patterns
- Questions to understand habits better
- Supportive insights about glucose management

Be creative, conversational, and helpful. Include specific numbers from the data.`;

      const analysisStream = await this.agent.stream({
        messages: [new HumanMessage(analysisPrompt)],
        userId: user.id,
        userContext: {
          email: user.email,
          diagnosisType: user.diagnosis_type || undefined,
          diagnosisDate: user.diagnosis_date || undefined,
          timezone: user.timezone || undefined,
        },
      });

      // Collect the generated message
      let generatedMessage = '';
      for await (const chunk of analysisStream) {
        const nodeUpdate = chunk.agent || chunk.tools;
        if (nodeUpdate?.messages) {
          const lastMessage = nodeUpdate.messages[nodeUpdate.messages.length - 1];
          if (lastMessage.content && typeof lastMessage.content === 'string') {
            generatedMessage = lastMessage.content;
          }
        }
      }

      console.log(`  Generated message (${generatedMessage.length} chars)`);

      if (!generatedMessage || generatedMessage.length < 50) {
        console.log(`  ${user.email}: No message generated`);
        return;
      }

      // PHASE 2: Decide whether to send
      const decisionPrompt = `I wrote this proactive message for the user. Should I send it?

**The message:**
${generatedMessage}

**Testing mode criteria - send if ANY of these are true:**
- The message discusses specific glucose patterns or observations
- There are readings below 70 or above 180
- I haven't messaged them recently (check the timestamps in the message)
- The message asks helpful questions
- The message would be useful or interesting to the user

**Only don't send if:**
- The message is generic or has no specific observations
- There's literally nothing of value in it

Respond with ONLY "SEND" or "DONT_SEND" (no explanation needed).`;

      const decisionStream = await this.agent.stream({
        messages: [new HumanMessage(decisionPrompt)],
        userId: user.id,
        userContext: {
          email: user.email,
          diagnosisType: user.diagnosis_type || undefined,
          diagnosisDate: user.diagnosis_date || undefined,
          timezone: user.timezone || undefined,
        },
      });

      // Get the decision
      let decision = '';
      for await (const chunk of decisionStream) {
        const nodeUpdate = chunk.agent || chunk.tools;
        if (nodeUpdate?.messages) {
          const lastMessage = nodeUpdate.messages[nodeUpdate.messages.length - 1];
          if (lastMessage.content && typeof lastMessage.content === 'string') {
            decision = lastMessage.content.trim().toUpperCase();
          }
        }
      }

      console.log(`  Decision: ${decision}`);

      // If decision is to send, send it
      if (decision.includes('SEND') && !decision.includes('DONT')) {
        const title = this.extractTitle(generatedMessage) || 'Glucose check-in';
        const type = this.determineMessageType(generatedMessage);

        const { sendProactiveMessageTool } = await import('../agent/tools.js');
        const result = await sendProactiveMessageTool.invoke({
          userId: user.id,
          type,
          title,
          content: generatedMessage,
        });

        const parsedResult = JSON.parse(result);
        if (parsedResult.success) {
          console.log(`  ✓ Sent proactive message to ${user.email}`);
        } else {
          console.log(`  ✗ Failed to send: ${parsedResult.error}`);
        }
      } else {
        console.log(`  ${user.email}: Decided not to send`);
      }
    } catch (error) {
      console.error(`  Error analyzing ${user.email}:`, error);
    }
  }

  /**
   * Decide if the agent's response warrants sending a message
   */
  private shouldSendMessage(response: string): boolean {
    if (!response || response.length < 50) {
      return false;
    }

    // Don't send if agent explicitly said no outreach needed
    const noOutreachPhrases = [
      'no outreach needed',
      'no need to reach out',
      'nothing notable',
      'everything looks good',
      'no significant patterns',
    ];

    const lowerResponse = response.toLowerCase();
    for (const phrase of noOutreachPhrases) {
      if (lowerResponse.includes(phrase)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extract a title from the response (first line or heading)
   */
  private extractTitle(response: string): string | null {
    // Look for markdown heading
    const headingMatch = response.match(/^#+\s*(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    // Use first line if it's short enough
    const firstLine = response.split('\n')[0].trim();
    if (firstLine.length > 0 && firstLine.length < 80) {
      return firstLine.replace(/^[#*\-\s]+/, '').trim();
    }

    return null;
  }

  /**
   * Determine message type based on content
   */
  private determineMessageType(response: string): 'insight' | 'question' | 'suggestion' {
    const lowerResponse = response.toLowerCase();

    // Check for questions
    if (lowerResponse.includes('?') || lowerResponse.includes('wondering')) {
      return 'question';
    }

    // Check for suggestions
    if (
      lowerResponse.includes('try') ||
      lowerResponse.includes('suggest') ||
      lowerResponse.includes('recommend') ||
      lowerResponse.includes('consider')
    ) {
      return 'suggestion';
    }

    // Default to insight
    return 'insight';
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
