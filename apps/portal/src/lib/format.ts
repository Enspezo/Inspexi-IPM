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

/** "8 juni 2026, 14:30" (lange maand mét tijd) */
export function formatDateTimeLong(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** "maandag 8 juni 2026" (weekdag + lange datum) */
export function formatWeekdayDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** "ma 8 jun 2026" (korte weekdag + korte datum) */
export function formatWeekdayShortDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** "8-6-2026" (numeriek, nl-NL default) */
export function formatNumericDate(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '—';
  return date.toLocaleDateString('nl-NL');
}

/** "14:30" — accepteert ISO-datums én kale "HH:MM"-strings */
export function formatTime(value: DateInput): string {
  const date = toDate(value);
  if (date) return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
  if (typeof value === 'string' && /^\d{1,2}:\d{2}/.test(value)) return value.slice(0, 5);
  return '—';
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
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;
  if (bytes < KB) return `${bytes} B`;
  if (bytes < MB) return `${(bytes / KB).toFixed(1)} KB`;
  if (bytes < GB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes < TB) return `${(bytes / GB).toFixed(1)} GB`;
  return `${(bytes / TB).toFixed(1)} TB`;
}
