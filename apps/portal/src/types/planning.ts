import type { ContactPersonRoleRef } from './crm';
import type { ProjectPhaseRef } from './projects';
import type { UserSummary } from './requests';

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
  projectPhaseId: string | null;
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
  projectPhase?: ProjectPhaseRef | null;
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
  projectPhaseId: string | null;
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
    projectId?: string | null;
    project?: { id: string; projectNumber: string } | null;
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
  projectPhase?: ProjectPhaseRef | null;
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
