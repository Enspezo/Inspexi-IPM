import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Color from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';

interface RichTextViewerProps {
  content: object | null | undefined;
  className?: string;
}

export function RichTextViewer({ content, className }: RichTextViewerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
    ],
    content: content ?? '',
    editable: false,
  });

  if (!content || !editor) return null;

  return (
    <EditorContent
      editor={editor}
      className={`prose prose-sm max-w-none [&_.ProseMirror]:outline-none ${className ?? ''}`}
    />
  );
}
