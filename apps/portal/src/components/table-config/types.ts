import type { Column } from '@/components/ui';

export interface ColumnDef<T> extends Column<T> {
  /** If true, this column cannot be hidden or reordered. */
  pinned?: boolean;
  /** Where to pin: 'start' (default) or 'end'. */
  pinnedPosition?: 'start' | 'end';
  /** Whether visible by default. Defaults to true. */
  defaultVisible?: boolean;
  /** Whether this column can be used as a filter field. */
  filterable?: boolean;
  /** Filter UI type. */
  filterType?: 'text' | 'select' | 'date' | 'boolean';
  /** Options for select-type filters. */
  filterOptions?: { value: string; label: string }[];
  /** Whether this column can be used for grouping. */
  groupable?: boolean;
  /** Label shown in sidebar when header is empty. */
  sidebarLabel?: string;
  /** Extract the value from an item for client-side filtering. */
  getFilterValue?: (item: T) => unknown;
  /** Extract the value from an item for client-side sorting. Falls back to getFilterValue, then item[key]. */
  getSortValue?: (item: T) => string | number | Date | null | undefined;
  /** Backend field name for server-side sorting. When set, sort is delegated to the API. */
  sortKey?: string;
}

export interface TableColumnConfig {
  visibleColumns: string[];
  columnOrder: string[];
}

export type FilterOperator =
  | 'bevat'
  | 'is_gelijk_aan'
  | 'begint_met'
  | 'voor'
  | 'na';

export interface TableFilter {
  columnKey: string;
  operator: FilterOperator;
  value: string;
}

export interface TableGrouping {
  columnKey: string;
}

export interface TableSort {
  columnKey: string;
  direction: 'asc' | 'desc';
}

export interface PersistedTableState {
  config: TableColumnConfig;
  filters: TableFilter[];
  grouping: TableGrouping | null;
  sort?: TableSort | null;
  version: number;
}
