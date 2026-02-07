import OpenAI from 'openai';
import { env } from '../config/env.js';
import fs from 'fs';
import { Readable } from 'stream';

/**
 * Audio processing service for voice interactions
 * Uses OpenAI Whisper for STT and TTS-1-HD for speech synthesis
 */

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
}

export interface SynthesisOptions {
  voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  speed?: number; // 0.25 to 4.0
  model?: 'tts-1' | 'tts-1-hd';
}

export class AudioService {
  /**
   * Transcribe audio to text using Whisper
   */
  async transcribeAudio(
    audioBuffer: Buffer,
    filename: string = 'audio.webm'
  ): Promise<TranscriptionResult> {
    try {
      console.log(`[AudioService] Transcribing audio (${audioBuffer.length} bytes)...`);

      // Create a temporary file-like object for OpenAI API
      // The API expects a File object, so we create a stream
      const file = new File([audioBuffer], filename, {
        type: this.getMimeType(filename)
      });

      const transcription = await openai.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en', // Focus on English for diabetes-specific terms
        response_format: 'verbose_json' // Get more details
      });

      console.log(`[AudioService] Transcription complete: "${transcription.text}"`);

      return {
        text: transcription.text,
        language: transcription.language,
        duration: transcription.duration
      };
    } catch (error) {
      console.error('[AudioService] Transcription failed:', error);
      throw new Error(`Failed to transcribe audio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Synthesize text to speech using TTS
   */
  async synthesizeSpeech(
    text: string,
    options: SynthesisOptions = {}
  ): Promise<Buffer> {
    try {
      const {
        voice = 'nova', // Warm, friendly female voice (good for healthcare)
        speed = 1.0,
        model = 'tts-1-hd' // High-definition quality
      } = options;

      console.log(`[AudioService] Synthesizing speech (${text.length} chars, voice: ${voice})...`);

      const mp3 = await openai.audio.speech.create({
        model,
        voice,
        input: text,
        speed
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      console.log(`[AudioService] Synthesis complete (${buffer.length} bytes)`);

      return buffer;
    } catch (error) {
      console.error('[AudioService] Speech synthesis failed:', error);
      throw new Error(`Failed to synthesize speech: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process voice chat: transcribe input, get response, synthesize output
   */
  async processVoiceChat(
    audioBuffer: Buffer,
    filename: string,
    chatProcessor: (text: string) => Promise<string>,
    synthesisOptions?: SynthesisOptions
  ): Promise<{
    transcript: string;
    response: string;
    audioBuffer: Buffer;
  }> {
    try {
      console.log('[AudioService] Processing voice chat...');

      // Step 1: Transcribe user's audio
      const transcription = await this.transcribeAudio(audioBuffer, filename);
      console.log(`[AudioService] User said: "${transcription.text}"`);

      // Step 2: Process through chat (agent/LLM)
      const response = await chatProcessor(transcription.text);
      console.log(`[AudioService] Agent response: "${response.substring(0, 100)}..."`);

      // Step 3: Synthesize response to audio
      const audioResponse = await this.synthesizeSpeech(response, synthesisOptions);

      console.log('[AudioService] Voice chat processing complete');

      return {
        transcript: transcription.text,
        response,
        audioBuffer: audioResponse
      };
    } catch (error) {
      console.error('[AudioService] Voice chat processing failed:', error);
      throw error;
    }
  }

  /**
   * Get MIME type from filename extension
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const mimeTypes: Record<string, string> = {
      'webm': 'audio/webm',
      'mp3': 'audio/mpeg',
      'mp4': 'audio/mp4',
      'm4a': 'audio/mp4',
      'wav': 'audio/wav',
      'ogg': 'audio/ogg',
      'flac': 'audio/flac'
    };
    return mimeTypes[ext || ''] || 'audio/webm';
  }

  /**
   * Check if audio service is configured
   */
  isConfigured(): boolean {
    return !!env.OPENAI_API_KEY;
  }
}

// Singleton instance
export const audioService = new AudioService();
