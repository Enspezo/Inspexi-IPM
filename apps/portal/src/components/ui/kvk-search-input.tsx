import { useState, useRef, useEffect, useCallback } from 'react';
import { searchKvk, type KvkSearchResult } from '@/lib/kvk';
import { Spinner } from '@inspexi/ui';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface KvkSearchInputProps {
  onSelect: (result: KvkSearchResult) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
}

export function KvkSearchInput({
  onSelect,
  placeholder = 'Zoek op bedrijfsnaam of KvK-nummer…',
  disabled = false,
  label,
}: KvkSearchInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSelected, setIsSelected] = useState(false);
  const [results, setResults] = useState<KvkSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(isSelected ? '' : inputValue, 350);

  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    searchKvk(debouncedQuery)
      .then((data) => {
        if (!cancelled) {
          setResults(data);
          setIsOpen(data.length > 0);
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

  // Close dropdown on outside click
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
    (result: KvkSearchResult) => {
      setIsOpen(false);
      setInputValue(result.naam);
      setIsSelected(true);
      onSelect(result);
    },
    [onSelect],
  );

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

  const handleReset = () => {
    setInputValue('');
    setIsSelected(false);
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <div className="pointer-events-none absolute left-3 flex items-center">
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
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-8 text-sm transition-colors focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
        />

        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleReset}
            className="absolute right-2 flex items-center p-0.5 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
            aria-label="Wis zoekopdracht"
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

      {isOpen && results.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {results.map((r, idx) => (
            <li
              key={r.kvkNummer}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(r);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm ${
                idx === activeIndex
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              {/* KvK icon */}
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
              <div className="min-w-0">
                <div className="font-medium">{r.naam}</div>
                <div className="text-xs text-gray-500">
                  {[r.kvkNummer, r.postcode && r.plaats ? `${r.postcode} ${r.plaats}` : r.plaats]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
