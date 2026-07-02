/**
 * Canonieke status/type → presentatie-mappings (kleur + Nederlands label).
 * Eén bron voor alle badges; gebruik samen met <StatusBadge>.
 *
 * Conflictresolutie bij introductie: het domein dat de status "bezit" wint
 * (bijv. RequestStatus volgt de requests-pagina's, niet contact-detail).
 */
import {
  AcceptanceStatus,
  ApprovalStatus,
  AuditAction,
  Availability,
  ChatThreadStatus,
  ContactType,
  HelpArticleStatus,
  SupportTicketStatus,
  SupportTicketPriority,
  LogType,
  MilestoneStatus,
  PhaseStatus,
  PlanningStatus,
  Priority,
  ProjectStatus,
  QuoteStatus,
  RequestSource,
  RequestStatus,
  SessionStatus,
  TaskEntityType,
  TaskStatus,
  TaskType,
  WorkOrderStatus,
} from '@/types';

export interface StatusConfig {
  label: string;
  classes: string;
}

export type StatusMap = Record<string, StatusConfig>;

const FALLBACK: StatusConfig = { label: '', classes: 'bg-gray-100 text-gray-600' };

/** Veilige lookup: onbekende waarde → grijze badge met de ruwe waarde als label. */
export function getStatusConfig(map: StatusMap, value: string | null | undefined): StatusConfig {
  if (!value) return { ...FALLBACK, label: '—' };
  return map[value] ?? { ...FALLBACK, label: value };
}

export const TASK_STATUS: StatusMap = {
  [TaskStatus.TE_DOEN]: { label: 'Te doen', classes: 'bg-blue-100 text-blue-800' },
  [TaskStatus.MEE_BEZIG]: { label: 'Mee bezig', classes: 'bg-yellow-100 text-yellow-800' },
  [TaskStatus.VOLTOOID]: { label: 'Voltooid', classes: 'bg-green-100 text-green-800' },
};

export const TASK_TYPE: StatusMap = {
  [TaskType.TO_DO]: { label: 'To-do', classes: 'bg-gray-100 text-gray-700' },
  [TaskType.EMAIL]: { label: 'E-mail', classes: 'bg-indigo-100 text-indigo-800' },
  [TaskType.TELEFOONGESPREK]: { label: 'Telefoongesprek', classes: 'bg-orange-100 text-orange-800' },
  [TaskType.DOCUMENT]: { label: 'Document', classes: 'bg-purple-100 text-purple-800' },
  [TaskType.GOEDKEURING]: { label: 'Goedkeuring', classes: 'bg-pink-100 text-pink-800' },
};

export const REQUEST_STATUS: StatusMap = {
  [RequestStatus.NIEUW]: { label: 'Nieuw', classes: 'bg-blue-100 text-blue-800' },
  [RequestStatus.IN_BEHANDELING]: { label: 'In behandeling', classes: 'bg-yellow-100 text-yellow-800' },
  [RequestStatus.OFFERTE_GEMAAKT]: { label: 'Offerte gemaakt', classes: 'bg-purple-100 text-purple-800' },
  [RequestStatus.GEWONNEN]: { label: 'Gewonnen', classes: 'bg-green-100 text-green-800' },
  [RequestStatus.VERLOREN]: { label: 'Verloren', classes: 'bg-red-100 text-red-800' },
  [RequestStatus.ON_HOLD]: { label: 'On hold', classes: 'bg-gray-100 text-gray-600' },
};

export const PRIORITY: StatusMap = {
  [Priority.HIGH]: { label: 'Hoog', classes: 'bg-red-100 text-red-800' },
  [Priority.NORMAL]: { label: 'Normaal', classes: 'bg-yellow-100 text-yellow-800' },
  [Priority.LOW]: { label: 'Laag', classes: 'bg-gray-100 text-gray-600' },
};

