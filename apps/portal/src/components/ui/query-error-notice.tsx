import { clsx } from 'clsx';
import { getErrorMessage } from '@/lib/api-client';

interface QueryErrorNoticeProps {
  /** De `error` van een useQuery-resultaat; bij null/undefined rendert dit niets. */
  error: unknown;
  /** Wat er niet geladen kon worden, bv. "Opdrachtgevers". Default: "Gegevens". */
  label?: string;
  /** Optioneel: `refetch` van de mislukte query → toont een "Opnieuw proberen"-knop. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Compacte, persistente foutstate voor dropdown-/lijstqueries (WP-B6 / B-305).
 * Een toast verdwijnt na 4s, maar een modal met een lege dropdown blijft staan —
 * dit blokje legt bij de dropdown zélf uit waarom er geen data is. Gebruik hem
 * overal waar een gefaalde query anders alleen een lege lijst zou opleveren:
 *
 *   const { data, error, refetch } = useContacts({ limit: 200 });
 *   <QueryErrorNotice error={error} label="Opdrachtgevers" onRetry={refetch} />
 */
export function QueryErrorNotice({
  error,
  label = 'Gegevens',
  onRetry,
  className,
}: QueryErrorNoticeProps) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className={clsx(
        'flex items-start justify-between gap-3 rounded-md bg-danger-50 px-3 py-2 text-sm text-danger-600',
        className,
      )}
    >
      <span>
        {label} laden mislukt: {getErrorMessage(error, 'onbekende fout')}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 font-medium underline hover:no-underline"
        >
          Opnieuw proberen
        </button>
      )}
    </div>
  );
}
