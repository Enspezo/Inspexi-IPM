// ===========================================
// RichTextBlock — Rijke tekst (hergebruikt de gedeelde RichTextEditor)
// ===========================================

import { RichTextEditor, RichTextViewer } from '@/components/ui';
import type { DocBlockProps, RichTextContent } from '../types';

export function RichTextBlock({ content, onChange, isReadOnly }: DocBlockProps<RichTextContent>) {
  const value = (content.tiptapJson as object | null | undefined) ?? null;

  if (isReadOnly) {
    return value ? (
      <RichTextViewer content={value} />
    ) : (
      <p className="text-sm italic text-gray-400">Lege tekst</p>
    );
  }

  return (
    <RichTextEditor
      value={value}
      onChange={(json) => onChange({ ...content, tiptapJson: json })}
      placeholder="Schrijf hier de inhoud..."
    />
  );
}
