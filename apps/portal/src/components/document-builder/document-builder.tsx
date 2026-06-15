// ===========================================
// DocumentBuilder — Block-editor voor inspectie-document-templates
// ===========================================
//
// Geport uit Inspexi-App (components/block-editor), aangepast aan de Beheer-
// conventies (geen lucide/cn, gedeelde UI-componenten). Half-width blocks
// worden naast elkaar gegroepeerd; volgorde via @dnd-kit.

import { useCallback } from 'react';
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
import { BlockWrapper } from './block-wrapper';
import { BlockRenderer } from './block-renderer';
import { BlockAddMenu } from './block-add-menu';
import { getBlock } from './block-registry';
import type { DocContentBlock, DocBlockType, DocBlockWidth } from './types';

/** Groepeer aangrenzende half-width blocks paarsgewijs in rijen. */
function buildRows(blocks: DocContentBlock[]): DocContentBlock[][] {
  const rows: DocContentBlock[][] = [];
  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block.width === 'half' && i + 1 < blocks.length && blocks[i + 1].width === 'half') {
      rows.push([block, blocks[i + 1]]);
      i += 2;
    } else {
      rows.push([block]);
      i += 1;
    }
  }
  return rows;
}

const reindex = (blocks: DocContentBlock[]): DocContentBlock[] =>
  blocks.map((b, idx) => ({ ...b, order: idx }));

interface DocumentBuilderProps {
  blocks: DocContentBlock[];
  onChange: (blocks: DocContentBlock[]) => void;
  isReadOnly?: boolean;
  className?: string;
}

export function DocumentBuilder({ blocks, onChange, isReadOnly, className }: DocumentBuilderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = blocks.findIndex((b) => b.id === active.id);
      const newIndex = blocks.findIndex((b) => b.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;
      onChange(reindex(arrayMove(blocks, oldIndex, newIndex)));
    },
    [blocks, onChange],
  );

  const handleAdd = useCallback(
    (type: DocBlockType) => {
      const definition = getBlock(type);
      if (!definition) return;
      const newBlock: DocContentBlock = {
        id: crypto.randomUUID(),
        type,
        width: 'full',
        order: blocks.length,
        // Diepe kopie zodat blocks geen gedeelde default-objecten delen.
        content: structuredClone(definition.defaultContent),
      };
      onChange([...blocks, newBlock]);
    },
    [blocks, onChange],
  );

  const handleDelete = useCallback(
    (id: string) => {
      onChange(reindex(blocks.filter((b) => b.id !== id)));
    },
    [blocks, onChange],
  );

  const handleBlockChange = useCallback(
    (updated: DocContentBlock) => {
      onChange(blocks.map((b) => (b.id === updated.id ? updated : b)));
    },
    [blocks, onChange],
  );

  const handleWidthChange = useCallback(
    (id: string, width: DocBlockWidth) => {
      onChange(blocks.map((b) => (b.id === id ? { ...b, width } : b)));
    },
    [blocks, onChange],
  );

  const handleMoveUp = useCallback(
    (id: string) => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx <= 0) return;
      onChange(reindex(arrayMove(blocks, idx, idx - 1)));
    },
    [blocks, onChange],
  );

  const handleMoveDown = useCallback(
    (id: string) => {
      const idx = blocks.findIndex((b) => b.id === id);
      if (idx === -1 || idx >= blocks.length - 1) return;
      onChange(reindex(arrayMove(blocks, idx, idx + 1)));
    },
    [blocks, onChange],
  );

  const rows = buildRows(blocks);

  return (
    <div className={className}>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={blocks.map((b) => b.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2 pt-6">
            {rows.map((row) => (
              <div key={row.map((b) => b.id).join('-')} className="flex gap-2">
                {row.map((block) => {
                  const globalIndex = blocks.findIndex((b) => b.id === block.id);
                  return (
                    <BlockWrapper
                      key={block.id}
                      block={block}
                      onDelete={handleDelete}
                      onWidthChange={handleWidthChange}
                      onMoveUp={handleMoveUp}
                      onMoveDown={handleMoveDown}
                      isFirst={globalIndex === 0}
                      isLast={globalIndex === blocks.length - 1}
                      isReadOnly={isReadOnly}
                    >
                      <BlockRenderer block={block} onChange={handleBlockChange} isReadOnly={isReadOnly} />
                    </BlockWrapper>
                  );
                })}
              </div>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {!isReadOnly && (
        <div className="mt-4 flex justify-center">
          <BlockAddMenu onAdd={handleAdd} />
        </div>
      )}

      {blocks.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-100 text-2xl">📄</div>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-500">
              {isReadOnly ? 'Geen blocks' : 'Begin met het toevoegen van blocks'}
            </p>
            {!isReadOnly && (
              <p className="mt-1 text-xs text-gray-400">
                Gebruik de knop hierboven om tekst, afbeeldingen en meer toe te voegen
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
