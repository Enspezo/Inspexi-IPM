import { useEffect, useState } from 'react';

/**
 * Debounce een snel-veranderende waarde (bijv. zoekinput) tot deze `delay` ms
 * lang stabiel blijft. Gedeeld door het helpcentrum en de help-widget.
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
