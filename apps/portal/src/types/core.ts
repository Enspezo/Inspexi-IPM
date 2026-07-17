import type { EmploymentType } from './availability';

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
  /** Vier-ogen-controle verplicht op inspectieplannen (PRD-13). */
  inspectionReviewEnabled: boolean;
  /** AI-voorcontrole van inspectierapporten aan/uit (PRD-13). */
  aiReviewEnabled: boolean;
  /** Optionele org-specifieke instructies voor de AI-voorcontrole (PRD-13). */
  aiReviewInstructions: string | null;
  /** Online herstel standaard aan voor nieuwe inspecties (PRD-14). */
  onlineRepairDefault: boolean;
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
  /** Dienstvorm (PRD-12) — null = geen inspecteur / n.v.t. */
  employmentType?: EmploymentType | null;
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

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}
