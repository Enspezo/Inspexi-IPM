import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { ChatThreadList } from './chat-thread-list';
import { ChatThreadView } from './chat-thread-view';
import { NewChatView } from './new-chat-view';
import { PresencePicker } from './presence-picker';

export function ChatDrawer() {
  const { user } = useAuth();
  const { isOpen, close, view, activeThreadId } = useChat();

  // Chat is org-gebonden: gebruikers zonder organisatie (bv. SUPERUSER) zien geen chat.
  if (!user || !user.orgId) return null;
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={close}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-xl">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-gray-200 px-3 py-2">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-semibold text-gray-900">Chat</span>
          </div>
          <div className="flex items-center gap-1">
            <PresencePicker />
            <button
              onClick={close}
              className="rounded-md p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Chat sluiten"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1">
          {view === 'thread' && activeThreadId ? (
            <ChatThreadView threadId={activeThreadId} />
          ) : view === 'new' ? (
            <NewChatView />
          ) : (
            <ChatThreadList />
          )}
        </div>
      </aside>
    </>
  );
}
