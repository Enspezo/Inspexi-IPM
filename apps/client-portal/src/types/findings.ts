import type { UserRef } from './common';

/**
 * AssetNode-ref zoals de server hem serialiseert (unified AssetNode-boom, B-401):
 * `assetNode: { select: { id, name, description } }` in client-inspections.service
 * (getFindings) en client-findings.service (getDetail). Let op: `locationDescription`
 * bestaat NIET op de node — het equivalent heet `description`; de vrije-tekst-locatie
 * van de constatering zelf staat op `Finding.locationDescription`.
 */
export interface AssetRef {
  id: string;
  name: string;
  description: string | null;
}

export interface ResolutionSummary {
  id: string;
  statusCode: string;
  description: string | null;
  resolvedAt: string;
  verifiedAt: string | null;
  verificationNotes: string | null;
}

export interface Finding {
  id: string;
  shortDescription: string;
  longDescription: string | null;
  classificationValues: Record<string, unknown>;
  locationDescription: string | null;
  recommendation: string | null;
  recommendationCustom: string | null;
  normReference: string | null;
  statusCode: string;
  resolvedAt: string | null;
  inspectionType: string;
  /**
   * In het schema een verplichte relatie, maar hier optioneel-veilig getypeerd:
   * een ontbrekende node mag de UI nooit meer slopen (B-401) — altijd via `?.` lezen.
   */
  assetNode: AssetRef | null;
  resolutions: ResolutionSummary[];
}

export interface ResolutionPhoto {
  id: string;
  caption: string | null;
  uploadedAt: string;
  url: string;
}

/**
 * B-409 (beslispunt A4): verwijzing naar de herstelverklaring bij een
 * REPORTED-resolutie — de verklaring (Documenten-tab) benoemt de hersteller.
 */
export interface RepairStatementRef {
  documentId: string;
  signedAt: string | null;
}

export interface FindingResolutionDetail {
  id: string;
  statusCode: string;
  description: string | null;
  resolvedAt: string;
  verifiedAt: string | null;
  verificationNotes: string | null;
  resolvedByClientUser: UserRef | null;
  repairStatement?: RepairStatementRef | null;
  photos: ResolutionPhoto[];
}

export interface FindingDetail extends Omit<Finding, 'resolutions'> {
  resolutions: FindingResolutionDetail[];
}
