import { Router } from 'express';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { createAgentGraph } from '../../agent/graph.js';
import { query } from '../../config/database.js';
import type { AuthRequest, User } from '../../types/index.js';

const router = Router();

router.use(authMiddleware);

// Send a message to the AI agent
const chatSchema = z.object({
  message: z.string().min(1).max(10000),
});

router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message } = chatSchema.parse(req.body);

    // Get user context
    const userResult = await query<User>(
      'SELECT email, diagnosis_type, diagnosis_date, timezone FROM users WHERE id = $1',
      [authReq.user!.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = userResult.rows[0];

    // Get recent chat history (last 10 messages)
    const historyResult = await query(
      `SELECT role, content
       FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 10`,
      [authReq.user!.id]
    );

    // Reverse to get chronological order
    const history = historyResult.rows.reverse();

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

    // Save messages to database
    await query(
      `INSERT INTO chat_messages (user_id, role, content, metadata)
       VALUES ($1, 'user', $2, $3), ($1, 'assistant', $4, $5)`,
      [
        authReq.user!.id,
        message,
        JSON.stringify({ timestamp: new Date().toISOString() }),
        responseContent,
        JSON.stringify({
          timestamp: new Date().toISOString(),
          duration,
          toolCalls: assistantMessage.tool_calls?.length || 0,
        }),
      ]
    );

    res.json({
      message: responseContent,
      metadata: {
        duration,
        toolCalls: assistantMessage.tool_calls?.length || 0,
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
       ORDER BY created_at DESC
       LIMIT $2`,
      [authReq.user!.id, parseInt(limit as string)]
    );

    res.json({
      messages: result.rows.reverse(), // Return in chronological order
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
