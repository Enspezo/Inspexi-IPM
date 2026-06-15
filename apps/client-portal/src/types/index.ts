// Types voor het klantportaal. Spiegelen de response-shapes van de Beheer client-* endpoints
// (apps/api/src/modules/client-*). De backend levert codes (statusCode/normTypeCode/…), die in de
// UI via <LookupBadge> (per-org lookups) of een vaste enum-map (lib/status.ts) gerenderd worden.

export interface ApiError {
  message: string;
  statusCode: number;
  error?: string;
}

// ── Auth ──────────────────────────────────────────────────────────────────
export interface ClientUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  function: string | null;
}

export type ClientAccessRole = 'VIEWER' | 'SIGNER' | 'ADMIN';

export interface ContactRef {
  id: string;
  companyName: string | null;
  firstName: string | null;
  lastName: string | null;
}

export interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
}

export interface ClientAccessEntry {
  role: ClientAccessRole;
  contact: ContactRef;
}

export interface ClientMe extends ClientUser {
  access: ClientAccessEntry[];
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginResult extends AuthTokens {
  user: ClientUser;
}

export type MagicLinkResult =
  | { requiresRegistration: true; email: string; inspectionPlanId: string | null }
  | ({ requiresRegistration: false; user: ClientUser; inspectionPlanId: string | null } & AuthTokens);

// ── Inspecties ──────────────────────────────────────────────────────────────
export interface AddressFields {
  addressStreet?: string | null;
  addressHouseNumber?: string | null;
  addressPostalCode?: string | null;
  addressCity?: string | null;
}

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

export interface DocumentSignature {
  id: string;
  signerRoleCode: string;
  signerName: string | null;
  signerFunction?: string | null;
  status: string;
  signedAt: string | null;
}

export interface GeneratedDocumentSummary {
  id: string;
  documentType: string;
  status: string;
  generatedAt: string | null;
  finalizedAt: string | null;
  pdfUrl: string | null;
  signatures: DocumentSignature[];
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
}

// ── Constateringen ───────────────────────────────────────────────────────────
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

// ── Documenten ────────────────────────────────────────────────────────────────
export interface DocumentDetail {
  id: string;
  documentType: string;
  status: string;
  htmlContent: string | null;
  pdfUrl: string | null;
  generatedAt: string | null;
  finalizedAt: string | null;
  inspectionPlan: {
    id: string;
    projectName: string;
    referenceNumber: string | null;
    normTypeCode: string;
    addressCity: string | null;
  };
  signatures: DocumentSignature[];
}

export interface SignResult {
  signatureId: string;
  status: string;
  signedAt: string | null;
  documentFullySigned: boolean;
}

// ── Berichten ─────────────────────────────────────────────────────────────────
export interface MessageAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface InspectionMessage {
  id: string;
  content: string;
  readAt: string | null;
  createdAt: string;
  clientUser: UserRef | null;
  user: UserRef | null;
  attachments: MessageAttachment[];
}

// ── Verzoeken ─────────────────────────────────────────────────────────────────
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

// ── Dashboard ─────────────────────────────────────────────────────────────────
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
