import type { DocumentTagRef } from '@/types';
import { readableTextColor } from './tag-pill';

interface TagSelectProps {
  available: DocumentTagRef[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  label?: string;
  /** Hint getoond wanneer er nog geen tags zijn aangemaakt. */
  emptyHint?: string;
}

/**
 * Multi-select via toggle-bare pills. Geschikt voor een beperkt aantal tags
 * (document-tags zijn per-org en doorgaans een handvol).
 */
export function TagSelect({
  available,
  selectedIds,
  onChange,
  label,
  emptyHint = 'Nog geen tags aangemaakt.',
}: TagSelectProps) {
  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter((x) => x !== id)
        : [...selectedIds, id],
    );
  };

  return (
    <div>
      {label && (
        <label className="mb-1 block text-sm font-medium text-gray-700">{label}</label>
      )}
      {available.length === 0 ? (
        <p className="text-xs text-gray-400">{emptyHint}</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {available.map((tag) => {
            const selected = selectedIds.includes(tag.id);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                  selected ? 'ring-2 ring-offset-1 ring-gray-400' : 'opacity-60 hover:opacity-100'
                }`}
                style={
                  selected
                    ? { backgroundColor: tag.color, color: readableTextColor(tag.color) }
                    : { backgroundColor: '#f3f4f6', color: '#374151' }
                }
                aria-pressed={selected}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
