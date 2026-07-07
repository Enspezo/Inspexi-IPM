import type { InspectionListItem } from './inspections';

export interface PendingSignature {
  signatureId: string;
  documentId: string;
  documentType: string;
  inspectionPlanId: string;
  projectName: string;
  city: string | null;
}

export interface DashboardData {
  recentInspections: InspectionListItem[];
  pendingSignatures: PendingSignature[];
  openFindingsCount: number;
  totalInspections: number;
}
