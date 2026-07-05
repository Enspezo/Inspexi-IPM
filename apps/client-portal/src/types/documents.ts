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