export const QUOTE_STATUS: StatusMap = {
  [QuoteStatus.CONCEPT]: { label: 'Concept', classes: 'bg-gray-100 text-gray-800' },
  [QuoteStatus.TER_GOEDKEURING]: { label: 'Ter goedkeuring', classes: 'bg-yellow-100 text-yellow-800' },
  [QuoteStatus.GOEDGEKEURD]: { label: 'Goedgekeurd', classes: 'bg-green-100 text-green-800' },
  [QuoteStatus.VERSTUURD]: { label: 'Verstuurd', classes: 'bg-blue-100 text-blue-800' },
  [QuoteStatus.BEKEKEN]: { label: 'Bekeken', classes: 'bg-purple-100 text-purple-800' },
  [QuoteStatus.GEACCEPTEERD]: { label: 'Geaccepteerd', classes: 'bg-emerald-100 text-emerald-800' },
  [QuoteStatus.AFGEWEZEN]: { label: 'Afgewezen', classes: 'bg-red-100 text-red-800' },
  [QuoteStatus.VERLOPEN]: { label: 'Verlopen', classes: 'bg-orange-100 text-orange-800' },
};

export const APPROVAL_STATUS: StatusMap = {
  [ApprovalStatus.PENDING]: { label: 'In afwachting', classes: 'bg-yellow-100 text-yellow-800' },
  [ApprovalStatus.APPROVED]: { label: 'Goedgekeurd', classes: 'bg-green-100 text-green-800' },
  [ApprovalStatus.REJECTED]: { label: 'Afgewezen', classes: 'bg-red-100 text-red-800' },
  [ApprovalStatus.CANCELLED]: { label: 'Ingetrokken', classes: 'bg-gray-100 text-gray-600' },
};

export const PLANNING_STATUS: StatusMap = {
  [PlanningStatus.NOG_TE_PLANNEN]: { label: 'Nog te plannen', classes: 'bg-gray-100 text-gray-700' },
  [PlanningStatus.CONCEPT]: { label: 'Concept', classes: 'bg-yellow-100 text-yellow-800' },
  [PlanningStatus.GEPLAND]: { label: 'Gepland', classes: 'bg-blue-100 text-blue-800' },
  [PlanningStatus.AFGEROND]: { label: 'Afgerond', classes: 'bg-green-100 text-green-800' },
  [PlanningStatus.VERVALLEN]: { label: 'Vervallen', classes: 'bg-red-100 text-red-800' },
};

export const SESSION_STATUS: StatusMap = {
  [SessionStatus.NOG_TE_PLANNEN]: { label: 'Nog te plannen', classes: 'bg-gray-100 text-gray-700' },
  [SessionStatus.CONCEPT]: { label: 'Concept', classes: 'bg-blue-100 text-blue-800' },
  [SessionStatus.DEFINITIEF]: { label: 'Definitief', classes: 'bg-green-100 text-green-800' },
  [SessionStatus.AFGEROND]: { label: 'Afgerond', classes: 'bg-green-200 text-green-900' },
  [SessionStatus.VERVALLEN]: { label: 'Vervallen', classes: 'bg-red-100 text-red-800' },
};

export const ACCEPTANCE_STATUS: StatusMap = {
  [AcceptanceStatus.PENDING]: { label: 'In afwachting', classes: 'bg-yellow-100 text-yellow-800' },
  [AcceptanceStatus.ACCEPTED]: { label: 'Geaccepteerd', classes: 'bg-green-100 text-green-800' },
  [AcceptanceStatus.REJECTED]: { label: 'Geweigerd', classes: 'bg-red-100 text-red-800' },
};

export const WORK_ORDER_STATUS: StatusMap = {
  [WorkOrderStatus.IN_VOORBEREIDING]: { label: 'In voorbereiding', classes: 'bg-yellow-100 text-yellow-800' },
  [WorkOrderStatus.IN_UITVOERING]: { label: 'In uitvoering', classes: 'bg-blue-100 text-blue-800' },
  [WorkOrderStatus.UITGEVOERD]: { label: 'Uitgevoerd', classes: 'bg-green-100 text-green-800' },
  [WorkOrderStatus.WACHT_OP_KLANT]: { label: 'Wacht op klant', classes: 'bg-orange-100 text-orange-800' },
};

export const PROJECT_STATUS: StatusMap = {
  [ProjectStatus.ACTIEF]: { label: 'Actief', classes: 'bg-green-100 text-green-800' },
  [ProjectStatus.ON_HOLD]: { label: 'On hold', classes: 'bg-yellow-100 text-yellow-800' },
  [ProjectStatus.AFGEROND]: { label: 'Afgerond', classes: 'bg-blue-100 text-blue-800' },
  [ProjectStatus.GEANNULEERD]: { label: 'Geannuleerd', classes: 'bg-red-100 text-red-800' },
};

