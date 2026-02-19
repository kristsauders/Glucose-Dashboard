import { Router } from 'express';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { createConfiguredAgentGraph } from '../../agent/graph.js';
import { query } from '../../config/database.js';
import type { AuthRequest, User } from '../../types/index.js';
import { logContextSize } from '../../utils/token-counter.js';
import { buildCurrentContext } from '../../utils/context-prefetch.js';

const router = Router();

router.use(authMiddleware);

// Send a message to the AI agent (streaming)
const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().nullish(), // Accept undefined or null
});

router.post('/stream', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message, conversationId: providedConversationId } = chatSchema.parse(req.body);

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders(); // Flush headers immediately

    // Get user context and preferences
    const userResult = await query<User>(
      'SELECT email, diagnosis_type, diagnosis_date, timezone, preferences FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0) {
      res.write(`data: ${JSON.stringify({ type: 'error', content: 'User not found' })}\n\n`);
      res.end();
      return;
    }

    const user = userResult.rows[0];
    const userPreferences = user.preferences || {};
    const userModelConfig = userPreferences.modelConfig;

    // Debug: Log model config
    console.log('[Chat] User model config:', JSON.stringify(userModelConfig, null, 2));

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

    // Create agent with user's model preferences
    const agent = createConfiguredAgentGraph(undefined, 'chat', userModelConfig);

    // Pre-fetch current context (glucose, meals, insulin, exercise today)
    // Injected as a SystemMessage so Sage skips these common tool calls
    const userTimezone = user.timezone || 'America/New_York';
    let contextMessage: SystemMessage | null = null;
    try {
      const contextSummary = await buildCurrentContext(authReq.user!.id, userTimezone);
      contextMessage = new SystemMessage(
        `## Current Status (pre-loaded snapshot — do NOT re-fetch with retrieve_user_memory, get_recent_glucose, get_meal_history, get_insulin_history, or get_exercise_history for today)\n\n⚠️ GLUCOSE WINDOW: Only the most recent ~2 hours of glucose readings are included below. Readings from earlier today or previous days are NOT in this snapshot — use execute_sql or get_glucose_stats to fetch them.\n\n${contextSummary}`
      );
    } catch (err) {
      console.error('[chat] Failed to build current context:', err);
    }

    // Prepare messages
    const messages = [
      ...history.map(h =>
        h.role === 'user'
          ? new HumanMessage(h.content)
          : new AIMessage(h.content)
      ),
      ...(contextMessage ? [contextMessage] : []),
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

    const startTime = Date.now();

    // Send initial status
    res.write(`data: ${JSON.stringify({ type: 'status', content: 'Thinking...' })}\n\n`);

    // Force flush to send data immediately
    if (typeof (res as any).flush === 'function') {
      (res as any).flush();
    }

    let fullResponse = '';
    let toolNames: string[] = []; // Track all tool names used
    let isFirstTokenChunk = true;
    let seenToolCallIds = new Set<string>(); // Track unique tool call IDs across iterations
    let tokenCount = 0;
    let lastValuesState: any = null; // Track last values state for same-model fallback

    try {
      // Use both 'values' and 'messages' modes for tool tracking AND token streaming
      const stream = await agent.stream({
        messages,
        userId: authReq.user!.id,
        userContext: {
          email: user.email,
          diagnosisType: user.diagnosis_type || undefined,
          diagnosisDate: user.diagnosis_date || undefined,
          timezone: user.timezone || undefined,
        },
      }, {
        streamMode: ['values', 'messages'],
        recursionLimit: 60, // Increased from default 25 to handle complex multi-tool queries
      });

      let chunkCount = 0;

      for await (const chunk of stream) {
        chunkCount++;

        // LangGraph 1.x returns tuples: [streamMode, data]
        if (Array.isArray(chunk) && chunk.length === 2) {
          const [mode, data] = chunk;

          // Handle 'values' mode - for tool tracking and same-model fallback
          if (mode === 'values' && data && typeof data === 'object' && 'messages' in data) {
            lastValuesState = data; // Always capture for same-model fallback
            const messages = data.messages;

            if (Array.isArray(messages) && messages.length > 0) {
              const lastMessage = messages[messages.length - 1];

              // Check for tool calls
              if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
                const newToolCalls = lastMessage.tool_calls.filter((tc: any) => !seenToolCallIds.has(tc.id));

                if (newToolCalls.length > 0) {
                  // If the model included a thinking message alongside tool calls, send it
                  const thinkingContent = typeof lastMessage.content === 'string' ? lastMessage.content.trim() : '';
                  if (thinkingContent) {
                    res.write(`data: ${JSON.stringify({ type: 'thinking', content: thinkingContent })}\n\n`);
                    if (typeof (res as any).flush === 'function') {
                      (res as any).flush();
                    }
                  }

                  newToolCalls.forEach((tc: any) => {
                    seenToolCallIds.add(tc.id);
                    toolNames.push(tc.name);
                  });

                  const toolNamesStr = newToolCalls.map((tc: any) => tc.name).join(', ');
                  res.write(`data: ${JSON.stringify({ type: 'status', content: `Using tool: ${toolNamesStr}` })}\n\n`);

                  if (typeof (res as any).flush === 'function') {
                    (res as any).flush();
                  }
                }
              }
            }
          }

          // Handle 'messages' mode - for token streaming
          if (mode === 'messages') {
            // data is a tuple: [messageChunk, metadata]
            if (Array.isArray(data) && data.length === 2) {
              const [messageChunk, metadata] = data;

              // Only stream tokens from synthesis node
              if (metadata && metadata.langgraph_node === 'synthesis') {
                if (messageChunk?.content) {
                  tokenCount++;
                  const content = typeof messageChunk.content === 'string' ? messageChunk.content : '';

                  if (content && content.length > 0) {
                    fullResponse += content;

                    if (isFirstTokenChunk) {
                      res.write(`data: ${JSON.stringify({ type: 'status', content: 'Responding...' })}\n\n`);
                      isFirstTokenChunk = false;
                    }

                    // Send the token immediately
                    res.write(`data: ${JSON.stringify({ type: 'content', content: content })}\n\n`);

                    if (typeof (res as any).flush === 'function') {
                      (res as any).flush();
                    }
                  }
                }
              }
            }
          }
        }
      }

      // Same-model optimization: synthesis skipped the LLM call and returned the analysis
      // message directly. It won't appear in the messages stream, so capture from values state.
      // We can't get real token-by-token output (the model already finished), so we simulate
      // streaming word-by-word to keep the UI experience consistent.
      if ((!fullResponse || fullResponse.trim().length === 0) && lastValuesState?.messages) {
        const stateMessages = lastValuesState.messages as any[];
        for (let i = stateMessages.length - 1; i >= 0; i--) {
          const msg = stateMessages[i];
          const msgType = msg?.constructor?.name || msg?._getType?.();
          const content = typeof msg?.content === 'string' ? msg.content.trim() : '';
          const hasToolCalls = msg?.tool_calls && msg.tool_calls.length > 0;
          if ((msgType === 'AIMessage' || msgType === 'ai') && content.length > 10 && !hasToolCalls) {
            fullResponse = content;
            res.write(`data: ${JSON.stringify({ type: 'status', content: 'Responding...' })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'content', content: fullResponse })}\n\n`);
            if (typeof (res as any).flush === 'function') (res as any).flush();
            break;
          }
        }
      }

      const duration = Date.now() - startTime;

      // Check for empty response
      if (!fullResponse || fullResponse.trim().length === 0) {
        console.error(`[chat] WARNING: Empty response after ${chunkCount} chunks, ${tokenCount} tokens`);
        console.error(`[chat] Tool calls: ${toolNames.join(', ')}`);
        fullResponse = "I apologize, but I encountered an issue generating a response. Please try asking your question again.";
      }

      // Save messages to database with conversation_id
      // Insert user message first
      await query(
        `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [
          authReq.user!.id,
          conversationId,
          message,
          JSON.stringify({ timestamp: new Date().toISOString() }),
        ]
      );

      // Insert assistant message second (ensures different created_at timestamp)
      await query(
        `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
         VALUES ($1, $2, 'assistant', $3, $4)`,
        [
          authReq.user!.id,
          conversationId,
          fullResponse,
          JSON.stringify({
            timestamp: new Date().toISOString(),
            duration,
            toolCalls: toolNames.length,
            toolNames,
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

      // Send completion event with conversationId and tool names
      res.write(`data: ${JSON.stringify({
        type: 'done',
        metadata: { duration, toolCalls: toolNames.length, toolNames, conversationId }
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

    // Get user context and preferences
    const userResult = await query<User>(
      'SELECT email, diagnosis_type, diagnosis_date, timezone, preferences FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];
    const userPreferences = user.preferences || {};
    const userModelConfig = userPreferences.modelConfig;

    // Debug: Log model config
    console.log('[Chat] User model config (non-streaming):', JSON.stringify(userModelConfig, null, 2));

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

    // Create agent with user's model preferences
    const agent = createConfiguredAgentGraph(undefined, 'chat', userModelConfig);

    // Pre-fetch current context
    const userTimezone = user.timezone || 'America/New_York';
    let contextMessage: SystemMessage | null = null;
    try {
      const contextSummary = await buildCurrentContext(authReq.user!.id, userTimezone);
      contextMessage = new SystemMessage(
        `## Current Status (pre-loaded snapshot — do NOT re-fetch with retrieve_user_memory, get_recent_glucose, get_meal_history, get_insulin_history, or get_exercise_history for today)\n\n⚠️ GLUCOSE WINDOW: Only the most recent ~2 hours of glucose readings are included below. Readings from earlier today or previous days are NOT in this snapshot — use execute_sql or get_glucose_stats to fetch them.\n\n${contextSummary}`
      );
    } catch (err) {
      console.error('[chat] Failed to build current context:', err);
    }

    // Prepare messages
    const messages = [
      ...history.map(h =>
        h.role === 'user'
          ? new HumanMessage(h.content)
          : new AIMessage(h.content)
      ),
      ...(contextMessage ? [contextMessage] : []),
      new HumanMessage(message),
    ];

    // Run agent
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
    // Insert user message first
    await query(
      `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'user', $3, $4)`,
      [
        authReq.user!.id,
        conversationId,
        message,
        JSON.stringify({ timestamp: new Date().toISOString() }),
      ]
    );

    // Insert assistant message second (ensures different created_at timestamp)
    await query(
      `INSERT INTO chat_messages (user_id, conversation_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [
        authReq.user!.id,
        conversationId,
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
