import type { UserRef } from './common';

export interface AssetRef {
  id: string;
  name: string;
  locationDescription: string | null;
  inspectionPlanId?: string;
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
  asset: AssetRef;
  resolutions: ResolutionSummary[];
}

export interface ResolutionPhoto {
  id: string;
  caption: string | null;
  uploadedAt: string;
  url: string;
}

export interface FindingResolutionDetail {
  id: string;
  statusCode: string;
  description: string | null;
  resolvedAt: string;
  verifiedAt: string | null;
  verificationNotes: string | null;
  resolvedByClientUser: UserRef | null;
  photos: ResolutionPhoto[];
}

export interface FindingDetail extends Omit<Finding, 'resolutions'> {
  resolutions: FindingResolutionDetail[];
}
