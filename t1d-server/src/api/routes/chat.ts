import { Router } from 'express';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { createAgentGraph } from '../../agent/graph.js';
import { query } from '../../config/database.js';
import type { AuthRequest, User } from '../../types/index.js';
import { logContextSize } from '../../utils/token-counter.js';

const router = Router();

router.use(authMiddleware);

// Send a message to the AI agent (streaming)
const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
});

router.post('/stream', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message, conversationId: providedConversationId } = chatSchema.parse(req.body);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Get user context
    const userResult = await query<User>(
      'SELECT email, diagnosis_type, diagnosis_date, timezone FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'User not found' })}\n\n`);
      res.end();
      return;
    }

    const user = userResult.rows[0];

    // Get or create conversation
    let conversationId = providedConversationId;
    if (!conversationId) {
      // Create new conversation
      const convResult = await query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, NULL)
         RETURNING id`,
        [authReq.user!.id]
      );
      conversationId = convResult.rows[0].id;
    } else {
      // Verify conversation belongs to user
      const verifyResult = await query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, authReq.user!.id]
      );
      if (verifyResult.rows.length === 0) {
        res.write(`data: ${JSON.stringify({ type: 'error', content: 'Conversation not found' })}\n\n`);
        res.end();
        return;
      }
    }

    // Get recent chat history from this conversation (last 10 messages)
    const historyResult = await query(
      `SELECT role, content
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [conversationId]
    );

    const history = historyResult.rows.reverse();
    const isFirstMessage = history.length === 0;

    // Create agent
    const agent = createAgentGraph();

    // Prepare messages
    const messages = [
      ...history.map(h =>
        h.role === 'user'
          ? new HumanMessage(h.content)
          : new AIMessage(h.content)
      ),
      new HumanMessage(message),
    ];

    // Log context size for monitoring
    logContextSize(messages, {
      email: user.email,
      diagnosisType: user.diagnosis_type || undefined,
      diagnosisDate: user.diagnosis_date || undefined,
      timezone: user.timezone || undefined,
    }, {
      label: 'Chat Request',
      isFirstMessage,
    });

    console.log(`Running streaming agent for user ${authReq.user!.id}...`);
    const startTime = Date.now();

    // Send initial status
    res.write(`data: ${JSON.stringify({ type: 'status', content: 'Thinking...' })}\n\n`);

    let fullResponse = '';
    let toolCallCount = 0;
    let isFirstChunk = true;

    try {
      // Use stream() for content streaming
      const stream = await agent.stream({
        messages,
        userId: authReq.user!.id,
        userContext: {
          email: user.email,
          diagnosisType: user.diagnosis_type || undefined,
          diagnosisDate: user.diagnosis_date || undefined,
          timezone: user.timezone || undefined,
        },
      });

      let lastContent = '';
      let chunkCount = 0;
      let aiMessageCount = 0; // Track how many AI messages we've seen

      for await (const chunk of stream) {
        chunkCount++;

        // Debug: Log chunk structure (only first few chunks)
        if (chunkCount <= 3) {
          console.log('Chunk', chunkCount, 'keys:', Object.keys(chunk));
          console.log('Chunk', chunkCount, 'structure:', JSON.stringify(chunk, null, 2).substring(0, 500));
        }

        // LangGraph streams chunks keyed by node name (agent or tools)
        const nodeUpdate = chunk.agent || chunk.tools;

        if (!nodeUpdate) {
          if (chunkCount <= 5) {
            console.log('Warning: No nodeUpdate found in chunk', chunkCount);
          }
          continue;
        }

        if (nodeUpdate && nodeUpdate.messages && nodeUpdate.messages.length > 0) {
          if (chunkCount <= 3) {
            console.log('Chunk', chunkCount, 'has', nodeUpdate.messages.length, 'messages');
          }

          const lastMessage = nodeUpdate.messages[nodeUpdate.messages.length - 1];

          // Process both AIMessage and AIMessageChunk instances
          const isAIMessage = lastMessage.constructor.name === 'AIMessage' ||
                             lastMessage.constructor.name === 'AIMessageChunk';

          if (chunkCount <= 5) {
            console.log('Chunk', chunkCount, 'message type:', lastMessage.constructor.name, 'has content:', !!lastMessage.content, 'content length:', lastMessage.content?.length || 0);
            if (lastMessage.content) {
              console.log('Chunk', chunkCount, 'content preview:', JSON.stringify(lastMessage.content).substring(0, 100));
            }
          }

          if (isAIMessage) {
            // Track AI message count
            aiMessageCount++;

            // Debug tool calls
            if (chunkCount <= 5) {
              console.log('Chunk', chunkCount, 'tool_calls:', lastMessage.tool_calls);
              console.log('Chunk', chunkCount, 'tool_calls length:', lastMessage.tool_calls?.length || 0);
            }

            // Check for tool calls
            if (lastMessage.tool_calls && lastMessage.tool_calls.length > 0) {
              const newToolCalls = lastMessage.tool_calls.length - toolCallCount;
              if (newToolCalls > 0) {
                toolCallCount = lastMessage.tool_calls.length;
                const toolNames = lastMessage.tool_calls.slice(-newToolCalls).map((tc: any) => tc.name).join(', ');
                res.write(`data: ${JSON.stringify({ type: 'status', content: `Using tool: ${toolNames}` })}\n\n`);
              }
            }

            // Only stream content from the FINAL AI message (no tool calls = final message)
            const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

            if (isFinalMessage && lastMessage.content && typeof lastMessage.content === 'string') {
              const currentContent = lastMessage.content;

              // Reset lastContent when we get to the final message (ignore intermediate messages)
              if (aiMessageCount > 1 && lastContent.length === 0) {
                // This is the first content of the final message after tool calls
                lastContent = '';
              }

              if (currentContent.length > lastContent.length) {
                const delta = currentContent.slice(lastContent.length);
                lastContent = currentContent;
                fullResponse = currentContent;

                if (isFirstChunk) {
                  res.write(`data: ${JSON.stringify({ type: 'status', content: 'Responding...' })}\n\n`);
                  isFirstChunk = false;
                }

                res.write(`data: ${JSON.stringify({ type: 'content', content: delta })}\n\n`);
              }
            }
          }
        }
      }

      console.log('\n=== Stream Complete ===');
      console.log('Total chunks:', chunkCount);
      console.log('Final fullResponse length:', fullResponse.length);
      console.log('Full response preview:', fullResponse.substring(0, 200));

      const duration = Date.now() - startTime;
      console.log(`✓ Streaming agent completed in ${duration}ms`);

      // Save messages to database with conversation_id
      await query(
        `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
         VALUES ($1, $2, 'user', $3, $4), ($1, $2, 'assistant', $5, $6)`,
        [
          authReq.user!.id,
          conversationId,
          message,
          JSON.stringify({ timestamp: new Date().toISOString() }),
          fullResponse,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            duration,
            toolCalls: toolCallCount,
          }),
        ]
      );

      // Update conversation timestamp and generate title if first message
      if (isFirstMessage) {
        const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
        await query(
          `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
          [title, conversationId]
        );
      } else {
        await query(
          `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
          [conversationId]
        );
      }

      // Send completion event with conversationId
      res.write(`data: ${JSON.stringify({
        type: 'done',
        metadata: { duration, toolCalls: toolCallCount, conversationId }
      })}\n\n`);

    } catch (error) {
      console.error('Streaming error:', error);
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'Failed to generate response' })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('Chat stream error:', error);
    next(error);
  }
});

