import { getToken } from './auth';
import { API_BASE_URL } from '../constants/config';
import type { SSEEvent } from '../types/chat';

/**
 * Stream chat using XMLHttpRequest instead of fetch+ReadableStream.
 * XHR with onprogress is the reliable streaming approach in React Native —
 * fetch body.getReader() has known issues on the iOS native network stack.
 */
export async function streamChat(
  message: string,
  conversationId: string | null,
  onEvent: (event: SSEEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const token = await getToken();

  if (signal.aborted) {
    throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    const xhr = new XMLHttpRequest();
    let lastLength = 0;
    let buffer = '';

    xhr.open('POST', `${API_BASE_URL}/chat/stream`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    // Forward abort signal to XHR
    const onAbort = () => xhr.abort();
    signal.addEventListener('abort', onAbort);
    const cleanup = () => signal.removeEventListener('abort', onAbort);

    function processChunks(newText: string) {
      buffer += newText;
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() ?? '';
      for (const chunk of chunks) {
        const line = chunk.trim();
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as SSEEvent;
          onEvent(event); // may throw for error events
        } catch (e) {
          settle(() => reject(e));
          return;
        }
      }
    }

    xhr.onprogress = () => {
      if (settled) return;
      const newText = xhr.responseText.slice(lastLength);
      lastLength = xhr.responseText.length;
      processChunks(newText);
    };

    xhr.onload = () => {
      if (settled) return;
      // Flush any data that arrived after last onprogress
      const remaining = xhr.responseText.slice(lastLength);
      if (remaining) processChunks(remaining);
      if (settled) return; // error event threw

      if (xhr.status < 200 || xhr.status >= 300) {
        try {
          const err = JSON.parse(xhr.responseText);
          settle(() => reject(new Error(err.error ?? `Stream failed: ${xhr.status}`)));
        } catch {
          settle(() => reject(new Error(`Stream failed: ${xhr.status}`)));
        }
        return;
      }
      settle(() => resolve());
    };

    xhr.onerror = () => settle(() => reject(new Error('Network request failed')));
    xhr.onabort = () =>
      settle(() => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));

    xhr.send(JSON.stringify({ message, conversationId }));
  });
}
