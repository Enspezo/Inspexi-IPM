import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { useChatUnread } from '@/pages/chat/hooks/use-chat';

/** Chat-icoon met ongelezen-badge voor de header (poll zoals de notificatie-bel). */
export function ChatButton() {
  const { user } = useAuth();
  const { toggle, isOpen } = useChat();
  const hasChat = !!user?.orgId;
  const { data } = useChatUnread(hasChat);

  if (!hasChat) return null;
  const count = data?.count ?? 0;

  return (
    <button
      onClick={toggle}
      className={`relative rounded-lg p-2 transition-colors hover:bg-gray-50 hover:text-gray-600 ${
        isOpen ? 'bg-gray-100 text-gray-700' : 'text-gray-400'
      }`}
      title="Chat"
      aria-label="Chat openen"
    >
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
        />
      </svg>
      {count > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </button>
  );
}
