import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { BlockType, BlockWidth } from '@/types';

interface BlockWrapperProps {
  id: string;
  type: BlockType;
  width: BlockWidth;
  onWidthToggle: () => void;
  onDelete: () => void;
  canDelete: boolean;
  children: React.ReactNode;
}

const TYPE_LABELS: Record<BlockType, string> = {
  rich_text: 'Tekst',
  image: 'Afbeelding',
  quote_lines: 'Offerteregels',
};

export function BlockWrapper({
  id,
  type,
  width,
  onWidthToggle,
  onDelete,
  canDelete,
  children,
}: BlockWrapperProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-lg border bg-white transition-shadow ${
        isDragging
          ? 'z-10 border-primary-300 shadow-lg'
          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
      }`}
    >
      {/* Toolbar - visible on hover */}
      <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-3 py-1.5 rounded-t-lg">
        <div className="flex items-center gap-2">
          {/* Drag handle */}
          <button
            type="button"
            className="flex-shrink-0 cursor-grab touch-none text-gray-400 hover:text-gray-600"
            {...attributes}
            {...listeners}
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.2" />
              <circle cx="11" cy="3" r="1.2" />
              <circle cx="5" cy="8" r="1.2" />
              <circle cx="11" cy="8" r="1.2" />
              <circle cx="5" cy="13" r="1.2" />
              <circle cx="11" cy="13" r="1.2" />
            </svg>
          </button>

          {/* Type badge */}
          <span className="text-xs font-medium text-gray-500">{TYPE_LABELS[type]}</span>
        </div>

        <div className="flex items-center gap-1">
          {/* Width toggle */}
          <button
            type="button"
            onClick={onWidthToggle}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title={width === 'full' ? 'Halve breedte' : 'Volle breedte'}
          >
            {width === 'full' ? (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5z" />
              </svg>
            )}
          </button>

          {/* Delete button */}
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
              title="Blok verwijderen"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Block content */}
      <div className="p-3">{children}</div>
    </div>
  );
}
