import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ChatView = 'list' | 'thread' | 'new';

export interface PendingReference {
  /** PascalCase modelnaam, bv. "Request". */
  entityType: string;
  entityId: string;
  /** Optioneel label voor weergave in de chip. */
  label?: string;
}

interface ChatContextValue {
  isOpen: boolean;
  view: ChatView;
  activeThreadId: string | null;
  pendingReference: PendingReference | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  openThread: (threadId: string) => void;
  openList: () => void;
  startNew: (reference?: PendingReference) => void;
  /** Opent de chat in "nieuw"-modus met een record voorgevuld (detailpagina-actie). */
  startChatForRecord: (reference: PendingReference) => void;
  clearPendingReference: () => void;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<ChatView>('list');
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingReference, setPendingReference] = useState<PendingReference | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  const openThread = useCallback((threadId: string) => {
    setActiveThreadId(threadId);
    setView('thread');
    setIsOpen(true);
  }, []);

  const openList = useCallback(() => {
    setView('list');
    setActiveThreadId(null);
  }, []);

  const startNew = useCallback((reference?: PendingReference) => {
    setPendingReference(reference ?? null);
    setView('new');
    setIsOpen(true);
  }, []);

  const startChatForRecord = useCallback((reference: PendingReference) => {
    setPendingReference(reference);
    setView('new');
    setActiveThreadId(null);
    setIsOpen(true);
  }, []);

  const clearPendingReference = useCallback(() => setPendingReference(null), []);

  const value = useMemo<ChatContextValue>(
    () => ({
      isOpen,
      view,
      activeThreadId,
      pendingReference,
      open,
      close,
      toggle,
      openThread,
      openList,
      startNew,
      startChatForRecord,
      clearPendingReference,
    }),
    [
      isOpen,
      view,
      activeThreadId,
      pendingReference,
      open,
      close,
      toggle,
      openThread,
      openList,
      startNew,
      startChatForRecord,
      clearPendingReference,
    ],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatContextValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat moet binnen ChatProvider gebruikt worden');
  return ctx;
}