// ─── PRD-12: Projectfasen ─────────────────────────────────

export const PHASE_STATUS: StatusMap = {
  [PhaseStatus.NIET_GESTART]: { label: 'Niet gestart', classes: 'bg-gray-100 text-gray-700' },
  [PhaseStatus.ACTIEF]: { label: 'Actief', classes: 'bg-green-100 text-green-800' },
  [PhaseStatus.ON_HOLD]: { label: 'On hold', classes: 'bg-amber-100 text-amber-800' },
  [PhaseStatus.AFGEROND]: { label: 'Afgerond', classes: 'bg-blue-100 text-blue-800' },
  [PhaseStatus.GEANNULEERD]: { label: 'Geannuleerd', classes: 'bg-red-100 text-red-800' },
};

export const MILESTONE_STATUS: StatusMap = {
  [MilestoneStatus.OPEN]: { label: 'Open', classes: 'bg-amber-100 text-amber-800' },
  [MilestoneStatus.BEHAALD]: { label: 'Behaald', classes: 'bg-green-100 text-green-800' },
  [MilestoneStatus.VERVALLEN]: { label: 'Vervallen', classes: 'bg-red-100 text-red-800' },
};

export const LOG_TYPE: StatusMap = {
  [LogType.EMAIL]: { label: 'E-mail', classes: 'bg-blue-100 text-blue-800' },
  [LogType.PHONE]: { label: 'Telefoon', classes: 'bg-green-100 text-green-800' },
  [LogType.MEETING]: { label: 'Vergadering', classes: 'bg-purple-100 text-purple-800' },
  [LogType.NOTE]: { label: 'Notitie', classes: 'bg-gray-100 text-gray-800' },
};

export const ERROR_REPORT_STATUS: StatusMap = {
  OPEN: { label: 'Open', classes: 'bg-red-100 text-red-800' },
  IN_BEHANDELING: { label: 'In behandeling', classes: 'bg-yellow-100 text-yellow-800' },
  OPGELOST: { label: 'Opgelost', classes: 'bg-green-100 text-green-800' },
};

export const CONTACT_TYPE: StatusMap = {
  [ContactType.COMPANY]: { label: 'Bedrijf', classes: 'bg-blue-100 text-blue-800' },
  [ContactType.INDIVIDUAL]: { label: 'Particulier', classes: 'bg-purple-100 text-purple-800' },
};

export const AUDIT_ACTION: StatusMap = {
  [AuditAction.CREATE]: { label: 'Aangemaakt', classes: 'bg-green-100 text-green-800' },
  [AuditAction.UPDATE]: { label: 'Bijgewerkt', classes: 'bg-blue-100 text-blue-800' },
  [AuditAction.DELETE]: { label: 'Verwijderd', classes: 'bg-red-100 text-red-800' },
};

// ── Label-only maps (geen badge-kleuren) ──────────────────────────────────

export const REQUEST_SOURCE_LABELS: Record<string, string> = {
  [RequestSource.MANUAL]: 'Handmatig',
  [RequestSource.WEB_FORM]: 'Webformulier',
  [RequestSource.EMAIL]: 'E-mail',
  [RequestSource.PHONE]: 'Telefoon',
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  [TaskEntityType.CONTACT]: 'Relatie',
  [TaskEntityType.REQUEST]: 'Aanvraag',
  [TaskEntityType.QUOTE]: 'Offerte',
  [TaskEntityType.PLANNING]: 'Afspraak',
  [TaskEntityType.PROJECT]: 'Project',
  [TaskEntityType.PROJECT_PHASE]: 'Projectfase',
  [TaskEntityType.USER]: 'Gebruiker',
  PRODUCT: 'Product',
  TASK: 'Taak',
  WORK_ORDER: 'Werkbon',
};

// ── Fase 5: Inspectie lifecycle-enums ─────────────────────────────────────
// ALLEEN de lifecycle/structurele enums (die in Fase 1 enums BLEVEN). De status/type-velden
// die LOOKUPS werden (plan/asset/finding/report-status, signatory/signer, pass-fail,
// resolution, client-request) horen hier NIET — die renderen via <LookupBadge> (lib/lookups).

