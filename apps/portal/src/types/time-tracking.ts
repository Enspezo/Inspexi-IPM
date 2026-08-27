// Urenregistratie inspecteurs (add-on, PRD-16)

export enum TimeActivityType {
  VOORBEREIDING = 'VOORBEREIDING',
  UITVOERING = 'UITVOERING',
  RAPPORTAGE = 'RAPPORTAGE',
  REISTIJD = 'REISTIJD',
  OVERIG = 'OVERIG',
}

export enum TimeEntrySource {
  HANDMATIG = 'HANDMATIG',
  AGENDA = 'AGENDA',
  INSPECTIE_AUTO = 'INSPECTIE_AUTO',
  REIS_AUTO = 'REIS_AUTO',
  CORRECTIE = 'CORRECTIE',
}

export enum TimesheetStatus {
  CONCEPT = 'CONCEPT',
  INGEDIEND = 'INGEDIEND',
  GOEDGEKEURD = 'GOEDGEKEURD',
  AFGEWEZEN = 'AFGEWEZEN',
}

export interface TimeEntryUserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface TimeEntry {
  id: string;
  orgId: string;
  userId: string;
  activityType: TimeActivityType;
  source: TimeEntrySource;
  projectId: string | null;
  inspectionPlanId: string | null;
  planningItemId: string | null;
  startedAt: string;
  endedAt: string | null;
  durationMinutes: number | null;
  notes: string | null;
  stopReason: string | null;
  needsProjectAssignment: boolean;
  assignmentTaskId: string | null;
  correctedById: string | null;
  timesheetId: string | null;
  createdAt: string;
  updatedAt: string;
  user?: TimeEntryUserRef;
  correctedBy?: TimeEntryUserRef | null;
  project?: { id: string; projectNumber: string; title: string } | null;
  inspectionPlan?: { id: string; projectName: string } | null;
  planningItem?: { id: string; productName: string } | null;
  timesheet?: { id: string; status: TimesheetStatus; year: number; weekNumber: number } | null;
}

export interface TimesheetTotals {
  totalMinutes: number;
  byActivity: Partial<Record<TimeActivityType, number>>;
}

export interface Timesheet {
  id: string;
  orgId: string;
  userId: string;
  year: number;
  weekNumber: number;
  status: TimesheetStatus;
  submittedAt: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
  user?: TimeEntryUserRef;
  reviewedBy?: TimeEntryUserRef | null;
  entries?: TimeEntry[];
  totals?: TimesheetTotals;
}
