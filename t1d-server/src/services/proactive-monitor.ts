import { query } from '../config/database.js';
import { createConfiguredAgentGraph } from '../agent/graph.js';
import { HumanMessage } from '@langchain/core/messages';
import { logContextSize } from '../utils/token-counter.js';

/**
 * ProactiveMonitor service
 * Monitors glucose data and proactively reaches out with insights, questions, and suggestions
 */
export class ProactiveMonitor {
  private agent: any;
  private isRunning: boolean = false;
  private checkInterval: number = 90 * 60 * 1000; // 90 minutes for comprehensive analysis
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    this.agent = createConfiguredAgentGraph(undefined, 'proactive');
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

    // Don't send more than 1 message per hour (allows 2-3 insights per day during active hours)
    if (state.last_message_sent_at) {
      const hoursSinceLastMessage =
        (now.getTime() - new Date(state.last_message_sent_at).getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastMessage < 1.0) {
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
    // Get user's timezone
    const userResult = await query(
      `SELECT timezone FROM users WHERE id = $1`,
      [userId]
    );
    const userTimezone = userResult.rows[0]?.timezone || 'America/New_York';

    // Get current hour in USER'S timezone
    const now = new Date();
    const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    const hour = userLocalTime.getHours();

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

      // Get user's timezone
      const userTimezone = user.timezone || 'America/New_York';

      // PHASE 1: Analyze data and generate a message
      const now = new Date();
      // Convert to user's local time
      const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
      const hour = userLocalTime.getHours();

      // Time-based context for more relevant insights (using USER'S local time)
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

      const analysisPrompt = `Perform comprehensive glucose analysis and share data-driven insights proactively. ${timeContext}

**Analysis Framework - Use 5-7 tools for comprehensive insights (prioritize advanced analysis):**

1. **Always start with (2 tools):**
   - retrieve_user_memory (understand user context and preferences)
   - analyze_live_trend (current glucose status)

2. **Advanced analysis - choose 3-4 from these (PRIORITIZE statistical and pattern tools):**
   - analyze_trends (7-day trend + forecast for average_glucose or time_in_range) - USE THIS for trend context
   - detect_anomalies (last 3-7 days, sensitivity: low) - USE THIS sparingly, only high-severity events matter
   - compare_periods_statistical (this week vs last week) - USE THIS for progress tracking
   - get_detected_patterns (all patterns with confidence >0.6) - USE THIS to reference established correlations
   - analyze_meal_patterns (if discussing meals or post-meal glucose)
   - analyze_basal_patterns (if discussing overnight or fasting glucose)
   - analyze_exercise_patterns (if user exercises regularly)

3. **Tool selection priority:**
   - ALWAYS use: retrieve_user_memory, analyze_live_trend, analyze_trends
   - HIGHLY RECOMMENDED: compare_periods_statistical, get_detected_patterns
   - OPTIONAL: detect_anomalies (only if you need specific event context), pattern-specific tools

**Target:** Use 5-7 tools to provide comprehensive, data-backed insights. Favor statistical analysis and pattern detection tools over basic data retrieval.

**CRITICAL: Significance Filtering - Only share findings that meet these thresholds:**
- **Trends**: R² > 0.5 AND absolute slope >1 mg/dL/day (ignore flat/noisy trends)
- **Period comparisons**: p-value < 0.05 AND >5% change in key metrics (ignore insignificant changes)
- **Patterns**: Confidence >0.6 for established, >0.5 for emerging (ignore low-confidence)
- **Anomalies**: High severity only, AND either unexplained OR actionable (ignore explained minor events)
- **Stability**: If metrics are stable (CV <36%, TIR within ±5%, no significant trends), acknowledge stability briefly - don't force findings

**Examples of what NOT to share:**
- "Detected 150 anomalies" (noise - only share if high-severity and actionable)
- "Overnight glucose changed from 85 to 90" (insignificant - <10 mg/dL changes are normal variation)
- "CV is 35%, improved from 36%" (negligible - <5% changes aren't meaningful)
- "Low-confidence pattern (0.4): breakfast spikes" (unreliable - needs >0.6 confidence)
- "Glucose trending up by 0.3 mg/dL/day, R²=0.1" (noisy - not statistically significant)

**Examples of what TO share:**
- "TIR improved from 62% to 72% (p=0.02, 16% relative improvement)" (significant change)
- "High-confidence pattern (0.82): dinner consistently spikes to 190±12 mg/dL" (actionable)
- "Glucose trending down 2.8 mg/dL/day (R²=0.73)" (strong trend)
- "Overnight glucose rock-solid at 85±3 mg/dL, excellent stability" (positive finding)
- "3 unexplained highs >220 mg/dL between 2-4pm" (specific, actionable anomalies)

**What to Look For (prioritize significant, actionable findings):**
- **Strong trends (R² >0.5)**: Sustained directional changes worth tracking
- **Significant comparisons (p <0.05)**: Week-to-week improvements or declines
- **High-confidence patterns (>0.6)**: Established correlations to optimize
- **Stability**: Low CV (<36%), consistent TIR, flat overnight - these are positive findings
- **Actionable anomalies**: High-severity unexplained events that need investigation
- **Physiological insights**: LADA progression markers, insulin sensitivity changes
- **New discoveries**: Pattern shifts that warrant attention

**Educational Explanations:**
When you find something significant, explain the physiology:
- LADA progression markers (loss of first-phase insulin response, increasing basal needs)
- Why meal timing affects spikes
- How exercise affects insulin sensitivity for hours afterward
- Dawn phenomenon mechanisms (cortisol, growth hormone)
- Why protein/fat delay carb absorption
- How stress hormones affect glucose

**Message Structure (data-first approach):**
1. **Opening** (1-2 sentences, notification-friendly, no emoji/headers):
   Lead with the MOST SIGNIFICANT DATA FINDING that meets significance thresholds
   Examples: "TIR increased from 62% to 72% this week (p=0.02, 16% relative improvement)."
             "High-confidence pattern (0.82): breakfast meals consistently spike to 175±12 mg/dL."
             "Overnight glucose remarkably stable at 87±4 mg/dL (CV=4.6%)."
             "Glucose trending down 2.8 mg/dL/day over 7 days (R²=0.73, forecasts 115 mg/dL by next week)."

2. **Statistical Analysis** (only present significant findings):
   - **Trends**: Only if R² >0.5 AND slope >1 mg/dL/day
   - **Comparisons**: Only if p <0.05 AND >5% change
   - **Patterns**: Only if confidence >0.6 (established) or >0.5 (emerging noteworthy)
   - **Anomalies**: Only high-severity, unexplained events (omit minor explained variations)
   - **Stability**: If stable, acknowledge it positively and briefly

3. **Physiological Context** (explain the mechanism):
   - Describe WHY the observed pattern occurs physiologically
   - Connect to LADA progression markers if relevant
   - Reference established diabetes physiology

4. **Actionable Insights** (specific, data-backed recommendations):
   - Observations to track based on significant findings
   - Adjustments supported by high-confidence pattern data
   - Follow-up analysis suggestions

**Tone**: Analytical, selective, evidence-based. Only share findings that meet significance thresholds. Quality over quantity.

**Frequency**: Share meaningful insights, not noise. If everything is stable and no significant patterns emerge, it's okay to acknowledge that stability is a positive outcome.`;

      // Log context size
      const userCtx = {
        email: user.email,
        diagnosisType: user.diagnosis_type || undefined,
        diagnosisDate: user.diagnosis_date || undefined,
        timezone: user.timezone || undefined,
      };
      logContextSize([new HumanMessage(analysisPrompt)], userCtx, {
        label: 'Proactive Monitor - Generate Message',
        isFirstMessage: true,
      });

      const analysisStream = await this.agent.stream({
        messages: [new HumanMessage(analysisPrompt)],
        userId: user.id,
        userContext: userCtx,
      }, {
        streamMode: 'values', // LangGraph 1.x explicit mode
      });

      // Collect the generated message
      let generatedMessage = '';
      for await (const chunk of analysisStream) {
        // LangGraph 1.x returns state directly in 'values' mode
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          const messages = chunk.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const isAIMessage = lastMessage.constructor?.name === 'AIMessage' ||
                               lastMessage.constructor?.name === 'AIMessageChunk';
            const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

            // Only use final AI messages (from synthesis node)
            if (isAIMessage && isFinalMessage && lastMessage.content && typeof lastMessage.content === 'string') {
              generatedMessage = lastMessage.content;
            }
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

**Send if ANY of these are true:**
- Contains specific data analysis (trends, patterns, statistics, comparisons)
- Explains physiological mechanisms or LADA progression
- Identifies correlations between events and glucose responses
- Discusses interesting findings (even if not concerning)
- Shows week-over-week or period-to-period changes
- Provides educational context about diabetes management
- References detected patterns with confidence scores
- Includes forecasts or predictions
- Explains anomalies or unusual readings
- Offers investigative insights about observed data

**Only don't send if:**
- The message is completely generic with no specific observations
- Contains NO actual data from analysis tools
- Is just a greeting with no glucose insights
- Duplicates a very recent message (within last 90 minutes)

**Philosophy**: The user wants regular analytical insights and education, not just alerts. Share interesting findings proactively.

Respond with ONLY "SEND" or "DONT_SEND" (no explanation needed).`;

      // Log context size for decision call
      logContextSize([new HumanMessage(decisionPrompt)], userCtx, {
        label: 'Proactive Monitor - Send Decision',
        isFirstMessage: true,
      });

      const decisionStream = await this.agent.stream({
        messages: [new HumanMessage(decisionPrompt)],
        userId: user.id,
        userContext: userCtx,
      }, {
        streamMode: 'values', // LangGraph 1.x explicit mode
      });

      // Get the decision
      let decision = '';
      for await (const chunk of decisionStream) {
        // LangGraph 1.x returns state directly in 'values' mode
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          const messages = chunk.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const isAIMessage = lastMessage.constructor?.name === 'AIMessage' ||
                               lastMessage.constructor?.name === 'AIMessageChunk';
            const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;
            const shouldUse = isFinalMessage;

            if (isAIMessage && shouldUse && lastMessage.content && typeof lastMessage.content === 'string') {
              decision = lastMessage.content.trim().toUpperCase();
            }
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
    // Get user's timezone
    const userTimezone = user.timezone || 'America/New_York';

    const now = new Date();
    // Convert to user's local time
    const userLocalTime = new Date(now.toLocaleString('en-US', { timeZone: userTimezone }));
    const userHour = userLocalTime.getHours();

    // Send at 8am in USER'S local timezone
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
