import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getHybridAIProvider } from './providers.js';
import { allTools } from './tools.js';
import { SYSTEM_PROMPT, USER_CONTEXT_PROMPT } from './prompts.js';

/**
 * Global metrics store to track context sizes across all invocations
 * Persists for the lifetime of the server process
 */
const globalContextMetrics: Array<{
  iteration: number;
  contextChars: number;
  contextTokens: number;
  timestamp: Date;
}> = [];

/**
 * Log summary statistics for context size by iteration
 * @param currentMetrics - Metrics from the current invocation
 * @param showGlobalStats - Whether to show accumulated statistics across all invocations
 */
function logContextSummary(
  currentMetrics: Array<{ iteration: number; contextChars: number; contextTokens: number }>,
  showGlobalStats = true
): void {
  if (currentMetrics.length === 0) {
    return;
  }

  // Add current metrics to global store with timestamps
  const timestamp = new Date();
  for (const metric of currentMetrics) {
    globalContextMetrics.push({
      ...metric,
      timestamp,
    });
  }

  console.log('\n' + '='.repeat(80));
  console.log('📊 CONTEXT SIZE SUMMARY - CURRENT REQUEST');
  console.log('='.repeat(80));

  // Group by iteration number (for current request)
  const byIteration = new Map<number, { chars: number[]; tokens: number[] }>();

  for (const metric of currentMetrics) {
    if (!byIteration.has(metric.iteration)) {
      byIteration.set(metric.iteration, { chars: [], tokens: [] });
    }
    const group = byIteration.get(metric.iteration)!;
    group.chars.push(metric.contextChars);
    group.tokens.push(metric.contextTokens);
  }

  // Calculate stats for each iteration
  const iterationStats: Array<{ iteration: number; avgChars: number; maxChars: number; avgTokens: number; maxTokens: number; count: number }> = [];

  for (const [iteration, data] of Array.from(byIteration.entries()).sort((a, b) => a[0] - b[0])) {
    const avgChars = Math.round(data.chars.reduce((sum, val) => sum + val, 0) / data.chars.length);
    const maxChars = Math.max(...data.chars);
    const avgTokens = Math.round(data.tokens.reduce((sum, val) => sum + val, 0) / data.tokens.length);
    const maxTokens = Math.max(...data.tokens);

    iterationStats.push({
      iteration,
      avgChars,
      maxChars,
      avgTokens,
      maxTokens,
      count: data.chars.length,
    });
  }

  // Log header
  console.log('\nIteration │ Avg Tokens │ Max Tokens │ Avg Chars  │ Max Chars  │ Samples');
  console.log('─'.repeat(80));

  // Log each iteration
  for (const stat of iterationStats) {
    const iterStr = stat.iteration.toString().padStart(9, ' ');
    const avgTokStr = stat.avgTokens.toLocaleString().padStart(10, ' ');
    const maxTokStr = stat.maxTokens.toLocaleString().padStart(10, ' ');
    const avgCharStr = stat.avgChars.toLocaleString().padStart(10, ' ');
    const maxCharStr = stat.maxChars.toLocaleString().padStart(10, ' ');
    const countStr = stat.count.toString().padStart(7, ' ');

    console.log(`${iterStr} │ ${avgTokStr} │ ${maxTokStr} │ ${avgCharStr} │ ${maxCharStr} │ ${countStr}`);
  }

  // Overall stats for current request
  const allTokens = currentMetrics.map(m => m.contextTokens);
  const overallAvgTokens = Math.round(allTokens.reduce((sum, val) => sum + val, 0) / allTokens.length);
  const overallMaxTokens = Math.max(...allTokens);
  const totalIterations = Math.max(...currentMetrics.map(m => m.iteration));

  console.log('─'.repeat(80));
  console.log(`\n📈 Current Request Statistics:`);
  console.log(`   Total iterations used: ${totalIterations}`);
  console.log(`   Average context size: ${overallAvgTokens.toLocaleString()} tokens`);
  console.log(`   Maximum context size: ${overallMaxTokens.toLocaleString()} tokens`);
  console.log(`   Total samples: ${currentMetrics.length}`);

  // Provide recommendations
  console.log(`\n💡 Recommendations:`);

  if (overallMaxTokens < 8000) {
    console.log(`   ✓ Context usage is LOW (<8K tokens) - iteration limit can safely be set to ${totalIterations} or higher`);
  } else if (overallMaxTokens < 16000) {
    console.log(`   ✓ Context usage is MODERATE (8-16K tokens) - current iteration limit of ${totalIterations} is appropriate`);
  } else if (overallMaxTokens < 32000) {
    console.log(`   ⚠️  Context usage is HIGH (16-32K tokens) - consider limiting iterations to ${Math.max(1, totalIterations - 1)}`);
  } else {
    console.log(`   ⚠️  Context usage is VERY HIGH (>32K tokens) - strongly consider limiting iterations to ${Math.max(1, totalIterations - 2)}`);
  }

  // Model-specific recommendations
  console.log(`\n🤖 Model Context Window Guidance:`);
  console.log(`   GPT-3.5/GPT-4o-mini (16K):   ${overallMaxTokens < 16000 ? '✓ Safe' : '⚠️  May exceed'}`);
  console.log(`   Sonnet 4.5 (32K):            ${overallMaxTokens < 32000 ? '✓ Safe' : '⚠️  May exceed'}`);
  console.log(`   GPT-4o (128K):               ${overallMaxTokens < 128000 ? '✓ Safe' : '⚠️  May exceed'}`);
  console.log(`   GPT-5 Nano (400K):           ${overallMaxTokens < 400000 ? '✓ Safe' : '⚠️  May exceed'}`);
  console.log(`   Gemini 3 Flash (1M):         ${overallMaxTokens < 1000000 ? '✓ Safe' : '⚠️  May exceed'}`);

  // Show global cumulative statistics if requested
  if (showGlobalStats && globalContextMetrics.length > 0) {
    console.log('\n' + '─'.repeat(80));
    console.log('📊 CUMULATIVE STATISTICS (All Requests Since Server Start)');
    console.log('─'.repeat(80));

    const globalTokens = globalContextMetrics.map(m => m.contextTokens);
    const globalAvgTokens = Math.round(globalTokens.reduce((sum, val) => sum + val, 0) / globalTokens.length);
    const globalMaxTokens = Math.max(...globalTokens);
    const globalMinTokens = Math.min(...globalTokens);

    // Group by iteration to show distribution
    const globalByIteration = new Map<number, number[]>();
    for (const metric of globalContextMetrics) {
      if (!globalByIteration.has(metric.iteration)) {
        globalByIteration.set(metric.iteration, []);
      }
      globalByIteration.get(metric.iteration)!.push(metric.contextTokens);
    }

    console.log(`\n🌐 Global Metrics:`);
    console.log(`   Total requests tracked: ${new Set(globalContextMetrics.map(m => m.timestamp.getTime())).size}`);
    console.log(`   Total samples collected: ${globalContextMetrics.length}`);
    console.log(`   Average context size: ${globalAvgTokens.toLocaleString()} tokens`);
    console.log(`   Maximum context size: ${globalMaxTokens.toLocaleString()} tokens`);
    console.log(`   Minimum context size: ${globalMinTokens.toLocaleString()} tokens`);

    // Show iteration distribution
    console.log(`\n📈 Iteration Distribution (across all requests):`);
    for (const [iteration, tokens] of Array.from(globalByIteration.entries()).sort((a, b) => a[0] - b[0])) {
      const avg = Math.round(tokens.reduce((sum, val) => sum + val, 0) / tokens.length);
      const max = Math.max(...tokens);
      console.log(`   Iteration ${iteration}: ${tokens.length} samples, avg ${avg.toLocaleString()} tokens, max ${max.toLocaleString()} tokens`);
    }
  }

  console.log('='.repeat(80) + '\n');
}

