import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import type { Contact, PaginatedResponse } from '@/types';
import { ContactType } from '@/types';
import { CreateContactModal } from '@/pages/contacts/components/create-contact-modal';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function getContactDisplayName(c: {
  type?: string;
  companyName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}): string {
  if (c.companyName) return c.companyName;
  return [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

export interface ContactSearchInputProps {
  /** Currently selected contact ID */
  value: string;
  /** Display name for the selected contact — when omitted and value is non-empty the component fetches it */
  displayValue?: string;
  /** Called when a contact is selected or cleared */
  onSelect: (contactId: string, contactName: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  placeholder?: string;
}

export function ContactSearchInput({
  value,
  displayValue,
  onSelect,
  label,
  error,
  disabled = false,
  placeholder = 'Zoek een relatie...',
}: ContactSearchInputProps) {
  const [inputValue, setInputValue] = useState('');
  const [isSelected, setIsSelected] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-fetch the display name when value is provided but displayValue is not
  const { data: fetchedContact } = useQuery<Contact>({
    queryKey: ['contacts', value],
    queryFn: () => apiClient.get<Contact>(`/contacts/${value}`),
    enabled: !!value && !displayValue,
    staleTime: 5 * 60 * 1000,
  });

  // Sync displayed text when value / displayValue / fetched contact change
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
    if (fetchedContact) {
      setInputValue(getContactDisplayName(fetchedContact));
      setIsSelected(true);
    }
  }, [value, displayValue, fetchedContact]);

  const debouncedQuery = useDebounce(isSelected ? '' : inputValue, 300);
  const trimmedQuery = debouncedQuery.trim();

  // Search via TanStack Query (cached, deduped, race-safe) instead of a manual fetch.
  const { data: searchData, isFetching: isSearching } = useQuery<PaginatedResponse<Contact>>({
    queryKey: ['contacts', 'search', trimmedQuery],
    queryFn: () =>
      apiClient.get<PaginatedResponse<Contact>>(
        `/contacts?search=${encodeURIComponent(trimmedQuery)}&limit=10`,
      ),
    enabled: trimmedQuery.length >= 2,
    staleTime: 30 * 1000,
  });
  const results = searchData?.data ?? [];

  // Open the dropdown when fresh results arrive for the current query; close otherwise.
  useEffect(() => {
    if (trimmedQuery.length >= 2 && results.length > 0) {
      setIsOpen(true);
      setActiveIndex(-1);
    } else {
      setIsOpen(false);
    }
    // `searchData` identity changes per resolved query — stable, unlike `results`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trimmedQuery, searchData]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = useCallback(
    (contact: Contact) => {
      const name = getContactDisplayName(contact);
      setInputValue(name);
      setIsSelected(true);
      setIsOpen(false);
      onSelect(contact.id, name);
    },
    [onSelect],
  );

  const handleClear = () => {
    setInputValue('');
    setIsSelected(false);
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

  const handleContactCreated = (contact: Contact) => {
    handleSelect(contact);
    setIsCreateModalOpen(false);
  };

  return (
    <>
      <div ref={containerRef} className="relative">
        {label && (
          <label className="mb-1 block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}

        <div className="flex items-center gap-1.5">
          {/* Search input */}
          <div className="relative flex-1">
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

          {/* "+" icon — opens create contact modal */}
          {!disabled && (
            <button
              type="button"
              onClick={() => setIsCreateModalOpen(true)}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-500 transition-colors hover:border-primary-400 hover:bg-primary-50 hover:text-primary-600"
              title="Nieuwe relatie aanmaken"
              aria-label="Nieuwe relatie aanmaken"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          )}
        </div>

        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

        {/* Results dropdown */}
        {isOpen && results.length > 0 && (
          <ul
            className="absolute z-50 mt-1 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg"
            style={{ width: 'calc(100% - 2.625rem)' }}
            role="listbox"
          >
            {results.map((contact, idx) => (
              <li
                key={contact.id}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(contact);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={`flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm ${
                  idx === activeIndex
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span
                  className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    contact.type === ContactType.COMPANY
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-green-100 text-green-600'
                  }`}
                >
                  {contact.type === ContactType.COMPANY ? 'B' : 'P'}
                </span>
                <span className="flex-1 truncate font-medium">
                  {getContactDisplayName(contact)}
                </span>
                {contact.email && (
                  <span className="flex-shrink-0 text-xs text-gray-400">
                    {contact.email}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <CreateContactModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreated={handleContactCreated}
      />
    </>
  );
}
