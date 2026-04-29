import { useState, useEffect } from 'react';
import type { User } from '@/types';
import { Modal, Select, Button, Spinner, useToast } from '@/components/ui';
import { useUsers, useUserRecordCounts, useDeleteUser } from '../hooks/use-users';

interface DeleteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
}

const recordLabels: Record<string, string> = {
  contacts: 'Relaties (eigenaar)',
  requests: 'Aanvragen (toegewezen)',
  tasks: 'Taken (niet voltooid)',
  planningInspectors: 'Planning inspecteur',
  planningSessionInspectors: 'Planning sessie-inspecteur',
  planningFollowers: 'Planning volger',
};

export function DeleteUserModal({ isOpen, onClose, user }: DeleteUserModalProps) {
  const { showToast } = useToast();
  const { data: users } = useUsers();
  const { data: counts, isLoading: countsLoading } = useUserRecordCounts(
    isOpen && user ? user.id : null,
  );
  const deleteMutation = useDeleteUser();
  const [transferToUserId, setTransferToUserId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTransferToUserId('');
    }
  }, [isOpen]);

  const transferOptions = (users || [])
    .filter((u) => u.id !== user?.id && u.isActive && !u.isDeleted)
    .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` }));

  const handleDelete = async () => {
    if (!user || !transferToUserId) return;
    try {
      await deleteMutation.mutateAsync({ userId: user.id, transferToUserId });
      showToast('Gebruiker verwijderd en records overgedragen', 'success');
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gebruiker verwijderen">
      {user && (
        <div className="space-y-4">
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <p className="text-sm text-red-800">
              U staat op het punt om{' '}
              <span className="font-semibold">
                {user.firstName} {user.lastName}
              </span>{' '}
              te verwijderen. Deze actie kan niet ongedaan worden gemaakt.
            </p>
          </div>

          {countsLoading ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : counts && counts.total > 0 ? (
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                De volgende records staan op naam van deze gebruiker:
              </p>
              <div className="rounded-lg border border-gray-200 bg-gray-50">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(recordLabels).map(([key, label]) => {
                      const count = counts[key as keyof typeof counts] as number;
                      if (count === 0) return null;
                      return (
                        <tr key={key} className="border-b border-gray-200 last:border-0">
                          <td className="px-3 py-2 text-gray-600">{label}</td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900">
                            {count}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : counts ? (
            <p className="text-sm text-gray-600">
              Deze gebruiker heeft geen actieve records om over te dragen.
            </p>
          ) : null}

          <div>
            <Select
              label="Records overdragen aan"
              options={transferOptions}
              placeholder="Selecteer een gebruiker..."
              value={transferToUserId}
              onChange={(e) => setTransferToUserId(e.target.value)}
            />
            <p className="mt-1 text-xs text-gray-500">
              Alle actieve records worden overgedragen aan deze gebruiker.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              disabled={!transferToUserId}
              isLoading={deleteMutation.isPending}
            >
              Verwijderen
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
