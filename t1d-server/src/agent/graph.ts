import { StateGraph, END, START } from '@langchain/langgraph';
import { BaseMessage, HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { getAIProvider } from './providers.js';
import { allTools } from './tools.js';
import { SYSTEM_PROMPT, USER_CONTEXT_PROMPT } from './prompts.js';

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
export function createAgentGraph() {
  const provider = getAIProvider();
  console.log(`✓ Using AI provider: ${provider.name}`);

  // Bind tools to the model
  const modelWithTools = provider.model.bind({ tools: allTools });

  // Define the agent node
  async function agentNode(state: AgentState): Promise<Partial<AgentState>> {
    const { messages, userContext } = state;

    // Add system prompt and user context
    const systemMessages = [
      new SystemMessage(SYSTEM_PROMPT),
      new SystemMessage(USER_CONTEXT_PROMPT(userContext)),
    ];

    const response = await modelWithTools.invoke([...systemMessages, ...messages]);

    return {
      messages: [...messages, response],
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

    return {
      messages: [...messages, ...toolResults],
    };
  }

  // Define routing function
  function shouldContinue(state: AgentState): string {
    const { messages } = state;
    const lastMessage = messages[messages.length - 1];

    if (!lastMessage || !('tool_calls' in lastMessage) || !lastMessage.tool_calls?.length) {
      return END;
    }

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
