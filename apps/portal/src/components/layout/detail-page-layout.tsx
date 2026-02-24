import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';

const STORAGE_KEY = 'inspexi:sidebar-state';

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
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSidebarState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

interface DetailPageLayoutProps {
  children: ReactNode;
  sidebar?: ReactNode;
}

export function DetailPageLayout({ children, sidebar }: DetailPageLayoutProps) {
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
    <div className="flex gap-6">
      {/* Main content */}
      <div className="min-w-0 flex-1">{children}</div>

      {/* Sidebar toggle + panel */}
      <div className="relative flex shrink-0">
        {/* Toggle button — always visible */}
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

        {/* Sidebar panel */}
        <div
          className={`overflow-hidden transition-all duration-200 ${
            isOpen ? 'w-80 opacity-100' : 'w-0 opacity-0'
          }`}
        >
          <div className="w-80 space-y-4">
            {sidebar ?? (
              <div className="rounded-xl border border-gray-200 bg-white px-4 py-6 shadow-sm">
                <p className="text-center text-sm text-gray-400">
                  Metadata wordt later toegevoegd
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
