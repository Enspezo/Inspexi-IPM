import type {
  ColumnDef,
  TableFilter,
  TableGrouping,
} from './types';
import { FilterRow } from './filter-row';

interface FilterSectionProps<T> {
  columns: ColumnDef<T>[];
  filters: TableFilter[];
  grouping: TableGrouping | null;
  onFiltersChange: (filters: TableFilter[]) => void;
  onGroupingChange: (grouping: TableGrouping | null) => void;
}

export function FilterSection<T>({
  columns,
  filters,
  grouping,
  onFiltersChange,
  onGroupingChange,
}: FilterSectionProps<T>) {
  const filterableColumns = columns.filter((c) => c.filterable);
  const groupableColumns = columns.filter((c) => c.groupable);

  const handleAddFilter = () => {
    const firstFilterable = filterableColumns[0];
    if (!firstFilterable) return;
    onFiltersChange([
      ...filters,
      { columnKey: firstFilterable.key, operator: 'bevat', value: '' },
    ]);
  };

  const handleUpdateFilter = (index: number, updated: TableFilter) => {
    const next = [...filters];
    next[index] = updated;
    onFiltersChange(next);
  };

  const handleRemoveFilter = (index: number) => {
    onFiltersChange(filters.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="space-y-2">
        {filters.map((filter, i) => (
          <FilterRow
            key={i}
            filter={filter}
            columns={columns}
            onChange={(updated) => handleUpdateFilter(i, updated)}
            onRemove={() => handleRemoveFilter(i)}
          />
        ))}
      </div>

      {filterableColumns.length > 0 && (
        <button
          type="button"
          onClick={handleAddFilter}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          Filter toevoegen
        </button>
      )}

      {/* Grouping */}
      {groupableColumns.length > 0 && (
        <div>
          <label className="mb-1.5 block text-xs font-medium text-gray-600">
            Groeperen op
          </label>
          <select
            className="w-full rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
            value={grouping?.columnKey ?? ''}
            onChange={(e) =>
              onGroupingChange(
                e.target.value ? { columnKey: e.target.value } : null,
              )
            }
          >
            <option value="">Geen</option>
            {groupableColumns.map((col) => (
              <option key={col.key} value={col.key}>
                {col.sidebarLabel || col.header || col.key}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
