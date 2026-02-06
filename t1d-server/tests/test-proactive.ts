/**
 * Test Suite: Proactive Monitor
 * Tests the proactive analysis system (without sending messages)
 */

import { query } from '../src/config/database.js';
import { createConfiguredAgentGraph, createAgentGraph } from '../src/agent/graph.js';
import { HumanMessage } from '@langchain/core/messages';
import {
  runTest,
  TestResult,
  TestSuite,
  assertDefined,
  assertTruthy,
  getTestUser,
} from './test-utils.js';

export async function testProactiveMonitor(): Promise<TestSuite> {
  const suiteStartTime = Date.now();
  const tests: TestResult[] = [];

  const user = await getTestUser(query);

  // Test 1: Data gathering phase (tool-only agent)
  tests.push(
    await runTest('Phase 1: Data gathering with tool-only agent', async () => {
      const toolOnlyAgent = createAgentGraph();

      const analysisPrompt = `Perform glucose data analysis for proactive monitoring. Use available tools to gather data about recent glucose patterns and trends. Call multiple tools in parallel when possible. Maximum 3 iterations.`;

      const stream = await toolOnlyAgent.stream(
        {
          messages: [new HumanMessage(analysisPrompt)],
          userId: user.id,
          userContext: {
            email: user.email,
            timezone: user.timezone || 'America/New_York',
          },
        },
        { streamMode: 'values' }
      );

      let toolCallCount = 0;
      let finalMessage: any = null;

      for await (const chunk of stream) {
        if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
          const messages = chunk.messages;
          if (Array.isArray(messages) && messages.length > 0) {
            const lastMessage = messages[messages.length - 1];

            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
              toolCallCount += lastMessage.tool_calls.length;
            }

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

      assertTruthy(toolCallCount >= 2, `Data gathering should call multiple tools (called ${toolCallCount})`);
      assertDefined(finalMessage, 'Data gathering should produce a summary');
    })
  );

  // Test 2: Decision phase (should decide whether to send)
  tests.push(
    await runTest('Phase 2: Decision making with hybrid agent', async () => {
      const decisionAgent = createConfiguredAgentGraph(undefined, 'proactive');

      const decisionPrompt = `Based on recent glucose data analysis, decide if a proactive message should be sent. Consider:
- Is there something significant worth sharing?
- Has a message been sent recently?
- Is the insight actionable?

Respond with ONLY "SEND" or "DONT_SEND" followed by a brief reason.`;

      const stream = await decisionAgent.stream(
        {
          messages: [new HumanMessage(decisionPrompt)],
          userId: user.id,
          userContext: {
            email: user.email,
            timezone: user.timezone || 'America/New_York',
          },
        },
        { streamMode: 'values' }
      );

      let decision: any = null;

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
              decision = lastMessage.content;
            }
          }
        }
      }

      assertDefined(decision, 'Decision phase should produce a decision');
      assertTruthy(
        typeof decision === 'string' &&
          (decision.includes('SEND') || decision.includes('DONT_SEND')),
        'Decision should contain SEND or DONT_SEND'
      );
    })
  );

  // Test 3: Cooldown check
  tests.push(
    await runTest('Cooldown check (recent message detection)', async () => {
      const recentMessagesResult = await query(
        `SELECT id, sent_at
         FROM sage_messages
         WHERE user_id = $1
           AND sent_at > NOW() - INTERVAL '1 hour'
         ORDER BY sent_at DESC
         LIMIT 1`,
        [user.id]
      );

      // This test always passes - just checking the query works
      const hasRecentMessage = recentMessagesResult.rows.length > 0;
      console.log(
        `    Info: User ${hasRecentMessage ? 'has' : 'does not have'} messages in last hour`
      );
    })
  );

  // Test 4: Recent glucose data check
  tests.push(
    await runTest('Recent glucose data check', async () => {
      const recentDataResult = await query(
        `SELECT COUNT(*) as count
         FROM glucose_readings
         WHERE user_id = $1
           AND timestamp > NOW() - INTERVAL '2 hours'`,
        [user.id]
      );

      const count = parseInt(recentDataResult.rows[0].count);
      assertTruthy(count > 0, `Should have recent glucose data (found ${count} readings)`);
    })
  );

  const totalDuration = Date.now() - suiteStartTime;
  return { name: 'Proactive Monitor', tests, totalDuration };
}
