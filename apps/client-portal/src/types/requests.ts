import type { ContactRef } from './common';

export interface ClientRequest {
  id: string;
  requestTypeCode: string;
  subject: string;
  description: string;
  preferredDate: string | null;
  statusCode: string;
  handledAt: string | null;
  responseNotes: string | null;
  resultingInspectionPlanId: string | null;
  relatedInspectionPlan: { id: string; projectName: string; addressCity: string | null } | null;
  contact: ContactRef;
  createdAt: string;
}
