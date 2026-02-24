import { Button } from '@/components/ui';
import type { ColumnDef, TableColumnConfig, TableFilter, TableGrouping } from './types';
import { ColumnList } from './column-list';
import { FilterSection } from './filter-section';

interface TableConfigSidebarProps<T> {
  columns: ColumnDef<T>[];
  pendingColumnConfig: TableColumnConfig;
  onColumnConfigChange: (config: TableColumnConfig) => void;
  pendingFilters: TableFilter[];
  onFiltersChange: (filters: TableFilter[]) => void;
  pendingGrouping: TableGrouping | null;
  onGroupingChange: (grouping: TableGrouping | null) => void;
  onApplyColumns: () => void;
  onApplyFilters: () => void;
  onReset: () => void;
  isColumnsDirty: boolean;
  isFiltersDirty: boolean;
}

export function TableConfigSidebar<T>({
  columns,
  pendingColumnConfig,
  onColumnConfigChange,
  pendingFilters,
  onFiltersChange,
  pendingGrouping,
  onGroupingChange,
  onApplyColumns,
  onApplyFilters,
  onReset,
  isColumnsDirty,
  isFiltersDirty,
}: TableConfigSidebarProps<T>) {
  const hasFilterable = columns.some((c) => c.filterable);
  const hasGroupable = columns.some((c) => c.groupable);

  return (
    <div className="flex h-full flex-col">
      {/* Columns section */}
      <div className="flex-1 overflow-y-auto">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Kolommen
        </h3>

        <ColumnList
          columns={columns}
          config={pendingColumnConfig}
          onChange={onColumnConfigChange}
        />

        <div className="mt-3 flex gap-2">
          <Button
            size="sm"
            onClick={onApplyColumns}
            disabled={!isColumnsDirty}
          >
            Vernieuwen
          </Button>
          <Button variant="secondary" size="sm" onClick={onReset}>
            Herstellen
          </Button>
        </div>
      </div>

      {/* Divider + Filters section */}
      {(hasFilterable || hasGroupable) && (
        <>
          <hr className="my-4 border-gray-200" />

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
              Filters
            </h3>

            <FilterSection
              columns={columns}
              filters={pendingFilters}
              grouping={pendingGrouping}
              onFiltersChange={onFiltersChange}
              onGroupingChange={onGroupingChange}
            />

            <div className="mt-3">
              <Button
                size="sm"
                onClick={onApplyFilters}
                disabled={!isFiltersDirty}
              >
                Vernieuwen
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
