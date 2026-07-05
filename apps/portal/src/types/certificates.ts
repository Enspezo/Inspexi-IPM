import type { UserSummary } from './requests';

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
