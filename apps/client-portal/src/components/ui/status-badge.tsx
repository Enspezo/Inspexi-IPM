import { clsx } from 'clsx';
import { getStatusConfig, type StatusMap } from '@/lib/status';

interface StatusBadgeProps {
  /** Enum-waarde (bijv. QuoteStatus.CONCEPT) */
  status: string | null | undefined;
  /** Canonieke map uit lib/status.ts (bijv. QUOTE_STATUS) */
  map: StatusMap;
  className?: string;
}

/**
 * Uniforme status-pill. Onbekende waarden vallen terug op grijs met de
 * ruwe waarde als label.
 */
export function StatusBadge({ status, map, className }: StatusBadgeProps) {
  const config = getStatusConfig(map, status);

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
