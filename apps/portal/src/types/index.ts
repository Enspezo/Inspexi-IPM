export enum Role {
  SUPERUSER = 'SUPERUSER',
  ORG_ADMIN = 'ORG_ADMIN',
  MANAGER = 'MANAGER',
  BACKOFFICE = 'BACKOFFICE',
  WERKVOORBEREIDER = 'WERKVOORBEREIDER',
  INSPECTEUR = 'INSPECTEUR',
}

/** Beschikbaarheidsstatus voor de interne chat (REQ1). */
export enum Availability {
  BESCHIKBAAR = 'BESCHIKBAAR',
  BEZIG = 'BEZIG',
  AFWEZIG = 'AFWEZIG',
  OFFLINE = 'OFFLINE',
}

export enum ContactDisplayMode {
  NONE = 'NONE',
  STATIC = 'STATIC',
  INSPECTOR = 'INSPECTOR',
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
  inspectorPhoneDisplay: ContactDisplayMode;
  inspectorEmailDisplay: ContactDisplayMode;
  inspectorStaticPhone: string | null;
  inspectorStaticEmail: string | null;
  quoteApprovalThreshold: number | null;
  quoteApprovalRequiredRole: Role | null;
  isActive: boolean;
  chatEnabled: boolean;
  /** Toegewezen SaaS-abonnement (entitlements, PRD-09); null = geen plan. */
  planId: string | null;
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
  contactPhone: string | null;
  contactEmail: string | null;
  sharePhoneWithClients: boolean;
  shareEmailWithClients: boolean;
  defaultApprovalPersonId: string | null;
  availability?: Availability;
  availabilityNote?: string | null;
  lastSeenAt?: string | null;
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
  isSupplier: boolean;
  supplierCustomerNumber?: string | null;
  purchaseConditions?: string | null;
  supplierRating?: boolean | null;
  notes: string | null;
  priceTableId: string | null;
  ownerId: string | null;
  customFields: Record<string, any> | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
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
  updatedAt: string;
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
  updatedAt: string;
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
  locationTypeId: string | null;
  locationType?: {
    id: string;
    code: string;
    name: string;
    color: string | null;
    icon: string | null;
  } | null;
  notes: string | null;
  pdokData: Record<string, unknown> | null;
  lat: number | null;
  lng: number | null;
  // BAG-bouwgegevens (verrijkt via PDOK)
  gebruiksfunctie: string | null;
  bouwjaar: number | null;
  oppervlakte: number | null;
  bagId: string | null;
  customFields: Record<string, any> | null;
  createdAt: string;
  updatedAt: string;
}

/** Eén veldwijziging uit een PDOK-refresh-diff. */
export interface PdokDiffChange {
  field: string;
  label: string;
  oldValue: string | number | null;
  newValue: string | number | null;
}

/** Resultaat van POST /contacts/locations/:id/pdok-refresh. */
export interface PdokRefreshResult {
  applied: boolean;
  changes: PdokDiffChange[];
  /** Aanwezig wanneer niet opgeslagen (applied=false): de gevonden waarden. */
  fetched?: {
    gebruiksfunctie: string | null;
    bouwjaar: number | null;
    oppervlakte: number | null;
    bagId: string | null;
    lat: number | null;
    lng: number | null;
  };
  /** Aanwezig wanneer opgeslagen (applied=true): de bijgewerkte locatie. */
  location?: Location;
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
  productCode: string | null;
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
  // On the PUBLIC planning endpoint, `phone`/`email` are the server-resolved
  // client-safe values (per-channel display mode), NOT the login email.
  email: string;
  phone?: string | null;
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
  requestNumber: string | null;
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
  CANCELLED = 'CANCELLED',
}

