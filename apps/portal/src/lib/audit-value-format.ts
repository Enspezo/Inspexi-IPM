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
  TE_DOEN: 'Te doen',
  MEE_BEZIG: 'Mee bezig',
  VOLTOOID: 'Voltooid',

  // TaskType
  TO_DO: 'To-do',
  TELEFOONGESPREK: 'Telefoongesprek',
  DOCUMENT: 'Document',
  GOEDKEURING: 'Goedkeuring',

  // PlanningStatus
  NOG_TE_PLANNEN: 'Nog te plannen',
  GEPLAND: 'Gepland',
  AFGEROND: 'Afgerond',
  VERVALLEN: 'Vervallen',

  // WorkOrderStatus
  IN_VOORBEREIDING: 'In voorbereiding',
  IN_UITVOERING: 'In uitvoering',
  UITGEVOERD: 'Uitgevoerd',
  WACHT_OP_KLANT: 'Wacht op klant',

  // ProjectStatus
  ACTIEF: 'Actief',
  // ON_HOLD already defined above
  // AFGEROND already defined above
  GEANNULEERD: 'Geannuleerd',

  // PhaseStatus (PRD-12) — ACTIEF/ON_HOLD/AFGEROND/GEANNULEERD al gedefinieerd
  NIET_GESTART: 'Niet gestart',
  // MilestoneStatus (PRD-12) — VERVALLEN al gedefinieerd hierboven
  OPEN: 'Open',
  BEHAALD: 'Behaald',

  // AcceptanceStatus
  PENDING: 'In afwachting',
  ACCEPTED: 'Geaccepteerd',
  REJECTED: 'Afgewezen',

  // CustomFieldType
  TEXT: 'Tekst',
  NUMBER: 'Nummer',
  DATE: 'Datum',
  BOOLEAN: 'Ja/Nee',
  SELECT: 'Selectie',

  // EmailTemplateType
  OFFERTE_VERSTUURD: 'Offerte verstuurd',
  OFFERTE_ANTWOORD: 'Offerte antwoord',
  AFSPRAAK_BEVESTIGING: 'Afspraakbevestiging',
  AFSPRAAK_VERPLAATST: 'Afspraak verplaatst',
  AFSPRAAK_ACCEPTATIE: 'Afspraak acceptatie',
  CONTACT_EMAIL: 'Contact e-mail',
  UITNODIGING: 'Uitnodiging',
  WACHTWOORD_RESET: 'Wachtwoord reset',
  NOTIFICATIE: 'Notificatie',

  // QuoteTemplateType
  BLOCKS: 'Blokken sjabloon',
  DOCX: 'DOCX sjabloon',

  // CustomFieldEntityType
  CONTACT: 'Relatie',
  CONTACT_ADDRESS: 'Adres',
  LOCATION: 'Locatie',
  REQUEST: 'Aanvraag',
  QUOTE: 'Offerte',
  PRODUCT: 'Product',

  // ContactDisplayMode (inspecteur-contactgegevens klantportaal)
  NONE: 'Geen',
  STATIC: 'Statisch',
  INSPECTOR: 'Inspecteur (met statische terugval)',

  // SaaS feature-keys (PRD-09) — voor PlanFeature/OrganizationFeature.featureKey
  BASIS_CRM: 'Basis CRM',
  CRM_COMPLEET: 'CRM Compleet',
  BASIS_UITVOERING: 'Basis Uitvoering',
  UITVOERING_COMPLEET: 'Uitvoering Compleet',
  BASIS_INSPECTIES: 'Basis Inspecties',
  BASIS_WORKFLOW: 'Basis Workflow',
  WORKFLOW_COMPLEET: 'Workflow Compleet',
  PROJECT_FASEN: 'Projectfasen',
  WEBHOOKS: 'Webhooks (add-on)',
  CUSTOM_FIELDS: 'Aangepaste velden (add-on)',

  // SupportTicket (PRD-10) — NIEUW/IN_BEHANDELING/WACHT_OP_KLANT al hierboven
  OPGELOST: 'Opgelost',
  GESLOTEN: 'Gesloten',
  // SupportTicketPriority
  LAAG: 'Laag',
  NORMAAL: 'Normaal',
  HOOG: 'Hoog',
  URGENT: 'Urgent',
  // EmploymentType (PRD-12)
  DIENSTVERBAND: 'Dienstverband',
  FREELANCE: 'Freelance',

  // AvailabilityExceptionType (PRD-12) — BESCHIKBAAR hieronder los van chat-presence
  BESCHIKBAAR: 'Beschikbaar',
  GEBLOKKEERD: 'Geblokkeerd',

  // AiReviewItemSeverity (PRD-13)
  CRITICAL: 'Kritiek',
  WARNING: 'Waarschuwing',
  SUGGESTION: 'Suggestie',
  INFO: 'Informatie',
  // AiReviewItemStatus (PRD-13) — OPEN al gedefinieerd hierboven
  CHECKED: 'Afgevinkt',
  DISMISSED: 'Afgewezen',

  // SupportTicketCategory
  VRAAG: 'Vraag',
  PROBLEEM: 'Probleem',
  BUG: 'Bug',
  FEATURE_REQUEST: 'Wens',
  FACTUUR: 'Factuur',
  OVERIG: 'Overig',
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
  'budgetAmount',
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
  'scheduledDate',
  'startDate',
  'expectedEndDate',
  'endDate',
  'startTime',
  'endTime',
  'completedAt',
  'startsAt',
  'endsAt',
  'validFrom',
  'validUntil',
  'recurStartDate',
  'recurEndDate',
  'checkedAt',
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
  'planningItemId',
  'customerGroupId',
  'userId',
  'projectId',
  'projectManagerId',
  'workOrderId',
  'lostReasonId',
  'roleId',
  'planId',
  'updatedById',
  'phaseId',
  'contactPersonId',
  'assigneeId',
  'createdById',
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
    // Custom fields: show readable key=value pairs instead of raw JSON
    if (field === 'customFields' && value && !Array.isArray(value)) {
      const entries = Object.entries(value);
      if (entries.length === 0) return '(leeg)';
      return entries
        .map(([k, v]) => {
          if (v === true) return `${k}: Ja`;
          if (v === false) return `${k}: Nee`;
          if (v === null || v === undefined) return `${k}: (leeg)`;
          return `${k}: ${v}`;
        })
        .join(', ');
    }
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
