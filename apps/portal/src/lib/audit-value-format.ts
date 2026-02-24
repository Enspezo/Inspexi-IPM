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

  // TaskStatus
  OPEN: 'Open',
  IN_PROGRESS: 'In uitvoering',
  DONE: 'Afgerond',
  CANCELLED: 'Geannuleerd',

  // TaskPriority (reuses Priority above)
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
  'dueDate',
]);

/** UUID v4 pattern — used to detect unresolved UUIDs */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Fields that contain FK references (UUIDs) — these should never show raw UUIDs */
const FK_FIELDS = new Set([
  'id',
  'orgId',
  'contactId',
  'priceTableId',
  'ownerId',
  'assignedTo',
  'createdBy',
  'locationId',
  'templateId',
  'requestId',
  'quoteId',
  'productId',
  'customerGroupId',
  'userId',
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
    // Check enum label first
    if (enumLabels[value]) return enumLabels[value];

    // If this is a known FK field and the value is still a UUID, show a fallback
    if (field && FK_FIELDS.has(field) && UUID_REGEX.test(value)) {
      return '(verwijderd)';
    }

    // For any unknown field that happens to be a UUID, also show fallback
    if (UUID_REGEX.test(value)) {
      return '(verwijderd)';
    }

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

/** Fields that should be hidden from the audit trail (internal IDs, etc.) */
const HIDDEN_FIELDS = new Set(['id', 'orgId']);

/**
 * Returns true if a field should be hidden from the audit trail display.
 * These are internal system fields that have no meaning for end users.
 */
export function isHiddenAuditField(field: string): boolean {
  return HIDDEN_FIELDS.has(field);
}
