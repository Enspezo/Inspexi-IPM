import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { tenantStorage } from '@/lib/storage';
import {
  RESOURCE_TABS_BY_TYPE,
  findResourceByPath,
} from './resource-registry';
import {
  windowTabsReducer,
  type OpenTab,
  type WindowTabsState,
} from './window-tabs-reducer';

const STORAGE_KEY = 'window-tabs';

/** Load + sanitise the persisted tab set (tenant-scoped, so org-isolated). */
function loadState(): WindowTabsState {
  try {
    const raw = tenantStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: WindowTabsState = {};
    for (const [resourceType, list] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      out[resourceType] = list
        .filter(
          (t): t is OpenTab =>
            !!t &&
            typeof (t as OpenTab).id === 'string' &&
            typeof (t as OpenTab).title === 'string',
        )
        .map((t) => ({ resourceType, id: t.id, title: t.title }));
    }
    return out;
  } catch {
    return {};
  }
}

function persistState(state: WindowTabsState): void {
  try {
    // Strip the transient `missing` flag — it is re-derived when a detail page loads.
    const serializable: WindowTabsState = {};
    for (const [resourceType, list] of Object.entries(state)) {
      serializable[resourceType] = list.map(({ id, title }) => ({
        resourceType,
        id,
        title,
      }));
    }
    tenantStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
  } catch {
    // Storage unavailable — non-fatal.
  }
}

interface OpenTabOptions {
  /** Add the tab without switching to it (⌘/Ctrl-click / middle-click on a row). */
  background?: boolean;
}

interface WindowTabsContextValue {
  /** Open tabs grouped by resourceType. */
  tabs: WindowTabsState;
  openTab: (resourceType: string, id: string, title: string, opts?: OpenTabOptions) => void;
  closeTab: (resourceType: string, id: string) => void;
  closeOthers: (resourceType: string, keepId: string | null) => void;
  closeAll: (resourceType: string) => void;
  setActive: (resourceType: string, id: string | null) => void;
  setTabTitle: (resourceType: string, id: string, title: string) => void;
  markTabMissing: (resourceType: string, id: string, missing: boolean) => void;
}

const WindowTabsContext = createContext<WindowTabsContextValue | null>(null);

/**
 * Holds the in-window tab set for every registered tab-domein. The URL is the
 * single source of truth for which tab is ACTIVE (we never store an active id);
 * this provider only owns the *set* of open tabs + the navigation side-effects.
 */
