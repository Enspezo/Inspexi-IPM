/**
 * Gedeelde formatters voor datums, valuta en bestandsgroottes (nl-NL).
 * Alle functies accepteren null/undefined en geven dan '—' terug.
 */

type DateInput = string | Date | null | undefined;

function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "8 juni 2026" */
export function formatDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "8 jun 2026" */
export function formatShortDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "8 jun 2026, 14:30" */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "€ 1.234,56" */
export function formatCurrency(value: number | string | null | undefined): string {
  if (value == null || value === '') return '—';
  const amount = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(amount)) return '—';
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
  }).format(amount);
}

/** "1,5 MB" */
export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
