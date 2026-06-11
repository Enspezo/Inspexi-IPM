import { Button } from '@/components/ui';

// ─── Linked Entities Tab ────────────────────────────────────

export function LinkedEntitiesTab({
  items,
  entityType,
  canWrite,
  onLink,
  onUnlink,
  onNavigate,
  getLabel,
  getSubLabel,
}: {
  items: any[];
  entityType: string;
  canWrite: boolean;
  onLink: () => void;
  onUnlink: (id: string, label: string) => void;
  onNavigate: (id: string) => void;
  getLabel: (item: any) => string;
  getSubLabel: (item: any) => string;
}) {
  const entityLabels: Record<string, string> = {
    requests: 'Aanvragen',
    quotes: 'Offertes',
    planning: 'Planregels',
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {entityLabels[entityType] || entityType}
        </h3>
        {canWrite && (
          <Button variant="secondary" onClick={onLink}>
            Koppelen
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
          >
            <button
              className="min-w-0 flex-1 text-left hover:text-primary-600"
              onClick={() => onNavigate(item.id)}
            >
              <div className="text-sm font-medium text-gray-900">
                {getLabel(item)}
              </div>
              <div className="text-xs text-gray-500">{getSubLabel(item)}</div>
            </button>
            {canWrite && (
              <Button
                variant="ghost"
                onClick={() => onUnlink(item.id, getLabel(item))}
              >
                Ontkoppelen
              </Button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-gray-500">
            Geen {entityLabels[entityType]?.toLowerCase() || 'items'} gekoppeld
          </p>
        )}
      </div>
    </div>
  );
}
