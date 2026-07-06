import type { ContactSummary } from './products';

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
