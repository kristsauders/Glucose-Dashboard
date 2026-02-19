import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { audioService } from '../../services/audio-service.js';
import { createConfiguredAgentGraph } from '../../agent/graph.js';
import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import type { AuthRequest } from '../../types/index.js';
import { query } from '../../config/database.js';
import { getVoiceModel } from '../../agent/providers.js';
import { buildCurrentContext } from '../../utils/context-prefetch.js';
import { logMealTool, logInsulinTool, logExerciseTool } from '../../agent/tools.js';

const router = Router();

// Configure multer for file uploads (in-memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files
    const allowedMimes = [
      'audio/webm',
      'audio/mpeg',
      'audio/mp4',
      'audio/wav',
      'audio/ogg',
      'audio/flac',
      'audio/x-m4a'
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

router.use(authMiddleware);

// Check if voice service is configured
router.get('/status', (req, res) => {
  const isConfigured = audioService.isConfigured();
  res.json({
    configured: isConfigured,
    features: {
      transcription: isConfigured,
      synthesis: isConfigured,
      voiceChat: isConfigured
    }
  });
});

// POST /api/voice/transcribe - Transcribe audio to text
router.post('/transcribe', upload.single('audio'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    if (!audioService.isConfigured()) {
      return res.status(503).json({ error: 'Voice service not configured' });
    }

    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname || 'audio.webm';

    const result = await audioService.transcribeAudio(audioBuffer, filename);

    res.json({
      success: true,
      transcript: result.text,
      language: result.language,
      duration: result.duration
    });
  } catch (error) {
    console.error('[Voice API] Transcription error:', error);
    next(error);
  }
});

// POST /api/voice/synthesize - Convert text to speech
const synthesizeSchema = z.object({
  text: z.string().min(1).max(4096),
  voice: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
});

router.post('/synthesize', async (req, res, next) => {
  try {
    const { text, voice, speed } = synthesizeSchema.parse(req.body);

    if (!audioService.isConfigured()) {
      return res.status(503).json({ error: 'Voice service not configured' });
    }

    const audioBuffer = await audioService.synthesizeSpeech(text, {
      voice,
      speed,
      model: 'tts-1-hd'
    });

    // Send audio as response
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', audioBuffer.length);
    res.send(audioBuffer);
  } catch (error) {
    console.error('[Voice API] Synthesis error:', error);
    next(error);
  }
});