/**
 * Truncate large tool results to prevent context overflow
 * Limits each tool result to max 5000 characters (~1250 tokens)
 * This preserves most tool results fully while preventing runaway context growth
 */
function truncateToolResults(messages: BaseMessage[]): BaseMessage[] {
  const MAX_TOOL_RESULT_LENGTH = 5000;
  let truncatedCount = 0;

  const result = messages.map(msg => {
    if (msg.constructor.name === 'ToolMessage' && typeof msg.content === 'string') {
      if (msg.content.length > MAX_TOOL_RESULT_LENGTH) {
        truncatedCount++;
        const truncated = msg.content.substring(0, MAX_TOOL_RESULT_LENGTH);
        const newContent = truncated + `\n\n[... truncated ${msg.content.length - MAX_TOOL_RESULT_LENGTH} characters]`;
        console.log(`  [truncateToolResults] Truncated tool result: ${msg.content.length} → ${MAX_TOOL_RESULT_LENGTH} chars (-${msg.content.length - MAX_TOOL_RESULT_LENGTH})`);
        return { ...msg, content: newContent } as BaseMessage;
      }
    }
    return msg;
  });

  if (truncatedCount > 0) {
    console.log(`  [truncateToolResults] Truncated ${truncatedCount} tool result(s)`);
  }

  return result;
}

