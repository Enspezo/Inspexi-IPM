// Generieke, herbruikbare drag-and-drop reorder-lijst (@dnd-kit).
// Spiegelt het bestaande patroon uit components/table-config/column-list.tsx en
// components/document-builder/block-wrapper.tsx. Gebruikt door de inspectie-config-builders
// (asset/locatie-velden, meetstaat-secties+velden, checklist-items, classificatie-kenmerken+opties).
//
// Gebruik:
//   <SortableList items={fields} getId={(f) => f.id} disabled={!canManage}
//     onReorder={(ids) => reorder.mutate({ fieldIds: ids })}
//     renderItem={(field, { dragHandleProps }) => (
//       <Row><DragHandle {...dragHandleProps} /> {field.label}</Row>
//     )} />

import { type ReactNode } from 'react';
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
  useSortable,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { CSS } from '@dnd-kit/utilities';

export interface SortableRenderProps {
  /** Spread op het element dat als sleep-handvat dient (bv. <DragHandle {...dragHandleProps} />). */
  dragHandleProps: Record<string, unknown>;
  isDragging: boolean;
}

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  /** Nieuwe volgorde van id's; geef door aan de reorder-mutatie. */
  onReorder: (orderedIds: string[]) => void;
  renderItem: (item: T, render: SortableRenderProps) => ReactNode;
  /** Read-only: render een statische lijst zonder slepen. */
  disabled?: boolean;
  className?: string;
}

export function SortableList<T>({
  items,
  getId,
  onReorder,
  renderItem,
  disabled,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = items.map(getId);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    onReorder(arrayMove(ids, oldIndex, newIndex));
  };

  if (disabled) {
    return (
      <div className={className}>
        {items.map((item) => (
          <div key={getId(item)}>
            {renderItem(item, { dragHandleProps: {}, isDragging: false })}
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((item) => (
            <SortableRow key={getId(item)} id={getId(item)}>
              {(render) => renderItem(item, render)}
            </SortableRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (render: SortableRenderProps) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'relative z-10 bg-white shadow-md' : undefined}
    >
      {children({ dragHandleProps: { ...attributes, ...listeners }, isDragging })}
    </div>
  );
}

/** Standaard sleep-handvat (6-puntjes grip). Spread `dragHandleProps` erop. */
export function DragHandle({
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`flex-shrink-0 cursor-grab touch-none text-gray-400 hover:text-gray-600 active:cursor-grabbing ${className ?? ''}`}
      title="Versleep om te herordenen"
      {...props}
    >
      <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="3" r="1.2" />
        <circle cx="11" cy="3" r="1.2" />
        <circle cx="5" cy="8" r="1.2" />
        <circle cx="11" cy="8" r="1.2" />
        <circle cx="5" cy="13" r="1.2" />
        <circle cx="11" cy="13" r="1.2" />
      </svg>
    </button>
  );
}
