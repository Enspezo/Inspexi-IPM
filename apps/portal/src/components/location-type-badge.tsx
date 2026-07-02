import { clsx } from 'clsx';

/**
 * Pill that renders a location type from its hex color, choosing a readable
 * text color (light text on dark backgrounds, dark text on light ones). When
 * no type is given it renders a neutral grey dash placeholder, matching the
 * previous "no type" look.
 *
 * Reused on every location pill site (overview list, detail page, contact
 * person locations, contact locations tab, search results, map popup).
 */

interface LocationTypeBadgeProps {
  locationType?: { name: string; color: string | null } | null;
  className?: string;
}

/** Parse a #RGB or #RRGGBB hex string into [r, g, b] (0-255), or null. */
function parseHex(hex: string): [number, number, number] | null {
  const cleaned = hex.replace('#', '').trim();
  if (cleaned.length === 3) {
    const r = parseInt(cleaned[0] + cleaned[0], 16);
    const g = parseInt(cleaned[1] + cleaned[1], 16);
    const b = parseInt(cleaned[2] + cleaned[2], 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (cleaned.length === 6) {
    const r = parseInt(cleaned.slice(0, 2), 16);
    const g = parseInt(cleaned.slice(2, 4), 16);
    const b = parseInt(cleaned.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

/**
 * Returns a readable text color ('#111827' dark or '#ffffff' light) for a given
 * background hex, using the WCAG relative-luminance formula.
 */
export function readableTextColor(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return '#111827';
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // Threshold ~0.5 — lighter backgrounds get dark text, darker ones get white.
  return luminance > 0.5 ? '#111827' : '#ffffff';
}

export function LocationTypeBadge({ locationType, className }: LocationTypeBadgeProps) {
  if (!locationType) {
    return <span className={clsx('text-gray-400', className)}>—</span>;
  }

  const color = locationType.color;
  if (!color) {
    // Type without a color → neutral grey pill.
    return (
      <span
        className={clsx(
          'inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800',
          className,
        )}
      >
        {locationType.name}
      </span>
    );
  }

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        className,
      )}
      style={{ backgroundColor: color, color: readableTextColor(color) }}
    >
      {locationType.name}
    </span>
  );
}
