import { useState, useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import { useMessages, useSendMessage, useMarkMessageRead } from '../hooks/use-messages';
import { useClientAuth } from '@/providers/client-auth-provider';
import { Spinner, Button } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { personName } from '@/lib/labels';
import type { InspectionMessage } from '@/types';

export function MessagesTab({ inspectionId }: { inspectionId: string }) {
  const { user } = useClientAuth();
  const { data: messages, isLoading } = useMessages(inspectionId);
  const send = useSendMessage(inspectionId);
  const markRead = useMarkMessageRead(inspectionId);
  const [text, setText] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // Naar onder scrollen bij nieuwe berichten.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages?.length]);

  // Ongelezen staf-berichten als gelezen markeren.
  useEffect(() => {
    (messages ?? []).forEach((m) => {
      if (m.user && !m.readAt) markRead.mutate(m.id);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  const handleSend = async () => {
    const content = text.trim();
    if (!content || send.isPending) return;
    try {
      await send.mutateAsync(content);
      setText('');
    } catch {
      /* foutmelding blijft achterwege; gebruiker kan opnieuw proberen */
    }
  };

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 overflow-y-auto p-4" style={{ minHeight: 300, maxHeight: '60vh' }}>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : (messages ?? []).length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-sm text-gray-500">
            <svg className="mb-2 h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Nog geen berichten. Stel hier uw vraag aan de inspecteur.
          </div>
        ) : (
          (messages ?? []).map((message) => (
            <MessageBubble key={message.id} message={message} currentUserId={user?.id} />
          ))
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t border-gray-200 p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            rows={2}
            placeholder="Schrijf een bericht…"
            className="block w-full resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
          <Button onClick={handleSend} disabled={!text.trim()} isLoading={send.isPending}>
            Verstuur
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message, currentUserId }: { message: InspectionMessage; currentUserId?: string }) {
  const isOwn = !!message.clientUser && message.clientUser.id === currentUserId;
  const sender = message.clientUser
    ? personName(message.clientUser)
    : message.user
      ? `${personName(message.user)} (Inspecteur)`
      : 'Onbekend';

  return (
    <div className={clsx('flex flex-col', isOwn ? 'items-end' : 'items-start')}>
      <span className="mb-0.5 text-[11px] text-gray-400">{sender}</span>
      <div
        className={clsx(
          'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
          isOwn ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-900',
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
        {message.attachments.length > 0 && (
          <div className="mt-1 flex flex-col gap-1">
            {message.attachments.map((att) => (
              <a
                key={att.id}
                href={att.fileUrl}
                target="_blank"
                rel="noreferrer"
                className={clsx('text-xs underline', isOwn ? 'text-white/90' : 'text-primary-600')}
              >
                {att.fileName}
              </a>
            ))}
          </div>
        )}
      </div>
      <span className="mt-0.5 text-[11px] text-gray-400">{formatDateTime(message.createdAt)}</span>
    </div>
  );
}
