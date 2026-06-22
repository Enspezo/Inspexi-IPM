import { Button } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';

interface StartChatButtonProps {
  /** PascalCase modelnaam, bv. "Request". */
  entityType: string;
  entityId: string;
  /** Leesbaar label voor de koppeling-chip. */
  label?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

/**
 * Detailpagina-actie: opent de chat in "nieuw"-modus met dit record voorgevuld
 * als referentie. Verborgen voor gebruikers zonder organisatie.
 */
export function StartChatButton({
  entityType,
  entityId,
  label,
  variant = 'secondary',
  size = 'sm',
  children,
}: StartChatButtonProps) {
  const { user } = useAuth();
  const { startChatForRecord } = useChat();
  if (!user?.orgId) return null;

  return (
    <Button
      variant={variant}
      size={size}
      onClick={() => startChatForRecord({ entityType, entityId, label })}
    >
      <span className="inline-flex items-center gap-1.5">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.8}
            d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.8L3 20l1.3-3.9A7.96 7.96 0 013 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
          />
        </svg>
        {children ?? 'Chat over dit record'}
      </span>
    </Button>
  );
}