// POST /api/voice/chat - Full voice chat: transcribe -> process -> synthesize
router.post('/chat', upload.single('audio'), async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;

    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    if (!audioService.isConfigured()) {
      return res.status(503).json({ error: 'Voice service not configured' });
    }

    // Parse optional parameters
    const voice = req.body.voice || 'nova';
    const conversationId = req.body.conversationId || null;

    const audioBuffer = req.file.buffer;
    const filename = req.file.originalname || 'audio.webm';
    const userId = authReq.user!.id;

    // Get user context
    const userResult = await query(
      'SELECT email, diagnosis_type, diagnosis_date, timezone FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    // Get recent chat history from this conversation (last 10 messages)
    let history: any[] = [];
    if (conversationId) {
      const historyResult = await query(
        `SELECT role, content
         FROM chat_messages
         WHERE conversation_id = $1
         ORDER BY created_at DESC
         LIMIT 10`,
        [conversationId]
      );
      history = historyResult.rows.reverse();
    }

    // Create agent instance
    const agent = createConfiguredAgentGraph();

    // Process voice chat
    const result = await audioService.processVoiceChat(
      audioBuffer,
      filename,
      async (transcript: string) => {
        // Process through agent
        const userCtx = {
          email: user.email,
          diagnosisType: user.diagnosis_type || undefined,
          diagnosisDate: user.diagnosis_date || undefined,
          timezone: user.timezone || undefined,
        };

        // Prepare messages with history (same as chat mode)
        const messages = [
          ...history.map(h =>
            h.role === 'user'
              ? new HumanMessage(h.content)
              : new AIMessage(h.content)
          ),
          new HumanMessage(transcript),
        ];

        console.log('[Voice API] Processing transcript:', transcript);
        console.log('[Voice API] User context:', userCtx);
        console.log('[Voice API] Conversation history length:', history.length);

        const stream = await agent.stream({
          messages,
          userId,
          userContext: userCtx,
        }, {
          streamMode: 'values',
        });

        let fullResponse = '';
        let agentIterationCount = 0;
        let chunkCount = 0;

        for await (const chunk of stream) {
          chunkCount++;
          if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
            const messages = chunk.messages;
            if (Array.isArray(messages) && messages.length > 0) {
              const lastMessage = messages[messages.length - 1];

              // Count actual agent iterations (AIMessages only, not tool messages)
              const isAIMessage = lastMessage.constructor.name === 'AIMessage' ||
                                 lastMessage.constructor.name === 'AIMessageChunk';
              const isToolMessage = lastMessage.constructor.name === 'ToolMessage';

              if (isAIMessage) {
                agentIterationCount++;
                const hasCalls = !!lastMessage.tool_calls?.length;
                console.log(`[Voice API] Agent Iteration ${agentIterationCount} (chunk ${chunkCount}):`, {
                  hasToolCalls: hasCalls,
                  toolCount: lastMessage.tool_calls?.length || 0,
                  contentLength: typeof lastMessage.content === 'string' ? lastMessage.content.length : 0,
                });

                // Log tool calls with arguments
                if (hasCalls) {
                  lastMessage.tool_calls.forEach((tc: any) => {
                    console.log(`  → Calling tool: ${tc.name}`, tc.args);
                  });
                }
              }

              // Log tool responses
              if (isToolMessage) {
                console.log(`[Voice API] Tool Response (chunk ${chunkCount}):`, {
                  contentPreview: typeof lastMessage.content === 'string'
                    ? lastMessage.content.substring(0, 200)
                    : lastMessage.content
                });
              }

              const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

              if (isAIMessage && isFinalMessage && lastMessage.content && typeof lastMessage.content === 'string') {
                fullResponse = lastMessage.content;
              }
            }
          }
        }

        console.log(`[Voice API] Completed: ${agentIterationCount} agent iterations, ${chunkCount} total chunks`);

        console.log('[Voice API] Final response length:', fullResponse.length);
        return fullResponse || 'I processed your message but had no response.';
      },
      { voice: voice as any, speed: 1.0 }
    );

    // Save to chat messages if conversationId provided
    if (conversationId) {
      // Save user message
      await query(
        `INSERT INTO chat_messages (conversation_id, user_id, role, content, metadata)
         VALUES ($1, $2, 'user', $3, $4)`,
        [
          conversationId,
          userId,
          result.transcript,
          JSON.stringify({ voiceInput: true, timestamp: new Date().toISOString() })
        ]
      );

      // Save assistant response
      await query(
        `INSERT INTO chat_messages (conversation_id, user_id, role, content, metadata)
         VALUES ($1, $2, 'assistant', $3, $4)`,
        [
          conversationId,
          userId,
          result.response,
          JSON.stringify({ voiceResponse: true, timestamp: new Date().toISOString() })
        ]
      );

      // Update conversation timestamp
      await query(
        'UPDATE conversations SET updated_at = NOW() WHERE id = $1',
        [conversationId]
      );
    }

    // Return result with audio as base64
    res.json({
      success: true,
      transcript: result.transcript,
      response: result.response,
      audio: result.audioBuffer.toString('base64'),
      audioFormat: 'mp3'
    });
  } catch (error) {
    console.error('[Voice API] Voice chat error:', error);
    next(error);
  }
});

// POST /api/voice/query - Text-in, text-out for Siri/Apple Watch Shortcuts
// Accepts a spoken message (already transcribed by Shortcuts), returns a plain-text spoken response.
// Supports queries about glucose/health data and logging meals, insulin, and exercise.
const voiceQuerySchema = z.object({
  message: z.string().min(1).max(500),
  conversationId: z.string().uuid().optional(),
});

