import { Spinner } from '@/components/ui';
import { useChat } from '@/providers/chat-provider';
import { useChatThreads } from '@/pages/chat/hooks/use-chat';
import type { ChatThread } from '@/types';
import { ChatAvatar, TeamAvatar } from './chat-avatar';
import { threadTitle } from './chat-helpers';

function relativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'nu';
  if (min < 60) return `${min}m`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}u`;
  const day = Math.floor(hour / 24);
  if (day < 7) return `${day}d`;
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

function ThreadRow({ thread }: { thread: ChatThread }) {
  const { openThread } = useChat();
  const title = threadTitle(thread);
  const preview = thread.lastMessage?.content ?? 'Nog geen berichten';
  const unread = thread.unreadCount;

  return (
    <button
      onClick={() => openThread(thread.id)}
      className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
    >
      {thread.type === 'TEAM' ? <TeamAvatar /> : <ChatAvatar user={thread.counterpart} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${unread > 0 ? 'font-semibold text-gray-900' : 'font-medium text-gray-800'}`}>
            {title}
          </p>
          {thread.lastMessage && (
            <span className="shrink-0 text-[10px] text-gray-400">
              {relativeTime(thread.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2">
          <p className={`truncate text-xs ${unread > 0 ? 'text-gray-700' : 'text-gray-500'}`}>
            {thread.referenceName && (
              <span className="mr-1 text-primary-600">🔗 {thread.referenceName}</span>
            )}
            {preview}
          </p>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

export function ChatThreadList() {
  const { startNew } = useChat();
  const { data: threads, isLoading } = useChatThreads(true);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
        <p className="text-sm font-semibold text-gray-900">Gesprekken</p>
        <button
          onClick={() => startNew()}
          className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-primary-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Nieuw
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size="sm" />
          </div>
        ) : !threads || threads.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-gray-400">
            Nog geen gesprekken.
            <br />
            Start er een met de knop &ldquo;Nieuw&rdquo;.
          </div>
        ) : (
          threads.map((t) => <ThreadRow key={t.id} thread={t} />)
        )}
      </div>
    </div>
  );
}
