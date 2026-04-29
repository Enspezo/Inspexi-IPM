import { useState, useMemo, useCallback } from 'react';
import type { Column } from '@/components/ui';
import type {
  ColumnDef,
  TableColumnConfig,
  TableFilter,
  TableGrouping,
  TableSort,
} from './types';
import { useTableConfigPersistence } from './use-table-config-persistence';

interface UseTableConfigOptions<T> {
  pageKey: string;
  columns: ColumnDef<T>[];
}

export interface ApiSort {
  sortBy: string;
  sortOrder: 'asc' | 'desc';
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
  sort: TableSort | null;
  toggleSort: (columnKey: string) => void;
  /** When the active sort column has a sortKey, contains server-side sort params to pass to the query hook. */
  apiSort: ApiSort | null;
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

function compareValues(
  a: unknown,
  b: unknown,
  direction: 'asc' | 'desc',
): number {
  // Nulls always last, regardless of direction
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;

  let result: number;

  if (typeof a === 'number' && typeof b === 'number') {
    result = a - b;
  } else {
    const strA = String(a);
    const strB = String(b);
    // Detect ISO date strings (starts with 4-digit year)
    const isDateLike = (s: string) =>
      /^\d{4}-\d{2}-\d{2}/.test(s) && !isNaN(new Date(s).getTime());
    if (isDateLike(strA) && isDateLike(strB)) {
      result = new Date(strA).getTime() - new Date(strB).getTime();
    } else {
      result = strA.localeCompare(strB, 'nl', { sensitivity: 'base' });
    }
  }

  return direction === 'asc' ? result : -result;
}

export function useTableConfig<T>({
  pageKey,
  columns,
}: UseTableConfigOptions<T>): UseTableConfigReturn<T> {
  const { load, save, clear } = useTableConfigPersistence(pageKey);

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

  const [sort, setSortRaw] = useState<TableSort | null>(() => {
    const persisted = load();
    return persisted?.sort ?? null;
  });

  // Compute server-side sort params when the sorted column has a sortKey
  const apiSort = useMemo<ApiSort | null>(() => {
    if (!sort) return null;
    const colDef = columns.find((c) => c.key === sort.columnKey);
    if (!colDef?.sortKey) return null;
    return { sortBy: colDef.sortKey, sortOrder: sort.direction };
  }, [sort, columns]);

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

  // Client-side filtering + sorting
  const filteredData = useCallback(
    (data: T[]): T[] => {
      const columnMap = new Map(columns.map((c) => [c.key, c]));

      // 1. Filter
      let result = data;
      if (appliedFilters.length > 0) {
        result = data.filter((item) =>
          appliedFilters.every((filter) => {
            const colDef = columnMap.get(filter.columnKey);
            if (!colDef?.getFilterValue) return true;
            const value = colDef.getFilterValue(item);
            return matchFilter(value, filter);
          }),
        );
      }

      // 2. Sort — skip client-side sort when server-side is active (apiSort is set)
      if (sort && !apiSort) {
        const colDef = columnMap.get(sort.columnKey);
        result = [...result].sort((a, b) => {
          let aVal: unknown;
          let bVal: unknown;
          if (colDef?.getSortValue) {
            aVal = colDef.getSortValue(a);
            bVal = colDef.getSortValue(b);
          } else if (colDef?.getFilterValue) {
            aVal = colDef.getFilterValue(a);
            bVal = colDef.getFilterValue(b);
          } else {
            aVal = (a as Record<string, unknown>)[sort.columnKey];
            bVal = (b as Record<string, unknown>)[sort.columnKey];
          }
          return compareValues(aVal, bVal, sort.direction);
        });
      }

      return result;
    },
    [appliedFilters, sort, apiSort, columns],
  );

  // Toggle sort: asc → desc → null (cleared), new column → asc
  const toggleSort = useCallback(
    (columnKey: string) => {
      setSortRaw((prev) => {
        let newSort: TableSort | null;
        if (prev?.columnKey === columnKey) {
          newSort = prev.direction === 'asc'
            ? { columnKey, direction: 'desc' }
            : null;
        } else {
          newSort = { columnKey, direction: 'asc' };
        }
        // Save immediately — sort doesn't go through an "Apply" button
        save(appliedConfig, appliedFilters, appliedGrouping, newSort);
        return newSort;
      });
    },
    [appliedConfig, appliedFilters, appliedGrouping, save],
  );

  // Apply actions
  const applyColumns = useCallback(() => {
    setAppliedConfig(pendingColumnConfig);
    save(pendingColumnConfig, appliedFilters, appliedGrouping, sort);
  }, [pendingColumnConfig, appliedFilters, appliedGrouping, sort, save]);

  const applyFilters = useCallback(() => {
    setAppliedFilters(pendingFilters);
    setAppliedGrouping(pendingGrouping);
    save(appliedConfig, pendingFilters, pendingGrouping, sort);
  }, [pendingFilters, pendingGrouping, appliedConfig, sort, save]);

  const resetToDefaults = useCallback(() => {
    setAppliedConfig(defaultConfig);
    setAppliedFilters([]);
    setAppliedGrouping(null);
    setPendingColumnConfig(defaultConfig);
    setPendingFilters([]);
    setPendingGrouping(null);
    setSortRaw(null);
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
    sort,
    toggleSort,
    apiSort,
  };
}
