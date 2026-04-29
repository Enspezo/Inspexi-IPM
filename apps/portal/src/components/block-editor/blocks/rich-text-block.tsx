import { RichTextEditor } from '@/components/ui';
import type { Editor } from '@tiptap/react';

interface RichTextBlockProps {
  content: { tiptapJson?: object };
  onChange: (content: { tiptapJson: object }) => void;
  editorRef?: React.MutableRefObject<Editor | null>;
  onFocus?: () => void;
}

export function RichTextBlock({ content, onChange, editorRef, onFocus }: RichTextBlockProps) {
  return (
    <div onClick={onFocus}>
      <RichTextEditor
        value={content.tiptapJson ?? null}
        onChange={(json) => onChange({ tiptapJson: json })}
        editorRef={editorRef}
        placeholder="Schrijf hier de inhoud..."
      />
    </div>
  );
}
