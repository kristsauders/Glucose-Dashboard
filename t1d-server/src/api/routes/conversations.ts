import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { query } from '../../config/database.js';
import type { AuthRequest, Conversation, ConversationWithMessages } from '../../types/index.js';

const router = Router();

router.use(authMiddleware);

// Get all conversations for the user
router.get('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<Conversation>(
      `SELECT
        c.id,
        c.user_id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(cm.id) as message_count
       FROM conversations c
       LEFT JOIN chat_messages cm ON cm.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
      [authReq.user!.id]
    );

    res.json({
      conversations: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    next(error);
  }
});

// Create new conversation
router.post('/', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    const result = await query<Conversation>(
      `INSERT INTO conversations (user_id, title)
       VALUES ($1, NULL)
       RETURNING id, user_id, title, created_at, updated_at`,
      [authReq.user!.id]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get conversation with messages
router.get('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    // Get conversation
    const convResult = await query<Conversation>(
      `SELECT id, user_id, title, created_at, updated_at
       FROM conversations
       WHERE id = $1 AND user_id = $2`,
      [id, authReq.user!.id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get messages
    const messagesResult = await query(
      `SELECT id, user_id, conversation_id, role, content, metadata, created_at
       FROM chat_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC, id ASC`,
      [id]
    );

    const response: ConversationWithMessages = {
      ...convResult.rows[0],
      messages: messagesResult.rows,
    };

    res.json(response);
  } catch (error) {
    next(error);
  }
});

// Update conversation title
const updateTitleSchema = z.object({
  title: z.string().min(1).max(100),
});

router.patch('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;
    const { title } = updateTitleSchema.parse(req.body);

    const result = await query<Conversation>(
      `UPDATE conversations
       SET title = $1, updated_at = NOW()
       WHERE id = $2 AND user_id = $3
       RETURNING id, user_id, title, created_at, updated_at`,
      [title, id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Delete conversation
router.delete('/:id', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { id } = req.params;

    const result = await query(
      `DELETE FROM conversations
       WHERE id = $1 AND user_id = $2
       RETURNING id`,
      [id, authReq.user!.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
