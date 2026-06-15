// ===========================================
// Document Builder — Default content per block type
// ===========================================

import type {
  RichTextContent,
  ImageContent,
  DividerContent,
  SpacerContent,
  PlaceholderContent,
  TocContent,
  FindingsTableContent,
  AssetSummaryContent,
  MeasurementDataContent,
  SignatureBlockContent,
} from './types';

export const defaultRichTextContent: RichTextContent = {
  tiptapJson: { type: 'doc', content: [{ type: 'paragraph' }] },
};

export const defaultImageContent: ImageContent = {
  url: undefined,
  storageKey: undefined,
  fileName: undefined,
  alt: '',
  title: '',
};

export const defaultDividerContent: DividerContent = {
  style: 'solid',
  color: '#e5e7eb',
};

export const defaultSpacerContent: SpacerContent = {
  height: 32,
};

export const defaultPlaceholderContent: PlaceholderContent = {
  placeholder: '',
  label: '',
};

export const defaultTocContent: TocContent = {
  title: 'Inhoudsopgave',
  showPageNumbers: true,
};

export const defaultFindingsTableContent: FindingsTableContent = {
  showClassification: true,
  showNormReference: true,
  showPhotos: true,
  groupBy: 'none',
};

export const defaultAssetSummaryContent: AssetSummaryContent = {
  showTechnicalData: true,
  showFindings: true,
  showMeasurements: true,
  maxDepth: 3,
};

export const defaultMeasurementDataContent: MeasurementDataContent = {
  showPassFail: true,
  showNotes: true,
};

export const defaultSignatureBlockContent: SignatureBlockContent = {
  signerRoles: ['inspector', 'reviewer'],
  showDate: true,
  showFunction: true,
};
