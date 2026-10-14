/**
 * Lazy varianten van RichTextEditor/RichTextViewer.
 *
 * tiptap + prosemirror zijn samen ~775 KB (pre-minify). Ze horen NIET in de
 * hoofdbundel: alleen pagina's die daadwerkelijk een editor/viewer renderen
 * (offerte-editor, e-mailtemplates, block-editor/document-builder) laden de
 * chunk, en pas op het moment dat het component gemount wordt.
 *
 * Importeer daarom nooit `./rich-text-editor` / `./rich-text-viewer` direct
 * vanuit een module die in de hoofdbundel zit (barrel, layout, App) — gebruik
 * deze wrappers.
 */
import { lazy, Suspense, type ComponentProps } from 'react';
import { Spinner } from '@inspexi/ui';

const RichTextEditorImpl = lazy(() =>
  import('./rich-text-editor').then((m) => ({ default: m.RichTextEditor })),
);
const RichTextViewerImpl = lazy(() =>
  import('./rich-text-viewer').then((m) => ({ default: m.RichTextViewer })),
);

function EditorFallback() {
  return (
    <div className="flex min-h-[8rem] items-center justify-center rounded-lg border border-gray-200 bg-gray-50">
      <Spinner size="sm" />
    </div>
  );
}

function ViewerFallback() {
  return (
    <div className="flex items-center gap-2 py-2 text-sm text-gray-400">
      <Spinner size="sm" />
      Laden…
    </div>
  );
}

export function RichTextEditor(props: ComponentProps<typeof RichTextEditorImpl>) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <RichTextEditorImpl {...props} />
    </Suspense>
  );
}

export function RichTextViewer(props: ComponentProps<typeof RichTextViewerImpl>) {
  return (
    <Suspense fallback={<ViewerFallback />}>
      <RichTextViewerImpl {...props} />
    </Suspense>
  );
}
