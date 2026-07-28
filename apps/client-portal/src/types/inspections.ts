import type { AddressFields, ContactRef, UserRef } from './common';
import type { GeneratedDocumentSummary } from './documents';

export interface InspectionListItem extends AddressFields {
  id: string;
  projectName: string;
  referenceNumber: string | null;
  statusCode: string;
  normTypeCode: string;
  inspectionTypeCode: string;
  plannedDate: string | null;
  completedAt: string | null;
  contact: ContactRef;
}

export interface FindingSummary {
  id: string;
  statusCode: string;
  shortDescription: string;
  classificationValues: Record<string, unknown>;
}

export interface AssetSummary {
  id: string;
  name: string;
  assetType: string;
  statusCode: string;
  findings: FindingSummary[];
}

export interface InstallationResponsible {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
}

export interface InspectionDetail extends InspectionListItem {
  description: string | null;
  /** Online herstel (PRD-14): per-plan vlag — stuurt de herstel-ingang in het klantportaal. */
  onlineRepairEnabled: boolean;
  startedAt: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  approvedAt: string | null;
  notes: string | null;
  assignedUser: UserRef | null;
  reviewer: UserRef | null;
  installationResponsible: InstallationResponsible | null;
  assets: AssetSummary[];
  generatedDocuments: GeneratedDocumentSummary[];
  findingCounts: { total: number; open: number; resolved: number };
  /**
   * B-412 (WP-B9): false zolang het rapport nog niet gereviewd is (vier-ogen-gate
   * van de org aan) — constateringen en documenten zijn dan nog niet zichtbaar.
   */
  contentReleased: boolean;
}