export const CHECKLIST_STATUS: StatusMap = {
  CONCEPT: { label: 'Concept', classes: 'bg-gray-100 text-gray-700' },
  ACTIEF: { label: 'Actief', classes: 'bg-green-100 text-green-800' },
  VERVALLEN: { label: 'Vervallen', classes: 'bg-red-100 text-red-800' },
};

// Zelfde drie waarden — hergebruik voor inspectie- en meetstaat-templates.
export const TEMPLATE_STATUS: StatusMap = CHECKLIST_STATUS;
export const MEASUREMENT_SHEET_STATUS: StatusMap = CHECKLIST_STATUS;

export const INSPECTION_EXEC_STATUS: StatusMap = {
  not_started: { label: 'Niet gestart', classes: 'bg-gray-100 text-gray-700' },
  in_progress: { label: 'Mee bezig', classes: 'bg-yellow-100 text-yellow-800' },
  completed: { label: 'Voltooid', classes: 'bg-green-100 text-green-800' },
};

export const MEASUREMENT_SHEET_RECORD_STATUS: StatusMap = {
  IN_PROGRESS: { label: 'Mee bezig', classes: 'bg-yellow-100 text-yellow-800' },
  COMPLETED: { label: 'Voltooid', classes: 'bg-blue-100 text-blue-800' },
  VALIDATED: { label: 'Gevalideerd', classes: 'bg-green-100 text-green-800' },
};

export const GENERATED_DOCUMENT_STATUS: StatusMap = {
  DRAFT: { label: 'Concept', classes: 'bg-gray-100 text-gray-700' },
  PENDING_SIGNATURES: { label: 'Wacht op ondertekening', classes: 'bg-orange-100 text-orange-800' },
  SIGNED: { label: 'Ondertekend', classes: 'bg-green-100 text-green-800' },
  FINALIZED: { label: 'Definitief', classes: 'bg-green-100 text-green-800' },
};

export const SIGNATURE_STATUS: StatusMap = {
  PENDING: { label: 'In afwachting', classes: 'bg-gray-100 text-gray-700' },
  REQUESTED: { label: 'Verzonden', classes: 'bg-blue-100 text-blue-800' },
  SIGNED: { label: 'Ondertekend', classes: 'bg-green-100 text-green-800' },
  DECLINED: { label: 'Geweigerd', classes: 'bg-red-100 text-red-800' },
  EXPIRED: { label: 'Verlopen', classes: 'bg-red-100 text-red-800' },
};

// ─── Interne chat (REQ1) ──────────────────────────────────

export const CHAT_PRESENCE: StatusMap = {
  [Availability.BESCHIKBAAR]: { label: 'Beschikbaar', classes: 'bg-green-100 text-green-800' },
  [Availability.BEZIG]: { label: 'Bezig', classes: 'bg-yellow-100 text-yellow-800' },
  [Availability.AFWEZIG]: { label: 'Afwezig', classes: 'bg-orange-100 text-orange-800' },
  [Availability.OFFLINE]: { label: 'Offline', classes: 'bg-gray-100 text-gray-600' },
};

/** Kleine kleurstip per presence-status (voor avatar-indicatoren). */
export const CHAT_PRESENCE_DOT: Record<string, string> = {
  [Availability.BESCHIKBAAR]: 'bg-green-500',
  [Availability.BEZIG]: 'bg-yellow-500',
  [Availability.AFWEZIG]: 'bg-orange-400',
  [Availability.OFFLINE]: 'bg-gray-300',
};

export const CHAT_THREAD_STATUS: StatusMap = {
  [ChatThreadStatus.OPEN]: { label: 'Open', classes: 'bg-blue-100 text-blue-800' },
  [ChatThreadStatus.AFGEROND]: { label: 'Afgerond', classes: 'bg-gray-100 text-gray-600' },
};

export const HELP_ARTICLE_STATUS: StatusMap = {
  [HelpArticleStatus.DRAFT]: { label: 'Concept', classes: 'bg-gray-100 text-gray-700' },
  [HelpArticleStatus.PUBLISHED]: { label: 'Gepubliceerd', classes: 'bg-green-100 text-green-800' },
  [HelpArticleStatus.ARCHIVED]: { label: 'Gearchiveerd', classes: 'bg-amber-100 text-amber-800' },
};

