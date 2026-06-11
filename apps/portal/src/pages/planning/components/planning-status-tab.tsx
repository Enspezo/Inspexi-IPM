import { PlanningStatus } from '@/types';
import type { PlanningHistoryEntry, PlanningItem } from '@/types';
import { Button, Card, Input, Select, useToast } from '@/components/ui';
import { PLANNING_STATUS, getStatusConfig } from '@/lib/status';
import { useUpdatePlanningStatus } from '../hooks/use-planning';
import { planningStatusLabel } from './planning-detail-shared';

export function PlanningStatusTab({
  id,
  item,
  userCanWrite,
  newStatus,
  setNewStatus,
  statusNote,
  setStatusNote,
  statusHistory,
}: {
  id: string;
  item: PlanningItem;
  userCanWrite: boolean;
  newStatus: string;
  setNewStatus: React.Dispatch<React.SetStateAction<string>>;
  statusNote: string;
  setStatusNote: React.Dispatch<React.SetStateAction<string>>;
  statusHistory: PlanningHistoryEntry[];
}) {
  const { showToast } = useToast();
  const updateStatus = useUpdatePlanningStatus(id);

  const handleStatusUpdate = async () => {
    if (!newStatus || newStatus === item.status) return;
    try {
      await updateStatus.mutateAsync({ status: newStatus, note: statusNote || undefined });
      showToast('Status bijgewerkt', 'success');
      setNewStatus('');
      setStatusNote('');
    } catch {
      showToast('Status wijzigen mislukt', 'error');
    }
  };

  const statusOptions = Object.values(PlanningStatus).map((s) => ({
    value: s,
    label: planningStatusLabel(s),
  }));

  return (
    <div className="space-y-6">
      {/* Huidige status */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Huidige status</h3>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${getStatusConfig(PLANNING_STATUS, item.status).classes}`}>
            {planningStatusLabel(item.status)}
          </span>
        </div>
      </Card>

      {/* Status wijzigen */}
      {userCanWrite && (
        <Card>
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Status wijzigen</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-56">
              <Select
                label="Nieuwe status"
                options={statusOptions}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <Input
                label="Notitie (optioneel)"
                placeholder="Toelichting bij statuswijziging..."
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
              />
            </div>
            <Button
              onClick={handleStatusUpdate}
              isLoading={updateStatus.isPending}
              disabled={!newStatus || newStatus === item.status}
            >
              Bijwerken
            </Button>
          </div>
        </Card>
      )}

      {/* Statushistorie */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Statushistorie</h3>
        {statusHistory.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">Geen statushistorie beschikbaar</p>
        ) : (
          <div className="space-y-3">
            {statusHistory.map((entry) => (
              <Card key={entry.id}>
                <div className="flex items-start justify-between">
                  <p className="text-sm text-gray-900">{entry.description}</p>
                  <span className="ml-4 shrink-0 text-xs text-gray-400">
                    {new Date(entry.createdAt).toLocaleString('nl-NL')}
                  </span>
                </div>
                {entry.user && (
                  <p className="mt-1 text-xs text-gray-400">
                    Door {entry.user.firstName} {entry.user.lastName}
                  </p>
                )}
                {!entry.user && (
                  <p className="mt-1 text-xs text-gray-400">Systeem / automatisch</p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
