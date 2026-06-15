// ===========================================
// Document Builder — Block types
// ===========================================
//
// Block-editor types voor het inspectie-document-template-domein (plan/rapport).
// Bewust losgekoppeld van de quote-block-editor in `@/types` (die een smallere
// BlockType-union heeft). De content-shapes komen exact overeen met wat de
// Fase 4 BLOCKS-renderer (`BlockHtmlRendererService`) op de API leest.

export type DocBlockCategory = 'core' | 'layout' | 'inspection';

export type DocCoreBlockType = 'rich_text' | 'image' | 'divider' | 'spacer';

export type DocInspectionBlockType =
  | 'placeholder'
  | 'toc'
  | 'findings_table'
  | 'asset_summary'
  | 'measurement_data'
  | 'signature_block';

export type DocBlockType = DocCoreBlockType | DocInspectionBlockType;

export type DocBlockWidth = 'full' | 'half';

// ── Per-block content shapes (matchen de API-renderer) ──────────────

export interface RichTextContent {
  tiptapJson?: object | null;
  /** Fallback bij gemigreerde secties (renderer leest dit als geen tiptapJson). */
  rawHtml?: string;
}

export interface ImageContent {
  /** Data-URL of absolute URL. De renderer gebruikt `url` vóór `storageKey`. */
  url?: string;
  storageKey?: string;
  fileName?: string;
  alt?: string;
  title?: string;
}

export interface DividerContent {
  style?: 'solid' | 'dashed' | 'dotted';
  color?: string;
}

export interface SpacerContent {
  height?: number;
}

export interface PlaceholderContent {
  placeholder: string;
  label?: string;
}

export interface TocContent {
  title?: string;
  showPageNumbers?: boolean;
}

export interface FindingsTableContent {
  showClassification?: boolean;
  showNormReference?: boolean;
  showPhotos?: boolean;
  groupBy?: 'asset' | 'classification' | 'none';
}

export interface AssetSummaryContent {
  showTechnicalData?: boolean;
  showFindings?: boolean;
  showMeasurements?: boolean;
  maxDepth?: number;
}

export interface MeasurementDataContent {
  showPassFail?: boolean;
  showNotes?: boolean;
}

export type DocSignerRole = 'inspector' | 'reviewer' | 'client' | 'installation_responsible';

export interface SignatureBlockContent {
  signerRoles?: DocSignerRole[];
  showDate?: boolean;
  showFunction?: boolean;
}

export type DocBlockContent =
  | RichTextContent
  | ImageContent
  | DividerContent
  | SpacerContent
  | PlaceholderContent
  | TocContent
  | FindingsTableContent
  | AssetSummaryContent
  | MeasurementDataContent
  | SignatureBlockContent
  | Record<string, unknown>;

export interface DocContentBlock {
  id: string;
  type: DocBlockType;
  width: DocBlockWidth;
  order: number;
  content: DocBlockContent;
}

// ── Block-component props ───────────────────────────────────────────

export interface DocBlockProps<T extends DocBlockContent = DocBlockContent> {
  content: T;
  onChange: (content: T) => void;
  isReadOnly?: boolean;
}

export interface DocBlockDefinition {
  type: DocBlockType;
  label: string;
  description?: string;
  /** Sleutel in de inline-SVG icon-map (`./icons`). */
  icon: string;
  category: DocBlockCategory;
  defaultContent: DocBlockContent;
  supportsHalfWidth?: boolean;
  isDeletable?: boolean;
}