router.post('/query', async (req, res, next) => {
  try {
    const authReq = req as AuthRequest;
    const { message, conversationId } = voiceQuerySchema.parse(req.body);
    const userId = authReq.user!.id;
    const startTime = Date.now();

    // Load user context and preferences
    const userResult = await query(
      'SELECT email, diagnosis_type, diagnosis_date, timezone, preferences FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    const userTimezone = user.timezone || 'America/New_York';
    const userModelConfig = (user.preferences || {}).modelConfig;

    // Pre-load current context (glucose, meals, insulin, exercise, memory)
    const contextSummary = await buildCurrentContext(userId, userTimezone);

    // Load recent conversation history for multi-turn context (last 3 exchanges)
    let history: Array<{ role: string; content: string }> = [];
    let activeConversationId = conversationId;

    if (conversationId) {
      const historyResult = await query(
        `SELECT role, content FROM chat_messages
         WHERE conversation_id = $1 AND role IN ('user', 'assistant')
         ORDER BY created_at DESC LIMIT 6`,
        [conversationId]
      );
      history = historyResult.rows.reverse();
    }

    const { model, modelName } = getVoiceModel(userModelConfig);
    console.log(`[Voice Query] User: ${user.email}, Model: ${modelName}`);
    console.log(`[Voice Query] Message: "${message}"`);

    // Bind logging tools — the only tools needed for voice (no heavy analysis)
    const modelWithTools = model.bindTools([logMealTool, logInsulinTool, logExerciseTool]);

    // Build time context string
    const localTime = new Date(new Date().toLocaleString('en-US', { timeZone: userTimezone }));
    const timeStr = localTime.toLocaleString('en-US', {
      weekday: 'long', hour: 'numeric', minute: '2-digit', hour12: true,
    });

    const systemMsg = new SystemMessage(
      `You are Sage, a T1D assistant responding to a voice query from an Apple Watch via Siri.\n\n` +
      `CRITICAL RULES FOR VOICE RESPONSES:\n` +
      `- Respond in 1 to 3 spoken sentences MAXIMUM — this will be read aloud\n` +
      `- Plain conversational text ONLY — no markdown, no bullets, no headers, no asterisks\n` +
      `- Be specific with numbers (exact values, not approximations)\n` +
      `- If the user wants to log something (insulin, meal, exercise), call the appropriate tool first, then confirm what was logged in your spoken response\n\n` +
      `Current time: ${timeStr}\n\n` +
      `## Current Health Status (pre-loaded, covers last 2 hours of glucose):\n` +
      `${contextSummary}\n\n` +
      `If the user asks about something older than 2 hours, note that you can only see recent data in voice mode.`
    );

    const messages: any[] = [
      systemMsg,
      ...history.map(h => h.role === 'user' ? new HumanMessage(h.content) : new AIMessage(h.content)),
      new HumanMessage(message),
    ];

    // First model call — may include a tool call (logging intent)
    let response = await modelWithTools.invoke(messages);
    let logged: { type: string; summary: string } | undefined;

    if (response.tool_calls && response.tool_calls.length > 0) {
      const toolCall = response.tool_calls[0];
      console.log(`[Voice Query] Tool call: ${toolCall.name}`, toolCall.args);

      let toolResult: string;
      try {
        const toolArgs = { ...toolCall.args, userId, timezone: userTimezone };
        if (toolCall.name === 'log_meal') {
          toolResult = await logMealTool.invoke(toolArgs);
        } else if (toolCall.name === 'log_insulin') {
          toolResult = await logInsulinTool.invoke(toolArgs);
        } else if (toolCall.name === 'log_exercise') {
          toolResult = await logExerciseTool.invoke(toolArgs);
        } else {
          toolResult = JSON.stringify({ success: false, error: 'Unknown tool' });
        }

        const parsed = JSON.parse(toolResult);
        if (parsed.success !== false) {
          logged = {
            type: toolCall.name.replace('log_', ''),
            summary: toolCall.args.description || toolCall.args.insulinType
              ? `${toolCall.args.units}u ${toolCall.args.insulinType}`
              : toolCall.name,
          };
        }
      } catch (e: any) {
        toolResult = JSON.stringify({ success: false, error: e.message });
      }

      // Add the assistant tool-call message + tool result, then get final spoken response
      messages.push(response as any);
      messages.push(new ToolMessage({ tool_call_id: toolCall.id, content: toolResult! }));
      response = await model.invoke(messages);
    }

    const spoken = typeof response.content === 'string' ? response.content.trim() : '';
    if (!spoken) {
      return res.status(500).json({ error: 'No response generated' });
    }

    console.log(`[Voice Query] Done in ${Date.now() - startTime}ms: "${spoken.substring(0, 80)}..."`);

    // Find or create a "Voice Queries" conversation for history
    if (!activeConversationId) {
      const existingConv = await query(
        `SELECT id FROM conversations WHERE user_id = $1 AND title = 'Voice Queries'
         ORDER BY updated_at DESC LIMIT 1`,
        [userId]
      );
      if (existingConv.rows.length > 0) {
        activeConversationId = existingConv.rows[0].id;
      } else {
        const newConv = await query(
          `INSERT INTO conversations (user_id, title) VALUES ($1, 'Voice Queries') RETURNING id`,
          [userId]
        );
        activeConversationId = newConv.rows[0].id;
      }
    }

    // Save user message and response
    await query(
      `INSERT INTO chat_messages (conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, 'user', $3, $4)`,
      [activeConversationId, userId, message, JSON.stringify({ voiceQuery: true })]
    );
    await query(
      `INSERT INTO chat_messages (conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [activeConversationId, userId, spoken, JSON.stringify({ voiceQuery: true, model: modelName, logged })]
    );
    await query(
      `UPDATE conversations SET updated_at = NOW() WHERE id = $1`,
      [activeConversationId]
    );

    res.json({
      spoken,
      conversationId: activeConversationId,
      ...(logged && { logged }),
      duration: Date.now() - startTime,
    });
  } catch (error) {
    console.error('[Voice Query] Error:', error);
    next(error);
  }
});

// GET /api/voice/voices - Get available TTS voices
router.get('/voices', (req, res) => {
  res.json({
    voices: [
      { id: 'alloy', name: 'Alloy', description: 'Neutral, balanced' },
      { id: 'echo', name: 'Echo', description: 'Male, clear' },
      { id: 'fable', name: 'Fable', description: 'Male, expressive' },
      { id: 'onyx', name: 'Onyx', description: 'Male, deep' },
      { id: 'nova', name: 'Nova', description: 'Female, warm (recommended)' },
      { id: 'shimmer', name: 'Shimmer', description: 'Female, soft' }
    ],
    default: 'nova'
  });
});

export default router;
