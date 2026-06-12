export enum Role {
  SUPERUSER = 'SUPERUSER',
  ORG_ADMIN = 'ORG_ADMIN',
  MANAGER = 'MANAGER',
  BACKOFFICE = 'BACKOFFICE',
  WERKVOORBEREIDER = 'WERKVOORBEREIDER',
  INSPECTEUR = 'INSPECTEUR',
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  primaryColor: string | null;
  defaultVat: number;
  defaultValidityDays: number;
  senderName: string | null;
  senderEmail: string | null;
  workdayStart: number;
  workdayEnd: number;
  isActive: boolean;
  createdAt: string;
  _count?: { users: number };
}

export enum SignatureType {
  DRAW = 'DRAW',
  UPLOAD = 'UPLOAD',
  TEXT = 'TEXT',
}

export interface UserSignature {
  signatureType: SignatureType | null;
  signatureData: string | null;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: Role[];
  orgId: string | null;
  isActive: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  emailVerifiedAt: string | null;
  initials: string | null;
  avatarUrl: string | null;
  signatureType: SignatureType | null;
  signatureData: string | null;
  color: string | null;
  homeStreet: string | null;
  homeHouseNumber: string | null;
  homePostalCode: string | null;
  homeCity: string | null;
  homeLat: number | null;
  homeLng: number | null;
  icalToken: string | null;
  createdAt: string;
  organization?: Organization;
}

