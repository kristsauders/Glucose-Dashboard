import { useState, useRef, useCallback } from 'react';
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

  const sendMessage = useCallback(async (text: string) => {
    if (state.streaming) return;

    abortRef.current = new AbortController();

    // Optimistically add user message
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
      statusText: 'Thinking...',
      error: null,
    }));

    let fullText = '';
    let charts: string[] = [];
    let finalConversationId = state.conversationId;

    try {
      await streamChat(
        text,
        state.conversationId,
        (event: SSEEvent) => {
          if (event.type === 'status') {
            setState(s => ({ ...s, statusText: event.content }));
          } else if (event.type === 'content') {
            fullText += event.content;
            setState(s => ({ ...s, streamingText: fullText }));
          } else if (event.type === 'chart') {
            charts = [...charts, event.data];
            setState(s => ({ ...s, streamingCharts: charts }));
          } else if (event.type === 'done') {
            finalConversationId = event.metadata.conversationId ?? finalConversationId;
          }
        },
        abortRef.current.signal,
      );

      // Commit the assistant message
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
  }, []);

  const clearError = useCallback(() => {
    setState(s => ({ ...s, error: null }));
  }, []);

  // Called once after the conversation query resolves to hydrate history
  const resetMessages = useCallback((msgs: Message[]) => {
    setState(s => ({ ...s, messages: msgs }));
  }, []);

  return { ...state, sendMessage, abort, clearError, resetMessages };
}
