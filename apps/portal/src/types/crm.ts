import type { Quote } from './quotes';
import type { Request } from './requests';

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
