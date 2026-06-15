/**
 * Statische labels voor velden die GEEN per-org lookup zijn (anders → lib/lookups + <LookupBadge>).
 * documentType en normType zijn vaste codes uit het inspectiedomein.
 */

const DOCUMENT_TYPE: Record<string, string> = {
  PLAN: 'Inspectieplan',
  REPORT: 'Inspectierapport',
};

export function documentTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return DOCUMENT_TYPE[code] ?? code;
}

const NORM_TYPE: Record<string, string> = {
  NEN1010: 'NEN 1010',
  NEN3140: 'NEN 3140',
  SCOPE_8: 'SCIOS Scope 8',
  SCOPE_10: 'SCIOS Scope 10',
  SCOPE_12: 'SCIOS Scope 12',
  IEC62446_1: 'IEC 62446-1',
};

export function normTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return NORM_TYPE[code] ?? code;
}

/** Weergavenaam voor een contact (bedrijfsnaam, anders "voornaam achternaam"). */
export function contactName(
  contact: { companyName?: string | null; firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  const full = [contact.firstName, contact.lastName].filter(Boolean).join(' ').trim();
  return full || '—';
}

/** Weergavenaam voor een gebruiker/persoon ("voornaam achternaam"). */
export function personName(
  person: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!person) return '—';
  const full = [person.firstName, person.lastName].filter(Boolean).join(' ').trim();
  return full || '—';
}
