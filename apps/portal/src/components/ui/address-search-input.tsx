import { useState, useRef, useEffect, useCallback } from 'react';
import {
  suggestAddresses,
  lookupAddress,
  type AddressSuggestion,
  type ParsedAddress,
} from '@/lib/geocoding';
import { Spinner } from '@inspexi/ui';

export interface AddressSearchInputProps {
  onSelect: (address: ParsedAddress) => void;
  initialValue?: string;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  error?: string;
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function AddressSearchInput({
  onSelect,
  initialValue,
  placeholder = 'Zoek een adres…',
  disabled = false,
  label,
  error,
}: AddressSearchInputProps) {
  const [inputValue, setInputValue] = useState(initialValue ?? '');
  const [isSelected, setIsSelected] = useState(!!initialValue);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedQuery = useDebounce(isSelected ? '' : inputValue, 300);

  // Sync initialValue changes (e.g. when modal opens)
  useEffect(() => {
    setInputValue(initialValue ?? '');
    setIsSelected(!!initialValue);
    setSuggestions([]);
    setIsOpen(false);
  }, [initialValue]);

  // Fetch suggestions when debounced query changes
  useEffect(() => {
    if (debouncedQuery.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    let cancelled = false;
    setIsSearching(true);
    suggestAddresses(debouncedQuery)
      .then((results) => {
        if (!cancelled) {
          setSuggestions(results);
          setIsOpen(results.length > 0);
          setActiveIndex(-1);
        }
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
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
    async (suggestion: AddressSuggestion) => {
      setIsOpen(false);
      setInputValue(suggestion.label);
      setIsSelected(true);
      setIsLookingUp(true);
      try {
        const address = await lookupAddress(suggestion.id);
        onSelect(address);
      } catch {
        // silently ignore lookup errors — user can still fill manually
      } finally {
        setIsLookingUp(false);
      }
    },
    [onSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        handleSelect(suggestions[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  const handleReset = () => {
    setInputValue('');
    setIsSelected(false);
    setSuggestions([]);
    setIsOpen(false);
    setActiveIndex(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const isLoading = isSearching || isLookingUp;

  return (
    <div ref={containerRef} className="relative">
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        {/* Search icon */}
        <div className="pointer-events-none absolute left-3 flex items-center">
          {isLoading ? (
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
            if (!isSelected && suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          disabled={disabled || isLookingUp}
          className={`w-full rounded-lg border py-2 pl-9 pr-8 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 ${
            error
              ? 'border-red-300 bg-red-50 focus:ring-red-400'
              : 'border-gray-300 bg-white focus:border-primary-500'
          } ${disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''}`}
        />

        {/* Clear button — only when value present */}
        {inputValue && !disabled && (
          <button
            type="button"
            onClick={handleReset}
            className="absolute right-2 flex items-center p-0.5 text-gray-400 hover:text-gray-600"
            tabIndex={-1}
            aria-label="Wis adres"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Suggestions dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
          role="listbox"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent input blur before click
                handleSelect(s);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2.5 text-sm ${
                idx === activeIndex
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <svg
                className="h-4 w-4 flex-shrink-0 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {s.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
