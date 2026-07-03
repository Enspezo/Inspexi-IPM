import { useState, useEffect } from 'react';
import { Modal, Button, Input, Spinner } from '@/components/ui';
import { useToast } from '@/components/ui';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { PhaseSelect } from '@/components/projects/phase-select';
import { useFeatures } from '@/providers/feature-provider';
import { useAssignToProject } from '../hooks/use-projects';

interface Props {
  projectId: string;
  entityType: 'requests' | 'quotes' | 'planning';
  onClose: () => void;
}

const entityLabels: Record<string, string> = {
  requests: 'Aanvragen',
  quotes: 'Offertes',
  planning: 'Planregels',
};

const entityEndpoints: Record<string, string> = {
  requests: '/requests',
  quotes: '/quotes',
  planning: '/planning',
};

export function LinkEntitiesModal({ projectId, entityType, onClose }: Props) {
  const { showToast } = useToast();
  const { hasFeature } = useFeatures();
  const assignMutation = useAssignToProject(projectId);
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Optionele fase-koppeling bij het koppelen (PRD-12 §12.7.2); aanvragen kennen geen
  // fase en de hele fase-laag zit achter PROJECT_FASEN (§Fase E).
  const [phaseId, setPhaseId] = useState<string | null>(null);
  const supportsPhase = entityType !== 'requests' && hasFeature('PROJECT_FASEN');

  useEffect(() => {
    setLoading(true);
    apiClient
      .get<{ data: any[] } | any[]>(`${entityEndpoints[entityType]}?limit=50${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then((res) => {
        const data = Array.isArray(res) ? res : res.data;
        // Filter items that don't have a projectId yet
        setItems(data.filter((item: any) => !item.projectId));
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [entityType, search]);

  const toggleItem = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const payload: Record<string, string[]> = {};
    if (entityType === 'requests') payload.requestIds = ids;
    if (entityType === 'quotes') payload.quoteIds = ids;
    if (entityType === 'planning') payload.planningItemIds = ids;

    try {
      await assignMutation.mutateAsync(payload);
      // De fase pas na de projectkoppeling zetten: de entiteit heeft dan het juiste
      // projectId zodat de projectconsistentie-check (§12.4.2) op de API slaagt.
      if (supportsPhase && phaseId) {
        await Promise.all(
          ids.map((id) =>
            apiClient.patch(`${entityEndpoints[entityType]}/${id}`, {
              projectPhaseId: phaseId,
            }),
          ),
        );
      }
      showToast(
        `${ids.length} ${entityLabels[entityType].toLowerCase()} gekoppeld`,
        'success',
      );
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Koppelen mislukt'), 'error');
    }
  };

  const getItemLabel = (item: any) => {
    if (entityType === 'requests') return item.title || `Aanvraag #${item.id.substring(0, 8)}`;
    if (entityType === 'quotes') return item.quoteNumber || item.subject || `Offerte #${item.id.substring(0, 8)}`;
    return item.productName || `Planregel #${item.id.substring(0, 8)}`;
  };

  const getItemSubLabel = (item: any) => {
    if (entityType === 'requests') {
      const contact = item.contact;
      return contact?.companyName || [contact?.firstName, contact?.lastName].filter(Boolean).join(' ') || '';
    }
    if (entityType === 'quotes') return item.contact?.companyName || '';
    return item.contact?.companyName || '';
  };

  return (
    <Modal isOpen onClose={onClose} title={`${entityLabels[entityType]} koppelen`}>
      <div className="space-y-4">
        <Input
          placeholder={`Zoek ${entityLabels[entityType].toLowerCase()}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {supportsPhase && (
          <PhaseSelect
            projectId={projectId}
            value={phaseId}
            onChange={setPhaseId}
            label="Koppelen aan fase (optioneel)"
          />
        )}

        <div className="max-h-80 space-y-2 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          ) : items.length === 0 ? (
            <p className="py-4 text-center text-sm text-gray-500">
              Geen beschikbare {entityLabels[entityType].toLowerCase()} gevonden
            </p>
          ) : (
            items.map((item) => (
              <label
                key={item.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleItem(item.id)}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">
                    {getItemLabel(item)}
                  </div>
                  {getItemSubLabel(item) && (
                    <div className="text-xs text-gray-500">
                      {getItemSubLabel(item)}
                    </div>
                  )}
                </div>
              </label>
            ))
          )}
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={handleAssign}
            disabled={selected.size === 0}
            isLoading={assignMutation.isPending}
          >
            {selected.size > 0
              ? `${selected.size} koppelen`
              : 'Selecteer items'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
