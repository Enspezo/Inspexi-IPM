// ===========================================
// BlockRenderer — Render-switch per block type
// ===========================================

import type {
  DocContentBlock,
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
import { RichTextBlock } from './blocks/rich-text-block';
import { ImageBlock } from './blocks/image-block';
import { DividerBlock } from './blocks/divider-block';
import { SpacerBlock } from './blocks/spacer-block';
import { PlaceholderBlock } from './blocks/placeholder-block';
import { TocBlock } from './blocks/toc-block';
import { FindingsTableBlock } from './blocks/findings-table-block';
import { AssetSummaryBlock } from './blocks/asset-summary-block';
import { MeasurementBlock } from './blocks/measurement-block';
import { SignatureBlock } from './blocks/signature-block';

interface BlockRendererProps {
  block: DocContentBlock;
  onChange: (block: DocContentBlock) => void;
  isReadOnly?: boolean;
}

export function BlockRenderer({ block, onChange, isReadOnly }: BlockRendererProps) {
  switch (block.type) {
    case 'rich_text':
      return (
        <RichTextBlock
          content={block.content as RichTextContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'image':
      return (
        <ImageBlock
          content={block.content as ImageContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'divider':
      return (
        <DividerBlock
          content={block.content as DividerContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'spacer':
      return (
        <SpacerBlock
          content={block.content as SpacerContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'placeholder':
      return (
        <PlaceholderBlock
          content={block.content as PlaceholderContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'toc':
      return (
        <TocBlock
          content={block.content as TocContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'findings_table':
      return (
        <FindingsTableBlock
          content={block.content as FindingsTableContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'asset_summary':
      return (
        <AssetSummaryBlock
          content={block.content as AssetSummaryContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'measurement_data':
      return (
        <MeasurementBlock
          content={block.content as MeasurementDataContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    case 'signature_block':
      return (
        <SignatureBlock
          content={block.content as SignatureBlockContent}
          onChange={(c) => onChange({ ...block, content: c })}
          isReadOnly={isReadOnly}
        />
      );
    default:
      return (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          Onbekend block-type: <code className="font-mono text-xs">{block.type}</code>
        </div>
      );
  }
}
