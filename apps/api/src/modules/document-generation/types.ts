// ===========================================
// Document Generation Types
// Ported from Inspexi-App (document-generation/types.ts).
// `DocumentData` is the normalized context for Handlebars/section rendering.
// ===========================================

/** Organization data for document placeholders */
export interface OrganizationData {
  name: string;
  logo?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
  kvk?: string;
  certifications?: string[];
}

/** Client data for document placeholders */
export interface ClientData {
  name: string;
  contactPerson?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  phone?: string;
  email?: string;
}

/** Location data for document placeholders */
export interface LocationData {
  name?: string;
  address: string;
  postalCode?: string;
  city?: string;
}

/** Inspection plan data for document placeholders */
export interface PlanData {
  id: string;
  reference: string;
  projectName: string;
  date: Date;
  plannedDate?: Date;
  scope?: string;
  description?: string;
  normType: string;
  normTypeName: string;
  status: string;
}

/** Inspector/User data for document placeholders */
export interface InspectorData {
  name: string;
  email?: string;
  certifications?: string[];
}

/** Reviewer data for document placeholders */
export interface ReviewerData {
  name: string;
  email?: string;
}

/** Photo data for document placeholders */
export interface PhotoData {
  id: string;
  url: string;
  thumbnailUrl?: string;
  caption?: string;
  capturedAt?: Date;
}

/** Finding data for document placeholders */
export interface FindingData {
  id: string;
  reference?: string;
  shortDescription: string;
  longDescription?: string;
  classification: string;
  classificationColor: string;
  classificationName: string;
  assetId: string;
  assetName: string;
  locationDescription?: string;
  photos: PhotoData[];
  recommendation?: string;
  status: string;
  normReference?: string;
}

/** Asset data for document placeholders */
export interface AssetData {
  id: string;
  name: string;
  type: string;
  typeName: string;
  identifier?: string;
  locationDescription?: string;
  status: string;
  photos: PhotoData[];
  findings: FindingData[];
  measurements: Record<string, unknown>;
  technicalData?: Record<string, unknown>;
  children?: AssetData[];
}

/** Measurement sheet section data */
export interface MeasurementSectionData {
  name: string;
  fields: Record<string, unknown>;
}

/** Measurement sheet data for document placeholders */
/** Gebruikt meetmiddel op een meetstaat (snapshot of live opgelost). */
export interface UsedInstrumentData {
  id: string;
  code: string;
  brand: string;
  type: string;
  serialNumber?: string | null;
  lastCalibrationDate?: Date | string | null;
  nextCalibrationDue?: Date | string | null;
}

export interface MeasurementSheetData {
  id: string;
  name: string;
  templateCode: string;
  assetId?: string;
  assetName?: string;
  date: Date;
  inspector: string;
  sections: MeasurementSectionData[];
  usedInstruments: UsedInstrumentData[];
}

/** Finding summary by classification */
export interface FindingSummary {
  total: number;
  byClassification: Record<string, number>;
  byStatus: Record<string, number>;
}

/** Complete document data for template rendering */
export interface DocumentData {
  organization: OrganizationData;
  client: ClientData;
  location: LocationData;
  plan: PlanData;
  inspector: InspectorData;
  reviewer?: ReviewerData;
  assets: AssetData[];
  findings: FindingData[];
  findingsSummary: FindingSummary;
  measurementSheets: MeasurementSheetData[];
  currentDate: Date;
  generatedAt: Date;
  // Pagination placeholders (filled in by PDF generator)
  pageNumber?: string;
  totalPages?: string;
}

/** Normalized rendering context (alias for DocumentData). */
export type DocumentContext = DocumentData;

/** PDF generation options */
export interface PdfOptions {
  format?: 'A4' | 'A3' | 'Letter';
  landscape?: boolean;
  marginTopMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
  marginRightMm?: number;
  headerHtml?: string;
  footerHtml?: string;
}

/** Document template settings from the database (subset used for rendering). */
export interface DocumentTemplateSettings {
  pageSize: string;
  orientation: string;
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  headerHtml?: string | null;
  footerHtml?: string | null;
  coverPageHtml?: string | null;
}
