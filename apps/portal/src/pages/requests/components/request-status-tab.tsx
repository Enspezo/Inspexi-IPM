import { useState } from 'react';
import { RequestStatus } from '@/types';
import type { Request } from '@/types';
import { Button, Card, Select, Input, useToast } from '@/components/ui';
import { getStatusConfig, REQUEST_STATUS } from '@/lib/status';
import type { useUpdateRequestStatus } from '../hooks/use-requests';
import { formatDate } from './request-detail-helpers';
import { getErrorMessage } from '@/lib/api-client';

const statusOptions = Object.values(RequestStatus).map((s) => ({
  value: s,
  label: REQUEST_STATUS[s]?.label || s,
}));

export function RequestStatusTab({
  request,
  userCanWrite,
  updateStatusMutation,
}: {
  request: Request;
  userCanWrite: boolean;
  updateStatusMutation: ReturnType<typeof useUpdateRequestStatus>;
}) {
  const { showToast } = useToast();
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    try {
      await updateStatusMutation.mutateAsync({
        status: newStatus,
        note: statusNote || undefined,
      });
      showToast('Status bijgewerkt', 'success');
      setNewStatus('');
      setStatusNote('');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div className="space-y-6">
      {/* Huidige status */}
      <Card>
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Huidige status</h3>
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
              getStatusConfig(REQUEST_STATUS, request.status).classes
            }`}
          >
            {getStatusConfig(REQUEST_STATUS, request.status).label}
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
              isLoading={updateStatusMutation.isPending}
              disabled={!newStatus || newStatus === request.status}
            >
              Bijwerken
            </Button>
          </div>
        </Card>
      )}

      {/* Status historie */}
      <div>
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Statushistorie</h3>
        {(request.statusHistory?.length || 0) === 0 ? (
          <p className="py-4 text-center text-sm text-gray-500">
            Geen statushistorie beschikbaar
          </p>
        ) : (
          <div className="space-y-3">
            {request.statusHistory?.map((entry) => (
              <Card key={entry.id}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {entry.fromStatus && (
                      <>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            getStatusConfig(REQUEST_STATUS, entry.fromStatus).classes
                          }`}
                        >
                          {getStatusConfig(REQUEST_STATUS, entry.fromStatus).label}
                        </span>
                        <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </>
                    )}
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        getStatusConfig(REQUEST_STATUS, entry.toStatus).classes
                      }`}
                    >
                      {getStatusConfig(REQUEST_STATUS, entry.toStatus).label}
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDate(entry.changedAt)}
                  </span>
                </div>
                {entry.note && (
                  <p className="mt-2 text-sm text-gray-600">{entry.note}</p>
                )}
                {entry.changedByUser && (
                  <p className="mt-1 text-xs text-gray-400">
                    Door {entry.changedByUser.firstName} {entry.changedByUser.lastName}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
