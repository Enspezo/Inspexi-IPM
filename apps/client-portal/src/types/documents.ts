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

/**
 * GET /client/inspections/:id/documents — B-406a (WP-B9): de server stuurt per
 * document het per-plan teken-recht mee zodat de UI de onderteken-knop verbergt
 * i.p.v. de klant pas ná het tekenen een 403 te tonen.
 */
export interface InspectionDocumentListItem extends GeneratedDocumentSummary {
  canSign: boolean;
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
  /** B-406a (WP-B9): per-plan teken-recht van de ingelogde klant. */
  canSign: boolean;
  signatures: DocumentSignature[];
}

export interface SignResult {
  signatureId: string;
  status: string;
  signedAt: string | null;
  documentFullySigned: boolean;
}
