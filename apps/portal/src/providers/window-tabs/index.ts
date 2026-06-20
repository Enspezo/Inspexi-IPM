export {
  WindowTabsProvider,
  useWindowTabs,
  useActiveResourceTabs,
  useWindowTabSync,
  type ActiveResourceTabs,
} from './window-tabs-provider';
export {
  RESOURCE_TABS,
  RESOURCE_TABS_BY_TYPE,
  findResourceByPath,
  type ResourceTabConfig,
  type ActiveResourceMatch,
} from './resource-registry';
export {
  windowTabsReducer,
  type OpenTab,
  type WindowTabsState,
  type WindowTabsAction,
} from './window-tabs-reducer';
