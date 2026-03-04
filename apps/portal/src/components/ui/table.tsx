import { type ReactNode } from 'react';
import { clsx } from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

export interface TableSort {
  columnKey: string;
  direction: 'asc' | 'desc';
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
  className?: string;
  sort?: TableSort | null;
  onSort?: (columnKey: string) => void;
}

function SortIcon({ direction }: { direction: 'asc' | 'desc' | null }) {
  if (direction === 'asc') {
    return (
      <svg className="h-3.5 w-3.5 text-primary-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M14.77 12.79a.75.75 0 01-1.06-.02L10 8.832 6.29 12.77a.75.75 0 11-1.08-1.04l4.25-4.5a.75.75 0 011.08 0l4.25 4.5a.75.75 0 01-.02 1.06z" clipRule="evenodd" />
      </svg>
    );
  }
  if (direction === 'desc') {
    return (
      <svg className="h-3.5 w-3.5 text-primary-600 shrink-0" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
      </svg>
    );
  }
  return (
    <svg className="h-3.5 w-3.5 text-gray-300 shrink-0 group-hover:text-gray-400" viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a.75.75 0 01.55.24l3.25 3.5a.75.75 0 11-1.1 1.02L10 4.852 7.3 7.76a.75.75 0 01-1.1-1.02l3.25-3.5A.75.75 0 0110 3zm-3.76 9.2a.75.75 0 011.06.04l2.7 2.908 2.7-2.908a.75.75 0 111.1 1.02l-3.25 3.5a.75.75 0 01-1.1 0l-3.25-3.5a.75.75 0 01.04-1.06z" clipRule="evenodd" />
    </svg>
  );
}

export function Table<T>({
  columns,
  data,
  keyExtractor,
  emptyMessage = 'Geen gegevens gevonden',
  className,
  sort,
  onSort,
}: TableProps<T>) {
  return (
    <div className={clsx('overflow-hidden rounded-lg border border-gray-200 shadow-sm', className)}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => {
                const isSortable = column.sortable && !!onSort;
                const activeDirection =
                  sort?.columnKey === column.key ? sort.direction : null;

                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={clsx(
                      'px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500',
                      column.className,
                      isSortable && 'select-none',
                    )}
                  >
                    {isSortable ? (
                      <button
                        onClick={() => onSort(column.key)}
                        className="group inline-flex items-center gap-1 hover:text-gray-700 transition-colors"
                      >
                        {column.header}
                        <SortIcon direction={activeDirection} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white">
            {data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  className="transition-colors hover:bg-gray-50"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={clsx(
                        'whitespace-nowrap px-6 py-4 text-sm text-gray-900',
                        column.className,
                      )}
                    >
                      {column.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
