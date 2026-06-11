import { Spinner } from '@/components/ui';

// ── Autosave indicator ───────────────────────────────────

export function AutosaveIndicator({
  status,
  lastSaved,
}: {
  status: 'saved' | 'saving' | 'unsaved' | 'error';
  lastSaved: Date | null;
}) {
  const colors = {
    saved: 'text-green-600',
    saving: 'text-gray-500',
    unsaved: 'text-yellow-600',
    error: 'text-red-600',
  };

  const labels = {
    saved: 'Opgeslagen',
    saving: 'Opslaan...',
    unsaved: 'Niet-opgeslagen wijzigingen',
    error: 'Opslaan mislukt',
  };

  return (
    <div className={`flex items-center gap-1.5 text-xs ${colors[status]}`}>
      {status === 'saving' ? (
        <Spinner size="sm" />
      ) : (
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            status === 'saved'
              ? 'bg-green-500'
              : status === 'unsaved'
                ? 'bg-yellow-500'
                : status === 'error'
                  ? 'bg-red-500'
                  : 'bg-gray-400'
          }`}
        />
      )}
      <span>{labels[status]}</span>
      {status === 'saved' && lastSaved && (
        <span className="text-gray-400">
          {lastSaved.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </div>
  );
}
