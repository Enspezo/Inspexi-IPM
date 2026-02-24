/**
 * Formatteert waarden voor weergave in de audit trail.
 */

const enumLabels: Record<string, string> = {
  // ContactType
  COMPANY: 'Bedrijf',
  INDIVIDUAL: 'Particulier',

  // RequestStatus
  NIEUW: 'Nieuw',
  IN_BEHANDELING: 'In behandeling',
  OFFERTE_GEMAAKT: 'Offerte gemaakt',
  GEWONNEN: 'Gewonnen',
  VERLOREN: 'Verloren',
  ON_HOLD: 'On hold',

  // Priority
  LOW: 'Laag',
  NORMAL: 'Normaal',
  HIGH: 'Hoog',

  // RequestSource
  MANUAL: 'Handmatig',
  WEB_FORM: 'Webformulier',
  EMAIL: 'E-mail',
  PHONE: 'Telefoon',

  // QuoteStatus
  CONCEPT: 'Concept',
  TER_GOEDKEURING: 'Ter goedkeuring',
  GOEDGEKEURD: 'Goedgekeurd',
  VERSTUURD: 'Verstuurd',
  BEKEKEN: 'Bekeken',
  GEACCEPTEERD: 'Geaccepteerd',
  AFGEWEZEN: 'Afgewezen',
  VERLOPEN: 'Verlopen',

  // ContactPersonRole
  ALGEMEEN: 'Algemeen',
  TECHNISCH: 'Technisch',
  ADMINISTRATIEF: 'Administratief',
  ANDERS: 'Anders',

  // PriceType
  FIXED: 'Vast',
  TIERED: 'Gestaffeld',

  // Role
  SUPERUSER: 'Superuser',
  ORG_ADMIN: 'Organisatie Admin',
  MANAGER: 'Manager',
  BACKOFFICE: 'Backoffice',
  WERKVOORBEREIDER: 'Werkvoorbereider',
  INSPECTEUR: 'Inspecteur',
};

/** Currency fields that should be formatted as EUR */
const currencyFields = new Set([
  'basePrice',
  'unitPrice',
  'lineTotal',
  'subtotal',
  'discountTotal',
  'vatTotal',
  'total',
]);

/** Fields containing date/datetime ISO strings */
const dateFields = new Set([
  'validUntil',
  'sentAt',
  'viewedAt',
  'signedAt',
  'emailVerifiedAt',
  'loggedAt',
]);

const currencyFormatter = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
});

const dateFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('nl-NL', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatAuditValue(
  value: any,
  field?: string,
): string {
  if (value === null || value === undefined) return '(leeg)';

  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee';

  if (typeof value === 'string') {
    // Check enum label
    if (enumLabels[value]) return enumLabels[value];

    // Check date fields
    if (field && dateFields.has(field)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return dateTimeFormatter.format(d);
    }

    // Try to detect ISO date strings
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return dateFormatter.format(d);
    }

    return value;
  }

  if (typeof value === 'number') {
    if (field && currencyFields.has(field)) {
      return currencyFormatter.format(value);
    }
    return String(value);
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}
