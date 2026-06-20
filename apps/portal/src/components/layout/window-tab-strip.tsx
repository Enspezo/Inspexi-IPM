import { useEffect, useRef, useState } from 'react';
import { useActiveResourceTabs, useWindowTabs } from '@/providers/window-tabs';

function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function OverflowIcon() {
  return (
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
      <path d="M6 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM11.5 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM17 10a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
    </svg>
  );
}

/**
 * Atera-style in-window tab strip, mounted between the header and the main
 * content. Shows the non-closable anchor (overzicht) tab plus the open record
 * tabs for the current tab-domein. Rendered as null on routes without a domein
 * and when no record tabs are open. All model knowledge lives in the registry.
 */
export function WindowTabStrip() {
  // Hooks must run unconditionally — bail out after they are called.
  const active = useActiveResourceTabs();
  const { closeTab, closeOthers, closeAll, setActive } = useWindowTabs();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [menuOpen]);

  // Nothing to show: no tab-domein for this route, or no record tabs opened yet.
  if (!active || active.tabs.length === 0) return null;

  const { resource, tabs, activeId } = active;
  const rt = resource.resourceType;
  const anchorActive = activeId === null;

  return (
    <div className="flex h-11 shrink-0 items-stretch border-b border-gray-200 bg-white">
      <div
        role="tablist"
        aria-label={`Geopende ${resource.label.toLowerCase()}`}
        className="flex flex-1 items-stretch overflow-x-auto"
      >
        {/* Anchor (overzicht) — never closable */}
        <button
          type="button"
          role="tab"
          aria-selected={anchorActive}
          onClick={() => setActive(rt, null)}
          title={resource.label}
          className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 border-r border-r-gray-100 px-4 text-sm font-medium transition-colors ${
            anchorActive
              ? 'border-b-primary-600 text-primary-600'
              : 'border-b-transparent text-gray-500 hover:bg-gray-50 hover:text-gray-700'
          }`}
        >
          {resource.icon}
          <span className="whitespace-nowrap">{resource.label}</span>
        </button>

        {/* Record tabs */}
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={0}
              onClick={() => setActive(rt, tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setActive(rt, tab.id);
                }
              }}
              // Middle-click closes the tab (preventDefault stops autoscroll).
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  closeTab(rt, tab.id);
                }
              }}
              title={tab.missing ? `${tab.title} — niet gevonden` : tab.title}
              className={`group -mb-px inline-flex shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-r border-r-gray-100 pl-3 pr-1.5 text-sm transition-colors ${
                isActive
                  ? 'border-b-primary-600 text-primary-600'
                  : 'border-b-transparent text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <span className="shrink-0 text-gray-400">{resource.icon}</span>
              <span
                className={`max-w-[12rem] truncate ${
                  tab.missing ? 'text-gray-400 line-through' : ''
                }`}
              >
                {tab.title}
              </span>
              <button
                type="button"
                aria-label={`${tab.title} sluiten`}
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(rt, tab.id);
                }}
                className="ml-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-gray-400 opacity-60 transition-colors hover:bg-gray-200 hover:text-gray-700 hover:opacity-100 group-hover:opacity-100"
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>

      {/* "…" overflow menu */}
      <div
        ref={menuRef}
        className="relative flex shrink-0 items-center border-l border-gray-200 px-1"
        onKeyDown={(e) => {
          if (e.key === 'Escape' && menuOpen) {
            setMenuOpen(false);
            menuTriggerRef.current?.focus();
          }
        }}
      >
        <button
          ref={menuTriggerRef}
          type="button"
          aria-label="Tabblad-acties"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="flex h-7 w-7 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
        >
          <OverflowIcon />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              disabled={anchorActive || tabs.length <= 1}
              onClick={() => {
                setMenuOpen(false);
                closeOthers(rt, activeId);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300 disabled:hover:bg-transparent"
            >
              Sluit andere tabbladen
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                closeAll(rt);
              }}
              className="flex w-full items-center px-3 py-2 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
            >
              Sluit alle tabbladen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
