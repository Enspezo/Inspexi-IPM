import { useState, useRef, useEffect, useCallback } from 'react';
import { Spinner } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import type { PlanningItem } from '@/types';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

interface PlanningListResponse {
  data: PlanningItem[];
  total: number;
  page: number;
  limit: number;
}

function getPlanningLabel(item: PlanningItem): string {
  const parts: string[] = [];
  parts.push(item.productName);
  if (item.contact) {
    const name =
      item.contact.companyName ||
      [item.contact.firstName, item.contact.lastName]
        .filter(Boolean)
        .join(' ');
    if (name) parts.push(`— ${name}`);
  }
  return parts.join(' ');
}

function getPlanningDateLabel(item: PlanningItem): string | null {
  if (!item.scheduledDate) return null;
  return new Date(item.scheduledDate).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface PlanningSearchInputProps {
  /** Currently selected planning item ID */
  value: string;
  /** Display name for the selected item — when omitted and value is non-empty the component fetches it */
  displayValue?: string;
  /** Called when a planning item is selected or cleared */
  onSelect: (planningItemId: string, displayName: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function PlanningSearchInput({
  value,
  displayValue,
  onSelect,
  label,
  error,
  disabled = false,
  placeholder = 'Zoek een planregel...',
}: PlanningSearchInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSelected, setIsSelected] = useState(false);
  const [results, setResults] = useState<PlanningItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fetch display name when value is provided but displayValue is not
  useEffect(() => {
    if (!value) {
      setInputValue('');
      setIsSelected(false);
      return;
    }
    if (displayValue) {
      setInputValue(displayValue);
      setIsSelected(true);
      return;
    }
    // Fetch the planning item to get its label
    apiClient
      .get<PlanningItem>(`/planning/${value}`)
      .then((item) => {
        setInputValue(getPlanningLabel(item));
        setIsSelected(true);
      })
      .catch(() => {
        // Ignore fetch errors — user can re-search
      });
  }, [value, displayValue]);

  const debouncedQuery = useDebounce(isSelected ? '' : inputValue, 300);

  // Search when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    apiClient
      .get<PlanningListResponse>(
        `/planning?search=${encodeURIComponent(debouncedQuery)}&limit=10`,
      )
      .then((res) => {
        if (!cancelled) {
          const list = res.data || [];
          setResults(list);
          setIsOpen(list.length > 0);
          setActiveIndex(-1);
        }
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setIsSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = useCallback(
    (item: PlanningItem) => {
      const name = getPlanningLabel(item);
      setInputValue(name);
      setIsSelected(true);
      setIsOpen(false);
      setResults([]);
      onSelect(item.id, name);
    },
    [onSelect],
  );

  const handleClear = () => {
    setInputValue('');
    setIsSelected(false);
    setResults([]);
    setIsOpen(false);
    onSelect('', '');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && results[activeIndex]) {
        handleSelect(results[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2">
          {isSearching ? (
            <Spinner size="sm" />
          ) : (
            <svg
              className="h-4 w-4 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </div>

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsSelected(false);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!isSelected && results.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={`w-full rounded-lg border py-2 pl-9 pr-8 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            error
              ? 'border-red-300 bg-red-50 focus:ring-red-400'
              : 'border-gray-300 bg-white focus:border-primary-500'
          } ${disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''}`}
        />

        {/* Clear button */}
        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
            aria-label="Wis selectie"
          >
            <svg
              className="h-4 w-4"
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
        )}
      </div>

      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

      {/* Results dropdown */}
      {isOpen && results.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {results.map((item, idx) => {
            const dateLabel = getPlanningDateLabel(item);
            const contactName = item.contact
              ? item.contact.companyName ||
                [item.contact.firstName, item.contact.lastName]
                  .filter(Boolean)
                  .join(' ')
              : null;

            return (
              <li
                key={item.id}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm ${
                  idx === activeIndex
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-600">
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
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <div className="flex flex-1 flex-col truncate">
                  <span className="truncate font-medium">
                    {item.productName}
                  </span>
                  {contactName && (
                    <span className="truncate text-xs text-gray-500">
                      {contactName}
                    </span>
                  )}
                </div>
                {dateLabel && (
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {dateLabel}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
