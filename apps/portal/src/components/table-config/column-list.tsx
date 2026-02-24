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
import type { ColumnDef, TableColumnConfig } from './types';
import { ColumnListItem } from './column-list-item';

interface ColumnListProps<T> {
  columns: ColumnDef<T>[];
  config: TableColumnConfig;
  onChange: (config: TableColumnConfig) => void;
}

export function ColumnList<T>({
  columns,
  config,
  onChange,
}: ColumnListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const columnMap = new Map(columns.map((c) => [c.key, c]));

  // Separate pinned and orderable columns
  const pinnedStart = columns.filter(
    (c) => c.pinned && (c.pinnedPosition ?? 'start') === 'start',
  );
  const pinnedEnd = columns.filter(
    (c) => c.pinned && c.pinnedPosition === 'end',
  );
  const pinnedKeys = new Set(
    [...pinnedStart, ...pinnedEnd].map((c) => c.key),
  );

  // Orderable = in config order, excluding pinned
  const orderableKeys = config.columnOrder.filter(
    (k) => !pinnedKeys.has(k) && columnMap.has(k),
  );

  const handleToggle = (key: string) => {
    const visible = config.visibleColumns.includes(key);
    const visibleColumns = visible
      ? config.visibleColumns.filter((k) => k !== key)
      : [...config.visibleColumns, key];
    onChange({ ...config, visibleColumns });
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderableKeys.indexOf(String(active.id));
    const newIndex = orderableKeys.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrderable = arrayMove(orderableKeys, oldIndex, newIndex);

    // Rebuild full column order: pinned-start, orderable, pinned-end
    const columnOrder = [
      ...pinnedStart.map((c) => c.key),
      ...newOrderable,
      ...pinnedEnd.map((c) => c.key),
    ];

    onChange({ ...config, columnOrder });
  };

  const getLabel = (key: string) => {
    const col = columnMap.get(key);
    if (!col) return key;
    return col.sidebarLabel || col.header || key;
  };

  return (
    <div className="space-y-0.5">
      {/* Pinned start columns */}
      {pinnedStart.map((col) => (
        <ColumnListItem
          key={col.key}
          id={col.key}
          label={getLabel(col.key)}
          visible={true}
          pinned
          onToggle={handleToggle}
        />
      ))}

      {/* Sortable middle columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={orderableKeys}
          strategy={verticalListSortingStrategy}
        >
          {orderableKeys.map((key) => (
            <ColumnListItem
              key={key}
              id={key}
              label={getLabel(key)}
              visible={config.visibleColumns.includes(key)}
              onToggle={handleToggle}
            />
          ))}
        </SortableContext>
      </DndContext>

      {/* Pinned end columns */}
      {pinnedEnd.map((col) => (
        <ColumnListItem
          key={col.key}
          id={col.key}
          label={getLabel(col.key)}
          visible={true}
          pinned
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}
