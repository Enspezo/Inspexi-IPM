import { useAiAgent } from '@/providers/ai-agent-provider';
import { useAiAgentAvailable } from './assistant-button';
import { ConversationList } from './conversation-list';
import { ConversationView } from './conversation-view';
import { UsageBadge } from './usage-badge';

export function AssistantDrawer() {
  const available = useAiAgentAvailable();
  const { isOpen, view, activeConversationId, close, openList } = useAiAgent();

  if (!available || !isOpen) return null;

  const inConversation = view === 'conversation' && activeConversationId;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={close} aria-hidden="true" />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-md flex-col border-l border-gray-200 bg-gray-50 shadow-xl">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5">
          {inConversation ? (
            <button
              type="button"
              onClick={openList}
              className="rounded p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Terug"
            >
              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M12.7 15.3a1 1 0 01-1.4 0l-5-5a1 1 0 010-1.4l5-5a1 1 0 011.4 1.4L8.42 9.6l4.3 4.3a1 1 0 010 1.4z" clipRule="evenodd" />
              </svg>
            </button>
          ) : null}
          <div className="flex-1">
            <p className="text-sm font-semibold text-gray-900">AI-assistent</p>
          </div>
          <UsageBadge />
          <button
            type="button"
            onClick={close}
            className="rounded p-1 text-gray-500 hover:bg-gray-100"
            aria-label="Sluiten"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.3 5A1 1 0 004.9 6.3L8.6 10l-3.7 3.7a1 1 0 101.4 1.4L10 11.4l3.7 3.7a1 1 0 001.4-1.4L11.4 10l3.7-3.7A1 1 0 0013.7 5L10 8.6 6.3 5z" />
            </svg>
          </button>
        </div>

        <div className="min-h-0 flex-1">
          {inConversation ? (
            <ConversationView conversationId={activeConversationId!} />
          ) : (
            <ConversationList />
          )}
        </div>
      </aside>
    </>
  );
}
