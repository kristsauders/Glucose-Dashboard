import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.js';
import { audioService } from '../../services/audio-service.js';
import { createConfiguredAgentGraph } from '../../agent/graph.js';
import { HumanMessage } from '@langchain/core/messages';
import type { AuthRequest } from '../../types/index.js';
import { query } from '../../config/database.js';

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

        const stream = await agent.stream({
          messages: [new HumanMessage(transcript)],
          userId,
          userContext: userCtx,
        }, {
          streamMode: 'values',
        });

        let fullResponse = '';

        for await (const chunk of stream) {
          if (chunk && typeof chunk === 'object' && 'messages' in chunk) {
            const messages = chunk.messages;
            if (Array.isArray(messages) && messages.length > 0) {
              const lastMessage = messages[messages.length - 1];
              const isAIMessage = lastMessage.constructor.name === 'AIMessage' ||
                                 lastMessage.constructor.name === 'AIMessageChunk';
              const isFinalMessage = !lastMessage.tool_calls || lastMessage.tool_calls.length === 0;

              if (isAIMessage && isFinalMessage && lastMessage.content && typeof lastMessage.content === 'string') {
                fullResponse = lastMessage.content;
              }
            }
          }
        }

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
