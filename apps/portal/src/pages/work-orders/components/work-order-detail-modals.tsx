import { getErrorMessage } from '@/lib/api-client';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, Select, useToast } from '@/components/ui';
import { WORK_ORDER_STATUS, getStatusConfig } from '@/lib/status';
import { WorkOrderStatus } from '@/types';
import type { WorkOrder } from '@/types';
import {
  useUpdateWorkOrderStatus,
  useDeleteWorkOrder,
} from '../hooks/use-work-orders';

export function WorkOrderStatusChangeModal({
  id,
  statusChangeOpen,
  setStatusChangeOpen,
  availableTransitions,
}: {
  id: string | undefined;
  statusChangeOpen: boolean;
  setStatusChangeOpen: React.Dispatch<React.SetStateAction<boolean>>;
  availableTransitions: WorkOrderStatus[];
}) {
  const { showToast } = useToast();
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const updateStatus = useUpdateWorkOrderStatus(id);

  const handleStatusChange = async () => {
    if (!newStatus) return;
    try {
      await updateStatus.mutateAsync({
        status: newStatus as WorkOrderStatus,
        note: statusNote || undefined,
      });
      setStatusChangeOpen(false);
      setNewStatus('');
      setStatusNote('');
      showToast('Status bijgewerkt', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij statuswijziging'), 'error');
    }
  };

  return (
    <Modal
      isOpen={statusChangeOpen}
      onClose={() => {
        setStatusChangeOpen(false);
        setNewStatus('');
        setStatusNote('');
      }}
      title="Status wijzigen"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Nieuwe status
          </label>
          <Select
            options={[
              { value: '', label: 'Selecteer status...' },
              ...availableTransitions.map((s) => ({
                value: s,
                label: getStatusConfig(WORK_ORDER_STATUS, s).label,
              })),
            ]}
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Notitie (optioneel)
          </label>
          <textarea
            value={statusNote}
            onChange={(e) => setStatusNote(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Toelichting bij de statuswijziging..."
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={() => {
              setStatusChangeOpen(false);
              setNewStatus('');
              setStatusNote('');
            }}
          >
            Annuleren
          </Button>
          <Button
            onClick={handleStatusChange}
            disabled={!newStatus}
            isLoading={updateStatus.isPending}
          >
            Status wijzigen
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function WorkOrderDeleteModal({
  id,
  workOrder,
  deleteConfirmOpen,
  setDeleteConfirmOpen,
}: {
  id: string | undefined;
  workOrder: WorkOrder;
  deleteConfirmOpen: boolean;
  setDeleteConfirmOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const deleteWorkOrder = useDeleteWorkOrder(id);

  const handleDelete = async () => {
    try {
      await deleteWorkOrder.mutateAsync();
      showToast('Werkbon verwijderd', 'success');
      navigate('/work-orders');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij verwijderen'), 'error');
    }
  };

  return (
    <Modal
      isOpen={deleteConfirmOpen}
      onClose={() => setDeleteConfirmOpen(false)}
      title="Werkbon verwijderen"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Weet u zeker dat u werkbon{' '}
          <strong>{workOrder.workOrderNumber}</strong> wilt verwijderen? Dit
          kan niet ongedaan gemaakt worden.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="secondary"
            onClick={() => setDeleteConfirmOpen(false)}
          >
            Annuleren
          </Button>
          <Button
            variant="danger"
            onClick={handleDelete}
            isLoading={deleteWorkOrder.isPending}
          >
            Verwijderen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
