import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHelp } from '@/providers/help-provider';
import { Input } from '@/components/ui';
import { HelpSuggestions } from './help-suggestions';
import { HelpChatPanel } from './help-chat-panel';

function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const HelpIcon = (
  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

export function HelpWidget() {
  const { isOpen, open, close, moduleKey } = useHelp();
  const [search, setSearch] = useState('');
  const q = useDebounce(search.trim(), 300);

  return (
    <>
      {!isOpen && (
        <button
          onClick={open}
          aria-label="Help openen"
          className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary-600 text-white shadow-lg transition hover:bg-primary-700"
        >
          {HelpIcon}
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-6 right-6 z-40 flex max-h-[80vh] w-96 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="font-semibold text-gray-900">Help</span>
            <button
              onClick={close}
              aria-label="Sluiten"
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Zoek in de help…"
            />

            <HelpSuggestions moduleKey={moduleKey} q={q || undefined} onNavigate={close} />

            <div className="border-t pt-4">
              <HelpChatPanel />
            </div>
          </div>

          <div className="border-t px-4 py-3">
            {/* /help/tickets/new wordt functioneel in Fase 4 */}
            <Link
              to={`/help/tickets/new?module=${moduleKey}`}
              onClick={close}
              className="block w-full rounded-lg bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-800 hover:bg-gray-200"
            >
              Een vraag? Maak een ticket aan
            </Link>
            <Link
              to="/help"
              onClick={close}
              className="mt-2 block text-center text-xs text-gray-500 hover:underline"
            >
              Naar het volledige helpcentrum
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