export enum ApprovalKind {
  THRESHOLD = 'THRESHOLD',
  VOLUNTARY_TEAM = 'VOLUNTARY_TEAM',
  VOLUNTARY_PERSON = 'VOLUNTARY_PERSON',
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
  template?: { id: string; name: string; templateType?: string } | null;
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
  kind: ApprovalKind;
  approverRole: Role | null;
  approverUserId: string | null;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  requestedByUser?: UserSummary;
  reviewedByUser?: UserSummary;
  approverUser?: UserSummary;
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
  FOUTMELDING_INGEDIEND = 'FOUTMELDING_INGEDIEND',
  INSPECTIEPLAN_TOEGEWEZEN = 'INSPECTIEPLAN_TOEGEWEZEN',
  INSPECTIEPLAN_TER_REVIEW = 'INSPECTIEPLAN_TER_REVIEW',
  INSPECTIEPLAN_GOEDGEKEURD = 'INSPECTIEPLAN_GOEDGEKEURD',
  INSPECTIEPLAN_AFGEKEURD = 'INSPECTIEPLAN_AFGEKEURD',
  OFFERTE_GOEDKEURING_GEVRAAGD_TEAM = 'OFFERTE_GOEDKEURING_GEVRAAGD_TEAM',
  OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON = 'OFFERTE_GOEDKEURING_GEVRAAGD_PERSOON',
  OFFERTE_GOEDKEURING_AFGEHANDELD = 'OFFERTE_GOEDKEURING_AFGEHANDELD',
  CHAT_BERICHT = 'CHAT_BERICHT',
  CHAT_TEAM_BERICHT = 'CHAT_TEAM_BERICHT',
  CHAT_MENTION = 'CHAT_MENTION',
  SUPPORT_TICKET_AANGEMAAKT = 'SUPPORT_TICKET_AANGEMAAKT',
  SUPPORT_TICKET_REACTIE = 'SUPPORT_TICKET_REACTIE',
  SUPPORT_TICKET_STATUS = 'SUPPORT_TICKET_STATUS',
  MEETMIDDEL_KALIBRATIE_BINNENKORT = 'MEETMIDDEL_KALIBRATIE_BINNENKORT',
  MEETMIDDEL_KALIBRATIE_VERLOPEN = 'MEETMIDDEL_KALIBRATIE_VERLOPEN',
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
  LOCATION = 'LOCATION',
  REQUEST = 'REQUEST',
  QUOTE = 'QUOTE',
  PRODUCT = 'PRODUCT',
  TASK = 'TASK',
  PLANNING = 'PLANNING',
  PROJECT = 'PROJECT',
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

// ─── PRD-11: Inspecteur-certificaten / diploma's ────────

export interface InspectorCertificate {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  number: string | null;
  issueDate: string;
  validUntil: string | null;
  issuer: string;
  // Bestand-metadata (storageKey wordt nooit naar de client gestuurd).
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  hasDocument: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  user?: UserSummary;
}

// ─── Meetmiddelen (measurement instruments) + Kalibraties ───────────────────

export enum MeasurementInstrumentStatus {
  ACTIEF = 'ACTIEF',
  BUITEN_GEBRUIK = 'BUITEN_GEBRUIK',
  AFGEKEURD = 'AFGEKEURD',
}

/** Afgeleide kalibratiestatus (geen DB-enum) — berekend uit laatste kalibratie + interval. */
export type MeasurementCalibrationStatus =
  | 'GEEN_KALIBRATIE'
  | 'GELDIG'
  | 'BINNENKORT'
  | 'VERLOPEN';

export interface MeasurementInstrument {
  id: string;
  orgId: string;
  code: string;
  brand: string;
  type: string;
  serialNumber: string | null;
  calibrationIntervalMonths: number;
  status: MeasurementInstrumentStatus;
  assignedToUserId: string | null;
  notes: string | null;
  // Afgeleide cache (laatste kalibratie + verloopdatum).
  lastCalibrationDate: string | null;
  nextCalibrationDue: string | null;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  // Door de API verrijkt:
  calibrationStatus?: MeasurementCalibrationStatus;
  assignedTo?: UserSummary | null;
  calibrationCount?: number;
}

export interface Calibration {
  id: string;
  orgId: string;
  instrumentId: string;
  calibrationDate: string;
  performedBy: string;
  certificateNumber: string | null;
  notes: string | null;
  // Bestand-metadata (storageKey wordt nooit naar de client gestuurd).
  fileName: string | null;
  originalName: string | null;
  mimeType: string | null;
  size: number | null;
  hasDocument: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
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

// ─── PRD-12: Projectfasen ─────────────────────────────────

export enum PhaseStatus {
  NIET_GESTART = 'NIET_GESTART',
  ACTIEF = 'ACTIEF',
  ON_HOLD = 'ON_HOLD',
  AFGEROND = 'AFGEROND',
  GEANNULEERD = 'GEANNULEERD',
}

export enum MilestoneStatus {
  OPEN = 'OPEN',
  BEHAALD = 'BEHAALD',
  VERVALLEN = 'VERVALLEN',
}

/** Fasevolger — spiegelt ProjectFollower (§12.3.3). */
export interface ProjectPhaseFollower {
  id: string;
  phaseId: string;
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

export interface PhaseMilestone {
  id: string;
  orgId: string;
  phaseId: string;
  title: string;
  description: string | null;
  dueDate: string;
  status: MilestoneStatus;
  completedAt: string | null;
  assigneeId: string | null;
  reminderDaysBefore: number;
  lastReminderStage: string | null;
  lastReminderAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  assignee?: UserSummary | null;
}

/** Lichte milestone-vorm zoals meegeleverd in de fasenlijst (§12.5). */
export interface PhaseMilestoneSummaryItem {
  id: string;
  status: MilestoneStatus;
  dueDate: string;
}

export interface PhaseCounts {
  inspectionPlans: number;
  planningItems: number;
  workOrders: number;
  quotes: number;
  followers: number;
  milestones: number;
}

interface PhasePersonRef {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

export interface ProjectPhase {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  description: string | null;
  status: PhaseStatus;
  sortOrder: number;
  locationId: string | null;
  contactPersonId: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  completedAt: string | null;
  // Prisma Decimal serialiseert als string; alleen aanwezig voor canWrite-rollen (§12.4.8).
  budgetAmount?: string | null;
  isDeleted: boolean;
  deletedAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  location?: LocationSummary | null;
  contactPerson?: PhasePersonRef | null;
  createdByUser?: PhasePersonRef;
  // Lijst levert lichte milestones; detail levert de volledige lijst.
  milestones?: PhaseMilestoneSummaryItem[];
  followers?: ProjectPhaseFollower[];
  _count?: PhaseCounts;
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
  isFavorited?: boolean;
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
  isFavorited?: boolean;
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
  isFavorited?: boolean;
  id: string;
  contactId: string;
  name: string;
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
  locationType?: {
    id: string;
    code: string;
    name: string;
    color: string | null;
    icon: string | null;
  } | null;
  contact: {
    id: string;
    companyName: string | null;
    firstName: string | null;
    lastName: string | null;
  };
}

export interface SearchRequestResult {
  isFavorited?: boolean;
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
  isFavorited?: boolean;
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
  isFavorited?: boolean;
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
  isFavorited?: boolean;
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
  isFavorited?: boolean;
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

// ─── Favorites (REQ36) ──────────────────────────────────

/** Canonical Prisma model names that can be favorited (matches backend allow-list). */
export type FavoritableEntityType =
  | 'Contact'
  | 'ContactPerson'
  | 'Location'
  | 'Request'
  | 'Quote'
  | 'Task'
  | 'Project'
  | 'Product';

/** Lightweight key used to drive the star toggle state. */
export interface FavoriteKey {
  entityType: FavoritableEntityType;
  entityId: string;
}

/** A favorite enriched with a human-readable name for the favorites overview. */
export interface FavoriteItem {
  id: string;
  entityType: FavoritableEntityType;
  entityId: string;
  name: string;
  createdAt: string;
}

export interface FavoriteGroup {
  entityType: FavoritableEntityType;
  items: FavoriteItem[];
}

export interface FavoritesResponse {
  groups: FavoriteGroup[];
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

// ─── Fase 1: Inspectiedomein ─────────────────────────────
// Core + config/template types geport uit de Inspexi-App.
// Status-/type-codes (statusCode, normTypeCode, ...) zijn vrije code-strings
// gekoppeld aan per-org lookups (InspectionLookupOption), GEEN enums.

// ── Per-org lookups ──
/**
 * Generieke lookup-rij voor de 11 overschrijfbare status/type-lijsten
 * (inspectietype, plan-/asset-/finding-/report-status, signatory-type,
 * signer-role, pass/fail, resolutie, client-request type/status).
 * orgId null = globale systeemdefault; org-rij met dezelfde `code` overschrijft.
 */
export interface InspectionLookupOption {
  id: string;
  orgId: string | null;
  code: string;
  label: string;
  color?: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: string;
}

// ── Vaste enums (code-gebonden, niet org-uitbreidbaar) ──
export enum InspectionExecStatus {
  not_started = 'not_started',
  in_progress = 'in_progress',
  completed = 'completed',
}

export enum FindingInspectionType {
  visual = 'visual',
  measurement = 'measurement',
}

export enum PhotoEntityType {
  asset = 'asset',
  finding = 'finding',
  inspection_plan = 'inspection_plan',
  location = 'location',
}

export enum MeasurementDataType {
  number = 'number',
  text = 'text',
  select = 'select',
  boolean = 'boolean',
}

export enum ChecklistStatus {
  CONCEPT = 'CONCEPT',
  ACTIEF = 'ACTIEF',
  VERVALLEN = 'VERVALLEN',
}

export enum TemplateStatus {
  CONCEPT = 'CONCEPT',
  ACTIEF = 'ACTIEF',
  VERVALLEN = 'VERVALLEN',
}

export enum AssetFieldType {
  text = 'text',
  number = 'number',
  select = 'select',
  checkbox = 'checkbox',
  date = 'date',
  textarea = 'textarea',
}

export enum DocumentType {
  PLAN = 'PLAN',
  REPORT = 'REPORT',
}

export enum SectionType {
  STATIC = 'STATIC',
  REPEATING = 'REPEATING',
  TABLE_OF_CONTENTS = 'TABLE_OF_CONTENTS',
  SIGNATURE_BLOCK = 'SIGNATURE_BLOCK',
  CONDITIONAL = 'CONDITIONAL',
}

/** Hoe een DocumentTemplate is opgebouwd (Fase 4). */
export enum TemplateMode {
  SECTIONS = 'SECTIONS',
  BLOCKS = 'BLOCKS',
  DOCX = 'DOCX',
}

export interface DocumentSection {
  id: string;
  documentTemplateId: string;
  code: string;
  title: string;
  sectionType: SectionType;
  contentHtml: string | null;
  repeatOn: string | null;
  repeatItemTemplate: string | null;
  condition: string | null;
  sortOrder: number;
  includeInToc: boolean;
  pageBreakBefore: boolean;
  pageBreakAfter: boolean;
  parentSectionId: string | null;
  childSections?: DocumentSection[];
}

export interface DocumentTemplateDocxRevision {
  id: string;
  documentTemplateId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  uploadedById: string;
  uploadedBy?: { id: string; firstName: string; lastName: string };
  version: number;
  createdAt: string;
}

/**
 * Plan- of rapport-document-template van een inspectie-template (Fase 4).
 * `contentBlocks` is de block-editor-payload (BLOCKS-modus) — getypt als
 * `unknown[]` om `@/types` losgekoppeld te houden van de block-editor-module;
 * de detailpagina cast naar `DocContentBlock[]`.
 */
export interface DocumentTemplate {
  id: string;
  inspectionTemplateId: string;
  documentType: DocumentType;
  pageSize: string;
  orientation: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerHtml: string | null;
  footerHtml: string | null;
  coverPageHtml: string | null;
  templateMode: TemplateMode;
  contentBlocks: unknown[] | null;
  docxStorageKey: string | null;
  docxFileName: string | null;
  docxFileSize: number | null;
  createdAt: string;
  updatedAt: string;
  sections?: DocumentSection[];
}

export enum GeneratedDocumentStatus {
  DRAFT = 'DRAFT',
  PENDING_SIGNATURES = 'PENDING_SIGNATURES',
  SIGNED = 'SIGNED',
  FINALIZED = 'FINALIZED',
}

export enum SignatureStatus {
  PENDING = 'PENDING',
  REQUESTED = 'REQUESTED',
  SIGNED = 'SIGNED',
  DECLINED = 'DECLINED',
  EXPIRED = 'EXPIRED',
}

export interface DocumentSignature {
  id: string;
  generatedDocumentId: string;
  signerRoleCode: string;
  signerName: string | null;
  signerEmail: string | null;
  signerFunction: string | null;
  signatureImage: string | null;
  signedAt: string | null;
  signedIpAddress: string | null;
  signatureRequestId: string | null;
  signatureRequestSentAt: string | null;
  signatureRequestUrl: string | null;
  status: SignatureStatus;
}

/** Gegenereerd inspectie-document (plan of rapport) — lifecycle + ondertekening. */
export interface GeneratedDocument {
  id: string;
  orgId: string;
  documentTemplateId: string;
  inspectionPlanId: string;
  documentType: DocumentType;
  status: GeneratedDocumentStatus;
  isEdited: boolean;
  editedAt: string | null;
  pdfUrl: string | null;
  wordUrl: string | null;
  generatedAt: string;
  generatedBy: string;
  finalizedAt: string | null;
  signatures?: DocumentSignature[];
}

export enum MeasurementSheetTemplateStatus {
  CONCEPT = 'CONCEPT',
  ACTIEF = 'ACTIEF',
  VERVALLEN = 'VERVALLEN',
}

export enum MeasurementSheetFieldType {
  NUMBER = 'NUMBER',
  TEXT = 'TEXT',
  TEXTAREA = 'TEXTAREA',
  CHECKBOX = 'CHECKBOX',
  DROPDOWN = 'DROPDOWN',
  CALCULATED = 'CALCULATED',
  PHOTO = 'PHOTO',
}

export enum MeasurementSheetFieldWidth {
  QUARTER = 'QUARTER',
  THIRD = 'THIRD',
  HALF = 'HALF',
  TWO_THIRDS = 'TWO_THIRDS',
  THREE_QUARTERS = 'THREE_QUARTERS',
  FULL = 'FULL',
}

export enum PassFailOperator {
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  EQ = 'EQ',
  RANGE = 'RANGE',
  IN = 'IN',
}

export enum MeasurementSheetRecordStatus {
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  VALIDATED = 'VALIDATED',
}

export enum MarkerType {
  ASSET = 'ASSET',
  MEASUREMENT = 'MEASUREMENT',
  FINDING = 'FINDING',
}

// ── Core entities ──
export interface InspectionPlan {
  id: string;
  orgId: string;
  contactId: string;
  projectId: string | null;
  inspectionTemplateId: string | null;
  locationId: string | null;
  projectName: string;
  description: string | null;
  referenceNumber: string | null;
  normTypeCode: string;
  inspectionTypeCode: string;
  addressStreet: string | null;
  addressHouseNumber: string | null;
  addressPostalCode: string | null;
  addressCity: string | null;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  plannedDate: string | null;
  plannedDurationHours: string | null;
  deadline: string | null;
  assignedTo: string | null;
  reviewerId: string | null;
  statusCode: string;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  installationResponsibleId: string | null;
  notes: string | null;
  internalNotes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  lastModifiedBy: string | null;
  deviceId: string | null;
  deletedAt: string | null;
  contact?: ContactSummary;
  project?: { id: string; projectNumber: string } | null;
  assignedUser?: UserSummary | null;
  reviewer?: UserSummary | null;
  inspectionTemplate?: InspectionTemplate | null;
  location?: LocationSummary | null;
  scopeLocations?: InspectionPlanLocation[];
  signatures?: Signature[];
  reports?: Report[];
}

/** Unified recursive node: één boom met LOCATION- en ASSET-knopen (MAIC-model). */
export enum AssetNodeType {
  LOCATION = 'LOCATION',
  ASSET = 'ASSET',
}

export interface AssetNode {
  id: string;
  orgId: string;
  nodeType: AssetNodeType;
  parentId: string | null;
  /** Alleen gevuld op de root-LOCATION-node (1:1 met een CRM-locatie). */
  rootLocationId: string | null;
  typeCode: string;
  /** Server-toegekend, uniek-per-org nodenummer (read-only). */
  nodeNumber: string | null;
  name: string;
  identifier: string | null;
  description: string | null;
  technicalData: Record<string, unknown>;
  statusCode: string;
  notes: string | null;
  sortOrder: number;
  /** ltree materialized path (server-maintained); niet via Prisma Client schrijfbaar. */
  path: string | null;
  depth: number;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  deletedAt: string | null;
  // Relaties / include-projecties:
  parent?: AssetNode | null;
  children?: AssetNode[];
  rootLocation?: LocationSummary | null;
  findings?: Finding[];
  // Berekende projectie-velden uit de tree/lijst-endpoints:
  childCount?: number;
  findingCount?: number;
  visualInspectionStatus?: string;
  measurementStatus?: string;
  /** Alleen in de planboom (GET /inspection-plans/:id/tree): valt deze LOCATION binnen de scope. */
  inScope?: boolean;
}

/** Koppeling van een inspectieplan aan een deellocatie-node (scope). */
export interface InspectionPlanLocation {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  assetNodeId: string;
  isPrimary: boolean;
  assetNode?: AssetNode;
}

/**
 * Legacy compat-shape van de assets-wrappers (GET /assets,
 * GET /inspection-plans/:id/assets?flat=true). Deze endpoints mappen ASSET-nodes
 * terug op het oude Asset-contract; de boom-UI gebruikt {@link AssetNode}.
 */
export interface Asset {
  id: string;
  parentAssetId: string | null;
  assetType: string;
  name: string;
  identifier: string | null;
  locationDescription: string | null;
  sortOrder: number;
  statusCode: string;
  technicalData: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  /** Alleen aanwezig op detail-/uitvoeringsprojecties. */
  inspectionPlanId?: string | null;
  findingCount?: number;
  _count?: Record<string, number>;
}

/**
 * Legacy compat-shape van de inspection-locations-wrapper
 * (GET /inspection-plans/:id/locations?flat=true). Mapt LOCATION-nodes terug op
 * het oude contract; de boom-UI gebruikt {@link AssetNode}.
 */
export interface InspectionLocation {
  id: string;
  parentLocationId: string | null;
  locationType: string;
  name: string;
  identifier: string | null;
  description: string | null;
  sortOrder: number;
  technicalData: Record<string, unknown>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Finding {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  assetNodeId: string;
  visualInspectionId: string | null;
  measurementRecordId: string | null;
  findingTemplateId: string | null;
  inspectionType: FindingInspectionType;
  shortDescription: string;
  longDescription: string | null;
  classificationValues: Record<string, unknown>;
  locationDescription: string | null;
  locationMarker: Record<string, unknown> | null;
  recommendation: string | null;
  recommendationCustom: string | null;
  normReference: string | null;
  checklistItemId: string | null;
  statusCode: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  resolutionNotes: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  deletedAt: string | null;
  assetNode?: AssetNode;
  findingTemplate?: FindingTemplate | null;
}

export interface StandaloneMeasurement {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  locationNodeId: string | null;
  linkedAssetNodeId: string | null;
  measurementType: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string | null;
  createdBy?: string | null;
  deviceId?: string | null;
}

// ── Locatie-afbeelding (plattegrond) + markers ──
export interface LocationImageMarker {
  id: string;
  orgId: string;
  locationImageId: string;
  positionX: number; // % 0-100
  positionY: number; // % 0-100
  markerType: MarkerType;
  assetNodeId: string | null;
  findingId: string | null;
  standaloneMeasurementId: string | null;
  annotation: Record<string, unknown> | null;
  label: string | null;
  color: string | null;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  // Door de API meegestuurde (deels geselecteerde) relaties:
  assetNode?: Pick<AssetNode, 'id' | 'name' | 'typeCode' | 'nodeType' | 'statusCode'> | null;
  finding?: Pick<Finding, 'id' | 'shortDescription' | 'statusCode' | 'classificationValues'> | null;
  standaloneMeasurement?: Pick<StandaloneMeasurement, 'id' | 'measurementType' | 'description'> | null;
}

export interface LocationImage {
  id: string;
  orgId: string;
  nodeId: string;
  storagePath: string;
  thumbnailPath: string | null;
  originalFilename: string | null;
  fileSize: number | null;
  mimeType: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  updatedAt: string;
  syncedAt: string | null;
  createdBy: string | null;
  deviceId: string | null;
  markers?: LocationImageMarker[];
}

export interface Signature {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  signatoryTypeCode: string;
  signatoryName: string;
  signatoryFunction: string | null;
  signatoryUserId: string | null;
  signatoryContactId: string | null;
  signatureData: string;
  signatureHash: string | null;
  signedAt: string;
  ipAddress: string | null;
  deviceInfo: Record<string, unknown> | null;
  gpsLatitude: string | null;
  gpsLongitude: string | null;
  syncedAt: string | null;
  deviceId: string | null;
}

export interface Report {
  id: string;
  orgId: string;
  inspectionPlanId: string;
  version: number;
  templateId: string | null;
  statusCode: string;
  customContent: Record<string, unknown>;
  pdfPath: string | null;
  wordPath: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalNotes: string | null;
  sentAt: string | null;
  sentTo: unknown[];
  deliveryStatus: string | null;
  generatedAt: string | null;
  fileSize: number | null;
  pageCount: number | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
}

// ── Norm & classificatie ──
export interface NormTypeDefinition {
  id: string;
  code: string;
  label: string;
  description: string | null;
  assetTypes: string[];
  classificationModelId: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  createdBy: string;
  classificationModel?: ClassificationModel | null;
}

export interface ClassificationModel {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  characteristics?: ClassificationCharacteristic[];
}

export interface ClassificationCharacteristic {
  id: string;
  classificationModelId: string;
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  options?: ClassificationOption[];
}

export interface ClassificationOption {
  id: string;
  characteristicId: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  sortOrder: number;
}

// ── Categorieën (constatering- & checklist-item-categorieën) ──
export interface Category {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  parentId: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
  parent?: Category | null;
  children?: Category[];
}

// ── Checklists ──
export interface Checklist {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  code: string | null;
  name: string;
  description: string | null;
  normTypeCode: string;
  assetTypes: string[];
  locationTypes: string[];
  version: string;
  status: ChecklistStatus;
  previousVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  /** Door de API meegestuurd op detail: gekoppelde items via de join-tabel. */
  itemLinks?: ChecklistItemLink[];
}

/** Koppeling tussen een Checklist en een ChecklistItem uit de bibliotheek. */
export interface ChecklistItemLink {
  id: string;
  checklistId: string;
  checklistItemId: string;
  sortOrder: number;
  isRequired: boolean;
  categoryOverride: string | null;
  checklistItem?: ChecklistItem & { category?: Category | null };
}

export interface ChecklistItem {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  code: string | null;
  question: string;
  instruction: string | null;
  normReference: string | null;
  categoryId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

// ── Templates (constatering / asset- & locatietype / inspectie / meetstaat) ──
export interface FindingTemplate {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  code: string | null;
  categoryId: string | null;
  shortDescription: string;
  longDescription: string | null;
  explanation: string | null;
  normReference: string | null;
  classificationModelId: string;
  defaultClassification: Record<string, unknown>;
  usageCount: number;
  lastUsedAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface AssetTypeDefinition {
  id: string;
  orgId: string | null;
  code: string;
  shortCode: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  normTypes: unknown[];
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  fields?: AssetTypeField[];
}

export interface AssetTypeField {
  id: string;
  assetTypeDefinitionId: string;
  fieldKey: string;
  label: string;
  description: string | null;
  helpText: string | null;
  fieldType: AssetFieldType;
  isRequired: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  validationRules: Record<string, unknown>;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  displayWidth: string | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Toegestaan ouder-type voor een asset-type (parent-constraint). */
export interface AssetTypeConstraint {
  id: string;
  assetTypeDefinitionId: string;
  allowedParentTypeId: string | null;
  isRequired: boolean;
  createdAt: string;
  allowedParentType?: { id: string; code: string; name: string } | null;
}

export interface LocationTypeDefinition {
  id: string;
  orgId: string | null;
  code: string;
  shortCode: string | null;
  name: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  normTypes: unknown[];
  isActive: boolean;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  fields?: LocationTypeField[];
}

export interface LocationTypeField {
  id: string;
  locationTypeDefinitionId: string;
  fieldKey: string;
  label: string;
  description: string | null;
  helpText: string | null;
  fieldType: AssetFieldType;
  isRequired: boolean;
  defaultValue: string | null;
  placeholder: string | null;
  validationRules: Record<string, unknown>;
  unit: string | null;
  sortOrder: number;
  isActive: boolean;
  displayWidth: string | null;
  groupName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Toegestaan ouder-type voor een locatie-type (parent-constraint). */
export interface LocationTypeConstraint {
  id: string;
  locationTypeDefinitionId: string;
  allowedParentTypeId: string | null;
  isRequired: boolean;
  createdAt: string;
  allowedParentType?: { id: string; code: string; name: string } | null;
}

export interface InspectionTemplate {
  id: string;
  isSystem: boolean;
  orgId: string | null;
  forkedFromId: string | null;
  code: string;
  name: string;
  description: string | null;
  normTypeCode: string;
  classificationModelId: string;
  version: string;
  status: TemplateStatus;
  previousVersionId: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  classificationModel?: ClassificationModel;
}

export interface MeasurementSheetTemplate {
  id: string;
  code: string;
  name: string;
  description: string | null;
  normTypeCode: string;
  assetTypes: string[];
  locationTypes: string[];
  version: string;
  status: MeasurementSheetTemplateStatus;
  previousVersionId: string | null;
  finalCheckRules: unknown[];
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  retiredAt: string | null;
  createdBy: string;
  updatedBy: string | null;
  sections?: MeasurementSheetSection[];
}

export interface MeasurementSheetSection {
  id: string;
  templateId: string;
  code: string;
  name: string;
  description: string | null;
  isRepeating: boolean;
  minRows: number;
  sortOrder: number;
  collapsible: boolean;
  defaultCollapsed: boolean;
  rowValidationRules: unknown[];
  fields?: MeasurementSheetField[];
}

export interface MeasurementSheetField {
  id: string;
  sectionId: string;
  code: string;
  name: string;
  description: string | null;
  fieldType: MeasurementSheetFieldType;
  sortOrder: number;
  placeholder: string | null;
  width: MeasurementSheetFieldWidth;
  unit: string | null;
  decimals: number | null;
  minValue: string | null;
  maxValue: string | null;
  dropdownOptions: Record<string, unknown> | null;
  formula: string | null;
  formulaDependencies: string[];
  isRequired: boolean;
  passFailEnabled: boolean;
  passFailOperator: PassFailOperator | null;
  passFailValue: string | null;
  passFailMinValue: string | null;
  passFailMaxValue: string | null;
  passFailValues: Record<string, unknown> | null;
  passFailFailMessage: string | null;
  autoFindingEnabled: boolean;
  autoFindingTemplateId: string | null;
  copyValueOnNewRow: boolean;
  allowBulkEdit: boolean;
}

// ─── Ingevulde meetstaat-records (snapshot van een template) ───
// Een record bevriest het template (templateSnapshot) bij aanmaken en bewaart de
// ingevulde waarden in `data` (sectie → rij → veld). De staf bekijkt dit read-only;
// invullen gebeurt in het veld (PWA).

/** Eén veldwaarde in record.data: ingevulde waarde + pass/fail-uitkomst. */
export interface MeasurementSheetFieldValue {
  value: unknown;
  passFail?: 'pass' | 'fail' | null;
}

/** Bevroren veld in templateSnapshot.sections[].fields[] (subset van MeasurementSheetField). */
export interface MeasurementSheetSnapshotField {
  code: string;
  name: string;
  description: string | null;
  fieldType: MeasurementSheetFieldType;
  sortOrder: number;
  placeholder: string | null;
  width: MeasurementSheetFieldWidth;
  unit: string | null;
  decimals: number | null;
}

/** Bevroren sectie in templateSnapshot.sections[]. */
export interface MeasurementSheetSnapshotSection {
  code: string;
  name: string;
  description: string | null;
  isRepeating: boolean;
  minRows: number;
  sortOrder: number;
  fields: MeasurementSheetSnapshotField[];
}

/** Het ingevroren template binnen een record. */
export interface MeasurementSheetTemplateSnapshot {
  id: string;
  code: string;
  name: string;
  version: string;
  normTypeCode: string;
  finalCheckRules?: unknown[];
  sections: MeasurementSheetSnapshotSection[];
}

/** Resultaat van één final-check-regel (record.finalCheckResults.results[]). */
export interface MeasurementSheetFinalCheckRuleResult {
  ruleType: string;
  passed: boolean;
  message?: string;
  details?: Record<string, unknown>;
}

/** record.finalCheckResults: macro-uitkomst van de afronding. */
export interface MeasurementSheetFinalCheckResults {
  passed: boolean;
  results: MeasurementSheetFinalCheckRuleResult[];
}

/** record.data: sectiecode → rij-index ("0", "1", …) → veldcode → waarde. */
export type MeasurementSheetRecordData = Record<
  string,
  Record<string, Record<string, MeasurementSheetFieldValue>>
>;

export interface MeasurementSheetRecord {
  id: string;
  orgId: string;
  templateId: string;
  assetNodeId: string;
  inspectionPlanId: string;
  templateVersion: string;
  templateSnapshot: MeasurementSheetTemplateSnapshot;
  status: MeasurementSheetRecordStatus;
  data: MeasurementSheetRecordData;
  finalCheckExecuted: boolean;
  finalCheckPassed: boolean | null;
  finalCheckResults: MeasurementSheetFinalCheckResults | null;
  syncedAt: string | null;
  deviceId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  createdBy: string;
  usedInstrumentIds: string[];
  // Include-projecties uit de endpoints:
  template?: { id: string; code: string; name: string; version: string };
  assetNode?: { id: string; name: string; typeCode: string; inspectionPlanId?: string };
}

// ─── Voice-prompts (3-lagen prompt-model voor spraakinvoer) ───

/** Laag 1: systeem-base-prompt (SUPERUSER, exact één actief). */
export interface VoiceBasePrompt {
  id: string;
  name: string;
  content: string;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/** Laag 2: per-org template-prompt op een meetstaat-template (ORG_ADMIN). */
export interface VoiceTemplatePrompt {
  id: string;
  orgId: string;
  templateId: string;
  content: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  /** Meegestuurd door de API (include) — handig voor weergave. */
  template?: { id: string; name: string };
}

// ─── Interne chat (REQ1) ──────────────────────────────────

export enum ChatThreadType {
  DIRECT = 'DIRECT',
  TEAM = 'TEAM',
}

export enum ChatThreadStatus {
  OPEN = 'OPEN',
  AFGEROND = 'AFGEROND',
}

/** Lichte gebruikersweergave incl. presence (van /chat/users en thread-counterpart). */
export interface ChatUser {
  id: string;
  firstName: string;
  lastName: string;
  initials: string | null;
  avatarUrl: string | null;
  availability: Availability;
  availabilityNote: string | null;
  lastSeenAt: string | null;
  roles?: Role[];
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  sender: {
    id: string;
    firstName: string;
    lastName: string;
    initials: string | null;
    avatarUrl: string | null;
  };
  content: string;
  mentionedUserIds: string[];
  referenceEntityType: string | null;
  referenceEntityId: string | null;
  referenceName: string | null;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  type: ChatThreadType;
  teamRole: Role | null;
  subject: string | null;
  status: ChatThreadStatus;
  referenceEntityType: string | null;
  referenceEntityId: string | null;
  referenceName: string | null;
  noteId: string | null;
  closedAt: string | null;
  unreadCount: number;
  counterpart: ChatUser | null;
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    senderName: string;
    createdAt: string;
  } | null;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserPresence {
  id: string;
  availability: Availability;
  availabilityNote: string | null;
  lastSeenAt: string | null;
}

export interface ChatUnreadResponse {
  count: number;
}

// ── Helpsysteem (IMP_PRD-10) ────────────────────────────────────────────────
export enum HelpArticleStatus {
  DRAFT = 'DRAFT',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export interface HelpCategory {
  id: string;
  orgId: string | null; // null = globaal
  slug: string;
  name: string;
  description: string | null;
  icon: string | null;
  order: number;
  parentId: string | null;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
  articles?: HelpArticle[]; // bij categorie-detail
}

export interface HelpArticle {
  id: string;
  orgId: string | null; // null = globaal
  categoryId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  body: string;
  status: HelpArticleStatus;
  tags: string[];
  moduleKeys: string[];
  order: number;
  viewCount: number;
  helpfulYes: number;
  helpfulNo: number;
  authorId: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  category?: { id: string; name: string; slug: string } | null;
}

// ─── IMP_PRD-10 Fase 4: Support-tickets ─────────────────

export enum SupportTicketStatus {
  NIEUW = 'NIEUW',
  IN_BEHANDELING = 'IN_BEHANDELING',
  WACHT_OP_KLANT = 'WACHT_OP_KLANT',
  OPGELOST = 'OPGELOST',
  GESLOTEN = 'GESLOTEN',
}

export enum SupportTicketPriority {
  LAAG = 'LAAG',
  NORMAAL = 'NORMAAL',
  HOOG = 'HOOG',
  URGENT = 'URGENT',
}

export enum SupportTicketCategory {
  VRAAG = 'VRAAG',
  PROBLEEM = 'PROBLEEM',
  BUG = 'BUG',
  FEATURE_REQUEST = 'FEATURE_REQUEST',
  FACTUUR = 'FACTUUR',
  OVERIG = 'OVERIG',
}

export type SupportMessageAuthorType = 'USER' | 'SUPPORT' | 'SYSTEM';

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  orgId: string;
  authorId: string | null;
  authorType: SupportMessageAuthorType;
  body: string;
  isInternal: boolean;
  createdAt: string;
  author?: UserSummary;
}

export interface SupportTicket {
  id: string;
  orgId: string;
  ticketNumber: number;
  subject: string;
  description: string;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  category: SupportTicketCategory;
  contextModule: string | null;
  contextUrl: string | null;
  createdById: string;
  assignedToId: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: UserSummary;
  assignedTo?: UserSummary | null;
  organization?: { id: string; name: string } | null;
  messages?: SupportTicketMessage[];
}
