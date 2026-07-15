import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type AiView = 'list' | 'conversation';

interface AiAgentContextValue {
  isOpen: boolean;
  view: AiView;
  activeConversationId: string | null;
  open: () => void;
  close: () => void;
  toggle: () => void;
  openConversation: (id: string) => void;
  openList: () => void;
}

const AiAgentContext = createContext<AiAgentContextValue | null>(null);

/** UI-state voor de AI-assistent-drawer (PRD-12). Geen dataophaling — die zit in de hooks. */
export function AiAgentProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<AiView>('list');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const openConversation = useCallback((id: string) => {
    setActiveConversationId(id);
    setView('conversation');
    setIsOpen(true);
  }, []);
  const openList = useCallback(() => {
    setActiveConversationId(null);
    setView('list');
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      view,
      activeConversationId,
      open,
      close,
      toggle,
      openConversation,
      openList,
    }),
    [isOpen, view, activeConversationId, open, close, toggle, openConversation, openList],
  );

  return <AiAgentContext.Provider value={value}>{children}</AiAgentContext.Provider>;
}

export function useAiAgent(): AiAgentContextValue {
  const ctx = useContext(AiAgentContext);
  if (!ctx) throw new Error('useAiAgent must be used within an AiAgentProvider');
  return ctx;
}
