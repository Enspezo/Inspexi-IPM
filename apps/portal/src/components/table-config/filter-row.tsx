import type { ColumnDef, TableFilter, FilterOperator } from './types';

interface FilterRowProps<T> {
  filter: TableFilter;
  columns: ColumnDef<T>[];
  onChange: (updated: TableFilter) => void;
  onRemove: () => void;
}

const textOperators: { value: FilterOperator; label: string }[] = [
  { value: 'bevat', label: 'Bevat' },
  { value: 'is_gelijk_aan', label: 'Is gelijk aan' },
  { value: 'begint_met', label: 'Begint met' },
];

const dateOperators: { value: FilterOperator; label: string }[] = [
  { value: 'voor', label: 'Voor' },
  { value: 'na', label: 'Na' },
  { value: 'is_gelijk_aan', label: 'Is gelijk aan' },
];

const selectOperators: { value: FilterOperator; label: string }[] = [
  { value: 'is_gelijk_aan', label: 'Is gelijk aan' },
];

function getOperators<T>(
  col: ColumnDef<T> | undefined,
): { value: FilterOperator; label: string }[] {
  if (!col) return textOperators;
  switch (col.filterType) {
    case 'date':
      return dateOperators;
    case 'select':
    case 'boolean':
      return selectOperators;
    default:
      return textOperators;
  }
}

export function FilterRow<T>({
  filter,
  columns,
  onChange,
  onRemove,
}: FilterRowProps<T>) {
  const filterableColumns = columns.filter((c) => c.filterable);
  const selectedCol = columns.find((c) => c.key === filter.columnKey);
  const operators = getOperators(selectedCol);

  const handleColumnChange = (columnKey: string) => {
    const col = columns.find((c) => c.key === columnKey);
    const ops = getOperators(col);
    onChange({
      columnKey,
      operator: ops[0]?.value ?? 'bevat',
      value: '',
    });
  };

  return (
    <div className="flex items-center gap-1.5">
      {/* Column select */}
      <select
        className="w-28 truncate rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
        value={filter.columnKey}
        onChange={(e) => handleColumnChange(e.target.value)}
      >
        <option value="" disabled>
          Kolom
        </option>
        {filterableColumns.map((col) => (
          <option key={col.key} value={col.key}>
            {col.sidebarLabel || col.header || col.key}
          </option>
        ))}
      </select>

      {/* Operator select */}
      <select
        className="w-28 truncate rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
        value={filter.operator}
        onChange={(e) =>
          onChange({ ...filter, operator: e.target.value as FilterOperator })
        }
      >
        {operators.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>

      {/* Value input */}
      {selectedCol?.filterType === 'select' ? (
        <select
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
        >
          <option value="" disabled>
            Kies...
          </option>
          {selectedCol.filterOptions?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : selectedCol?.filterType === 'date' ? (
        <input
          type="date"
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
        />
      ) : selectedCol?.filterType === 'boolean' ? (
        <select
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
        >
          <option value="" disabled>
            Kies...
          </option>
          <option value="true">Ja</option>
          <option value="false">Nee</option>
        </select>
      ) : (
        <input
          type="text"
          placeholder="Waarde..."
          className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-xs focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500/20"
          value={filter.value}
          onChange={(e) => onChange({ ...filter, value: e.target.value })}
        />
      )}

      {/* Remove button */}
      <button
        type="button"
        onClick={onRemove}
        className="flex-shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
