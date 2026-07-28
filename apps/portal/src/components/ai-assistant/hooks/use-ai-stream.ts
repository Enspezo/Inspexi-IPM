import { getAccessToken } from '@/lib/api-client';
import type { AiPendingActionCard } from '@/types';

export interface StreamHandlers {
  onToken?(text: string): void;
  onTool?(name: string): void;
  onPendingActions?(actions: AiPendingActionCard[]): void;
  onDone?(paused: boolean): void;
  onError?(message: string): void;
}

function dispatch(event: string, data: any, h: StreamHandlers) {
  switch (event) {
    case 'token':
      h.onToken?.(data?.text ?? '');
      break;
    case 'tool':
      h.onTool?.(data?.name ?? '');
      break;
    case 'pending_actions':
      h.onPendingActions?.((data?.actions ?? []) as AiPendingActionCard[]);
      break;
    case 'done':
      h.onDone?.(!!data?.paused);
      break;
    case 'error':
      h.onError?.(data?.message ?? 'Er ging iets mis met de AI-assistent');
      break;
  }
}

/**
 * POST + Server-Sent-Events lezer voor de AI-assistent (PRD-15). `apiClient`
 * kent geen streaming, dus een rauwe `fetch` met de bearer-token (zoals de
 * bestaande authenticated downloads), en we lezen `response.body` zelf.
 */
export async function streamPost(
  path: string,
  body: unknown,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  const token = getAccessToken();
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
      body: JSON.stringify(body ?? {}),
      signal,
    });
  } catch (err) {
    if ((err as any)?.name === 'AbortError') return;
    handlers.onError?.('Kan de AI-assistent niet bereiken');
    return;
  }

  if (!res.ok || !res.body) {
    let message = 'Er ging iets mis met de AI-assistent';
    try {
      const j = await res.json();
      message = j?.message ?? message;
    } catch {
      // niet-JSON body; houd de default
    }
    handlers.onError?.(message);
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        let event = 'message';
        let dataStr = '';
        for (const line of frame.split('\n')) {
          if (line.startsWith('event:')) event = line.slice(6).trim();
          else if (line.startsWith('data:')) dataStr += line.slice(5).trim();
        }
        if (!dataStr) continue;
        try {
          dispatch(event, JSON.parse(dataStr), handlers);
        } catch {
          // negeer onparseerbare frames
        }
      }
    }
  } catch (err) {
    if ((err as any)?.name !== 'AbortError') {
      handlers.onError?.('De verbinding met de AI-assistent werd onderbroken');
    }
  }
}
