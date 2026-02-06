/**
 * Test Suite: Agent Graph
 * Tests the AI agent with real tool calls and synthesis
 */

import { HumanMessage } from '@langchain/core/messages';
import { createConfiguredAgentGraph } from '../src/agent/graph.js';
import { query } from '../src/config/database.js';
import {
  runTest,
  TestResult,
  TestSuite,
  assertDefined,
  assertTruthy,
  getTestUser,
} from './test-utils.js';

export async function testAgent(): Promise<TestSuite> {
  const suiteStartTime = Date.now();
  const tests: TestResult[] = [];

  const user = await getTestUser(query);
  const userContext = {
    email: user.email,
    diagnosisType: 'LADA',
    timezone: user.timezone,
  };

  // Test 1: Simple question (should use tools)
  tests.push(
    await runTest('Simple question with tools', async () => {
      const agent = createConfiguredAgentGraph();

      const stream = await agent.stream(
        {
          messages: [new HumanMessage('What was my average glucose yesterday?')],
          userId: user.id,
          userContext,
        },
        { streamMode: 'values' }
      );

      let finalMessage: any = null;
      let toolCallCount = 0;

      for await (const chunk of stream) {
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          const messages = chunk.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];

            // Count tool calls
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
              toolCallCount += lastMessage.tool_calls.length;
            }

            // Get final AI message
            const isAIMessage =
              lastMessage.constructor?.name === 'AIMessage' ||
              lastMessage.constructor?.name === 'AIMessageChunk';
            const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

            if (isAIMessage && isFinalMessage && lastMessage.content) {
              finalMessage = lastMessage.content;
            }
          }
        }
      }

      assertTruthy(toolCallCount > 0, 'Agent should have called at least one tool');
      assertDefined(finalMessage, 'Agent should have produced a final response');
      assertTruthy(
        typeof finalMessage === 'string' && finalMessage.length > 0,
        'Final message should be non-empty string'
      );
    })
  );

  // Test 2: Multi-turn conversation
  tests.push(
    await runTest('Multi-turn conversation', async () => {
      const agent = createConfiguredAgentGraph();

      // First turn
      const stream1 = await agent.stream(
        {
          messages: [new HumanMessage('What was my TIR this week?')],
          userId: user.id,
          userContext,
        },
        { streamMode: 'values' }
      );

      let messages1: any[] = [];
      for await (const chunk of stream1) {
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          messages1 = chunk.messages;
        }
      }

      assertTruthy(messages1.length > 0, 'First turn should produce messages');

      // Second turn (follow-up question)
      const stream2 = await agent.stream(
        {
          messages: [...messages1, new HumanMessage('How does that compare to last week?')],
          userId: user.id,
          userContext,
        },
        { streamMode: 'values' }
      );

      let finalMessage2: any = null;
      for await (const chunk of stream2) {
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          const messages = chunk.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];
            const isAIMessage =
              lastMessage.constructor?.name === 'AIMessage' ||
              lastMessage.constructor?.name === 'AIMessageChunk';
            const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

            if (isAIMessage && isFinalMessage && lastMessage.content) {
              finalMessage2 = lastMessage.content;
            }
          }
        }
      }

      assertDefined(finalMessage2, 'Second turn should produce a response');
    })
  );

  // Test 3: Hybrid agent (if configured)
  tests.push(
    await runTest('Hybrid agent (small + large model)', async () => {
      try {
        const agent = createConfiguredAgentGraph('hybrid');

        const stream = await agent.stream(
          {
            messages: [new HumanMessage('Analyze my overnight glucose patterns')],
            userId: user.id,
            userContext,
          },
          { streamMode: 'values' }
        );

        let finalMessage: any = null;
        for await (const chunk of stream) {
          if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
            const messages = chunk.messages;
            if (Array.isArray(messages) && messages.length > 0) {
              const lastMessage = messages[messages.length - 1];
              const isAIMessage =
                lastMessage.constructor?.name === 'AIMessage' ||
                lastMessage.constructor?.name === 'AIMessageChunk';
              const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

              if (isAIMessage && isFinalMessage && lastMessage.content) {
                finalMessage = lastMessage.content;
              }
            }
          }
        }

        assertDefined(finalMessage, 'Hybrid agent should produce a response');
      } catch (error: any) {
        if (error.message?.includes('not configured')) {
          throw new Error('Skipped: hybrid mode not configured');
        }
        throw error;
      }
    })
  );

  const totalDuration = Date.now() - suiteStartTime;
  return { name: 'Agent Graph', tests, totalDuration };
}
