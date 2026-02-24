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
  createdAt: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: Role;
  orgId: string;
  isActive: boolean;
  emailVerifiedAt: string | null;
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

export enum ContactPersonRole {
  ALGEMEEN = 'ALGEMEEN',
  TECHNISCH = 'TECHNISCH',
  ADMINISTRATIEF = 'ADMINISTRATIEF',
  ANDERS = 'ANDERS',
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
  cocNumber: string | null;
  notes: string | null;
  priceTableId: string | null;
  ownerId: string | null;
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
}

export interface ContactPerson {
  id: string;
  contactId: string;
  orgId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  role: ContactPersonRole;
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
  createdAt: string;
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

export interface Product {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  unit: string;
  defaultVat: number;
  category: string | null;
  isActive: boolean;
  createdAt: string;
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
  createdBy: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  contact?: ContactSummary;
  location?: LocationSummary;
  assignedUser?: UserSummary;
  createdByUser?: UserSummary;
  statusHistory?: RequestStatusHistory[];
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

export interface QuoteTemplate {
  id: string;
  orgId: string;
  name: string;
  coverBlocks: any;
  contentBlocks: any;
  closingBlocks: any;
  defaultValidityDays: number;
  requiresApproval: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
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
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null; email: string | null };
  location?: LocationSummary;
  request?: { id: string; title: string };
  template?: { id: string; name: string };
  createdByUser?: UserSummary;
  lines?: QuoteLine[];
  approvalRequests?: QuoteApprovalRequest[];
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
