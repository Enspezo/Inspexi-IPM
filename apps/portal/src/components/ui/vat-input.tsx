import { useState, useEffect, useRef, forwardRef } from 'react';
import { checkVatNumber, looksLikeVatNumber } from '@/lib/vat';
import type { VatValidationResult } from '@/lib/vat';

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

type ValidationStatus = 'idle' | 'checking' | 'valid' | 'invalid';

export interface VatInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label?: string;
  error?: string;
  value?: string;
  onChange?: (value: string) => void;
  /** Wordt aangeroepen zodra de VIES-check klaar is (of null bij wissen) */
  onValidationResult?: (result: VatValidationResult | null) => void;
}

export const VatInput = forwardRef<HTMLInputElement, VatInputProps>(
  ({ label, error, value = '', onChange, onValidationResult, disabled, ...rest }, ref) => {
    const [status, setStatus] = useState<ValidationStatus>('idle');
    const latestValue = useRef(value);
    latestValue.current = value;

    const debouncedValue = useDebounce(value, 800);

    useEffect(() => {
      const trimmed = debouncedValue.trim();

      if (!trimmed || !looksLikeVatNumber(trimmed)) {
        setStatus('idle');
        onValidationResult?.(null);
        return;
      }

      let cancelled = false;
      setStatus('checking');

      checkVatNumber(trimmed)
        .then((result) => {
          if (cancelled) return;
          setStatus(result.isValid ? 'valid' : 'invalid');
          onValidationResult?.(result);
        })
        .catch(() => {
          if (cancelled) return;
          setStatus('idle');
          onValidationResult?.(null);
        });

      return () => {
        cancelled = true;
      };
    }, [debouncedValue]); // eslint-disable-line react-hooks/exhaustive-deps

    // Reset status bij leeg veld
    useEffect(() => {
      if (!value?.trim()) {
        setStatus('idle');
      }
    }, [value]);

    return (
      <div>
        {label && (
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          <input
            ref={ref}
            type="text"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled}
            className={`w-full rounded-lg border px-3 py-2 pr-9 text-sm shadow-sm transition-colors focus:outline-none focus:ring-2 ${
              error
                ? 'border-red-300 bg-red-50 focus:ring-red-400'
                : status === 'valid'
                  ? 'border-green-400 focus:border-green-500 focus:ring-green-400/30'
                  : status === 'invalid'
                    ? 'border-red-400 focus:border-red-500 focus:ring-red-400/30'
                    : 'border-gray-300 focus:border-primary-500 focus:ring-primary-500/20'
            } ${disabled ? 'cursor-not-allowed bg-gray-50 text-gray-400' : ''}`}
            {...rest}
          />

          {/* Status indicator */}
          <div className="pointer-events-none absolute right-3">
            {status === 'checking' && (
              <svg
                className="h-4 w-4 animate-spin text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            )}
            {status === 'valid' && (
              <svg
                className="h-4 w-4 text-green-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
            {status === 'invalid' && (
              <svg
                className="h-4 w-4 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            )}
          </div>
        </div>

        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}

        {/* Inline VIES naam als geldig */}
        {status === 'valid' && (
          <p className="mt-1 text-xs text-green-700">
            ✓ Geldig BTW-nummer
          </p>
        )}
        {status === 'invalid' && (
          <p className="mt-1 text-xs text-red-600">
            Ongeldig of onbekend BTW-nummer (VIES)
          </p>
        )}
      </div>
    );
  },
);

VatInput.displayName = 'VatInput';
