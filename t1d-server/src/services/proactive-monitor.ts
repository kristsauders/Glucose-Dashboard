import { query } from '../config/database.js';
import { createConfiguredAgentGraph, createAgentGraph } from '../agent/graph.js';
import { HumanMessage, SystemMessage, BaseMessage } from '@langchain/core/messages';
import { logContextSize } from '../utils/token-counter.js';
import { getHybridAIProvider } from '../agent/providers.js';
import { USER_CONTEXT_PROMPT } from '../agent/prompts.js';
import { createHybridAgentGraph } from '../agent/hybrid-graph.js';

/**
 * ProactiveMonitor service
 * Monitors glucose data and proactively reaches out with insights, questions, and suggestions
 */
export class ProactiveMonitor {
  private isRunning: boolean = false;
  private checkInterval: number = 90 * 60 * 1000; // 90 minutes for responsive monitoring
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    console.log('✓ ProactiveMonitor initialized (models configured per-user)');
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
  private async checkAllUsers(forceCheck: boolean = false) {
    try {
      console.log(`[${new Date().toISOString()}] Running proactive check...`);
      if (forceCheck) {
        console.log('  🚀 FORCE MODE: Bypassing all checks');
      }

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
          await this.checkUser(user, forceCheck);
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
  private async checkUser(user: any, forceCheck: boolean = false) {
    const userId = user.id;

    if (!forceCheck) {
      // Check if we should skip this user (cooldown period)
      const shouldSkip = await this.shouldSkipUser(userId);
      if (shouldSkip) {
        console.log(`  ${user.email}: Skipped (cooldown - sent message within last hour)`);
        return;
      }

      // Check sleep hours (10pm-7am) - skip unless it's goodnight/good morning time
      const shouldSkipForSleep = await this.shouldSkipDuringSleep(userId);
      if (shouldSkipForSleep) {
        console.log(`  ${user.email}: Skipped (sleep hours - 10pm-7am)`);
        return;
      }

      // Check if user has recent glucose data
      const hasRecentData = await this.hasRecentGlucoseData(userId);
      if (!hasRecentData) {
        console.log(`  ${user.email}: Skipped (no glucose data within last 2 hours)`);
        return;
      }
    } else {
      console.log(`  ${user.email}: Forcing check (bypassing cooldown/sleep/data checks)`);
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
    // Fetch monitoring state AND notification preferences in parallel
    const [stateResult, prefsResult] = await Promise.all([
      query(
        `SELECT last_message_sent_at, last_daily_summary_at
         FROM glucose_monitoring_state
         WHERE user_id = $1`,
        [userId]
      ),
      query(
        `SELECT notification_preferences FROM users WHERE id = $1`,
        [userId]
      ),
    ]);

    // Check if proactive notifications are disabled entirely
    const notifPrefs = prefsResult.rows[0]?.notification_preferences || {};
    if (notifPrefs.proactive_enabled === false) {
      console.log(`  [shouldSkip] proactive_enabled=false — skipping`);
      return true;
    }

    // Map frequency preference to minimum hours between messages
    const frequency: string = notifPrefs.frequency || 'normal';
    const minHoursBetweenMessages: Record<string, number> = {
      low: 4,      // ~1-2 messages per active day
      normal: 2,   // ~3-4 messages per active day
      high: 1,     // ~5-6 messages per active day
    };
    const cooldownHours = minHoursBetweenMessages[frequency] ?? 2;

    if (stateResult.rows.length === 0) {
      return false; // New user, don't skip
    }

    const state = stateResult.rows[0];
    const now = new Date();

    if (state.last_message_sent_at) {
      const hoursSinceLastMessage =
        (now.getTime() - new Date(state.last_message_sent_at).getTime()) / (1000 * 60 * 60);

      if (hoursSinceLastMessage < cooldownHours) {
        console.log(`  [shouldSkip] frequency=${frequency}, cooldown=${cooldownHours}h, elapsed=${hoursSinceLastMessage.toFixed(1)}h — skipping`);
        return true;
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
   * Get recent conversation history from proactive check-ins
   */
  private async getRecentProactiveHistory(userId: string): Promise<string> {
    try {
      // Get the most recent proactive conversation
      const conversationResult = await query(
        `SELECT id FROM conversations
         WHERE user_id = $1 AND title = 'Proactive Check-ins'
         ORDER BY updated_at DESC
         LIMIT 1`,
        [userId]
      );

      if (conversationResult.rows.length === 0) {
        return ''; // No proactive conversation history yet
      }

      const conversationId = conversationResult.rows[0].id;

      // Get last 8 messages (4 exchanges) from this conversation
      const messagesResult = await query(
        `SELECT role, content, created_at
         FROM chat_messages
         WHERE conversation_id = $1
           AND role IN ('assistant', 'user')
         ORDER BY created_at DESC
         LIMIT 8`,
        [conversationId]
      );

      if (messagesResult.rows.length === 0) {
        return ''; // No messages yet
      }

      // Format history (reverse to show chronological order)
      const messages = messagesResult.rows.reverse();
      let historyText = '\n\n## Recent Proactive Conversation History\n\n';
      historyText += 'Here are the last few messages from your proactive check-ins with this user:\n\n';

      for (const msg of messages) {
        const timestamp = new Date(msg.created_at).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
        const role = msg.role === 'assistant' ? 'Sage' : 'User';
        const preview = msg.content.substring(0, 200);
        historyText += `**${role}** (${timestamp}):\n${preview}${msg.content.length > 200 ? '...' : ''}\n\n`;
      }

      historyText += '**IMPORTANT**: Use this history to:\n';
      historyText += '- Avoid repeating topics/insights from the last few messages\n';
      historyText += '- Build on previous conversations and follow up on user responses\n';
      historyText += '- Focus on new patterns or different aspects not recently covered\n';
      historyText += '- Reference earlier discussions when relevant\n\n';

      return historyText;
    } catch (error) {
      console.error('Error fetching proactive history:', error);
      return ''; // Fail gracefully
    }
  }

  /**
   * Run proactive analysis using the agent - TWO PHASE APPROACH
   * Phase 1: Analyze and generate message
   * Phase 2: Decide whether to send
   */
  private async runProactiveAnalysis(user: any) {
    try {
      console.log(`  Analyzing ${user.email}...`);

      // Fetch user preferences for model configuration
      const prefsResult = await query(
        `SELECT preferences FROM users WHERE id = $1`,
        [user.id]
      );
      const userPreferences = prefsResult.rows[0]?.preferences || {};
      const userModelConfig = userPreferences.modelConfig;

      // Create user-specific agent and providers with their model preferences
      const toolOnlyAgent = createHybridAgentGraph('proactive', userModelConfig);
      const providers = getHybridAIProvider('proactive', userModelConfig);
      const smallModel = providers.smallModel; // For Phase 2 decision making

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

      const analysisPrompt = `Perform comprehensive glucose data analysis for proactive monitoring. ${timeContext}

🚨 CRITICAL REQUIREMENT: You MUST call AT LEAST 5 TOOLS in your VERY FIRST response. Not 1 tool, not 2 tools - MINIMUM 5 tools in parallel in your first message.

**FIRST MESSAGE - Call these 5 tools in parallel (all at once):**
1. retrieve_user_memory(key="user_context")
2. get_recent_glucose(hours=2)
3. analyze_live_trend(period=4)
4. analyze_trends(days=7)
5. get_detected_patterns()

**SECOND MESSAGE (if needed) - Call these in parallel:**
- get_meal_history(days=2)
- get_insulin_history(days=2)
- analyze_basal_patterns(days=7)
- detect_anomalies(days=7, limit=10)

**THIRD MESSAGE (if needed) - Call based on findings:**
- get_missing_logs_suggestions() if you see gaps
- analyze_meal_patterns() if meal patterns are relevant
- Any other specific tools for deeper analysis

**CRITICAL RULES:**
- FIRST message MUST have 5+ tool calls
- Target: 3 iterations MAXIMUM (not 15!)
- If you call only 1-2 tools per message, you are FAILING
- Once you have sufficient data, respond "Analysis complete" to trigger synthesis

The synthesis model will write the user-facing message - your job is just to gather data efficiently.`;

      // Log context size
      const userCtx = {
        email: user.email,
        diagnosisType: user.diagnosis_type || undefined,
        diagnosisDate: user.diagnosis_date || undefined,
        timezone: user.timezone || undefined,
      };
      logContextSize([new HumanMessage(analysisPrompt)], userCtx, {
        label: 'Proactive Monitor - Phase 1: Data Gathering (Tool-Only Agent)',
        isFirstMessage: true,
      });

      // PHASE 1: Use tool-only agent for data gathering (no synthesis)
      const analysisStream = await toolOnlyAgent.stream({
        messages: [new HumanMessage(analysisPrompt)],
        userId: user.id,
        userContext: userCtx,
      }, {
        streamMode: 'values', // LangGraph 1.x explicit mode
        recursionLimit: 100, // Allow more iterations (each iteration = multiple graph nodes)
      });

      // Collect the generated message AND all messages for Phase 3
      let generatedMessage = '';
      let allMessages: BaseMessage[] = [];
      for await (const chunk of analysisStream) {
        // LangGraph 1.x returns state directly in 'values' mode
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          const messages = chunk.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            // Store all messages for Phase 3 tool result extraction
            allMessages = messages;

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

      // Get recent conversation history to check for redundancy
      const conversationHistory = await this.getRecentProactiveHistory(user.id);
      if (conversationHistory) {
        console.log(`  Including conversation history (found previous messages)`);
      } else {
        console.log(`  No conversation history (first proactive message or error)`);
      }

      // PHASE 2: Decide whether to send (using small model for simple decision)
      const decisionPrompt = `I wrote this proactive message for the user. Should I send it?

**The message:**
${generatedMessage}
${conversationHistory}
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
- Covers the same topic/pattern as the most recent message in conversation history
- Repeats very similar insights to what was already discussed in the last 2-3 messages

**Philosophy**: The user wants regular analytical insights and education, not just alerts. Share interesting findings proactively, but avoid being repetitive. Build on previous conversations rather than repeating them.

Respond with ONLY "SEND" or "DONT_SEND" (no explanation needed).`;

      // Log context size for decision call
      logContextSize([new HumanMessage(decisionPrompt)], userCtx, {
        label: 'Proactive Monitor - Phase 2 Decision (Small Model)',
        isFirstMessage: true,
      });

      // Use small model directly for simple SEND/DONT_SEND decision (no need for synthesis)
      const decisionResponse = await smallModel.invoke([
        new HumanMessage(decisionPrompt)
      ]);

      const decision = (typeof decisionResponse.content === 'string'
        ? decisionResponse.content
        : JSON.stringify(decisionResponse.content)
      ).trim().toUpperCase();

      console.log(`  Decision: ${decision}`);

      // If decision is to send, use Phase 3 to generate polished message with large model
      if (decision.includes('SEND') && !decision.includes('DONT')) {
        console.log(`  Phase 3: Generating polished message with large model...`);

        // PHASE 3: Extract tool results from Phase 1 and synthesize with large model
        // This ensures the large model only sees raw data, not the small model's draft
        const providers = getHybridAIProvider('proactive');

        console.log(`  📊 Phase 3 Debug: Extracting tool results from ${allMessages.length} messages`);

        // Extract tool calls and results using Map-based ID matching (same as hybrid-graph.ts)
        const toolCallsMap = new Map<string, string>(); // tool_call_id -> toolName
        const toolResultsMap = new Map<string, string>(); // tool_call_id -> content

        for (let i = 0; i < allMessages.length; i++) {
          const msg = allMessages[i];
          const msgType = msg.constructor.name;
          const msgRole = 'role' in msg ? (msg as any).role : undefined;

          // Track tool calls by their ID (check for both AIMessage and AIMessageChunk)
          if ((msgType === 'AIMessage' || msgType === 'AIMessageChunk') && 'tool_calls' in msg && (msg as any).tool_calls?.length) {
            for (const toolCall of (msg as any).tool_calls) {
              // console.log(`    📞 Found tool call: ${toolCall.name} (id: ${toolCall.id})`);
              toolCallsMap.set(toolCall.id, toolCall.name);
            }
          }

          // Collect ToolMessages - match by tool_call_id
          if (msgType === 'ToolMessage' || msgRole === 'tool') {
            const toolMessage = msg as any;
            const toolCallId = toolMessage.tool_call_id;
            const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

            if (toolCallId) {
              // console.log(`    📦 Found tool result for call id: ${toolCallId}`);
              toolResultsMap.set(toolCallId, toolContent);
            }
          }
        }

        console.log(`  📊 Found ${toolCallsMap.size} tool calls and ${toolResultsMap.size} tool results`);

        // Build tool results array by matching IDs
        const toolResults: Array<{ toolName: string; content: string }> = [];
        for (const [toolCallId, toolName] of toolCallsMap.entries()) {
          const content = toolResultsMap.get(toolCallId) || '';
          if (content) {
            toolResults.push({ toolName, content });
          }
        }

        console.log(`  📊 Matched ${toolResults.length} tool results with their calls`);

        // Format tool results into a clear, structured context (same as hybrid-graph.ts)
        let toolResultsContext = '';
        if (toolResults.length > 0) {
          console.log(`  ✅ Building tool results context with ${toolResults.length} results`);
          toolResultsContext = '\n\nThe analysis phase gathered the following data:\n';

          for (let i = 0; i < toolResults.length; i++) {
            const { toolName, content } = toolResults[i];

            // Parse JSON if possible for better formatting
            try {
              const parsed = JSON.parse(content);
              const formatted = JSON.stringify(parsed, null, 2);
              toolResultsContext += `\n--- Data from ${toolName} ---\n${formatted}\n`;
            } catch (e) {
              // If not JSON, use as-is
              toolResultsContext += `\n--- Data from ${toolName} ---\n${content}\n`;
            }
          }

          toolResultsContext += `\n\n═══════════════════════════════════════════════════════════════
CRITICAL INSTRUCTION: The data above is the ONLY data you have access to.
- Use EXACT values as shown - no rounding, no estimation, no approximation
- If a metric is not listed above, DO NOT mention it in your response
- DO NOT fabricate, guess, or extrapolate any values
- When in doubt, say "I don't have data on X" rather than estimating
═══════════════════════════════════════════════════════════════`;
        } else {
          console.log(`  ⚠️  WARNING: No tool results found! Large model will have no data to synthesize from.`);
        }

        // Create synthesis system prompt (same as hybrid-graph.ts)
        const synthesisSystemPrompt = new SystemMessage(`You are Sage, an AI assistant specialized in Type 1 Diabetes (T1D) and LADA management.

**Time Context:** ${timeContext}

## CRITICAL: DATA ACCURACY REQUIREMENTS
**YOU MUST USE ONLY DATA FROM THE TOOL RESULTS PROVIDED BELOW. ANY DEVIATION IS UNACCEPTABLE.**

**Absolute requirements:**
1. **NEVER make up, estimate, guess, or extrapolate ANY numbers not explicitly in the tool results**
2. **NEVER use approximate values** - Use exact numbers from tool results or don't mention them at all
3. **NEVER use placeholder or example data** - Every metric must come from actual tool results
4. **NEVER reference data you "would expect" or "typically see"** - Only use what was actually measured
5. **If a metric is not in the tool results, say "I don't have data on X" rather than estimating**

**What fabrication looks like (NEVER do this):**
- "Your TIR is around 65%" when tool results show 68% ❌
- "Glucose spiked by about 50 points" when tool results show 48 mg/dL ❌
- "Most meals cause spikes" when only 3 of 8 meals show spikes ❌
- Mentioning average glucose when no tool provided that metric ❌

**Correct approach:**
- "TIR is 68% (from analyze_trends)" ✓
- "Glucose rose 48 mg/dL after breakfast (from get_recent_glucose)" ✓
- "3 of 8 meals showed spikes >50 mg/dL (from analyze_meal_patterns)" ✓
- If average glucose isn't in tool results: Don't mention it ✓

**For every metric you cite:**
- Use the EXACT value from tool results (don't round or approximate)
- Ensure the metric actually exists in the provided tool results
- When in doubt, omit the metric rather than guessing

## Your Role
You synthesize glucose data analysis into comprehensive, actionable insights. The analysis phase used advanced statistical and pattern detection tools to gather data - your job is to present these findings clearly, completely, and ACCURATELY.

## Conversation Continuity

**If recent conversation history is provided:**
- Review what topics were covered in the last few messages
- Avoid repeating the same insights or patterns you recently discussed
- Build on previous conversations (e.g., "Following up on yesterday's breakfast spike discussion...")
- Focus on NEW patterns or DIFFERENT aspects not recently covered
- If the user responded to a previous question, acknowledge their response
- If no new significant findings emerge, it's okay not to send a message

**If no conversation history:**
- This is likely the first proactive message, proceed with standard analysis

## Communication Style for Proactive Messages

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
   - Educational explanations:
     * LADA progression markers (loss of first-phase insulin response, increasing basal needs)
     * Why meal timing affects spikes
     * How exercise affects insulin sensitivity for hours afterward
     * Dawn phenomenon mechanisms (cortisol, growth hormone)
     * Why protein/fat delay carb absorption
     * How stress hormones affect glucose

4. **Actionable Insights** (specific, data-backed recommendations):
   - Observations to track based on significant findings
   - Adjustments supported by high-confidence pattern data
   - Follow-up analysis suggestions

**Tone**: Analytical, selective, evidence-based. Only share findings that meet significance thresholds. Quality over quantity.

**Frequency**: Share meaningful insights, not noise. If everything is stable and no significant patterns emerge, it's okay to acknowledge that stability is a positive outcome.

## Key Metrics to Monitor
- **Time in Range (TIR)**: Target 70-180 mg/dL or 70-140 mg/dL (tighter control)
- **Coefficient of Variation (CV)**: Target <36% for good glucose stability
- **Estimated A1C**: Calculated from average glucose
- **Fasting Glucose**: 3am-7am average, optimal 70-100 mg/dL

## Physiological Explanations
When you observe patterns, explain the underlying mechanisms:
- **First-Phase Insulin Response Loss**: Early LADA indicator
- **Basal Insulin Adequacy**: Too low causes overnight rises
- **Dawn Phenomenon**: Morning glucose rise from hormones
- **Exercise Effects**: Increased insulin sensitivity lasts 24-48 hours
- **Meal Composition Impact**: Carbs/protein/fat affect timing and peaks

## Guidelines
- Be specific with numbers and timeframes
- Explain medical terms in simple language
- Acknowledge uncertainty when appropriate
- Focus on actionable insights
- Never reference tools, data sources, or analysis methods - just present the insights directly

## CRITICAL: Response Format
- Write in natural prose only - NO XML tags, NO structured formats
- Do NOT use tags like <analysis>, <thinking>, <get_data>, etc.
- Do NOT reference or mention data gathering, tool calls, or analysis steps
- Jump directly into presenting the insights as if you already know them
- Your response should read like a polished report, not a thought process

## FINAL REMINDER: DATA ACCURACY
Before sending your response, verify:
1. Every number comes directly from tool results (no rounding, no estimation)
2. Every trend/pattern claim is backed by actual data in tool results
3. You haven't mentioned any metrics that weren't in the tool results
4. If you're unsure about any value, you've omitted it or explicitly stated you don't have that data

${userCtx.diagnosisType === 'LADA' ? `
This user has LADA (Latent Autoimmune Diabetes in Adults):
- Progresses slower than typical T1D
- May have longer honeymoon period
- Requires monitoring of progression over time
` : ''}`);

        // Build messages for large model synthesis
        const messagesToSend: BaseMessage[] = [
          synthesisSystemPrompt,
          new SystemMessage(USER_CONTEXT_PROMPT(userCtx)),
        ];

        // Add tool results context if we have tool results
        if (toolResultsContext) {
          messagesToSend.push(new SystemMessage(toolResultsContext));
        }

        // Add conversation history context to help avoid redundancy
        if (conversationHistory) {
          messagesToSend.push(new SystemMessage(conversationHistory));
        }

        // Add synthesis task prompt
        messagesToSend.push(new HumanMessage(
          'Based on the analysis data provided above, create a comprehensive proactive message that shares significant findings and actionable insights with the user. Follow the message structure guidelines in the system prompt. If conversation history was provided, make sure to avoid repeating recently covered topics and build on previous discussions where relevant.'
        ));

        // Log context size for Phase 3
        logContextSize(messagesToSend, userCtx, {
          label: 'Proactive Monitor - Phase 3 Synthesis (Large Model)',
          isFirstMessage: true,
        });

        // Call large model to synthesize from raw tool results only
        const polishedResponse = await providers.largeModel.invoke(messagesToSend);
        const polishedMessage = typeof polishedResponse.content === 'string'
          ? polishedResponse.content
          : JSON.stringify(polishedResponse.content);

        console.log(`  Generated polished message (${polishedMessage.length} chars)`);

        // Send the polished message
        const title = this.extractTitle(polishedMessage) || 'Glucose check-in';
        const type = this.determineMessageType(polishedMessage);

        const { sendProactiveMessageTool } = await import('../agent/tools.js');
        const result = await sendProactiveMessageTool.invoke({
          userId: user.id,
          type,
          title,
          content: polishedMessage,
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