export function WindowTabsProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [tabs, dispatch] = useReducer(windowTabsReducer, undefined, loadState);

  // Latest tabs for stale-free reads inside callbacks (neighbour lookup on close).
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Persist whenever the set changes (tenant-scoped key → no cross-org leaks).
  useEffect(() => {
    persistState(tabs);
  }, [tabs]);

  // URL drives the set: a detail route auto-adds its tab (placeholder title until
  // the detail page reports the real one). Covers direct links, bookmarks, the
  // notification bell, quick-create — anything that lands on a detail route.
  useEffect(() => {
    const match = findResourceByPath(location.pathname);
    if (match?.kind === 'detail') {
      dispatch({
        type: 'ensure',
        resourceType: match.resource.resourceType,
        tab: {
          resourceType: match.resource.resourceType,
          id: match.id,
          title: match.resource.pendingTitle,
        },
      });
    }
  }, [location.pathname]);

  const openTab = useCallback<WindowTabsContextValue['openTab']>(
    (resourceType, id, title, opts) => {
      const resource = RESOURCE_TABS_BY_TYPE[resourceType];
      if (!resource) return;
      dispatch({ type: 'open', resourceType, tab: { resourceType, id, title } });
      if (!opts?.background) navigate(resource.detailRoute(id));
    },
    [navigate],
  );

  const closeTab = useCallback<WindowTabsContextValue['closeTab']>(
    (resourceType, id) => {
      const resource = RESOURCE_TABS_BY_TYPE[resourceType];
      if (!resource) return;
      const list = tabsRef.current[resourceType] ?? [];
      const isActive = resource.matchDetailId(location.pathname) === id;
      dispatch({ type: 'close', resourceType, id });
      // Closing the active tab falls back to the neighbour, else the anchor.
      if (isActive) {
        const idx = list.findIndex((t) => t.id === id);
        const neighbour = list[idx + 1] ?? list[idx - 1];
        navigate(neighbour ? resource.detailRoute(neighbour.id) : resource.listRoute);
      }
    },
    [location.pathname, navigate],
  );

  const closeOthers = useCallback<WindowTabsContextValue['closeOthers']>(
    (resourceType, keepId) => {
      const resource = RESOURCE_TABS_BY_TYPE[resourceType];
      if (!resource) return;
      dispatch({ type: 'closeOthers', resourceType, keepId });
      navigate(keepId ? resource.detailRoute(keepId) : resource.listRoute);
    },
    [navigate],
  );

  const closeAll = useCallback<WindowTabsContextValue['closeAll']>(
    (resourceType) => {
      const resource = RESOURCE_TABS_BY_TYPE[resourceType];
      if (!resource) return;
      dispatch({ type: 'closeAll', resourceType });
      navigate(resource.listRoute);
    },
    [navigate],
  );

  const setActive = useCallback<WindowTabsContextValue['setActive']>(
    (resourceType, id) => {
      const resource = RESOURCE_TABS_BY_TYPE[resourceType];
      if (!resource) return;
      navigate(id ? resource.detailRoute(id) : resource.listRoute);
    },
    [navigate],
  );

  const setTabTitle = useCallback<WindowTabsContextValue['setTabTitle']>(
    (resourceType, id, title) => {
      dispatch({ type: 'setTitle', resourceType, id, title });
    },
    [],
  );

  const markTabMissing = useCallback<WindowTabsContextValue['markTabMissing']>(
    (resourceType, id, missing) => {
      dispatch({ type: 'setMissing', resourceType, id, missing });
    },
    [],
  );

  const value = useMemo<WindowTabsContextValue>(
    () => ({
      tabs,
      openTab,
      closeTab,
      closeOthers,
      closeAll,
      setActive,
      setTabTitle,
      markTabMissing,
    }),
    [tabs, openTab, closeTab, closeOthers, closeAll, setActive, setTabTitle, markTabMissing],
  );

  return <WindowTabsContext.Provider value={value}>{children}</WindowTabsContext.Provider>;
}

export function useWindowTabs(): WindowTabsContextValue {
  const ctx = useContext(WindowTabsContext);
  if (!ctx) {
    throw new Error('useWindowTabs must be used within a WindowTabsProvider');
  }
  return ctx;
}

export interface ActiveResourceTabs {
  resource: (typeof RESOURCE_TABS_BY_TYPE)[string];
  tabs: OpenTab[];
  /** The active record id from the URL, or null when the anchor (list) is active. */
  activeId: string | null;
}

/**
 * Strip helper: resolves the current route to its resource + open tabs + the
 * active id (derived from the URL). Returns null on routes without a tab-domein.
 */
export function useActiveResourceTabs(): ActiveResourceTabs | null {
  const location = useLocation();
  const { tabs } = useWindowTabs();
  const match = findResourceByPath(location.pathname);
  if (!match) return null;
  return {
    resource: match.resource,
    tabs: tabs[match.resource.resourceType] ?? [],
    activeId: match.kind === 'detail' ? match.id : null,
  };
}

/**
 * Detail pages call this to keep their tab's title in sync with the loaded record
 * and to flag a 404 (so the strip can mark a tab whose record no longer exists).
 * Both updates are no-ops when the tab is absent or unchanged.
 */
export function useWindowTabSync(
  resourceType: string,
  id: string | undefined,
  opts: { title?: string | null; notFound?: boolean },
): void {
  const { setTabTitle, markTabMissing } = useWindowTabs();
  const { title, notFound } = opts;

  useEffect(() => {
    if (id && title) setTabTitle(resourceType, id, title);
  }, [resourceType, id, title, setTabTitle]);

  useEffect(() => {
    if (id) markTabMissing(resourceType, id, !!notFound);
  }, [resourceType, id, notFound, markTabMissing]);
}
