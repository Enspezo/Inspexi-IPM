// Gedeelde formatter (lange datum mét tijd) — her-geëxporteerd zodat bestaande
// imports uit dit helpers-bestand blijven werken.
export { formatDateTimeLong as formatDate } from '@/lib/format';

export function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}
