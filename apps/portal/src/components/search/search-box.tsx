import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { SearchResultDropdown } from './search-result-dropdown';

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debouncedValue;
}

export function SearchBox() {
  const [inputValue, setInputValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const isSearchPage = location.pathname === '/search';
  const debouncedQuery = useDebounce(inputValue, 300);

  // On /search page: sync input with URL ?q= on mount
  useEffect(() => {
    if (isSearchPage) {
      const q = searchParams.get('q') ?? '';
      setInputValue(q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSearchPage]);

  // On /search page: update URL when debounced query changes
  useEffect(() => {
    if (!isSearchPage) return;
    if (debouncedQuery.trim().length >= 3) {
      const current = searchParams.get('q') ?? '';
      if (debouncedQuery.trim() !== current) {
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set('q', debouncedQuery.trim());
          next.delete('type'); // reset tab when query changes
          return next;
        });
      }
    }
  }, [debouncedQuery, isSearchPage, searchParams, setSearchParams]);

  // Close dropdown on outside click
  const handleOutsideClick = useCallback((e: MouseEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [handleOutsideClick]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setInputValue(value);
    if (!isSearchPage && value.trim().length >= 3) {
      setIsOpen(true);
    }
    if (!isSearchPage && value.trim().length < 3) {
      setIsOpen(false);
    }
  };

  const handleFocus = () => {
    setIsFocused(true);
    if (!isSearchPage && inputValue.trim().length >= 3) {
      setIsOpen(true);
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      setIsFocused(false);
      (e.currentTarget as HTMLInputElement).blur();
    }
    if (e.key === 'Enter' && inputValue.trim().length >= 3) {
      navigate(`/search?q=${encodeURIComponent(inputValue.trim())}`);
      setIsOpen(false);
    }
  };

  const showDropdown = isOpen && debouncedQuery.trim().length >= 3 && !isSearchPage;

  return (
    <div
      ref={containerRef}
      className={`relative transition-all duration-200 ${
        isFocused ? 'w-[512px]' : 'w-80'
      }`}
    >
      <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center">
        <svg
          className="h-4 w-4 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>
      <input
        type="search"
        value={inputValue}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder="Zoeken..."
        className="block w-full rounded-lg border border-gray-300 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-primary-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 transition-colors"
      />
      {showDropdown && (
        <SearchResultDropdown
          query={debouncedQuery.trim()}
          onClose={() => setIsOpen(false)}
        />
      )}
    </div>
  );
}
