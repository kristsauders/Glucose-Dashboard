import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAIProvider } from './providers.js';
import { allTools } from './tools.js';
import { SYSTEM_PROMPT, USER_CONTEXT_PROMPT } from './prompts.js';
import { createHybridAgentGraph } from './hybrid-graph.js';
import { env } from '../config/env.js';

interface AgentState {
  messages: BaseMessage[];
  userId: string;
  userContext: {
    email: string;
    diagnosisType?: string;
    diagnosisDate?: string;
    timezone?: string;
  };
}

/**
 * Create the AI agent graph
 */
export function createAgentGraph(forceProvider?: 'ollama' | 'openrouter') {
  const provider = getAIProvider(forceProvider);
  console.log(`✓ Using AI provider: ${provider.name}`);

  // Bind tools to the model
  // Use different method depending on what's available (older vs newer LangChain versions)
  console.log(`  Binding ${allTools.length} tools to model`);
  console.log(`  Tool names: ${allTools.map(t => t.name).join(', ')}`);
  console.log(`  Using bindTools method: ${typeof provider.model.bindTools === 'function'}`);

  const modelWithTools = typeof provider.model.bindTools === 'function'
    ? provider.model.bindTools(allTools)
    : provider.model.bind({ tools: allTools });

  // Define the agent node
  async function agentNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userContext } = state;

    // Only add system prompts if this is the first turn (no AI messages yet)
    // This prevents overwhelming context in multi-turn conversations
    const hasAIMessages = messages.some(m => m.constructor.name === 'AIMessage');

    let messagesToSend: BaseMessage[];
    if (!hasAIMessages) {
      // First turn: add full system prompts
      const systemMessages = [
        new SystemMessage(SYSTEM_PROMPT),
        new SystemMessage(USER_CONTEXT_PROMPT(userContext)),
      ];
      messagesToSend = [...systemMessages, ...messages];
    } else {
      // Continuation: just use conversation history
      // The model already has context from previous turns
      messagesToSend = messages;
    }

    const response = await modelWithTools.invoke(messagesToSend);

    return {
      messages: [...messages, response],
    };
  }

  // Define the tool execution node
  async function toolNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userId, userContext } = state;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || !('tool_calls' in lastMessage) || !lastMessage.tool_calls?.length) {
      return {};
    }

    console.log(`[toolNode] Executing ${lastMessage.tool_calls.length} tool(s) in parallel`);

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

    console.log(`[toolNode] Completed ${toolResults.length} tool execution(s)`);

    return {
      messages: [...messages, ...toolResults],
    };
  }

  // Define routing function
  function shouldContinue(state: AgentState): string {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];

    console.log('[shouldContinue] Evaluating last message:');
    console.log('  - Message type:', lastMessage?.constructor.name);
    console.log('  - Has tool_calls property:', 'tool_calls' in (lastMessage || {}));
    console.log('  - tool_calls value:', (lastMessage as any)?.tool_calls);
    console.log('  - tool_calls length:', (lastMessage as any)?.tool_calls?.length || 0);

    if (!lastMessage || !('tool_calls' in lastMessage) || !lastMessage.tool_calls?.length) {
      console.log('  → Routing to END (no tool calls)');
      return END;
    }

    console.log('  → Routing to tools');
    return 'tools';
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
    },
  });

  // Add nodes
  workflow.addNode('agent', agentNode);
  workflow.addNode('tools', toolNode);

  // Add edges
  workflow.addEdge(START, 'agent');
  workflow.addConditionalEdges('agent', shouldContinue, {
    tools: 'tools',
    [END]: END,
  });
  workflow.addEdge('tools', 'agent');

  return workflow.compile();
}

/**
 * Create the appropriate agent graph based on configuration
 * - If AI_PROVIDER is 'hybrid', use hybrid graph (small model for tools, large for synthesis)
 * - Otherwise, use standard single-model graph
 */
export function createConfiguredAgentGraph(forceProvider?: 'ollama' | 'openrouter' | 'hybrid') {
  const provider = forceProvider || env.AI_PROVIDER;

  if (provider === 'hybrid') {
    return createHybridAgentGraph();
  } else {
    return createAgentGraph(provider as 'ollama' | 'openrouter');
  }
}
