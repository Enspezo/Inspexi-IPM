import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { Spinner, useToast } from '@/components/ui';
import { useSearch } from '@/pages/search/hooks/use-search';
import { useChatUsers, useSendMessage } from '@/pages/chat/hooks/use-chat';
import type { ChatMessage, ChatUser } from '@/types';
import { ChatAvatar } from './chat-avatar';
import { SEARCH_TYPE_TO_REFERENCE } from './chat-helpers';

interface Trigger {
  type: '/' | '@';
  query: string;
  start: number;
}

interface PickerOption {
  key: string;
  label: string;
  sublabel?: string | null;
  apply: () => void;
  user?: ChatUser;
}

interface ChatComposerProps {
  threadId: string;
  disabled?: boolean;
  onSent: (msg: ChatMessage) => void;
}

/** Detecteer een actieve `/`- of `@`-trigger vlak vóór de cursor. */
function detectTrigger(text: string, caret: number): Trigger | null {
  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === '/' || ch === '@') {
      const before = i === 0 ? ' ' : text[i - 1];
      if (!/\s/.test(before)) return null;
      const query = text.slice(i + 1, caret);
      if (/\s/.test(query)) return null;
      return { type: ch, query, start: i };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

function searchItemLabel(type: string, item: Record<string, unknown>): string {
  const s = (k: string) => (item[k] as string) ?? '';
  switch (type) {
    case 'contact':
      return s('companyName') || [s('firstName'), s('lastName')].filter(Boolean).join(' ') || '—';
    case 'contactPerson':
      return [s('firstName'), s('lastName')].filter(Boolean).join(' ') || '—';
    case 'location':
      return s('name') || '—';
    case 'request':
      return s('title') || '—';
    case 'quote':
      return [s('quoteNumber'), s('subject')].filter(Boolean).join(' — ') || '—';
    case 'task':
      return s('title') || '—';
    case 'document':
      return s('originalName') || s('fileName') || '—';
    case 'product':
      return s('name') || '—';
    default:
      return '—';
  }
}

export function ChatComposer({ threadId, disabled, onSent }: ChatComposerProps) {
  const { showToast } = useToast();
  const sendMessage = useSendMessage(threadId);

  const [value, setValue] = useState('');
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pendingRef, setPendingRef] = useState<{ entityType: string; entityId: string; label: string } | null>(null);
  const [mentions, setMentions] = useState<ChatUser[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const caretRef = useRef<number | null>(null);

  // Picker-databronnen — alleen actief bij de juiste trigger.
  const recordSearch = useSearch({
    q: trigger?.type === '/' ? trigger.query : '',
    limit: 5,
  });
  const userSearch = useChatUsers(
    trigger?.type === '@' ? trigger.query : '',
    trigger?.type === '@',
  );

  // Herstel de cursorpositie na een programmatische tekstvervanging.
  useLayoutEffect(() => {
    if (caretRef.current !== null && textareaRef.current) {
      textareaRef.current.selectionStart = caretRef.current;
      textareaRef.current.selectionEnd = caretRef.current;
      textareaRef.current.focus();
      caretRef.current = null;
    }
  });

  function refreshTrigger(text: string, caret: number) {
    setTrigger(detectTrigger(text, caret));
    setActiveIndex(0);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value;
    setValue(text);
    refreshTrigger(text, e.target.selectionStart ?? text.length);
  }

  function replaceTriggerToken(replacement: string) {
    if (!trigger) return;
    const caret = textareaRef.current?.selectionStart ?? value.length;
    const next = value.slice(0, trigger.start) + replacement + value.slice(caret);
    caretRef.current = trigger.start + replacement.length;
    setValue(next);
    setTrigger(null);
  }

  function selectRecord(type: string, item: Record<string, unknown>) {
    const referenceType = SEARCH_TYPE_TO_REFERENCE[type];
    const id = item.id as string;
    if (!referenceType || !id) return;
    setPendingRef({ entityType: referenceType, entityId: id, label: searchItemLabel(type, item) });
    replaceTriggerToken(''); // verwijder het "/..."-token
  }

  function selectMention(user: ChatUser) {
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ');
    replaceTriggerToken(`@${name} `);
    setMentions((prev) => (prev.some((u) => u.id === user.id) ? prev : [...prev, user]));
  }

  // Bouw de zichtbare picker-opties op basis van de actieve trigger.
  const options: PickerOption[] = [];
  let pickerLoading = false;
  if (trigger?.type === '/') {
    pickerLoading = recordSearch.isLoading;
    for (const group of recordSearch.data?.groups ?? []) {
      if (!SEARCH_TYPE_TO_REFERENCE[group.type]) continue;
      for (const item of group.items as unknown as Array<Record<string, unknown>>) {
        options.push({
          key: `${group.type}:${item.id}`,
          label: searchItemLabel(group.type, item),
          sublabel: group.type,
          apply: () => selectRecord(group.type, item),
        });
      }
    }
  } else if (trigger?.type === '@') {
    pickerLoading = userSearch.isLoading;
    for (const u of userSearch.data ?? []) {
      options.push({
        key: u.id,
        label: [u.firstName, u.lastName].filter(Boolean).join(' '),
        apply: () => selectMention(u),
        user: u,
      });
    }
  }
  const showPicker = trigger !== null;

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (showPicker && options.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % options.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + options.length) % options.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        options[activeIndex]?.apply();
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setTrigger(null);
        return;
      }
    }
    // Enter (zonder shift) verstuurt het bericht.
    if (e.key === 'Enter' && !e.shiftKey && !showPicker) {
      e.preventDefault();
      void handleSend();
    }
  }

  async function handleSend() {
    const content = value.trim();
    if (!content || disabled || sendMessage.isPending) return;
    // Alleen mentions meesturen die nog in de tekst staan.
    const activeMentions = mentions.filter((u) =>
      value.includes(`@${[u.firstName, u.lastName].filter(Boolean).join(' ')}`),
    );
    try {
      const msg = await sendMessage.mutateAsync({
        content,
        mentionedUserIds: activeMentions.length ? activeMentions.map((u) => u.id) : undefined,
        referenceEntityType: pendingRef?.entityType,
        referenceEntityId: pendingRef?.entityId,
      });
      setValue('');
      setPendingRef(null);
      setMentions([]);
      setTrigger(null);
      onSent(msg);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  }

  return (
    <div className="relative border-t border-gray-200 bg-white p-3">
      {/* Referentie-chip */}
      {pendingRef && (
        <div className="mb-2 flex items-center gap-2">
          <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-primary-50 px-2 py-1 text-xs text-primary-700">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 11-5.656-5.656l1.5-1.5" />
            </svg>
            <span className="truncate">{pendingRef.label}</span>
            <button
              type="button"
              onClick={() => setPendingRef(null)}
              className="ml-0.5 text-primary-400 hover:text-primary-700"
              aria-label="Referentie verwijderen"
            >
              ×
            </button>
          </span>
        </div>
      )}

      {/* Picker-dropdown */}
      {showPicker && (
        <div className="absolute bottom-full left-3 right-3 mb-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {pickerLoading && (
            <div className="flex justify-center py-4">
              <Spinner size="sm" />
            </div>
          )}
          {!pickerLoading && options.length === 0 && (
            <div className="px-3 py-3 text-center text-xs text-gray-400">
              {trigger?.type === '/' ? 'Typ om een record te zoeken…' : 'Geen gebruikers gevonden'}
            </div>
          )}
          {options.map((opt, i) => (
            <button
              key={opt.key}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                opt.apply();
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                i === activeIndex ? 'bg-primary-50' : 'hover:bg-gray-50'
              }`}
            >
              {opt.user && <ChatAvatar user={opt.user} size="sm" />}
              <span className="min-w-0 flex-1 truncate text-gray-900">{opt.label}</span>
              {opt.sublabel && <span className="text-xs text-gray-400">{opt.sublabel}</span>}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => refreshTrigger(value, e.currentTarget.selectionStart ?? 0)}
          rows={2}
          disabled={disabled}
          placeholder={disabled ? 'Dit gesprek is afgerond' : 'Bericht…  ( / voor record, @ voor persoon )'}
          className="min-h-[2.5rem] flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={disabled || !value.trim() || sendMessage.isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-600 text-white transition-colors hover:bg-primary-700 disabled:opacity-40"
          aria-label="Versturen"
        >
          {sendMessage.isPending ? (
            <Spinner size="sm" />
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
