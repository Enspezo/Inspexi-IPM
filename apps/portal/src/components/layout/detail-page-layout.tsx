import { useState, useEffect, useContext, createContext, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { tenantStorage } from '@/lib/storage';

const STORAGE_KEY = 'sidebar-state';

/** Return the "view key" for the current route, e.g. "/contacts/:id" → "contacts-detail" */
function getViewKey(pathname: string): string {
  const segments = pathname.split('/').filter(Boolean);

  // /contacts/persons/:id → contacts-persons-detail
  // /contacts/persons     → contacts-persons
  // /contacts/:id         → contacts-detail
  // /contacts             → contacts
  // /quotes/:id           → quotes-detail
  // etc.
  if (segments.length === 0) return 'root';

  // Check if last segment looks like a UUID (detail page)
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-/i;
  const lastIsId = uuidPattern.test(segments[segments.length - 1]);

  if (lastIsId) {
    const base = segments.slice(0, -1).join('-');
    return `${base}-detail`;
  }

  return segments.join('-');
}

function loadSidebarState(): Record<string, boolean> {
  try {
    const raw = tenantStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSidebarState(state: Record<string, boolean>) {
  try {
    tenantStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

interface SidebarContextValue {
  isOpen: boolean;
  onExpand: () => void;
}

const SidebarContext = createContext<SidebarContextValue>({ isOpen: false, onExpand: () => {} });

export function useSidebarContext() {
  return useContext(SidebarContext);
}

interface SidebarSectionProps {
  icon: ReactNode;
  label: string;
  count?: number;
  children: ReactNode;
}

export function SidebarSection({ icon, label, count, children }: SidebarSectionProps) {
  const { isOpen, onExpand } = useSidebarContext();

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onExpand}
        title={label}
        className="relative flex w-full flex-col items-center gap-1 rounded-lg px-1 py-3 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <span className="relative flex h-6 w-6 items-center justify-center">
          {icon}
          {count != null && count > 0 && (
            <span className="absolute -right-2 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary-600 px-1 text-[10px] font-bold leading-none text-white">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-gray-900">{label}</h3>
      {children}
    </div>
  );
}

interface DetailPageLayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
  /** When true, collapsed state shows a 56px icon strip instead of hiding completely */
  iconStrip?: boolean;
}

export function DetailPageLayout({ children, sidebar, iconStrip = false }: DetailPageLayoutProps) {
  const location = useLocation();
  const viewKey = getViewKey(location.pathname);

  const [isOpen, setIsOpen] = useState(() => {
    const saved = loadSidebarState();
    // Default to collapsed (false) if no preference saved for this view
    return saved[viewKey] ?? false;
  });

  // Sync state when navigating to a different view
  useEffect(() => {
    const saved = loadSidebarState();
    setIsOpen(saved[viewKey] ?? false);
  }, [viewKey]);

  const handleToggle = () => {
    const next = !isOpen;
    setIsOpen(next);

    const saved = loadSidebarState();
    saved[viewKey] = next;
    saveSidebarState(saved);
  };

  return (
    <SidebarContext.Provider value={{ isOpen, onExpand: () => { if (!isOpen) handleToggle(); } }}>
      <div className="flex gap-6">
        {/* Main content */}
        <div className="min-w-0 flex-1">{children}</div>

        {/* Sidebar toggle + panel */}
        <div className="relative flex shrink-0">
          {/* Toggle button at -left-3: shown when NOT using icon strip, OR when expanded */}
          {(!iconStrip || isOpen) && (
            <button
              onClick={handleToggle}
              className="absolute -left-3 top-0 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-600"
              title={isOpen ? 'Sidebar inklappen' : 'Sidebar uitklappen'}
            >
              <svg
                className={`h-3.5 w-3.5 transition-transform ${isOpen ? 'rotate-0' : 'rotate-180'}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          )}

          {/* Sidebar panel */}
          <div
            className={`overflow-hidden transition-all duration-200 ${
              isOpen ? 'w-80' : (iconStrip ? 'w-14' : 'w-0 opacity-0')
            }`}
          >
            <div className={isOpen ? 'w-80 space-y-6' : (iconStrip ? 'w-14 space-y-1 pt-1' : '')}>
              {/* Chevron at top of icon strip (collapsed + iconStrip mode only) */}
              {iconStrip && !isOpen && (
                <div className="flex w-full items-center justify-center py-2">
                  <button
                    onClick={handleToggle}
                    title="Sidebar uitklappen"
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-400 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-600"
                  >
                    <svg
                      className="h-3.5 w-3.5 rotate-180"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              )}

              {sidebar ?? (
                isOpen ? (
                  <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 shadow-sm">
                    <p className="text-center text-sm text-gray-400">
                      Metadata wordt later toegevoegd
                    </p>
                  </div>
                ) : null
              )}
            </div>
          </div>
        </div>
      </div>
    </SidebarContext.Provider>
  );
}
