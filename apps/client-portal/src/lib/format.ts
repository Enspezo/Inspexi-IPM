/**
 * Datum/valuta/bestandsgrootte-formatters (nl-NL). De implementaties leven in
 * @inspexi/shared-web (gedeeld met de Beheer-portal); hier alleen re-export van de
 * subset die het klantportaal gebruikt, plus de app-eigen `addressLine` (leunt op
 * het klantportaal-type AddressFields).
 */
import type { AddressFields } from '@/types';

export {
  formatDate,
  formatShortDate,
  formatDateTime,
  formatCurrency,
  formatFileSize,
} from '@inspexi/shared-web';

/** "Straat 12, 1234 AB Plaats" — lege delen vallen weg; helemaal leeg → '—'. */
export function addressLine(a: AddressFields | null | undefined): string {
  if (!a) return '—';
  const street = [a.addressStreet, a.addressHouseNumber].filter(Boolean).join(' ').trim();
  const city = [a.addressPostalCode, a.addressCity].filter(Boolean).join(' ').trim();
  const line = [street, city].filter(Boolean).join(', ');
  return line || '—';
}

/**
 * `YYYY-MM-DD` for an `<input type="date">` built from LOCAL date parts. `toISOString()`
 * would use UTC and shift the day around midnight (e.g. 23:30 CEST → "yesterday").
 */
export function toLocalDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local "tomorrow" as `YYYY-MM-DD` (min-value for preferred-date inputs). */
export function tomorrowInputValue(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return toLocalDateInputValue(d);
}