// Send a message to the AI agent (non-streaming, kept for backwards compatibility)
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message, conversationId: providedConversationId } = chatSchema.parse(req.body);

    // Get user context
    const userResult = await query<User>(
      'SELECT email, diagnosis_type, diagnosis_date, timezone FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get or create conversation
    let conversationId = providedConversationId;
    if (!conversationId) {
      const convResult = await query(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, NULL)
         RETURNING id`,
        [authReq.user!.id]
      );
      conversationId = convResult.rows[0].id;
    } else {
      // Verify conversation belongs to user
      const verifyResult = await query(
        'SELECT id FROM conversations WHERE id = $1 AND user_id = $2',
        [conversationId, authReq.user!.id]
      );
      if (verifyResult.rows.length === 0) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
    }

    // Get recent chat history from this conversation (last 10 messages)
    const historyResult = await query(
      `SELECT role, content
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [conversationId]
    );

    // Reverse to get chronological order
    const history = historyResult.rows.reverse();
    const isFirstMessage = history.length === 0;

    // Create agent
    const agent = createAgentGraph();

    // Prepare messages
    const messages = [
      ...history.map(h =>
        h.role === 'user'
          ? new HumanMessage(h.content)
          : new AIMessage(h.content)
      ),
      new HumanMessage(message),
    ];

    // Run agent
    console.log(`Running agent for user ${authReq.user!.id}...`);
    const startTime = Date.now();

    const result = await agent.invoke({
      messages,
      userId: authReq.user!.id,
      userContext: {
        email: user.email,
        diagnosisType: user.diagnosis_type || undefined,
        diagnosisDate: user.diagnosis_date || undefined,
        timezone: user.timezone || undefined,
      },
    });

    const duration = Date.now() - startTime;
    console.log(`✓ Agent completed in ${duration}ms`);

    // Get the assistant's response
    const assistantMessage = result.messages[result.messages.length - 1];
    const responseContent = typeof assistantMessage.content === 'string'
      ? assistantMessage.content
      : JSON.stringify(assistantMessage.content);

    // Count all tool calls across all messages
    const totalToolCalls = result.messages.filter((m: any) =>
      m.role === 'tool' || (m.tool_calls && m.tool_calls.length > 0)
    ).length;

    // Save messages to database with conversation_id
    await query(
      `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'user', $3, $4), ($1, $2, 'assistant', $5, $6)`,
      [
        authReq.user!.id,
        conversationId,
        message,
        JSON.stringify({ timestamp: new Date().toISOString() }),
        responseContent,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          duration,
          toolCalls: totalToolCalls,
        }),
      ]
    );

    // Update conversation timestamp and generate title if first message
    if (isFirstMessage) {
      const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
      await query(
        `UPDATE conversations SET title = $1, updated_at = NOW() WHERE id = $2`,
        [title, conversationId]
      );
    } else {
      await query(
        `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
        [conversationId]
      );
    }

    res.json({
      message: responseContent,
      metadata: {
        duration,
        toolCalls: totalToolCalls,
        conversationId,
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    next(error);
  }
});

// Get chat history
router.get('/history', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { limit = '50' } = req.query;

    const result = await query(
      `SELECT id, role, content, metadata, created_at
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [authReq.user!.id, parseInt(limit as string)]
    );

    res.json({
      messages: result.rows, // Already in chronological order
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

// Clear chat history
router.delete('/history', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    await query(
      'DELETE FROM chat_messages WHERE user_id = $1',
      [authReq.user!.id]
    );

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
