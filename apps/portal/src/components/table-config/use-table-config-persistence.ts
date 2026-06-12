import { tenantStorage } from '@/lib/storage';
import { useCallback } from 'react';
import type {
  TableColumnConfig,
  TableFilter,
  TableGrouping,
  TableSort,
  PersistedTableState,
} from './types';

const STORAGE_PREFIX = 'table-config:';
const SCHEMA_VERSION = 1;

export function useTableConfigPersistence(pageKey: string) {
  const storageKey = `${STORAGE_PREFIX}${pageKey}`;

  const load = useCallback((): PersistedTableState | null => {
    try {
      const raw = tenantStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedTableState;
      if (parsed.version !== SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [storageKey]);

  const save = useCallback(
    (
      config: TableColumnConfig,
      filters: TableFilter[],
      grouping: TableGrouping | null,
      sort?: TableSort | null,
    ) => {
      const state: PersistedTableState = {
        config,
        filters,
        grouping,
        sort: sort ?? null,
        version: SCHEMA_VERSION,
      };
      try {
        tenantStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // Storage full or unavailable
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    tenantStorage.removeItem(storageKey);
  }, [storageKey]);

  return { load, save, clear };
}
