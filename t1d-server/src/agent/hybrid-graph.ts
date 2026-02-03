import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getHybridAIProvider } from './providers.js';
import { allTools } from './tools.js';
import { SYSTEM_PROMPT, USER_CONTEXT_PROMPT } from './prompts.js';

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
}

/**
 * Create the hybrid AI agent graph
 * Uses small model for tool calling, large model for final message synthesis
 */
export function createHybridAgentGraph() {
  const providers = getHybridAIProvider();
  console.log(`✓ Using hybrid AI providers:`);
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

Your role: Use the available tools to gather and analyze glucose data. Call tools to collect information - you don't need to generate user-facing messages.

User info:
- Email: ${userContext.email}
- Diagnosis: ${userContext.diagnosisType || 'Not specified'}
- Timezone: ${userContext.timezone || 'America/New_York'}

Available data sources:
- Glucose readings and patterns
- Meal/exercise/insulin logs
- Statistical analysis tools
- Trend and anomaly detection

When asked to analyze: Use tools to gather comprehensive data, then respond with "Analysis complete" when you have enough information. The synthesis model will create the user-facing message.`);

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

    // Safety: Limit to 8 iterations maximum (6 suggested in prompt + 2 buffer)
    const currentIteration = state.iterationCount || 0;
    if (currentIteration >= 8) {
      console.log('[analysisNode] Maximum iterations reached (8), forcing synthesis');
      return {
        messages: [new AIMessage('Analysis complete - maximum iterations reached.')],
        readyForSynthesis: true,
        iterationCount: currentIteration + 1,
      };
    }

    console.log(`[analysisNode] Iteration ${currentIteration + 1}/8 - Invoking small model for tool calling/analysis`);

    // Detailed logging to debug context overflow
    console.log(`  State messages count: ${messages.length}`);
    console.log(`  Messages to send count: ${messagesToSend.length}`);

    // Log size of each message type
    const messageSizes = messagesToSend.map((msg, idx) => {
      const type = msg.constructor.name;
      const size = JSON.stringify(msg).length;
      return { idx, type, chars: size, tokens: Math.round(size / 4) };
    });
    const toolMessages = messageSizes.filter(m => m.type === 'ToolMessage');
    const totalSize = JSON.stringify(messagesToSend).length;

    console.log(`  Total context: ${totalSize} chars (~${Math.round(totalSize / 4)} tokens)`);
    console.log(`  Tool messages: ${toolMessages.length}, avg size: ${toolMessages.length > 0 ? Math.round(toolMessages.reduce((sum, m) => sum + m.chars, 0) / toolMessages.length) : 0} chars`);

    if (totalSize > 100000) {
      console.log('  ⚠️  Context very large! Message breakdown:');
      messageSizes.forEach(m => {
        if (m.chars > 10000) {
          console.log(`    [${m.idx}] ${m.type}: ${m.chars} chars (${m.tokens} tokens)`);
        }
      });
    }

    const response = await smallModelWithTools.invoke(messagesToSend);

    // IMPORTANT: Only return NEW messages (not the full array)
    // The state reducer uses concat, so returning the full array causes exponential duplication!
    // We truncate in messagesToSend (what we send to model), but state keeps full history
    return {
      messages: [response],
      readyForSynthesis: !response.tool_calls || response.tool_calls.length === 0,
      iterationCount: currentIteration + 1,
    };
  }

  // Define the synthesis node (uses large model for final message)
  async function synthesisNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userContext } = state;

    console.log('[synthesisNode] Invoking large model for final message synthesis');

    // Transform the conversation for the synthesis model
    // Convert tool_calls + tool_results into a natural format (SystemMessage with context)
    // The large model doesn't have tools bound, so we present data as additional context
    const transformedMessages: BaseMessage[] = [];
    let toolResultsContext = '';

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Keep HumanMessages (user questions)
      if (msg.constructor.name === 'HumanMessage') {
        transformedMessages.push(msg);
        continue;
      }

      // Skip AIMessages with tool_calls (they're internal scaffolding)
      if (msg.constructor.name === 'AIMessage') {
        const content = typeof msg.content === 'string' ? msg.content : '';

        // Skip if it has tool calls or is "Analysis complete"
        if (('tool_calls' in msg && msg.tool_calls && msg.tool_calls.length > 0) ||
            content === 'Analysis complete' || content.length < 20) {
          continue;
        }

        // Keep substantial AI messages (from previous conversation turns)
        if (content.length >= 20) {
          transformedMessages.push(msg);
        }
      }

      // Convert ToolMessages into context (they can't exist without tool_calls)
      if (msg.constructor.name === 'ToolMessage') {
        const toolContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
        toolResultsContext += `\n\nAnalysis Data:\n${toolContent}`;
      }
    }

    // Add accumulated tool results as a system message with context
    if (toolResultsContext) {
      transformedMessages.push(new SystemMessage(`The analysis phase gathered the following data:${toolResultsContext}

Now synthesize this data into a natural, conversational response for the user. Write in plain prose - NO XML tags, NO thinking blocks, NO tool references. Start your response directly with the insights.`));
    }

    console.log(`[synthesisNode] Transformed messages: ${messages.length} → ${transformedMessages.length}`);

    // Create a synthesis-specific system prompt (without tool descriptions)
    const synthesisSystemPrompt = new SystemMessage(`You are Sage, an AI assistant specialized in Type 1 Diabetes (T1D) and LADA management.

## Your Role
You synthesize glucose data analysis into clear, helpful insights for users. The analysis phase has already gathered all necessary data - your job is to present it in a user-friendly way.

## Communication Style
- Be analytical and objective - focus on data, trends, patterns
- Lead with insights, not encouragement
- Explain physiological mechanisms when relevant
- Present specific numbers and comparisons
- Be direct and factual about concerning trends
- Provide actionable recommendations based on the data

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

    const response = await providers.largeModel.invoke(messagesToSend);

    console.log(`[synthesisNode] Response received, length: ${typeof response.content === 'string' ? response.content.length : 0} chars`);
    if (typeof response.content === 'string' && response.content.length > 0) {
      console.log(`[synthesisNode] Content preview: ${response.content.substring(0, 200)}...`);
    }

    // Only return NEW message, not the full array
    return {
      messages: [response],
    };
  }

  // Define the tool execution node
  async function toolNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userId } = state;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || !('tool_calls' in lastMessage) || !lastMessage.tool_calls?.length) {
      return {};
    }

    const toolResults: BaseMessage[] = [];

    for (const toolCall of lastMessage.tool_calls) {
      const tool = allTools.find(t => t.name === toolCall.name);

      if (!tool) {
        toolResults.push({
          role: 'tool',
          content: `Error: Tool ${toolCall.name} not found`,
          tool_call_id: toolCall.id,
        } as any);
        continue;
      }

      try {
        // Add userId to tool arguments
        const argsWithUserId = { ...toolCall.args, userId };
        const result = await tool.invoke(argsWithUserId);

        toolResults.push({
          role: 'tool',
          content: result,
          tool_call_id: toolCall.id,
        } as any);
      } catch (error) {
        toolResults.push({
          role: 'tool',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          tool_call_id: toolCall.id,
        } as any);
      }
    }

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

    console.log('[shouldContinue] Evaluating routing:');
    console.log('  - readyForSynthesis:', readyForSynthesis);
    console.log('  - Has tool_calls:', (lastMessage as any)?.tool_calls?.length || 0);

    // If the analysis node indicated it's ready for synthesis (no more tool calls)
    if (readyForSynthesis) {
      console.log('  → Routing to synthesis (using large model)');
      return 'synthesis';
    }

    // Check if there are tool calls to execute
    if (lastMessage && 'tool_calls' in lastMessage && lastMessage.tool_calls?.length) {
      console.log('  → Routing to tools');
      return 'tools';
    }

    // Shouldn't reach here, but just in case
    console.log('  → Routing to END');
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
