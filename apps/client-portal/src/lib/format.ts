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