export const SUPPORT_TICKET_STATUS: StatusMap = {
  [SupportTicketStatus.NIEUW]: { label: 'Nieuw', classes: 'bg-blue-100 text-blue-800' },
  [SupportTicketStatus.IN_BEHANDELING]: { label: 'In behandeling', classes: 'bg-amber-100 text-amber-800' },
  [SupportTicketStatus.WACHT_OP_KLANT]: { label: 'Wacht op klant', classes: 'bg-purple-100 text-purple-800' },
  [SupportTicketStatus.OPGELOST]: { label: 'Opgelost', classes: 'bg-green-100 text-green-800' },
  [SupportTicketStatus.GESLOTEN]: { label: 'Gesloten', classes: 'bg-gray-100 text-gray-700' },
};

export const SUPPORT_TICKET_PRIORITY: StatusMap = {
  [SupportTicketPriority.LAAG]: { label: 'Laag', classes: 'bg-gray-100 text-gray-700' },
  [SupportTicketPriority.NORMAAL]: { label: 'Normaal', classes: 'bg-blue-100 text-blue-800' },
  [SupportTicketPriority.HOOG]: { label: 'Hoog', classes: 'bg-orange-100 text-orange-800' },
  [SupportTicketPriority.URGENT]: { label: 'Urgent', classes: 'bg-red-100 text-red-800' },
};

/** IMP_PRD-10 Fase 5 — support-toegang logacties. */
export const SUPPORT_ACCESS_ACTION: StatusMap = {
  ENABLED: { label: 'Ingeschakeld', classes: 'bg-green-100 text-green-800' },
  DISABLED: { label: 'Uitgeschakeld', classes: 'bg-gray-100 text-gray-700' },
  EXPIRED: { label: 'Verlopen', classes: 'bg-amber-100 text-amber-800' },
  ACCESSED: { label: 'Ingezien', classes: 'bg-blue-100 text-blue-800' },
};

// ─── PRD-11: Inspecteur-certificaten — geldigheidsstatus ──────────────────
// Afgeleide status (geen enum): berekend uit `validUntil` via getCertificateValidityKey.

export type CertificateValidityKey = 'verlopen' | 'binnenkort' | 'geldig' | 'geen-einddatum';

export const CERTIFICATE_VALIDITY: StatusMap = {
  verlopen: { label: 'Verlopen', classes: 'bg-red-100 text-red-800' },
  binnenkort: { label: 'Verloopt binnenkort', classes: 'bg-orange-100 text-orange-800' },
  geldig: { label: 'Geldig', classes: 'bg-green-100 text-green-800' },
  'geen-einddatum': { label: 'Geen einddatum', classes: 'bg-gray-100 text-gray-600' },
};

/**
 * Bepaalt de geldigheidsstatus van een certificaat o.b.v. `validUntil`:
 * verlopen (verstreken), binnenkort (≤ 30 dagen), geldig, of geen-einddatum.
 */
export function getCertificateValidityKey(
  validUntil: string | null | undefined,
): CertificateValidityKey {
  if (!validUntil) return 'geen-einddatum';
  const end = new Date(validUntil);
  if (Number.isNaN(end.getTime())) return 'geen-einddatum';
  const days = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (days < 0) return 'verlopen';
  if (days <= 30) return 'binnenkort';
  return 'geldig';
}

// ─── Meetmiddelen — kalibratiestatus + levenscyclus ───────────────────────
// De kalibratiestatus-sleutel komt uit @inspexi/calibration (computeCalibrationStatus).

export const MEETMIDDEL_KALIBRATIE_STATUS: StatusMap = {
  GELDIG: { label: 'Geldig', classes: 'bg-green-100 text-green-800' },
  BINNENKORT: { label: 'Verloopt binnenkort', classes: 'bg-orange-100 text-orange-800' },
  VERLOPEN: { label: 'Verlopen', classes: 'bg-red-100 text-red-800' },
  GEEN_KALIBRATIE: { label: 'Geen kalibratie', classes: 'bg-gray-100 text-gray-600' },
};

export const MEETMIDDEL_STATUS: StatusMap = {
  ACTIEF: { label: 'Actief', classes: 'bg-green-100 text-green-800' },
  BUITEN_GEBRUIK: { label: 'Buiten gebruik', classes: 'bg-gray-100 text-gray-700' },
  AFGEKEURD: { label: 'Afgekeurd', classes: 'bg-red-100 text-red-800' },
};
