import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Spinner, StatusBadge, useConfirm, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { getEntityLink } from '@/lib/audit-entity-helpers';
import { CHAT_THREAD_STATUS } from '@/lib/status';
import { ChatThreadStatus, type ChatMessage } from '@/types';
import {
  useChatThread,
  useCloseThread,
  useMarkThreadRead,
  useThreadMessages,
} from '@/pages/chat/hooks/use-chat';
import { ChatAvatar, PresenceLabel, TeamAvatar } from './chat-avatar';
import { ChatComposer } from './chat-composer';
import { threadTitle } from './chat-helpers';

function MessageReference({
  message,
  onNavigate,
}: {
  message: ChatMessage;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  if (!message.referenceEntityType || !message.referenceEntityId) return null;
  const href = getEntityLink(message.referenceEntityType, message.referenceEntityId);
  const label = message.referenceName ?? message.referenceEntityType;
  const inner = (
    <span className="mt-1 inline-flex items-center gap-1 rounded-md bg-white/70 px-1.5 py-0.5 text-[11px] text-primary-700 ring-1 ring-primary-200">
      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5" />
      </svg>
      <span className="truncate">{label}</span>
    </span>
  );
  if (!href) return inner;
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate();
        navigate(href);
      }}
      className="block"
    >
      {inner}
    </button>
  );
}

export function ChatThreadView({ threadId }: { threadId: string }) {
  const { user } = useAuth();
  const { openList, close } = useChat();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: thread } = useChatThread(threadId);
  const { messages, isLoading, appendMessage } = useThreadMessages(threadId);
  const markRead = useMarkThreadRead();
  const closeThread = useCloseThread();

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = messages.length ? messages[messages.length - 1].id : null;

  // Scroll naar beneden bij nieuwe berichten.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  // Markeer gelezen wanneer de thread opent / een nieuw laatste bericht binnenkomt.
  useEffect(() => {
    if (threadId && lastMessageId) markRead.mutate(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId, lastMessageId]);

  const isClosed = thread?.status === ChatThreadStatus.AFGEROND;
  const hasReference = !!thread?.referenceEntityType && !!thread?.referenceEntityId;

  async function handleClose() {
    if (!thread) return;
    const ok = await confirm({
      title: 'Gesprek afronden',
      message: hasReference
        ? 'Het transcript wordt als notitie bij het gekoppelde record opgeslagen. Doorgaan?'
        : 'Weet je zeker dat je dit gesprek wilt afronden?',
      confirmLabel: 'Afronden',
    });
    if (!ok) return;
    try {
      await closeThread.mutateAsync(threadId);
      showToast(
        hasReference ? 'Gesprek afgerond — transcript opgeslagen als notitie' : 'Gesprek afgerond',
        'success',
      );
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2">
        <button
          onClick={openList}
          className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          aria-label="Terug"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        {thread?.type === 'TEAM' ? <TeamAvatar size="sm" /> : <ChatAvatar user={thread?.counterpart ?? null} size="sm" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {thread ? threadTitle(thread) : '…'}
          </p>
          {thread?.type === 'DIRECT' && thread.counterpart && (
            <PresenceLabel availability={thread.counterpart.availability} />
          )}
          {thread?.type === 'TEAM' && <span className="text-xs text-gray-500">Team-chat</span>}
        </div>
        {isClosed && <StatusBadge map={CHAT_THREAD_STATUS} status={thread!.status} />}
        {!isClosed && hasReference && (
          <button
            onClick={handleClose}
            disabled={closeThread.isPending}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            title="Afronden → transcript als notitie bij het record"
          >
            Afronden
          </button>
        )}
      </div>

      {/* Reference banner */}
      {hasReference && (
        <ReferenceBanner
          entityType={thread!.referenceEntityType!}
          entityId={thread!.referenceEntityId!}
          label={thread!.referenceName}
          onNavigate={close}
        />
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-gray-50 px-3 py-4">
        {isLoading && messages.length === 0 ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">Nog geen berichten</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === user?.id;
            return (
              <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] ${mine ? 'items-end' : 'items-start'} flex flex-col`}>
                  {!mine && thread?.type === 'TEAM' && (
                    <span className="mb-0.5 px-1 text-[11px] font-medium text-gray-500">
                      {[m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ')}
                    </span>
                  )}
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? 'rounded-br-sm bg-primary-600 text-white'
                        : 'rounded-bl-sm bg-white text-gray-900 ring-1 ring-gray-200'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                    <MessageReference message={m} onNavigate={close} />
                  </div>
                  <span className="mt-0.5 px-1 text-[10px] text-gray-400">
                    {new Date(m.createdAt).toLocaleTimeString('nl-NL', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Composer */}
      <ChatComposer threadId={threadId} disabled={isClosed} onSent={appendMessage} />
    </div>
  );
}

function ReferenceBanner({
  entityType,
  entityId,
  label,
  onNavigate,
}: {
  entityType: string;
  entityId: string;
  label: string | null;
  onNavigate: () => void;
}) {
  const navigate = useNavigate();
  const href = getEntityLink(entityType, entityId);
  return (
    <div className="flex items-center gap-2 border-b border-primary-100 bg-primary-50 px-3 py-1.5 text-xs text-primary-700">
      <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5" />
      </svg>
      <span className="min-w-0 flex-1 truncate">Gekoppeld: {label ?? entityType}</span>
      {href && (
        <button
          onClick={() => {
            onNavigate();
            navigate(href);
          }}
          className="font-medium hover:underline"
        >
          Openen
        </button>
      )}
    </div>
  );
}
