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
  isDeleted: boolean;
  createdAt: string;
  addresses?: ContactAddress[];
  locations?: Location[];
  logs?: ContactLog[];
  emails?: ContactEmail[];
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
