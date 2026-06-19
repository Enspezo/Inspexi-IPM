// ===========================================
// BlockWrapper — Drag handle, breedte-toggle, verplaatsen, verwijderen
// ===========================================

import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripIcon,
  TrashIcon,
  ColumnsIcon,
  SquareIcon,
  ChevronUpIcon,
  ChevronDownIcon,
} from './icons';
import { getBlock } from './block-registry';
import type { DocContentBlock, DocBlockWidth } from './types';

interface BlockWrapperProps {
  block: DocContentBlock;
  onDelete: (id: string) => void;
  onWidthChange: (id: string, width: DocBlockWidth) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  isFirst: boolean;
  isLast: boolean;
  isReadOnly?: boolean;
  children: React.ReactNode;
}

export function BlockWrapper({
  block,
  onDelete,
  onWidthChange,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  isReadOnly,
  children,
}: BlockWrapperProps) {
  const [isHovered, setIsHovered] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: block.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };

  const definition = getBlock(block.type);
  const isDeletable = definition?.isDeletable !== false;
  const supportsHalfWidth = definition?.supportsHalfWidth ?? false;

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative rounded-lg border transition-all duration-100 ${
        isDragging
          ? 'z-10 border-blue-300 bg-white opacity-50 shadow-lg'
          : isHovered && !isReadOnly
            ? 'border-gray-200 bg-white shadow-sm'
            : 'border-transparent'
      } ${block.width === 'half' ? 'w-[calc(50%-4px)]' : 'w-full'}`}
    >
      {/* Action bar — alleen bij hover en niet read-only */}
      {isHovered && !isReadOnly && (
        <div className="absolute -top-8 left-0 right-0 z-10 flex items-center gap-1 rounded-md border border-gray-200 bg-white px-1 py-0.5 shadow-sm">
          <button
            type="button"
            {...attributes}
            {...listeners}
            className="flex h-6 w-6 cursor-grab items-center justify-center text-gray-400 hover:text-gray-600 active:cursor-grabbing"
            title="Versleep"
          >
            <GripIcon className="h-4 w-4" />
          </button>

          {definition && <span className="px-1 text-xs text-gray-400">{definition.label}</span>}

          <div className="flex-1" />

          {supportsHalfWidth && (
            <ActionBtn
              onClick={() => onWidthChange(block.id, block.width === 'half' ? 'full' : 'half')}
              title={block.width === 'half' ? 'Volledige breedte' : 'Halve breedte'}
            >
              {block.width === 'half' ? <SquareIcon className="h-3.5 w-3.5" /> : <ColumnsIcon className="h-3.5 w-3.5" />}
            </ActionBtn>
          )}

          <ActionBtn onClick={() => onMoveUp(block.id)} disabled={isFirst} title="Omhoog">
            <ChevronUpIcon className="h-3.5 w-3.5" />
          </ActionBtn>

          <ActionBtn onClick={() => onMoveDown(block.id)} disabled={isLast} title="Omlaag">
            <ChevronDownIcon className="h-3.5 w-3.5" />
          </ActionBtn>

          {isDeletable && (
            <ActionBtn
              onClick={() => onDelete(block.id)}
              title="Block verwijderen"
              className="text-red-500 hover:bg-red-50 hover:text-red-700"
            >
              <TrashIcon className="h-3.5 w-3.5" />
            </ActionBtn>
          )}
        </div>
      )}

      <div className="p-3">{children}</div>
    </div>
  );
}

interface ActionBtnProps {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
  className?: string;
}

function ActionBtn({ onClick, disabled, title, children, className }: ActionBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-6 w-6 items-center justify-center rounded text-gray-500 transition-colors hover:bg-gray-100 ${
        disabled ? 'cursor-not-allowed opacity-30' : ''
      } ${className ?? ''}`}
    >
      {children}
    </button>
  );
}
