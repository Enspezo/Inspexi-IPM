import type { DocumentTagRef } from '@/types';

interface TagPillProps {
  tag: DocumentTagRef;
  /** Toon een verwijder-knop (×) en roep deze handler aan bij klik. */
  onRemove?: (tagId: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** Bepaal leesbare tekstkleur (zwart/wit) op basis van de achtergrondluminantie. */
export function readableTextColor(hex: string): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return '#ffffff';
  const int = parseInt(match[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  // Relatieve luminantie (sRGB, vereenvoudigd)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1f2937' : '#ffffff';
}

/** Gekleurde tag-pill; kleur komt uit de hex op de tag. */
export function TagPill({ tag, onRemove, size = 'sm', className }: TagPillProps) {
  const textColor = readableTextColor(tag.color);
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full font-medium ${padding} ${className ?? ''}`}
      style={{ backgroundColor: tag.color, color: textColor }}
    >
      {tag.name}
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(tag.id)}
          className="-mr-0.5 rounded-full leading-none opacity-80 hover:opacity-100"
          style={{ color: textColor }}
          aria-label={`Tag ${tag.name} verwijderen`}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </span>
  );
}
