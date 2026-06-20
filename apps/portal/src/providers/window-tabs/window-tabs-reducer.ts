/**
 * Pure reducer for the in-window tab state (Atera-style record tabs).
 *
 * State is keyed per "tab-domein" (resourceType), each holding the ordered set
 * of open record tabs. The reducer is deliberately UI- and router-free so it can
 * be unit-tested in isolation; navigation + persistence live in the provider.
 *
 * No-op actions return the SAME state reference on purpose — the provider runs a
 * persist-effect and (via useWindowTabSync) dispatches title/missing updates from
 * render effects, so reference stability prevents pointless re-renders/writes.
 */

export interface OpenTab {
  resourceType: string;
  id: string;
  /** Display title shown on the tab — NL, sourced from the record. */
  title: string;
  /** True when the underlying record was not found (404). Render hint only; not persisted. */
  missing?: boolean;
}

/** Open tabs grouped by resourceType. */
export type WindowTabsState = Record<string, OpenTab[]>;

export type WindowTabsAction =
  /** Upsert a tab and switch focus to it: updates the title + clears `missing` when it already exists. */
  | { type: 'open'; resourceType: string; tab: OpenTab }
  /** Add a tab only if absent (keeps an existing title untouched) — used for URL-driven auto-add. */
  | { type: 'ensure'; resourceType: string; tab: OpenTab }
  | { type: 'close'; resourceType: string; id: string }
  /** Close every tab except `keepId`; `keepId === null` closes them all. */
  | { type: 'closeOthers'; resourceType: string; keepId: string | null }
  | { type: 'closeAll'; resourceType: string }
  | { type: 'setTitle'; resourceType: string; id: string; title: string }
  | { type: 'setMissing'; resourceType: string; id: string; missing: boolean };

function tabsFor(state: WindowTabsState, resourceType: string): OpenTab[] {
  return state[resourceType] ?? [];
}

export function windowTabsReducer(
  state: WindowTabsState,
  action: WindowTabsAction,
): WindowTabsState {
  switch (action.type) {
    case 'open': {
      const list = tabsFor(state, action.resourceType);
      const idx = list.findIndex((t) => t.id === action.tab.id);
      let nextList: OpenTab[];
      if (idx === -1) {
        nextList = [...list, { ...action.tab, missing: false }];
      } else {
        nextList = [...list];
        nextList[idx] = { ...list[idx], title: action.tab.title, missing: false };
      }
      return { ...state, [action.resourceType]: nextList };
    }

    case 'ensure': {
      const list = tabsFor(state, action.resourceType);
      if (list.some((t) => t.id === action.tab.id)) return state;
      return {
        ...state,
        [action.resourceType]: [...list, { ...action.tab, missing: false }],
      };
    }

    case 'close': {
      const list = tabsFor(state, action.resourceType);
      if (!list.some((t) => t.id === action.id)) return state;
      return {
        ...state,
        [action.resourceType]: list.filter((t) => t.id !== action.id),
      };
    }

    case 'closeOthers': {
      const list = tabsFor(state, action.resourceType);
      const nextList = action.keepId
        ? list.filter((t) => t.id === action.keepId)
        : [];
      if (nextList.length === list.length) return state;
      return { ...state, [action.resourceType]: nextList };
    }

    case 'closeAll': {
      const list = tabsFor(state, action.resourceType);
      if (list.length === 0) return state;
      return { ...state, [action.resourceType]: [] };
    }

    case 'setTitle': {
      const list = tabsFor(state, action.resourceType);
      const idx = list.findIndex((t) => t.id === action.id);
      if (idx === -1 || list[idx].title === action.title) return state;
      const nextList = [...list];
      nextList[idx] = { ...list[idx], title: action.title };
      return { ...state, [action.resourceType]: nextList };
    }

    case 'setMissing': {
      const list = tabsFor(state, action.resourceType);
      const idx = list.findIndex((t) => t.id === action.id);
      if (idx === -1 || !!list[idx].missing === action.missing) return state;
      const nextList = [...list];
      nextList[idx] = { ...list[idx], missing: action.missing };
      return { ...state, [action.resourceType]: nextList };
    }

    default:
      return state;
  }
}