export interface Invitation {
  id: string;
  orgId: string;
  email: string;
  role: Role;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface Session {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  isCurrent: boolean;
}

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ─── PRD-02: CRM Types ──────────────────────────────────

export enum ContactType {
  COMPANY = 'COMPANY',
  INDIVIDUAL = 'INDIVIDUAL',
}

export enum LogType {
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  MEETING = 'MEETING',
  NOTE = 'NOTE',
}

/** Lookup-rij voor contactpersoon-rollen (vervangt voorheen de ContactPersonRole enum). */
export interface ContactPersonRoleOption {
  id: string;
  orgId: string | null;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

/** Ingesloten rol-referentie zoals teruggegeven bij een contactpersoon. */
export interface ContactPersonRoleRef {
  id: string;
  code: string;
  label: string;
}

/** Lookup-rij voor "reden verloren" (vervangt voorheen de LostReason enum). */
export interface LostReason {
  id: string;
  orgId: string | null;
  code: string;
  label: string;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

export interface Contact {
  id: string;
  orgId: string;
  type: ContactType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  vatNumber: string | null;
  vatValidation: Record<string, unknown> | null;
  cocNumber: string | null;
  notes: string | null;
  priceTableId: string | null;
  ownerId: string | null;
  customFields: Record<string, any> | null;
  isDeleted: boolean;
  createdAt: string;
  owner?: { id: string; firstName: string; lastName: string } | null;
  addresses?: ContactAddress[];
  contactPersons?: ContactPerson[];
  customerGroups?: ContactCustomerGroup[];
  locations?: Location[];
  logs?: ContactLog[];
  emails?: ContactEmail[];
  quotes?: Quote[];
  requests?: Request[];
}

export interface ContactPerson {
  id: string;
  contactId: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  roleId: string | null;
  role: ContactPersonRoleRef | null;
  notes: string | null;
  isDeleted: boolean;
  createdAt: string;
  contact?: Contact;
}

export interface CustomerGroup {
  id: string;
  orgId: string;
  name: string;
  notes: string | null;
  isDeleted: boolean;
  createdAt: string;
  contacts?: ContactCustomerGroup[];
  _count?: { contacts: number };
}

export interface ContactCustomerGroup {
  id: string;
  contactId: string;
  customerGroupId: string;
  contact?: Contact;
  customerGroup?: { id: string; name: string };
}

export interface ContactAddress {
  id: string;
  contactId: string;
  label: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  country: string;
  isPrimary: boolean;
  isPostal: boolean;
  isInvoice: boolean;
  customFields: Record<string, any> | null;
}

export interface Location {
  id: string;
  contactId: string;
  orgId: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  objectType: string | null;
  notes: string | null;
  pdokData: Record<string, unknown> | null;
  lat: number | null;
  lng: number | null;
  customFields: Record<string, any> | null;
  createdAt: string;
}

export interface LocationContactPerson {
  id: string;
  locationId: string;
  contactPersonId: string;
  orgId: string;
  notes: string | null;
  createdAt: string;
  contactPerson?: ContactPerson & {
    contact?: { id: string; type: ContactType; companyName: string | null; firstName: string | null; lastName: string | null };
  };
}

export interface ContactLog {
  id: string;
  contactId: string;
  orgId: string;
  userId: string;
  type: LogType;
  subject: string | null;
  body: string | null;
  loggedAt: string;
  createdAt: string;
  user?: { firstName: string; lastName: string };
}

export interface ContactEmail {
  id: string;
  contactId: string;
  orgId: string;
  userId: string;
  resendId: string | null;
  subject: string;
  bodyHtml: string;
  sentAt: string;
  openedAt: string | null;
  user?: { firstName: string; lastName: string };
}

// ─── PRD-04: Products & Price Tables Types ─────────────

export enum PriceType {
  FIXED = 'FIXED',
  TIERED = 'TIERED',
}

export interface ProductGroupProduct {
  id: string;
  orgId: string;
  productGroupId: string | null;
  name: string;
  unit: string;
  defaultVat: number;
  description: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface ProductGroup {
  id: string;
  orgId: string;
  name: string;
  notes: string | null;
  isDeleted: boolean;
  createdAt: string;
  products?: ProductGroupProduct[];
  _count?: { products: number };
}

export interface Product {
  id: string;
  orgId: string;
  productGroupId: string | null;
  name: string;
  description: string | null;
  unit: string;
  defaultVat: number;
  isActive: boolean;
  customFields: Record<string, any> | null;
  createdAt: string;
  productGroup?: { id: string; name: string } | null;
}

export interface PriceTable {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  createdAt: string;
  items?: PriceTableItem[];
  contactPriceTables?: { contact: ContactSummary }[];
  _count?: { items: number };
}

export interface ContactSummary {
  id: string;
  type: ContactType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface PriceTableItem {
  id: string;
  priceTableId: string;
  productId: string;
  priceType: PriceType;
  basePrice: number | null;
  createdAt: string;
  tiers?: PriceTier[];
  product?: Product;
}

export interface PriceTier {
  id: string;
  priceTableItemId: string;
  fromQty: number;
  toQty: number | null;
  price: number;
}

// ─── PRD-03: Requests (Leads & Aanvragen) Types ─────────

export enum RequestSource {
  MANUAL = 'MANUAL',
  WEB_FORM = 'WEB_FORM',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
}

export enum RequestStatus {
  NIEUW = 'NIEUW',
  IN_BEHANDELING = 'IN_BEHANDELING',
  OFFERTE_GEMAAKT = 'OFFERTE_GEMAAKT',
  GEWONNEN = 'GEWONNEN',
  VERLOREN = 'VERLOREN',
  ON_HOLD = 'ON_HOLD',
}

export enum Priority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
}

export interface UserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  color?: string | null;
  initials?: string | null;
  homeLat?: number | null;
  homeLng?: number | null;
}

export interface LocationSummary {
  id: string;
  name: string;
  city: string;
}

export interface Request {
  id: string;
  orgId: string;
  contactId: string;
  locationId: string | null;
  assignedTo: string | null;
  source: RequestSource;
  status: RequestStatus;
  title: string;
  description: string | null;
  priority: Priority;
  lostReasonId: string | null;
  lostNote: string | null;
  customFields: Record<string, any> | null;
  createdBy: string;
  isDeleted: boolean;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  contact?: ContactSummary;
  lostReason?: { id: string; code: string; label: string } | null;
  location?: LocationSummary;
  assignedUser?: UserSummary;
  createdByUser?: UserSummary;
  statusHistory?: RequestStatusHistory[];
  project?: { id: string; projectNumber: string } | null;
}

export interface RequestStatusHistory {
  id: string;
  requestId: string;
  fromStatus: RequestStatus | null;
  toStatus: RequestStatus;
  changedBy: string;
  changedAt: string;
  note: string | null;
  changedByUser?: UserSummary;
}

// ─── PRD-05: Quotes (Offertes) ─────────────────────────

export enum QuoteStatus {
  CONCEPT = 'CONCEPT',
  TER_GOEDKEURING = 'TER_GOEDKEURING',
  GOEDGEKEURD = 'GOEDGEKEURD',
  VERSTUURD = 'VERSTUURD',
  BEKEKEN = 'BEKEKEN',
  GEACCEPTEERD = 'GEACCEPTEERD',
  AFGEWEZEN = 'AFGEWEZEN',
  VERLOPEN = 'VERLOPEN',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

// ── Block editor types ─────────────────────────────────────

export type BlockType = 'rich_text' | 'image' | 'quote_lines';
export type BlockWidth = 'full' | 'half';

export interface ContentBlock {
  id: string;
  type: BlockType;
  width: BlockWidth;
  order: number;
  content: {
    tiptapJson?: object;
    storageKey?: string;
    fileName?: string;
    alt?: string;
    title?: string;
  };
}

export type QuoteTemplateType = 'BLOCKS' | 'DOCX';

export enum FollowUpType {
  EMAIL = 'EMAIL',
  TELEFOONGESPREK = 'TELEFOONGESPREK',
}

export enum FollowUpAssigneeType {
  SYSTEM = 'SYSTEM',
  QUOTE_OWNER = 'QUOTE_OWNER',
  SPECIFIC_USER = 'SPECIFIC_USER',
}

export interface QuoteTemplateFollowUp {
  id: string;
  templateId: string;
  type: FollowUpType;
  delayDays: number;
  isActive: boolean;
  emailTemplateId: string | null;
  defaultNotes: string | null;
  assigneeType: FollowUpAssigneeType;
  assigneeUserId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  emailTemplate?: { id: string; name: string; type: EmailTemplateType; subject: string; isActive: boolean } | null;
  assigneeUser?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface QuoteTemplateAttachment {
  id: string;
  templateId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  createdAt: string;
}

export interface QuoteTemplateDocxRevision {
  id: string;
  templateId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  uploadedById: string;
  uploadedBy?: { id: string; firstName: string; lastName: string };
  version: number;
  createdAt: string;
}

export interface QuoteTemplate {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  templateType: QuoteTemplateType;
  coverBlocks: any;
  contentBlocks: ContentBlock[] | any;
  closingBlocks: any;
  docxStorageKey: string | null;
  docxFileName: string | null;
  docxFileSize: number | null;
  defaultValidityDays: number;
  requiresApproval: boolean;
  isActive: boolean;
  sendEmailTemplateId?: string | null;
  sendEmailEnabled: boolean;
  acceptedEmailTemplateId?: string | null;
  acceptedEmailEnabled: boolean;
  sendEmailTemplate?: { id: string; name: string; type: EmailTemplateType; subject: string; isActive: boolean } | null;
  acceptedEmailTemplate?: { id: string; name: string; type: EmailTemplateType; subject: string; isActive: boolean } | null;
  createdAt: string;
  updatedAt: string;
  attachments?: QuoteTemplateAttachment[];
  docxRevisions?: QuoteTemplateDocxRevision[];
  followUpRules?: QuoteTemplateFollowUp[];
  _count?: { attachments: number };
}

export interface Quote {
  id: string;
  orgId: string;
  quoteNumber: string;
  templateId: string | null;
  requestId: string | null;
  contactId: string;
  locationId: string | null;
  status: QuoteStatus;
  subject: string;
  coverBlocks: any;
  contentBlocks: any;
  closingBlocks: any;
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  total: number;
  validUntil: string | null;
  requiresApproval: boolean;
  internalNotes: string | null;
  projectId: string | null;
  customFields: Record<string, any> | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Send & client portal
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  clientName: string | null;
  clientSignature: string | null;
  publicToken: string | null;
  contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null; email: string | null };
  location?: LocationSummary;
  request?: { id: string; title: string };
  pdfStorageKey?: string | null;
  signedPdfStorageKey?: string | null;
  template?: { id: string; name: string; templateType?: string };
  createdByUser?: UserSummary;
  organization?: { id: string; name: string; logoUrl: string | null; primaryColor: string | null };
  lines?: QuoteLine[];
  approvalRequests?: QuoteApprovalRequest[];
  questions?: QuoteQuestion[];
  attachments?: QuoteAttachment[];
  project?: { id: string; projectNumber: string } | null;
}

export interface QuoteLine {
  id: string;
  quoteId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discountPct: number;
  lineTotal: number;
  sortOrder: number;
  product?: { id: string; name: string; unit: string; category: string | null };
}

export interface QuoteApprovalRequest {
  id: string;
  quoteId: string;
  requestedBy: string;
  reviewedBy: string | null;
  status: ApprovalStatus;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  requestedByUser?: UserSummary;
  reviewedByUser?: UserSummary;
}

export interface ResolvedPrice {
  unitPrice: number;
  vatRate: number;
  unit: string;
}

export interface QuoteQuestion {
  id: string;
  quoteId: string;
  userId: string | null;
  message: string;
  isFromClient: boolean;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export interface QuoteAttachment {
  id: string;
  quoteId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isStandard: boolean;
  sortOrder: number;
  createdAt: string;
}

// ─── PRD-06: Notifications ──────────────────────────────

export enum NotificationType {
  OFFERTE_TER_GOEDKEURING = 'OFFERTE_TER_GOEDKEURING',
  OFFERTE_GOEDGEKEURD = 'OFFERTE_GOEDGEKEURD',
  OFFERTE_AFGEWEZEN = 'OFFERTE_AFGEWEZEN',
  OFFERTE_VERSTUURD = 'OFFERTE_VERSTUURD',
  OFFERTE_BEKEKEN = 'OFFERTE_BEKEKEN',
  OFFERTE_ONDERTEKEND = 'OFFERTE_ONDERTEKEND',
  OFFERTE_VERLOPEN = 'OFFERTE_VERLOPEN',
  NIEUWE_VRAAG_KLANT = 'NIEUWE_VRAAG_KLANT',
  ANTWOORD_OP_VRAAG = 'ANTWOORD_OP_VRAAG',
  AANVRAAG_TOEGEWEZEN = 'AANVRAAG_TOEGEWEZEN',
  AANVRAAG_STATUS_GEWIJZIGD = 'AANVRAAG_STATUS_GEWIJZIGD',
  TAAK_TOEGEWEZEN = 'TAAK_TOEGEWEZEN',
  TAAK_STATUS_GEWIJZIGD = 'TAAK_STATUS_GEWIJZIGD',
  DOCUMENT_GEUPLOAD = 'DOCUMENT_GEUPLOAD',
  AFSPRAAK_ACCEPTATIE_VERZOEK = 'AFSPRAAK_ACCEPTATIE_VERZOEK',
  AFSPRAAK_GEACCEPTEERD = 'AFSPRAAK_GEACCEPTEERD',
  AFSPRAAK_GEWEIGERD = 'AFSPRAAK_GEWEIGERD',
  AFSPRAAK_VERPLAATST = 'AFSPRAAK_VERPLAATST',
  AFSPRAAK_VERZETTEN_VERZOEK = 'AFSPRAAK_VERZETTEN_VERZOEK',
  AFSPRAAK_BEVESTIGING_VERSTUURD = 'AFSPRAAK_BEVESTIGING_VERSTUURD',
  PROJECT_AANGEMAAKT = 'PROJECT_AANGEMAAKT',
  PROJECT_STATUS_GEWIJZIGD = 'PROJECT_STATUS_GEWIJZIGD',
}

export interface Notification {
  id: string;
  orgId: string | null;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPref {
  id: string;
  userId: string;
  notificationType: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

export interface NotificationGroupPref {
  id: string;
  orgId: string;
  role: Role;
  notificationType: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

export interface UnreadCountResponse {
  count: number;
}

// ─── Audit Trail ──────────────────────────────────────────

export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
}

export interface AuditLogEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: AuditAction;
  changes: Record<string, { from: any; to: any }> | null;
  snapshot: Record<string, any> | null;
  userId: string;
  user: { id: string; firstName: string; lastName: string };
  createdAt: string;
}

// ─── Task Management ─────────────────────────────────────

export enum TaskStatus {
  TE_DOEN = 'TE_DOEN',
  MEE_BEZIG = 'MEE_BEZIG',
  VOLTOOID = 'VOLTOOID',
}

export enum TaskType {
  TO_DO = 'TO_DO',
  EMAIL = 'EMAIL',
  TELEFOONGESPREK = 'TELEFOONGESPREK',
  DOCUMENT = 'DOCUMENT',
  GOEDKEURING = 'GOEDKEURING',
}

export enum TaskEntityType {
  CONTACT = 'CONTACT',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
  USER = 'USER',
}

export interface Task {
  id: string;
  orgId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  taskType: TaskType;
  entityType: TaskEntityType;
  entityId: string;
  entityName: string | null;
  assigneeId: string | null;
  createdById: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: UserSummary;
  createdBy?: UserSummary;
}

// ─── Notes (Threaded) ────────────────────────────────────

export enum NoteEntityType {
  CONTACT = 'CONTACT',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
  USER = 'USER',
  WORK_ORDER = 'WORK_ORDER',
}

export interface Note {
  id: string;
  orgId: string;
  entityType: NoteEntityType;
  entityId: string;
  entityName?: string | null;
  content: string;
  createdById: string;
  createdBy: { id: string; firstName: string; lastName: string };
  parentId: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  replies?: Note[];
  replyCount?: number;
}

// ─── Document Management ────────────────────────────────

export enum DocumentEntityType {
  CONTACT = 'CONTACT',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PRODUCT = 'PRODUCT',
  TASK = 'TASK',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
  USER = 'USER',
  WORK_ORDER = 'WORK_ORDER',
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
}

// ─── PRD-07: Planning & Afspraken ───────────────────────

export enum PlanningStatus {
  NOG_TE_PLANNEN = 'NOG_TE_PLANNEN',
  CONCEPT = 'CONCEPT',
  GEPLAND = 'GEPLAND',
  AFGEROND = 'AFGEROND',
  VERVALLEN = 'VERVALLEN',
}

export enum AcceptanceStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  REJECTED = 'REJECTED',
}

export enum SessionStatus {
  NOG_TE_PLANNEN = 'NOG_TE_PLANNEN',
  CONCEPT = 'CONCEPT',
  DEFINITIEF = 'DEFINITIEF',
  AFGEROND = 'AFGEROND',
  VERVALLEN = 'VERVALLEN',
}

export enum RescheduleStatus {
  PENDING = 'PENDING',
  PROCESSED = 'PROCESSED',
}

export interface PlanningInspector {
  id: string;
  planningItemId: string;
  userId: string;
  isPrimary: boolean;
  acceptanceStatus: AcceptanceStatus;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  user?: UserSummary;
}

export interface PlanningSessionInspector {
  id: string;
  sessionId: string;
  userId: string;
  isPrimary: boolean;
  acceptanceStatus: AcceptanceStatus;
  acceptedAt: string | null;
  rejectedAt: string | null;
  rejectionNote: string | null;
  user?: UserSummary;
}

export interface PlanningSession {
  id: string;
  planningItemId: string;
  sessionNumber: number;
  scheduledDate: string | null;
  durationHours: number | null;
  status: SessionStatus;
  isDefinitief: boolean;
  confirmedAt: string | null;
  notes: string | null;
  isCancelled: boolean;
  replacedById: string | null;
  replacesId: string | null;
  originalDate: string | null;
  createdAt: string;
  updatedAt: string;
  sessionInspectors?: PlanningSessionInspector[];
}

export interface PlanningFollower {
  id: string;
  planningItemId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  createdAt: string;
  user?: UserSummary | null;
}

export interface PlanningHistoryEntry {
  id: string;
  planningItemId: string;
  userId: string | null;
  action: string;
  description: string;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export interface RescheduleRequest {
  id: string;
  planningItemId: string;
  requestedBy: string | null;
  clientName: string | null;
  preferredDate: string;
  reason: string;
  status: RescheduleStatus;
  processedBy: string | null;
  processedAt: string | null;
  createdAt: string;
}

export interface PlanningItem {
  id: string;
  orgId: string;
  projectId: string | null;
  quoteId: string | null;
  contactId: string;
  contactPersonId: string | null;
  locationId: string;
  productId: string | null;
  productName: string;
  status: PlanningStatus;
  isCancelled: boolean;
  cancelledAt: string | null;
  cancelReason: string | null;
  scheduledDate: string | null;
  durationHours: number | null;
  labels: string[];
  internalNotes: string | null;
  publicToken: string;
  replacedById: string | null;
  replacesId: string | null;
  originalDate: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    type: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  contactPerson?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    role: ContactPersonRoleRef | null;
  } | null;
  location?: {
    id: string;
    name: string;
    street: string;
    houseNumber: string;
    city: string;
    postalCode: string;
    lat: number | null;
    lng: number | null;
  };
  createdByUser?: UserSummary;
  isMultiDay: boolean;
  sessionCount: number | null;
  inspectors?: PlanningInspector[];
  sessions?: PlanningSession[];
  followers?: PlanningFollower[];
  history?: PlanningHistoryEntry[];
  organization?: {
    id: string;
    name: string;
    logoUrl: string | null;
    primaryColor: string | null;
  };
  project?: { id: string; projectNumber: string } | null;
}

// ─── Werkbonnen (Work Orders) ────────────────────────────

export enum WorkOrderStatus {
  IN_VOORBEREIDING = 'IN_VOORBEREIDING',
  IN_UITVOERING = 'IN_UITVOERING',
  UITGEVOERD = 'UITGEVOERD',
  WACHT_OP_KLANT = 'WACHT_OP_KLANT',
}

export interface WorkOrder {
  id: string;
  orgId: string;
  planningItemId: string | null;
  workOrderNumber: string;
  status: WorkOrderStatus;
  internalNotes: string | null;
  startTime: string | null;
  endTime: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  planningItem?: {
    id: string;
    productName: string;
    scheduledDate: string | null;
    status: string;
    contactId: string;
    locationId: string | null;
    contact?: {
      id: string;
      type: string;
      companyName: string | null;
      firstName: string | null;
      lastName: string | null;
    };
    location?: {
      id: string;
      name: string;
      street: string;
      houseNumber: string;
      city: string;
      postalCode: string;
    };
    inspectors?: PlanningInspector[];
  };
  createdByUser?: UserSummary;
  lines?: WorkOrderLine[];
}

export interface WorkOrderLine {
  id: string;
  workOrderId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  lineTotal: number;
  sortOrder: number;
  product?: {
    id: string;
    name: string;
    unit: string;
    productGroupId: string | null;
  };
}

// ─── Projects ────────────────────────────────────────────

export enum ProjectStatus {
  ACTIEF = 'ACTIEF',
  ON_HOLD = 'ON_HOLD',
  AFGEROND = 'AFGEROND',
  GEANNULEERD = 'GEANNULEERD',
}

export interface Project {
  id: string;
  orgId: string;
  projectNumber: string;
  title: string;
  description: string | null;
  status: ProjectStatus;
  contactId: string;
  locationId: string | null;
  projectManagerId: string;
  startDate: string;
  expectedEndDate: string | null;
  endDate: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    type: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  location?: LocationSummary | null;
  projectManager?: UserSummary;
  createdByUser?: UserSummary;
  _count?: {
    requests: number;
    quotes: number;
    planningItems: number;
  };
}

export interface ProjectFollower {
  id: string;
  projectId: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  canViewGeneral: boolean;
  canViewRequests: boolean;
  canViewQuotes: boolean;
  canViewPlanning: boolean;
  canViewDocuments: boolean;
  createdAt: string;
  user?: UserSummary | null;
}

// ─── Global Search ────────────────────────────────────────

export type SearchEntityType =
  | 'contact'
  | 'contactPerson'
  | 'location'
  | 'request'
  | 'quote'
  | 'task'
  | 'document'
  | 'product';

export interface SearchContactResult {
  id: string;
  type: ContactType;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  addresses: { city: string }[];
}

export interface SearchContactPersonResult {
  id: string;
  contactId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: ContactPersonRoleRef | null;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchLocationResult {
  id: string;
  contactId: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  objectType: string | null;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchRequestResult {
  id: string;
  title: string;
  status: RequestStatus;
  priority: Priority;
  createdAt: string;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchQuoteResult {
  id: string;
  quoteNumber: string;
  subject: string;
  status: QuoteStatus;
  total: number;
  createdAt: string;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchTaskResult {
  id: string;
  title: string;
  status: TaskStatus;
  entityType: TaskEntityType;
  entityId: string;
  entityName: string | null;
  deadline: string | null;
  assignee: UserSummary | null;
}

export interface SearchDocumentResult {
  id: string;
  originalName: string;
  mimeType: string;
  entityType: DocumentEntityType;
  entityId: string;
  entityName: string | null;
  createdAt: string;
  uploadedBy: UserSummary;
}

export interface SearchProductResult {
  id: string;
  name: string;
  unit: string;
  isActive: boolean;
  productGroup: { id: string; name: string } | null;
}

export type SearchResultItem =
  | SearchContactResult
  | SearchContactPersonResult
  | SearchLocationResult
  | SearchRequestResult
  | SearchQuoteResult
  | SearchTaskResult
  | SearchDocumentResult
  | SearchProductResult;

export interface SearchGroup {
  type: SearchEntityType;
  total: number;
  items: SearchResultItem[];
}

export interface SearchResponse {
  groups: SearchGroup[];
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
