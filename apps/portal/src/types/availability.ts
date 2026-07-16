// ─── PRD-12: Beschikbaarheid inspecteurs ────────────────

/** Dienstvorm van een inspecteur (bepaalt de baseline in de resolutie). */
export enum EmploymentType {
  DIENSTVERBAND = 'DIENSTVERBAND',
  FREELANCE = 'FREELANCE',
}

/** Uitzondering voegt beschikbaarheid toe of blokkeert die. */
export enum AvailabilityExceptionType {
  BESCHIKBAAR = 'BESCHIKBAAR',
  GEBLOKKEERD = 'GEBLOKKEERD',
}

/** Eén tijdslot binnen een template-weekdag (minuten vanaf middernacht). */
export interface AvailabilityTemplateSlot {
  id: string;
  templateId: string;
  weekday: number; // ISO 1..7
  startMinute: number;
  endMinute: number;
}

/** Herbruikbaar weekschema per organisatie. */
export interface AvailabilityTemplate {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  isActive: boolean;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  slots: AvailabilityTemplateSlot[];
  /** Aantal schema-toewijzingen (serialiseer van `_count.assignments`). */
  assignmentCount: number;
}

/** Koppeling inspecteur → template met ingangsdatum. */
export interface UserScheduleAssignment {
  id: string;
  orgId: string;
  userId: string;
  templateId: string;
  validFrom: string;
  validUntil: string | null;
  createdById: string;
  createdAt: string;
  template?: {
    id: string;
    name: string;
    isActive: boolean;
    isDeleted: boolean;
  };
}

/** Eenmalige of wekelijks herhalende beschikbaarheids-uitzondering. */
export interface AvailabilityException {
  id: string;
  orgId: string;
  userId: string;
  type: AvailabilityExceptionType;

  // Eenmalig (isRecurring = false)
  startsAt: string | null;
  endsAt: string | null;
  allDay: boolean;

  // Herhalend (isRecurring = true)
  isRecurring: boolean;
  weekdays: number[]; // ISO 1..7
  startMinute: number | null;
  endMinute: number | null;
  intervalWeeks: number;
  recurStartDate: string | null;
  recurEndDate: string | null;

  reason: string | null;
  createdById: string;
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Halfopen tijdsinterval binnen een dag: [startMinute, endMinute). */
export interface AvailabilityInterval {
  startMinute: number;
  endMinute: number;
}

/** Bron die (mede) bepaalt waarom iemand op een dag (niet) beschikbaar is. */
export interface AvailabilityDaySource {
  kind: 'TEMPLATE' | 'EXCEPTION';
  id: string;
  type?: AvailabilityExceptionType;
}

/** Berekend eindresultaat per inspecteur per dag (resolved availability). */
export interface ResolvedAvailabilityDay {
  userId: string;
  date: string; // YYYY-MM-DD
  intervals: AvailabilityInterval[];
  isAvailable: boolean;
  sources: AvailabilityDaySource[];
}

/** Eén conflict binnen een check-venster. */
export interface AvailabilityConflict {
  date: string;
  startMinute: number;
  endMinute: number;
  reason: string;
}

/** Resultaat van GET /availability/check. */
export interface AvailabilityCheckResult {
  available: boolean;
  coveredIntervals: { date: string; startMinute: number; endMinute: number }[];
  conflicts: AvailabilityConflict[];
}
