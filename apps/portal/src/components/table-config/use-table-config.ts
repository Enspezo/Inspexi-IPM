import { useState, useMemo, useCallback, useRef } from 'react';
import type { Column } from '@/components/ui';
import type {
  ColumnDef,
  TableColumnConfig,
  TableFilter,
  TableGrouping,
} from './types';
import { useTableConfigPersistence } from './use-table-config-persistence';

interface UseTableConfigOptions<T> {
  pageKey: string;
  columns: ColumnDef<T>[];
}

interface UseTableConfigReturn<T> {
  activeColumns: Column<T>[];
  filteredData: (data: T[]) => T[];
  pendingColumnConfig: TableColumnConfig;
  setPendingColumnConfig: (config: TableColumnConfig) => void;
  pendingFilters: TableFilter[];
  setPendingFilters: (filters: TableFilter[]) => void;
  pendingGrouping: TableGrouping | null;
  setPendingGrouping: (grouping: TableGrouping | null) => void;
  applyColumns: () => void;
  applyFilters: () => void;
  resetToDefaults: () => void;
  isColumnsDirty: boolean;
  isFiltersDirty: boolean;
  allColumns: ColumnDef<T>[];
  appliedFilters: TableFilter[];
  appliedGrouping: TableGrouping | null;
}

function buildDefaultConfig<T>(columns: ColumnDef<T>[]): TableColumnConfig {
  return {
    visibleColumns: columns
      .filter((c) => c.defaultVisible !== false)
      .map((c) => c.key),
    columnOrder: columns.map((c) => c.key),
  };
}

function mergePersistedConfig<T>(
  persisted: TableColumnConfig,
  columns: ColumnDef<T>[],
): TableColumnConfig {
  const allKeys = new Set(columns.map((c) => c.key));
  // Remove keys that no longer exist
  const order = persisted.columnOrder.filter((k) => allKeys.has(k));
  const visible = persisted.visibleColumns.filter((k) => allKeys.has(k));
  // Add new keys at the end
  const existingKeys = new Set(order);
  for (const col of columns) {
    if (!existingKeys.has(col.key)) {
      order.push(col.key);
      if (col.defaultVisible !== false) {
        visible.push(col.key);
      }
    }
  }
  return { visibleColumns: visible, columnOrder: order };
}

function matchFilter(value: unknown, filter: TableFilter): boolean {
  if (value == null) return false;
  const strValue = String(value).toLowerCase();
  const filterValue = filter.value.toLowerCase();

  switch (filter.operator) {
    case 'bevat':
      return strValue.includes(filterValue);
    case 'is_gelijk_aan':
      return strValue === filterValue;
    case 'begint_met':
      return strValue.startsWith(filterValue);
    case 'voor':
      return new Date(String(value)) < new Date(filter.value);
    case 'na':
      return new Date(String(value)) > new Date(filter.value);
    default:
      return true;
  }
}

export function useTableConfig<T>({
  pageKey,
  columns,
}: UseTableConfigOptions<T>): UseTableConfigReturn<T> {
  const { load, save, clear } = useTableConfigPersistence(pageKey);
  const initializedRef = useRef(false);

  // Compute initial state
  const defaultConfig = useMemo(() => buildDefaultConfig(columns), [columns]);

  const [appliedConfig, setAppliedConfig] = useState<TableColumnConfig>(() => {
    const persisted = load();
    if (persisted?.config) {
      return mergePersistedConfig(persisted.config, columns);
    }
    return defaultConfig;
  });

  const [appliedFilters, setAppliedFilters] = useState<TableFilter[]>(() => {
    const persisted = load();
    return persisted?.filters ?? [];
  });

  const [appliedGrouping, setAppliedGrouping] = useState<TableGrouping | null>(() => {
    const persisted = load();
    return persisted?.grouping ?? null;
  });

  // Pending (draft) state
  const [pendingColumnConfig, setPendingColumnConfig] = useState<TableColumnConfig>(appliedConfig);
  const [pendingFilters, setPendingFilters] = useState<TableFilter[]>(appliedFilters);
  const [pendingGrouping, setPendingGrouping] = useState<TableGrouping | null>(appliedGrouping);

  // Dirty checks
  const isColumnsDirty = useMemo(
    () => JSON.stringify(pendingColumnConfig) !== JSON.stringify(appliedConfig),
    [pendingColumnConfig, appliedConfig],
  );

  const isFiltersDirty = useMemo(
    () =>
      JSON.stringify(pendingFilters) !== JSON.stringify(appliedFilters) ||
      JSON.stringify(pendingGrouping) !== JSON.stringify(appliedGrouping),
    [pendingFilters, appliedFilters, pendingGrouping, appliedGrouping],
  );

  // Compute active columns from applied config
  const activeColumns = useMemo(() => {
    const columnMap = new Map(columns.map((c) => [c.key, c]));

    const pinnedStart = columns.filter(
      (c) => c.pinned && (c.pinnedPosition ?? 'start') === 'start',
    );
    const pinnedEnd = columns.filter(
      (c) => c.pinned && c.pinnedPosition === 'end',
    );
    const pinnedKeys = new Set([...pinnedStart, ...pinnedEnd].map((c) => c.key));

    const middleColumns = appliedConfig.columnOrder
      .filter(
        (key) =>
          !pinnedKeys.has(key) && appliedConfig.visibleColumns.includes(key),
      )
      .map((key) => columnMap.get(key))
      .filter(Boolean) as Column<T>[];

    return [
      ...(pinnedStart as Column<T>[]),
      ...middleColumns,
      ...(pinnedEnd as Column<T>[]),
    ];
  }, [columns, appliedConfig]);

  // Client-side filtering function
  const filteredData = useCallback(
    (data: T[]): T[] => {
      if (appliedFilters.length === 0) return data;

      const columnMap = new Map(columns.map((c) => [c.key, c]));

      return data.filter((item) =>
        appliedFilters.every((filter) => {
          const colDef = columnMap.get(filter.columnKey);
          if (!colDef?.getFilterValue) return true;
          const value = colDef.getFilterValue(item);
          return matchFilter(value, filter);
        }),
      );
    },
    [appliedFilters, columns],
  );

  // Apply actions
  const applyColumns = useCallback(() => {
    setAppliedConfig(pendingColumnConfig);
    save(pendingColumnConfig, appliedFilters, appliedGrouping);
  }, [pendingColumnConfig, appliedFilters, appliedGrouping, save]);

  const applyFilters = useCallback(() => {
    setAppliedFilters(pendingFilters);
    setAppliedGrouping(pendingGrouping);
    save(appliedConfig, pendingFilters, pendingGrouping);
  }, [pendingFilters, pendingGrouping, appliedConfig, save]);

  const resetToDefaults = useCallback(() => {
    setAppliedConfig(defaultConfig);
    setAppliedFilters([]);
    setAppliedGrouping(null);
    setPendingColumnConfig(defaultConfig);
    setPendingFilters([]);
    setPendingGrouping(null);
    clear();
  }, [defaultConfig, clear]);

  return {
    activeColumns,
    filteredData,
    pendingColumnConfig,
    setPendingColumnConfig,
    pendingFilters,
    setPendingFilters,
    pendingGrouping,
    setPendingGrouping,
    applyColumns,
    applyFilters,
    resetToDefaults,
    isColumnsDirty,
    isFiltersDirty,
    allColumns: columns,
    appliedFilters,
    appliedGrouping,
  };
}
