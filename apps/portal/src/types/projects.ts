import type { LocationSummary, UserSummary } from './requests';

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

/** Lichte fase-referentie zoals meegeleverd op gekoppelde entiteiten (PRD-12 §12.7.2). */
export interface ProjectPhaseRef {
  id: string;
  name: string;
  sortOrder: number;
  status: PhaseStatus;
  projectId?: string;
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
