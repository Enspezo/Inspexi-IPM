import type { UserSummary } from './requests';

// ─── Document Management ────────────────────────────────

export enum DocumentEntityType {
  CONTACT = 'CONTACT',
  LOCATION = 'LOCATION',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PRODUCT = 'PRODUCT',
  TASK = 'TASK',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
  PROJECT_PHASE = 'PROJECT_PHASE',
  USER = 'USER',
  WORK_ORDER = 'WORK_ORDER',
}

/** Volledige document-tag (beheer onder organisatie-instellingen). */
export interface DocumentTag {
  id: string;
  orgId: string;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  _count?: { documents: number };
}

// ─── Configureerbare nummering (per org, per model) ──────────────────────
export type NumberingModel =
  | 'REQUEST'
  | 'QUOTE'
  | 'PROJECT'
  | 'PRODUCT'
  | 'WORK_ORDER'
  | 'LOCATION_NODE'
  | 'ASSET_NODE';
export type NumberingMode = 'SEQUENTIAL' | 'RANDOM';
export type NumberingReset = 'CONTINUOUS' | 'PER_YEAR' | 'PER_MONTH';

export interface NumberingScheme {
  id: string;
  orgId: string;
  model: NumberingModel;
  prefix: string;
  suffix: string;
  mode: NumberingMode;
  start: number;
  interval: number;
  digits: number;
  resetPolicy: NumberingReset;
  allowManualEntry: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compacte tag-weergave zoals meegestuurd op documenten / pickers. */
export interface DocumentTagRef {
  id: string;
  name: string;
  color: string;
}

export interface CrmDocument {
  id: string;
  orgId: string;
  entityType: DocumentEntityType;
  entityId: string;
  entityName?: string | null;
  fileName: string;
  originalName: string;
  mimeType: string;
  size: number;
  description: string | null;
  isSharedWithClient: boolean;
  uploadedById: string;
  isDeleted: boolean;
  createdAt: string;
  uploadedBy?: UserSummary;
  tags?: DocumentTagRef[];
}

// ─── Custom Fields ──────────────────────────────────────

export enum CustomFieldType {
  TEXT = 'TEXT',
  NUMBER = 'NUMBER',
  DATE = 'DATE',
  BOOLEAN = 'BOOLEAN',
  SELECT = 'SELECT',
}

export enum CustomFieldEntityType {
  CONTACT = 'CONTACT',
  CONTACT_ADDRESS = 'CONTACT_ADDRESS',
  LOCATION = 'LOCATION',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PRODUCT = 'PRODUCT',
}

export interface CustomFieldDefinition {
  id: string;
  orgId: string;
  entityType: CustomFieldEntityType;
  fieldName: string;
  label: string;
  fieldType: CustomFieldType;
  options: string[] | null;
  isRequired: boolean;
  sortOrder: number;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Email Templates ──────────────────────────────────

export enum EmailTemplateType {
  OFFERTE_VERSTUURD = 'OFFERTE_VERSTUURD',
  OFFERTE_GEACCEPTEERD = 'OFFERTE_GEACCEPTEERD',
  OFFERTE_ANTWOORD = 'OFFERTE_ANTWOORD',
  AFSPRAAK_BEVESTIGING = 'AFSPRAAK_BEVESTIGING',
  AFSPRAAK_VERPLAATST = 'AFSPRAAK_VERPLAATST',
  AFSPRAAK_ACCEPTATIE = 'AFSPRAAK_ACCEPTATIE',
  CONTACT_EMAIL = 'CONTACT_EMAIL',
  UITNODIGING = 'UITNODIGING',
  WACHTWOORD_RESET = 'WACHTWOORD_RESET',
  NOTIFICATIE = 'NOTIFICATIE',
  OFFERTE_FOLLOW_UP = 'OFFERTE_FOLLOW_UP',
}

export interface EmailTemplateAttachment {
  id: string;
  emailTemplateId: string;
  orgId: string;
  originalName: string;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  orgId: string;
  type: EmailTemplateType;
  name: string;
  subject: string;
  bodyJson: any;
  bodyHtml: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  creator?: { id: string; firstName: string; lastName: string };
  attachments?: EmailTemplateAttachment[];
}

export interface PlaceholderField {
  key: string;
  label: string;
}

export interface PlaceholderGroup {
  entity: string;
  label: string;
  fields: PlaceholderField[];
}

export interface EmailTemplateTypeInfo {
  type: EmailTemplateType;
  label: string;
  placeholders: PlaceholderGroup[];
}

// ─── Error Reports ──────────────────────────────────────

export type ErrorReportStatus = 'OPEN' | 'IN_BEHANDELING' | 'OPGELOST';

export interface ErrorReport {
  id: string;
  orgId: string | null;
  userId: string | null;
  errorMessage: string;
  stackTrace: string | null;
  componentStack: string | null;
  userDescription: string | null;
  pageUrl: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  status: ErrorReportStatus;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; firstName: string; lastName: string; email: string } | null;
  organization?: { id: string; name: string; slug: string } | null;
}
