import type { Role } from './core';
import type { EmailTemplateType } from './documents';
import type { ProjectPhaseRef } from './projects';
import type { LocationSummary, UserSummary } from './requests';

// ─── PRD-05: Quotes (Offertes) ─────────────────────────

export enum QuoteStatus {
  CONCEPT = 'CONCEPT',
  TER_GOEDKEURING = 'TER_GOEDKEURING',
  GOEDGEKEURD = 'GOEDGEKEURD',
  VERSTUURD = 'VERSTUURD',
  BEKEKEN = 'BEKEKEN',
  GEACCEPTEERD = 'GEACCEPTEERD',
  AFGEWEZEN = 'AFGEWEZEN',
  VERLOPEN = 'VERLOPEN',
}

export enum ApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}

export enum ApprovalKind {
  THRESHOLD = 'THRESHOLD',
  VOLUNTARY_TEAM = 'VOLUNTARY_TEAM',
  VOLUNTARY_PERSON = 'VOLUNTARY_PERSON',
}

// ── Block editor types ─────────────────────────────────────

export type BlockType = 'rich_text' | 'image' | 'quote_lines';
export type BlockWidth = 'full' | 'half';

export interface ContentBlock {
  id: string;
  type: BlockType;
  width: BlockWidth;
  order: number;
  content: {
    tiptapJson?: object;
    storageKey?: string;
    fileName?: string;
    alt?: string;
    title?: string;
  };
}

export type QuoteTemplateType = 'BLOCKS' | 'DOCX';

export enum FollowUpType {
  EMAIL = 'EMAIL',
  TELEFOONGESPREK = 'TELEFOONGESPREK',
}

export enum FollowUpAssigneeType {
  SYSTEM = 'SYSTEM',
  QUOTE_OWNER = 'QUOTE_OWNER',
  SPECIFIC_USER = 'SPECIFIC_USER',
}

export interface QuoteTemplateFollowUp {
  id: string;
  templateId: string;
  type: FollowUpType;
  delayDays: number;
  isActive: boolean;
  emailTemplateId: string | null;
  defaultNotes: string | null;
  assigneeType: FollowUpAssigneeType;
  assigneeUserId: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  emailTemplate?: { id: string; name: string; type: EmailTemplateType; subject: string; isActive: boolean } | null;
  assigneeUser?: { id: string; firstName: string; lastName: string; email: string } | null;
}

export interface QuoteTemplateAttachment {
  id: string;
  templateId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  createdAt: string;
}

export interface QuoteTemplateDocxRevision {
  id: string;
  templateId: string;
  storageKey: string;
  fileName: string;
  fileSize: number;
  uploadedById: string;
  uploadedBy?: { id: string; firstName: string; lastName: string };
  version: number;
  createdAt: string;
}

export interface QuoteTemplate {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  templateType: QuoteTemplateType;
  coverBlocks: any;
  contentBlocks: ContentBlock[] | any;
  closingBlocks: any;
  docxStorageKey: string | null;
  docxFileName: string | null;
  docxFileSize: number | null;
  defaultValidityDays: number;
  requiresApproval: boolean;
  isActive: boolean;
  sendEmailTemplateId?: string | null;
  sendEmailEnabled: boolean;
  acceptedEmailTemplateId?: string | null;
  acceptedEmailEnabled: boolean;
  sendEmailTemplate?: { id: string; name: string; type: EmailTemplateType; subject: string; isActive: boolean } | null;
  acceptedEmailTemplate?: { id: string; name: string; type: EmailTemplateType; subject: string; isActive: boolean } | null;
  createdAt: string;
  updatedAt: string;
  attachments?: QuoteTemplateAttachment[];
  docxRevisions?: QuoteTemplateDocxRevision[];
  followUpRules?: QuoteTemplateFollowUp[];
  _count?: { attachments: number };
}

export interface Quote {
  id: string;
  orgId: string;
  quoteNumber: string;
  templateId: string | null;
  requestId: string | null;
  contactId: string;
  locationId: string | null;
  status: QuoteStatus;
  subject: string;
  coverBlocks: any;
  contentBlocks: any;
  closingBlocks: any;
  subtotal: number;
  discountTotal: number;
  vatTotal: number;
  total: number;
  validUntil: string | null;
  requiresApproval: boolean;
  internalNotes: string | null;
  projectId: string | null;
  projectPhaseId: string | null;
  customFields: Record<string, any> | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // Send & client portal
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  clientName: string | null;
  clientSignature: string | null;
  publicToken: string | null;
  contact?: { id: string; type: string; companyName: string | null; firstName: string | null; lastName: string | null; email: string | null };
  location?: LocationSummary;
  request?: { id: string; title: string };
  pdfStorageKey?: string | null;
  signedPdfStorageKey?: string | null;
  template?: { id: string; name: string; templateType?: string } | null;
  createdByUser?: UserSummary;
  organization?: { id: string; name: string; logoUrl: string | null; primaryColor: string | null };
  lines?: QuoteLine[];
  approvalRequests?: QuoteApprovalRequest[];
  questions?: QuoteQuestion[];
  attachments?: QuoteAttachment[];
  project?: { id: string; projectNumber: string } | null;
  projectPhase?: ProjectPhaseRef | null;
}

export interface QuoteLine {
  id: string;
  quoteId: string;
  productId: string | null;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
  discountPct: number;
  lineTotal: number;
  sortOrder: number;
  product?: { id: string; name: string; unit: string; category: string | null };
}

export interface QuoteApprovalRequest {
  id: string;
  quoteId: string;
  requestedBy: string;
  reviewedBy: string | null;
  status: ApprovalStatus;
  kind: ApprovalKind;
  approverRole: Role | null;
  approverUserId: string | null;
  note: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  requestedByUser?: UserSummary;
  reviewedByUser?: UserSummary;
  approverUser?: UserSummary;
}

export interface ResolvedPrice {
  unitPrice: number;
  vatRate: number;
  unit: string;
}

export interface QuoteQuestion {
  id: string;
  quoteId: string;
  userId: string | null;
  message: string;
  isFromClient: boolean;
  createdAt: string;
  user?: { id: string; firstName: string; lastName: string } | null;
}

export interface QuoteAttachment {
  id: string;
  quoteId: string;
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isStandard: boolean;
  sortOrder: number;
  createdAt: string;
}
