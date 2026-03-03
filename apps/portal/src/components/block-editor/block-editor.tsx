import { useRef, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { ContentBlock, BlockType } from '@/types';
import type { Editor } from '@tiptap/react';
import { BlockWrapper } from './block-wrapper';
import { BlockAddMenu } from './block-add-menu';
import { RichTextBlock } from './blocks/rich-text-block';
import { ImageBlock } from './blocks/image-block';
import { QuoteLinesBlock } from './blocks/quote-lines-block';

interface BlockEditorProps {
  blocks: ContentBlock[];
  onChange: (blocks: ContentBlock[]) => void;
  templateId: string;
  activeEditorRef?: React.MutableRefObject<Editor | null>;
}

export function BlockEditor({ blocks, onChange, templateId, activeEditorRef }: BlockEditorProps) {
  const editorRefs = useRef<Map<string, React.MutableRefObject<Editor | null>>>(new Map());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const hasQuoteLines = blocks.some((b) => b.type === 'quote_lines');

  const getEditorRef = useCallback((blockId: string) => {
    if (!editorRefs.current.has(blockId)) {
      editorRefs.current.set(blockId, { current: null });
    }
    return editorRefs.current.get(blockId)!;
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const newBlocks = arrayMove(blocks, oldIndex, newIndex).map((b, i) => ({
        ...b,
        order: i,
      }));
      onChange(newBlocks);
    },
    [blocks, onChange],
  );

  const addBlock = useCallback(
    (type: BlockType, insertIndex?: number) => {
      const newBlock: ContentBlock = {
        id: crypto.randomUUID(),
        type,
        width: 'full',
        order: blocks.length,
        content:
          type === 'rich_text'
            ? { tiptapJson: { type: 'doc', content: [{ type: 'paragraph' }] } }
            : type === 'image'
              ? {}
              : { title: 'Offerteregels' },
      };

      let newBlocks: ContentBlock[];
      if (insertIndex !== undefined) {
        newBlocks = [...blocks];
        newBlocks.splice(insertIndex, 0, newBlock);
      } else {
        newBlocks = [...blocks, newBlock];
      }

      onChange(newBlocks.map((b, i) => ({ ...b, order: i })));
    },
    [blocks, onChange],
  );

  const updateBlock = useCallback(
    (blockId: string, content: ContentBlock['content']) => {
      onChange(blocks.map((b) => (b.id === blockId ? { ...b, content } : b)));
    },
    [blocks, onChange],
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      const block = blocks.find((b) => b.id === blockId);
      if (!block || block.type === 'quote_lines') return;

      onChange(
        blocks
          .filter((b) => b.id !== blockId)
          .map((b, i) => ({ ...b, order: i })),
      );
      editorRefs.current.delete(blockId);
    },
    [blocks, onChange],
  );

  const toggleWidth = useCallback(
    (blockId: string) => {
      onChange(
        blocks.map((b) =>
          b.id === blockId
            ? { ...b, width: b.width === 'full' ? 'half' : 'full' }
            : b,
        ),
      );
    },
    [blocks, onChange],
  );

  const handleEditorFocus = useCallback(
    (blockId: string) => {
      const ref = editorRefs.current.get(blockId);
      if (ref && activeEditorRef) {
        activeEditorRef.current = ref.current;
      }
    },
    [activeEditorRef],
  );

  // Group blocks into rows for layout
  const rows = buildRows(blocks);

  return (
    <div className="space-y-0">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={blocks.map((b) => b.id)}
          strategy={verticalListSortingStrategy}
        >
          {rows.map((row, rowIndex) => (
            <div key={rowIndex}>
              {/* Add menu between rows */}
              {rowIndex === 0 && (
                <BlockAddMenu
                  onAdd={(type) => addBlock(type, 0)}
                  hasQuoteLines={hasQuoteLines}
                />
              )}

              <div
                className={
                  row.length === 2
                    ? 'grid grid-cols-2 gap-3'
                    : row.length === 1 && row[0].width === 'half'
                      ? 'grid grid-cols-2 gap-3'
                      : ''
                }
              >
                {row.map((block) => (
                  <BlockWrapper
                    key={block.id}
                    id={block.id}
                    type={block.type}
                    width={block.width}
                    onWidthToggle={() => toggleWidth(block.id)}
                    onDelete={() => deleteBlock(block.id)}
                    canDelete={block.type !== 'quote_lines'}
                  >
                    {renderBlockContent(
                      block,
                      templateId,
                      (content) => updateBlock(block.id, content),
                      getEditorRef(block.id),
                      () => handleEditorFocus(block.id),
                    )}
                  </BlockWrapper>
                ))}

                {/* Empty filler for lone half-width block */}
                {row.length === 1 && row[0].width === 'half' && (
                  <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50/50 flex items-center justify-center min-h-[80px]">
                    <span className="text-xs text-gray-400">Leeg</span>
                  </div>
                )}
              </div>

              <BlockAddMenu
                onAdd={(type) => {
                  // Insert after the last block in this row
                  const lastBlockInRow = row[row.length - 1];
                  const lastBlockIndex = blocks.findIndex((b) => b.id === lastBlockInRow.id);
                  addBlock(type, lastBlockIndex + 1);
                }}
                hasQuoteLines={hasQuoteLines}
              />
            </div>
          ))}
        </SortableContext>
      </DndContext>

      {/* Show add menu at bottom if no blocks */}
      {blocks.length === 0 && (
        <div className="py-8 text-center">
          <p className="text-sm text-gray-500 mb-3">Geen blokken. Voeg een blok toe om te beginnen.</p>
          <BlockAddMenu onAdd={(type) => addBlock(type)} hasQuoteLines={false} />
        </div>
      )}
    </div>
  );
}

// Group blocks into rows: full-width = own row, half-width = paired
function buildRows(blocks: ContentBlock[]): ContentBlock[][] {
  const rows: ContentBlock[][] = [];
  let i = 0;

  while (i < blocks.length) {
    if (blocks[i].width === 'half') {
      const pair = [blocks[i]];
      if (i + 1 < blocks.length && blocks[i + 1].width === 'half') {
        pair.push(blocks[i + 1]);
        i += 2;
      } else {
        i += 1;
      }
      rows.push(pair);
    } else {
      rows.push([blocks[i]]);
      i += 1;
    }
  }

  return rows;
}

function renderBlockContent(
  block: ContentBlock,
  templateId: string,
  onChange: (content: ContentBlock['content']) => void,
  editorRef: React.MutableRefObject<Editor | null>,
  onFocus: () => void,
) {
  switch (block.type) {
    case 'rich_text':
      return (
        <RichTextBlock
          content={block.content}
          onChange={onChange}
          editorRef={editorRef}
          onFocus={onFocus}
        />
      );
    case 'image':
      return (
        <ImageBlock
          content={block.content}
          onChange={onChange}
          templateId={templateId}
        />
      );
    case 'quote_lines':
      return (
        <QuoteLinesBlock
          content={block.content}
          onChange={onChange}
        />
      );
    default:
      return <div className="text-gray-400 text-sm">Onbekend bloktype</div>;
  }
}