interface AgentState {
  messages: BaseMessage[];
  userId: string;
  userContext: {
    email: string;
    diagnosisType?: string;
    diagnosisDate?: string;
    timezone?: string;
  };
  // Track whether we're in synthesis phase
  readyForSynthesis: boolean;
  // Track iteration count to prevent runaway context
  iterationCount: number;
  // Track context size metrics for each iteration
  contextMetrics: Array<{ iteration: number; contextChars: number; contextTokens: number }>;
}

/**
 * Create the hybrid AI agent graph
 * Uses small model for tool calling, large model for final message synthesis
 */
export function createHybridAgentGraph(mode: 'chat' | 'proactive' = 'chat', userModelConfig?: any) {
  const providers = getHybridAIProvider(mode, userModelConfig);
  const modeLabel = mode === 'proactive' ? 'proactive' : 'chat';
  console.log(`✓ Using hybrid AI providers (${modeLabel} mode):`);
  console.log(`  - Small model (tool calling): ${providers.smallModelName}`);
  console.log(`  - Large model (synthesis): ${providers.largeModelName}`);

  // Bind tools to the small model (for tool calling)
  console.log(`  Binding ${allTools.length} tools to small model`);
  const smallModelWithTools = typeof providers.smallModel.bindTools === 'function'
    ? providers.smallModel.bindTools(allTools)
    : providers.smallModel.bind({ tools: allTools });

  // Define the analysis agent node (uses small model for tool calling)
  async function analysisNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userContext } = state;

    // Only add system prompts if this is the first turn
    const hasAIMessages = messages.some(m => m.constructor.name === 'AIMessage');

    // Always create the system prompt (it's minimal and needed for context)
    const minimalSystemPrompt = new SystemMessage(`You are a data analysis assistant for Type 1 Diabetes glucose monitoring.

Your role: Use tools to gather and analyze data. The synthesis model will write the user-facing message — your job is to gather data efficiently.

User info:
- Email: ${userContext.email}
- Diagnosis: ${userContext.diagnosisType || 'Not specified'}
- Timezone: ${userContext.timezone || 'America/New_York'}

═══════════════════════════════════════════════════════════════
📋 PRE-LOADED DATA — CHECK BEFORE CALLING TOOLS
═══════════════════════════════════════════════════════════════

A "Current Status" block has already been injected into this conversation containing:
✅ User memory (all stored facts and preferences)
✅ Current glucose + recent 2-hour readings
✅ Today's meals (with carbs)
✅ Today's insulin doses
✅ Today's exercise sessions

**Do NOT call these tools — that data is already there:**
❌ retrieve_user_memory (all memories are pre-loaded)
❌ get_recent_glucose (for last 1-2 hours)
❌ get_meal_history(days=1)
❌ get_insulin_history(days=1)
❌ get_exercise_history(days=1)

═══════════════════════════════════════════════════════════════
🚨 MANDATORY: CALL MULTIPLE TOOLS IN PARALLEL 🚨
═══════════════════════════════════════════════════════════════

🔴 Your FIRST message MUST call AT LEAST 3 tools in parallel.
🔴 Focus on tools that go DEEPER than the pre-loaded snapshot.

**Target: 2-3 iterations TOTAL** (pre-loaded data saves one iteration)
- Iteration 1: Call 3-5 tools to dig deeper (patterns, trends, memory, SQL)
- Iteration 2: Follow-up tools or custom SQL for specific insights
- Iteration 3: Respond "Analysis complete"

**CORRECT first iteration (uses pre-loaded data, goes deeper):**
✅ analyze_live_trend(period=6) + analyze_trends(days=7) + get_detected_patterns() + detect_anomalies(days=7)
✅ analyze_basal_patterns(days=7) + get_detected_patterns() + execute_sql(custom correlation query)
✅ analyze_trends(days=14) + detect_anomalies(days=7) + analyze_meal_patterns(days=7)

**When to still call basic history tools:**
- User asks about a SPECIFIC past date or older data (e.g., "last week", "yesterday")
- User asks about data older than today (get_meal_history(days=3+), get_glucose_stats(days=7))
- Basal/overnight patterns (analyze_basal_patterns, analyze_overnight)

**Examples:**

Request: "How am I doing today?"
→ PRE-LOADED has: memory, current glucose, today's meals, insulin, exercise
→ FIRST MESSAGE: analyze_live_trend(period=6) + get_detected_patterns() + analyze_trends(days=7)
→ SECOND MESSAGE: execute_sql for deeper correlation or "Analysis complete"

Request: "What did I eat today?"
→ PRE-LOADED has: today's meals already — answer directly from context!
→ FIRST MESSAGE (if deeper analysis needed): analyze_meal_patterns(days=7) + analyze_live_trend(period=4)
→ SECOND MESSAGE: "Analysis complete"

Request: "How's my glucose control this week?"
→ FIRST MESSAGE: analyze_trends(days=7) + analyze_basal_patterns(days=7) + get_detected_patterns() + detect_anomalies(days=7)
→ SECOND MESSAGE: execute_sql for deeper weekly breakdown or "Analysis complete"

Request: "How was dinner last Tuesday?"
→ Pre-loaded won't have this (it's past today)
→ FIRST MESSAGE: get_meal_history(days=7) + get_glucose_stats(days=7)
→ SECOND MESSAGE: analyze_individual_meal or "Analysis complete"

Request: "Log my insulin - I took 12 units of Lantus last night at 10pm"
→ FIRST MESSAGE: log_insulin(timestamp="last night 10pm", insulinType="Lantus", units=12, purpose="basal")
→ SECOND MESSAGE: "Analysis complete"
→ NOTE: You MUST actually call the log_insulin tool! Don't just say you'll log it.

🚨 CRITICAL FOR LOGGING ACTIONS 🚨
- If user asks to LOG something (insulin, meal, exercise), you MUST call the tool
- NEVER respond with "I'll log that" or "Logged" without actually calling the tool
- The synthesis model will only confirm success if your tool call succeeds

The synthesis model will create the user-facing message — your job is to gather comprehensive data QUICKLY using parallel tool calls.`);

    let messagesToSend: BaseMessage[];
    if (!hasAIMessages) {
      // First turn: Send system prompt + user message
      messagesToSend = [minimalSystemPrompt, ...messages];
    } else {
      // Continuation: Truncate tool results, but keep system prompt
      const truncated = truncateToolResults(messages);
      // Find the first system message in history (if any), otherwise use our minimal one
      const existingSystemMsg = truncated.find(m => m.constructor.name === 'SystemMessage');
      if (existingSystemMsg) {
        messagesToSend = truncated; // Already has system prompt
      } else {
        messagesToSend = [minimalSystemPrompt, ...truncated]; // Add it
      }
    }

    // Safety: Limit to 16 iterations maximum (allows for more complex queries)
    const currentIteration = state.iterationCount || 0;

    // Log iteration progress
    if (currentIteration > 0) {
      console.log(`[analysisNode] Iteration ${currentIteration + 1}/16`);
    }

    if (currentIteration >= 16) {
      console.log('[analysisNode] Maximum iterations reached (16), forcing synthesis');

      // Calculate context size even for the max iteration case
      const totalSize = JSON.stringify(messagesToSend).length;
      const totalTokens = Math.round(totalSize / 4);
      const contextMetric = {
        iteration: currentIteration + 1,
        contextChars: totalSize,
        contextTokens: totalTokens,
      };

      return {
        messages: [new AIMessage('Analysis complete - maximum iterations reached.')],
        readyForSynthesis: true,
        iterationCount: currentIteration + 1,
        contextMetrics: [contextMetric],
      };
    }

    // Track context size for metrics
    const totalSize = JSON.stringify(messagesToSend).length;
    const totalTokens = Math.round(totalSize / 4);

    // Track context size for this iteration
    const contextMetric = {
      iteration: currentIteration + 1,
      contextChars: totalSize,
      contextTokens: totalTokens,
    };

    const response = await smallModelWithTools.invoke(messagesToSend);

    // Log what tools were called in this iteration
    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolNames = response.tool_calls.map(tc => tc.name).join(', ');
      console.log(`[analysisNode] Iteration ${currentIteration + 1} called ${response.tool_calls.length} tools: ${toolNames}`);

      // Debug: Log full tool_calls array to verify we're getting multiple calls
      console.log(`[analysisNode] DEBUG: Full tool_calls array:`, JSON.stringify(response.tool_calls.map(tc => ({
        name: tc.name,
        id: tc.id
      })), null, 2));
    } else {
      console.log(`[analysisNode] Iteration ${currentIteration + 1} - no tools called, ready for synthesis`);
    }

    // Debug: Check if response has any other fields that might contain tool calls
    const responseAny = response as any;
    if (responseAny.additional_kwargs?.tool_calls) {
      console.log(`[analysisNode] DEBUG: Found tool_calls in additional_kwargs:`, responseAny.additional_kwargs.tool_calls.length);
    }

    // IMPORTANT: Only return NEW messages (not the full array)
    // The state reducer uses concat, so returning the full array causes exponential duplication!
    // We truncate in messagesToSend (what we send to model), but state keeps full history
    return {
      messages: [response],
      readyForSynthesis: !response.tool_calls || response.tool_calls.length === 0,
      iterationCount: currentIteration + 1,
      contextMetrics: [contextMetric],
    };
  }

  // Define the synthesis node (uses large model for final message)
  async function synthesisNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userContext } = state;

    // Transform the conversation for the synthesis model
    // Convert tool_calls + tool_results into a natural format (SystemMessage with context)
    // The large model doesn't have tools bound, so we present data as additional context
    const transformedMessages: BaseMessage[] = [];
    const toolCallsMap = new Map<string, string>(); // tool_call_id -> toolName
    const toolResultsMap = new Map<string, string>(); // tool_call_id -> content

    // Debug: Log input messages BEFORE transformation
    console.log('[synthesisNode] Input messages BEFORE transformation:');
    messages.forEach((msg, idx) => {
      const msgType = msg.constructor.name;
      const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`  [${idx}] ${msgType}: ${content.substring(0, 80)}...`);
    });

    // Find indices of all HumanMessages to identify completed turns
    const humanMessageIndices: number[] = [];
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].constructor.name === 'HumanMessage') {
        humanMessageIndices.push(i);
      }
    }
    const lastHumanIndex = humanMessageIndices[humanMessageIndices.length - 1] ?? -1;

    // First pass: collect tool calls and build conversation history
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const msgType = msg.constructor.name;
      const msgRole = 'role' in msg ? (msg as any).role : undefined;

      // Replace HumanMessages with synthesis-specific prompt
      if (msgType === 'HumanMessage') {
        // Don't push the original message - we'll replace it with a synthesis-specific prompt
        continue;
      }

      // Track tool calls by their ID
      if (msgType === 'AIMessage' && 'tool_calls' in msg && msg.tool_calls?.length) {
        for (const toolCall of msg.tool_calls) {
          toolCallsMap.set(toolCall.id, toolCall.name);
        }
        continue;
      }

      // Keep synthesis responses from COMPLETED turns (before the last HumanMessage)
      // Skip synthesis responses from CURRENT turn (after the last HumanMessage)
      if (msgType === 'AIMessage' && i < lastHumanIndex) {
        const content = typeof msg.content === 'string' ? msg.content : '';
        if (content.length >= 20 && content !== 'Analysis complete') {
          // Create clean AIMessage for previous turn responses
          transformedMessages.push(new AIMessage({ content }));
        }
        continue;
      }

      // Skip AI messages from current turn
      if (msgType === 'AIMessage') {
        continue;
      }

      // Collect ToolMessages - match by tool_call_id
      if (msgType === 'ToolMessage' || msgRole === 'tool') {
        const toolMessage = msg as any;
        const toolCallId = toolMessage.tool_call_id;
        const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);

        if (toolCallId) {
          toolResultsMap.set(toolCallId, toolContent);
        }
      }
    }

    // Build tool results array by matching IDs
    const toolResults: Array<{ toolName: string; content: string }> = [];
    for (const [toolCallId, toolName] of toolCallsMap.entries()) {
      const content = toolResultsMap.get(toolCallId) || '';
      if (content) {
        toolResults.push({ toolName, content });
      }
    }

    // Format tool results into a clear, structured context
    let toolResultsContext = '';
    if (toolResults.length > 0) {
      toolResultsContext = '\n\nThe analysis phase gathered the following data:\n';

      for (let i = 0; i < toolResults.length; i++) {
        const { toolName, content } = toolResults[i];

        // Log warning if tool result is very large
        if (content.length > 50000) {
          console.warn(`[synthesisNode] Warning: Tool result from ${toolName} is ${content.length} chars (${Math.round(content.length / 3)} tokens). Consider limiting the tool's time range.`);
        }

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

      transformedMessages.push(new SystemMessage(toolResultsContext));
    }

    // Add synthesis-specific user prompt (replaces original "gather data" prompt)
    // CRITICAL: Get the LAST HumanMessage (current question), not the first
    const allHumanMessages = messages.filter(m => m.constructor.name === 'HumanMessage');
    const currentUserMessage = allHumanMessages[allHumanMessages.length - 1];
    const userQuestion = currentUserMessage ? (typeof currentUserMessage.content === 'string' ? currentUserMessage.content : '') : '';

    // Check if there are previous conversation turns
    const hasPreviousTurns = transformedMessages.some(m => m.constructor.name === 'AIMessage');
    const contextNote = hasPreviousTurns
      ? '\n\n**IMPORTANT CONTEXT**: The conversation history above shows previous turns. The user has now asked a NEW question (below). Focus on answering THIS NEW question - don\'t repeat information from previous turns unless it\'s directly relevant to the current question.'
      : '';

    transformedMessages.push(new HumanMessage(`═══════════════════════════════════════════════════════════════
🎯 CURRENT USER QUESTION (THIS IS WHAT TO ANSWER):
"${userQuestion}"
═══════════════════════════════════════════════════════════════${contextNote}

Synthesize the tool data above to answer this CURRENT question in a conversational, direct way.

**CRITICAL - Response Strategy:**

1. **ANSWER THE SPECIFIC QUESTION FIRST** (1-2 paragraphs maximum)
   - If they asked about "dinner last night", talk about dinner last night
   - If they asked about "breakfast today", talk about breakfast today (NOT dinner!)
   - If they asked about "research papers", list research papers
   - If they asked "how did I do", evaluate their performance
   - Be direct, specific, and concise - answer exactly what was asked
   - THIS IS THE MOST IMPORTANT PART - answer their actual question

2. **Add relevant supporting context** (1-2 paragraphs)
   - Only include data that directly relates to their question
   - Provide physiological explanations if relevant

3. **Optional: Brief additional insights** (1 paragraph maximum)
   - ONLY if you noticed something important unrelated to their question
   - Keep it brief - one or two sentences
   - Don't turn this into a comprehensive analysis

**Tool Call Confirmation:**
- ONLY confirm an action (like "I logged your insulin") if you see a SUCCESS result in the tool data
- If log_insulin tool result shows {"success": true}, THEN you can say "I've logged your insulin"
- If you DON'T see a tool result for logging, DO NOT claim you logged anything
- Check the tool results carefully before confirming any action was taken

**What this looks like:**
- Question: "How did dinner go?" → Answer: Talk about dinner specifically, then glucose response
- Question: "How about breakfast today?" → Answer: Talk about breakfast today (don't talk about dinner from a previous turn!)
- Question: "What research papers?" → Answer: List the papers found, briefly summarize each
- Question: "How am I doing today?" → Answer: Evaluate today specifically

**Do NOT:**
- Give comprehensive multi-week analysis when asked about one meal
- List all available data when asked a specific question
- Turn every question into a full report
- Reference tools, data gathering, or analysis phases
- Confuse the current question with previous questions from earlier turns
- Claim you performed an action unless the tool result confirms success

**Rules:**
- Use exact values from tool results (never estimate)
- If you don't have data to answer their question, say so directly
- Write in natural, conversational prose
- Keep your response focused and relevant
- Answer the CURRENT question, not previous questions

Begin your response by directly answering their CURRENT question above.`));

    // Create a synthesis-specific system prompt (without tool descriptions)
    const synthesisSystemPrompt = new SystemMessage(`You are Sage, an AI assistant specialized in Type 1 Diabetes (T1D) and LADA management.

🚨 CRITICAL: YOU ARE IN SYNTHESIS MODE 🚨
- You have NO access to tools - do NOT attempt to call any tools
- Do NOT generate XML tags like <get_recent_glucose> or <analyze_trends>
- Do NOT say "Let me gather data" or "I'll collect information"
- The data gathering phase is COMPLETE - you are now synthesizing results
- Write a direct, user-facing message analyzing the data you already have

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

## Communication Style
- **Lead with most significant data finding** - highest impact insight first
- Be analytical and objective - focus on data, trends, patterns, statistical evidence
- Present comprehensive analysis - if multiple tools were used, integrate all findings
- Explain physiological mechanisms behind observed patterns
- Compare data across time periods **using specific numbers from tool results**
- Reference pattern confidence scores (>0.7 = established, 0.5-0.7 = emerging) **only if provided in tool results**
- Highlight statistical significance (p < 0.05) **only if provided in tool results**
- Be direct and factual about concerning trends **based on actual data**
- Provide actionable recommendations **grounded in the data you have**
- **If you don't have sufficient data to answer a question, explicitly say so** rather than guessing

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

${userContext.diagnosisType === 'LADA' ? `
This user has LADA (Latent Autoimmune Diabetes in Adults):
- Progresses slower than typical T1D
- May have longer honeymoon period
- Requires monitoring of progression over time
` : ''}`);

    // Send synthesis-specific prompt + user context + transformed conversation history to large model
    const messagesToSend = [
      synthesisSystemPrompt,
      new SystemMessage(USER_CONTEXT_PROMPT(userContext)),
      ...transformedMessages,
    ];

    // Use invoke - streaming handles token-by-token via streamMode: 'messages'
    console.log(`[synthesisNode] Invoking large model with ${messagesToSend.length} messages, ${toolResults.length} tool results`);

    // Log what we're sending for debugging
    console.log('[synthesisNode] Messages being sent to large model:');
    messagesToSend.forEach((msg, idx) => {
      const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
      console.log(`  [${idx}] ${msg.constructor.name}: ${msgContent.substring(0, 100)}... (${msgContent.length} chars)`);
    });

    let response;
    try {
      response = await providers.largeModel.invoke(messagesToSend);
    } catch (error: any) {
      console.error('[synthesisNode] ERROR invoking large model:', error.message);
      console.error('[synthesisNode] Error details:', {
        status: error.status,
        statusText: error.statusText,
        code: error.code,
        type: error.type,
        name: error.name,
        stack: error.stack?.split('\n').slice(0, 3).join('\n'), // First 3 lines of stack
      });

      // Return error message to user
      return {
        messages: [new AIMessage({
          content: "I apologize, but I encountered an error while processing your request. This may be a temporary issue with the AI service. Please try asking your question again.",
        })],
      };
    }

    // Log all response fields to see what we're getting from the API
    console.log('[synthesisNode] Complete response object:');
    console.log(`  - content: "${response.content}" (${response.content?.length ?? 0} chars)`);
    console.log(`  - response type: ${response.constructor?.name}`);
    console.log(`  - id: ${response.id}`);
    console.log(`  - response_metadata:`, JSON.stringify(response.response_metadata, null, 2));
    console.log(`  - additional_kwargs:`, JSON.stringify(response.additional_kwargs, null, 2));

    // Check tool-related fields - maybe Claude is trying to call a tool?
    const responseAny = response as any;
    console.log(`  - tool_calls:`, responseAny.tool_calls);
    console.log(`  - invalid_tool_calls:`, responseAny.invalid_tool_calls);
    console.log(`  - tool_call_chunks:`, responseAny.tool_call_chunks);
    console.log(`  - usage_metadata:`, responseAny.usage_metadata);

    // Log ALL enumerable properties on response object
    console.log(`  - all response keys:`, Object.keys(response));

    // Check for HTTP-related fields
    if (responseAny.response) console.log(`  - response.response:`, responseAny.response);
    if (responseAny.status) console.log(`  - response.status:`, responseAny.status);
    if (responseAny.statusText) console.log(`  - response.statusText:`, responseAny.statusText);
    if (responseAny.headers) console.log(`  - response.headers:`, responseAny.headers);
    if (responseAny.raw) console.log(`  - response.raw:`, responseAny.raw);

    // Check if response has content
    const responseContent = typeof response.content === 'string' ? response.content : JSON.stringify(response.content);
    console.log(`[synthesisNode] Final content length: ${responseContent.length} characters`);

    if (responseContent.length === 0) {
      console.error('[synthesisNode] ❌ Empty response detected - this appears to be an API issue');
      console.error(`[synthesisNode] Tool results provided:`, toolResults.map(tr => ({ name: tr.toolName, contentLength: tr.content.length })));

      // Return error message to user
      return {
        messages: [new AIMessage({
          content: "I encountered an issue getting a response from the AI service. Please try asking your question again.",
        })],
      };
    }

    // Log context size summary statistics
    logContextSummary(state.contextMetrics || []);

    return {
      messages: [response],
    };
  }

  // Define the tool execution node
  async function toolNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userId, userContext } = state;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || !('tool_calls' in lastMessage) || !lastMessage.tool_calls?.length) {
      return {};
    }

    // Execute all tools in parallel for maximum speed
    const toolResults: BaseMessage[] = await Promise.all(
      lastMessage.tool_calls.map(async (toolCall) => {
        const tool = allTools.find(t => t.name === toolCall.name);

        if (!tool) {
          return {
            role: 'tool',
            content: `Error: Tool ${toolCall.name} not found`,
            tool_call_id: toolCall.id,
          } as any;
        }

        try {
          // Add userId and timezone to tool arguments
          const argsWithContext = {
            ...toolCall.args,
            userId,
            userTimezone: userContext.timezone || 'America/New_York',
          };
          const result = await tool.invoke(argsWithContext);

          return {
            role: 'tool',
            content: result,
            tool_call_id: toolCall.id,
          } as any;
        } catch (error) {
          return {
            role: 'tool',
            content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            tool_call_id: toolCall.id,
          } as any;
        }
      })
    );

    // Only return NEW tool results, not the full message array
    // The state reducer will concat them
    return {
      messages: toolResults,
    };
  }

  // Define routing function
  function shouldContinue(state: AgentState): string {
    const { messages, readyForSynthesis } = state;
    const lastMessage = messages[messages.length - 1];

    // If the analysis node indicated it's ready for synthesis (no more tool calls)
    if (readyForSynthesis) {
      return 'synthesis';
    }

    // Check if there are tool calls to execute
    if (lastMessage && 'tool_calls' in lastMessage && lastMessage.tool_calls?.length) {
      return 'tools';
    }

    // Shouldn't reach here, but just in case
    return END;
  }

  // Build the graph
  const workflow = new StateGraph<AgentState>({
    channels: {
      messages: {
        reducer: (left: BaseMessage[], right: BaseMessage[]) => left.concat(right),
        default: () => [],
      },
      userId: {
        reducer: (left: string, right: string | undefined) => right ?? left,
        default: () => '',
      },
      userContext: {
        reducer: (left: any, right: any) => ({ ...left, ...right }),
        default: () => ({}),
      },
      readyForSynthesis: {
        reducer: (left: boolean, right: boolean | undefined) => right ?? left,
        default: () => false,
      },
      iterationCount: {
        reducer: (left: number, right: number | undefined) => right ?? left,
        default: () => 0,
      },
      contextMetrics: {
        reducer: (left: any[], right: any[] | undefined) => right ? left.concat(right) : left,
        default: () => [],
      },
    },
  });

  // Add nodes
  workflow.addNode('analysis', analysisNode);
  workflow.addNode('tools', toolNode);
  workflow.addNode('synthesis', synthesisNode);

  // Add edges
  workflow.addEdge(START, 'analysis');
  workflow.addConditionalEdges('analysis', shouldContinue, {
    tools: 'tools',
    synthesis: 'synthesis',
    [END]: END,
  });
  workflow.addEdge('tools', 'analysis'); // After tools, go back to analysis
  workflow.addEdge('synthesis', END); // After synthesis, we're done

  return workflow.compile();
}
