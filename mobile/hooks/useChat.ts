import { useState, useRef, useCallback, useEffect } from 'react';
import { streamChat } from '../services/sse';
import type { Message, SSEEvent } from '../types/chat';

export interface ChatState {
  messages: Message[];
  streaming: boolean;
  streamingText: string;
  streamingCharts: string[];
  statusText: string;
  error: string | null;
  conversationId: string | null;
}

export function useChat(initialConversationId: string | null, initialMessages: Message[] = []) {
  const [state, setState] = useState<ChatState>({
    messages: initialMessages,
    streaming: false,
    streamingText: '',
    streamingCharts: [],
    statusText: '',
    error: null,
    conversationId: initialConversationId,
  });

  const abortRef = useRef<AbortController | null>(null);

  // Char-by-char reveal — mirrors web UI's charQueueRef pattern
  const charQueueRef = useRef('');
  const charTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const charRevealDoneRef = useRef<(() => void) | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (charTimerRef.current) clearInterval(charTimerRef.current);
    };
  }, []);

  const sendMessage = useCallback(async (text: string) => {
    if (state.streaming) return;

    abortRef.current = new AbortController();

    // Reset char-reveal state
    charQueueRef.current = '';
    if (charTimerRef.current) { clearInterval(charTimerRef.current); charTimerRef.current = null; }
    charRevealDoneRef.current = null;

    const userMsg: Message = {
      id: `tmp-${Date.now()}`,
      conversation_id: state.conversationId ?? '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };

    setState(s => ({
      ...s,
      messages: [...s.messages, userMsg],
      streaming: true,
      streamingText: '',
      streamingCharts: [],
      statusText: 'Thinking…',
      error: null,
    }));

    let fullText = '';
    let charts: string[] = [];
    let finalConversationId = state.conversationId;
    let contentStarted = false;

    // ~143 chars/sec — same rate as web UI
    const startReveal = () => {
      if (charTimerRef.current) return;
      charTimerRef.current = setInterval(() => {
        if (charQueueRef.current.length === 0) {
          clearInterval(charTimerRef.current!);
          charTimerRef.current = null;
          charRevealDoneRef.current?.();
          charRevealDoneRef.current = null;
          return;
        }
        const ch = charQueueRef.current[0];
        charQueueRef.current = charQueueRef.current.slice(1);
        fullText += ch;
        setState(s => ({ ...s, streamingText: fullText }));
      }, 7);
    };

    try {
      await streamChat(
        text,
        state.conversationId,
        (event: SSEEvent) => {
          if (event.type === 'status') {
            setState(s => ({ ...s, statusText: event.content }));
          } else if (event.type === 'thinking') {
            setState(s => ({ ...s, statusText: event.content }));
          } else if (event.type === 'content') {
            if (!contentStarted) {
              contentStarted = true;
              setState(s => ({ ...s, statusText: '' }));
            }
            charQueueRef.current += event.content;
            startReveal();
          } else if (event.type === 'chart') {
            charts = [...charts, event.data];
            setState(s => ({ ...s, streamingCharts: charts }));
          } else if (event.type === 'done') {
            finalConversationId = event.metadata?.conversationId ?? finalConversationId;
          } else if (event.type === 'error') {
            throw new Error(event.content);
          }
        },
        abortRef.current.signal,
      );

      // Wait for the char-reveal queue to drain before committing
      if (charQueueRef.current.length > 0 || charTimerRef.current) {
        await new Promise<void>(resolve => {
          charRevealDoneRef.current = resolve;
          startReveal();
        });
      }

      const assistantMsg: Message = {
        id: `tmp-assistant-${Date.now()}`,
        conversation_id: finalConversationId ?? '',
        role: 'assistant',
        content: fullText,
        metadata: { charts },
        created_at: new Date().toISOString(),
      };

      setState(s => ({
        ...s,
        messages: [...s.messages, assistantMsg],
        streaming: false,
        streamingText: '',
        streamingCharts: [],
        statusText: '',
        conversationId: finalConversationId,
      }));
    } catch (err: any) {
      if (charTimerRef.current) { clearInterval(charTimerRef.current); charTimerRef.current = null; }
      charQueueRef.current = '';
      charRevealDoneRef.current = null;

      if (err.name === 'AbortError') {
        setState(s => ({ ...s, streaming: false, streamingText: '', statusText: '' }));
      } else {
        setState(s => ({
          ...s,
          streaming: false,
          streamingText: '',
          statusText: '',
          error: err.message ?? 'Something went wrong',
        }));
      }
    }
  }, [state.streaming, state.conversationId]);

  const abort = useCallback(() => {
    abortRef.current?.abort();
    if (charTimerRef.current) { clearInterval(charTimerRef.current); charTimerRef.current = null; }
    charQueueRef.current = '';
    charRevealDoneRef.current = null;
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  const resetMessages = useCallback((msgs: Message[]) => {
    setState(s => ({ ...s, messages: msgs }));
  }, []);

  return { ...state, sendMessage, abort, clearError, resetMessages };
}
