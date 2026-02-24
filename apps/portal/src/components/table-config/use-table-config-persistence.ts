import { useCallback } from 'react';
import type { TableColumnConfig, TableFilter, TableGrouping, PersistedTableState } from './types';

const STORAGE_PREFIX = 'inspexi-table-config:';
const SCHEMA_VERSION = 1;

export function useTableConfigPersistence(pageKey: string) {
  const storageKey = `${STORAGE_PREFIX}${pageKey}`;

  const load = useCallback((): PersistedTableState | null => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PersistedTableState;
      if (parsed.version !== SCHEMA_VERSION) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [storageKey]);

  const save = useCallback(
    (config: TableColumnConfig, filters: TableFilter[], grouping: TableGrouping | null) => {
      const state: PersistedTableState = { config, filters, grouping, version: SCHEMA_VERSION };
      try {
        localStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        // Storage full or unavailable
      }
    },
    [storageKey],
  );

  const clear = useCallback(() => {
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  return { load, save, clear };
}
