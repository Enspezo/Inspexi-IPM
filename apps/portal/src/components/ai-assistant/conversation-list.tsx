import { Button, Spinner } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import { useAiAgent } from '@/providers/ai-agent-provider';
import { useAiConversations, useCreateAiConversation } from './hooks/use-ai';

export function ConversationList() {
  const { data, isLoading } = useAiConversations();
  const create = useCreateAiConversation();
  const { openConversation } = useAiAgent();

  async function startNew() {
    try {
      const conv = await create.mutateAsync(undefined);
      openConversation(conv.id);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-100 p-3">
        <Button size="sm" onClick={startNew} isLoading={create.isPending} className="w-full">
          + Nieuw gesprek
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex justify-center p-6">
            <Spinner size="md" />
          </div>
        ) : !data || data.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">
            Nog geen gesprekken. Start er een om de assistent te vragen iets op te zoeken of voor te bereiden.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {data.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openConversation(c.id)}
                  className="flex w-full flex-col items-start px-4 py-3 text-left hover:bg-gray-50"
                >
                  <span className="truncate text-sm font-medium text-gray-900">
                    {c.title || 'Nieuw gesprek'}
                  </span>
                  <span className="mt-0.5 text-[11px] text-gray-400">
                    {formatDateTime(c.updatedAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
