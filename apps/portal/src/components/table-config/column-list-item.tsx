import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Checkbox } from '@/components/ui';

interface ColumnListItemProps {
  id: string;
  label: string;
  visible: boolean;
  pinned?: boolean;
  onToggle: (key: string) => void;
}

export function ColumnListItem({
  id,
  label,
  visible,
  pinned,
  onToggle,
}: ColumnListItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: pinned });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
        isDragging ? 'z-10 bg-white shadow-md' : ''
      } ${pinned ? 'opacity-60' : 'hover:bg-gray-50'}`}
    >
      {/* Drag handle */}
      <button
        type="button"
        className={`flex-shrink-0 cursor-grab touch-none text-gray-400 ${
          pinned ? 'invisible' : ''
        }`}
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

      {/* Checkbox + label */}
      <Checkbox
        checked={visible}
        disabled={pinned}
        onChange={() => onToggle(id)}
        label={label}
      />

      {/* Lock icon for pinned */}
      {pinned && (
        <svg
          className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
      )}
    </div>
  );
}
