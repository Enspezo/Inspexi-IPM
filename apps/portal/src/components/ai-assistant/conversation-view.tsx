import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Spinner } from '@/components/ui';
import type { AiMessage, AiPendingActionCard } from '@/types';
import { useAiConversation } from './hooks/use-ai';
import { streamPost, type StreamHandlers } from './hooks/use-ai-stream';
import { PendingActionCard } from './pending-action-card';

function messageText(m: AiMessage): string {
  return (m.content ?? [])
    .filter((b) => b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('\n');
}

/** Interne tool_result-dragers (role USER met alleen tool_result-blokken) verbergen. */
function isInternal(m: AiMessage): boolean {
  const blocks = m.content ?? [];
  return blocks.length > 0 && blocks.every((b) => b.type === 'tool_result');
}

function usedTools(m: AiMessage): string[] {
  return (m.content ?? [])
    .filter((b) => b.type === 'tool_use' && typeof b.name === 'string')
    .map((b) => b.name as string);
}

export function ConversationView({ conversationId }: { conversationId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useAiConversation(conversationId);
  const [input, setInput] = useState('');
  const [streamingText, setStreamingText] = useState('');
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [pending, setPending] = useState<AiPendingActionCard[]>([]);
  const [resolved, setResolved] = useState<Set<string>>(new Set());
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const continuedRef = useRef(false);

  const visible = useMemo(
    () => (data?.messages ?? []).filter((m) => !isInternal(m)),
    [data?.messages],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [visible.length, streamingText, pending.length]);

  function makeHandlers(): StreamHandlers {
    return {
      onToken: (t) => setStreamingText((prev) => prev + t),
      onTool: (name) => setActiveTool(name),
      onPendingActions: (actions) => setPending(actions),
      onError: (message) => {
        setError(message);
        setIsStreaming(false);
        setActiveTool(null);
      },
      onDone: () => {
        setIsStreaming(false);
        setActiveTool(null);
        setStreamingText('');
        qc.invalidateQueries({ queryKey: ['ai', 'conversation', conversationId] });
        qc.invalidateQueries({ queryKey: ['ai', 'usage'] });
      },
    };
  }

  async function send() {
    const content = input.trim();
    if (!content || isStreaming) return;
    setInput('');
    setError(null);
    setStreamingText('');
    setPending([]);
    setResolved(new Set());
    continuedRef.current = false;
    setIsStreaming(true);
    await streamPost(`/ai/conversations/${conversationId}/messages`, { content }, makeHandlers());
  }

  // Zodra alle voorgestelde acties zijn afgehandeld → hervat de beurt.
  useEffect(() => {
    if (
      pending.length > 0 &&
      resolved.size === pending.length &&
      !isStreaming &&
      !continuedRef.current
    ) {
      continuedRef.current = true;
      setPending([]);
      setResolved(new Set());
      setStreamingText('');
      setIsStreaming(true);
      void streamPost(`/ai/conversations/${conversationId}/continue`, {}, makeHandlers());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending, resolved, isStreaming]);

  function onResolved(id: string) {
    setResolved((prev) => new Set(prev).add(id));
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner size="md" />
          </div>
        ) : (
          <>
            {visible.map((m) => {
              const text = messageText(m);
              const tools = usedTools(m);
              const mine = m.role === 'USER';
              if (!text && tools.length === 0) return null;
              return (
                <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-900 ring-1 ring-gray-200'
                    }`}
                  >
                    {text && <p className="whitespace-pre-wrap break-words">{text}</p>}
                    {!mine && tools.length > 0 && (
                      <p className="mt-1 text-[11px] text-gray-400">🔧 {tools.join(', ')}</p>
                    )}
                  </div>
                </div>
              );
            })}

            {streamingText && (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-2xl bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200">
                  <p className="whitespace-pre-wrap break-words">{streamingText}</p>
                </div>
              </div>
            )}

            {activeTool && (
              <p className="text-center text-[11px] text-gray-400">🔧 {activeTool}…</p>
            )}

            {pending.length > 0 && (
              <div className="space-y-2">
                <p className="text-[11px] font-medium text-gray-500">
                  Te bevestigen acties:
                </p>
                {pending.map((a) => (
                  <PendingActionCard key={a.id} action={a} onResolved={onResolved} />
                ))}
              </div>
            )}

            {isStreaming && !streamingText && pending.length === 0 && (
              <div className="flex justify-center p-2">
                <Spinner size="sm" />
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-danger-50 px-3 py-2 text-xs text-danger-700">{error}</p>
            )}
          </>
        )}
      </div>

      <div className="border-t border-gray-100 p-2">
        <div className="flex items-end gap-2">
          <textarea
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-400 focus:outline-none"
            placeholder="Vraag de assistent iets…"
            rows={1}
            value={input}
            disabled={isStreaming}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button size="sm" onClick={() => void send()} disabled={isStreaming || !input.trim()}>
            {isStreaming ? <Spinner size="sm" /> : 'Stuur'}
          </Button>
        </div>
      </div>
    </div>
  );
}
