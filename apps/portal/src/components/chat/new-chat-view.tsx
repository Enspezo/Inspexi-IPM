import { useEffect, useState } from 'react';
import { Spinner, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useChat } from '@/providers/chat-provider';
import { Role, type ChatUser } from '@/types';
import { useChatUsers, useCreateThread } from '@/pages/chat/hooks/use-chat';
import { ChatAvatar, PresenceLabel, TeamAvatar } from './chat-avatar';
import { ROLE_LABELS, teamLabel } from './chat-helpers';

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function NewChatView() {
  const { user } = useAuth();
  const { openList, openThread, pendingReference, clearPendingReference } = useChat();
  const { showToast } = useToast();
  const createThread = useCreateThread();

  const [tab, setTab] = useState<'person' | 'team'>('person');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query);
  const { data: users, isLoading } = useChatUsers(debouncedQuery, tab === 'person');

  const teamRoles = (user?.roles ?? []).filter((r) => r !== Role.SUPERUSER);

  const referencePayload = pendingReference
    ? {
        referenceEntityType: pendingReference.entityType,
        referenceEntityId: pendingReference.entityId,
      }
    : {};

  async function startDirect(target: ChatUser) {
    try {
      const thread = await createThread.mutateAsync({
        type: 'DIRECT',
        userId: target.id,
        ...referencePayload,
      });
      clearPendingReference();
      openThread(thread.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Chat starten mislukt', 'error');
    }
  }

  async function startTeam(role: Role) {
    try {
      const thread = await createThread.mutateAsync({
        type: 'TEAM',
        teamRole: role,
        ...referencePayload,
      });
      clearPendingReference();
      openThread(thread.id);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Team-chat starten mislukt', 'error');
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
        <p className="text-sm font-semibold text-gray-900">Nieuwe chat</p>
      </div>

      {/* Pending reference */}
      {pendingReference && (
        <div className="flex items-center gap-2 border-b border-primary-100 bg-primary-50 px-3 py-2 text-xs text-primary-700">
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5" />
          </svg>
          <span className="min-w-0 flex-1 truncate">
            Koppelen aan: {pendingReference.label ?? pendingReference.entityType}
          </span>
          <button
            onClick={clearPendingReference}
            className="text-primary-400 hover:text-primary-700"
            aria-label="Koppeling verwijderen"
          >
            ×
          </button>
        </div>
      )}

      {/* Tab toggle */}
      <div className="flex gap-1 border-b border-gray-200 p-2">
        <button
          onClick={() => setTab('person')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'person' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Persoon
        </button>
        <button
          onClick={() => setTab('team')}
          className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium ${
            tab === 'team' ? 'bg-primary-100 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          Team
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'person' ? (
          <>
            <div className="p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Zoek een collega…"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
              />
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : !users || users.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">Geen collega&apos;s gevonden</p>
            ) : (
              users.map((u) => (
                <button
                  key={u.id}
                  onClick={() => void startDirect(u)}
                  disabled={createThread.isPending}
                  className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChatAvatar user={u} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {[u.firstName, u.lastName].filter(Boolean).join(' ')}
                    </p>
                    <PresenceLabel availability={u.availability} />
                  </div>
                </button>
              ))
            )}
          </>
        ) : (
          <div className="p-2">
            {teamRoles.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-gray-400">
                Je hebt geen team-rollen.
              </p>
            ) : (
              teamRoles.map((role) => (
                <button
                  key={role}
                  onClick={() => void startTeam(role)}
                  disabled={createThread.isPending}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-50 disabled:opacity-50"
                >
                  <TeamAvatar />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{teamLabel(role)}</p>
                    <span className="text-xs text-gray-500">{ROLE_LABELS[role] ?? role}</span>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
