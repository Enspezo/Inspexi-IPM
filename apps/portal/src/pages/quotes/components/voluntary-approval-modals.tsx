import { useEffect, useState } from 'react';
import { Modal, Button, Select, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { useAuth } from '@/providers/auth-provider';
import { Role } from '@/types';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import { useRequestTeamApproval, useRequestPersonApproval } from '../hooks/use-quotes';

const ROLE_LABELS: Record<string, string> = {
  [Role.ORG_ADMIN]: 'Org Admin',
  [Role.MANAGER]: 'Manager',
  [Role.BACKOFFICE]: 'Backoffice',
  [Role.WERKVOORBEREIDER]: 'Werkvoorbereider',
  [Role.INSPECTEUR]: 'Inspecteur',
};

interface BaseProps {
  quoteId: string;
  quoteNumber: string;
  isOpen: boolean;
  onClose: () => void;
}

/** Vrijwillig goedkeuring vragen aan het eigen team (rol). */
export function RequestTeamApprovalModal({ quoteId, quoteNumber, isOpen, onClose }: BaseProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const mutation = useRequestTeamApproval(quoteId);

  // Eigen staf-rollen (SUPERUSER telt niet als 'team').
  const ownRoles = (user?.roles ?? []).filter((r) => r !== Role.SUPERUSER);
  const needsChoice = ownRoles.length > 1;

  const [role, setRole] = useState<string>(ownRoles[0] ?? '');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setRole(ownRoles[0] ?? '');
      setNote('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const handleSubmit = async () => {
    try {
      await mutation.mutateAsync({
        role: needsChoice ? (role as Role) : undefined,
        note: note.trim() || undefined,
      });
      showToast('Goedkeuring aan team gevraagd', 'success');
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Verzoek mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Goedkeuring vragen aan team`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Vraag een collega van uw team om vrijblijvend mee te kijken naar offerte{' '}
          <strong>{quoteNumber}</strong>. Dit is adviserend en blokkeert het versturen niet.
        </p>
        {needsChoice ? (
          <Select
            label="Team / rol"
            options={ownRoles.map((r) => ({ value: r, label: ROLE_LABELS[r] ?? r }))}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        ) : (
          <p className="text-sm text-gray-500">
            Verzoek aan team: <strong>{ROLE_LABELS[ownRoles[0]] ?? ownRoles[0] ?? '—'}</strong>
          </p>
        )}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notitie (optioneel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleSubmit} isLoading={mutation.isPending} disabled={!ownRoles.length}>
            Verzoek versturen
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Vrijwillig goedkeuring vragen aan een specifieke persoon. */
export function RequestPersonApprovalModal({ quoteId, quoteNumber, isOpen, onClose }: BaseProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const mutation = useRequestPersonApproval(quoteId);
  const { data: users } = useSelectableUsers(undefined, { enabled: isOpen });

  const [approverUserId, setApproverUserId] = useState<string>('');
  const [note, setNote] = useState('');

  // Vooringevuld met de profiel-default-goedkeurder.
  useEffect(() => {
    if (isOpen) {
      setApproverUserId(user?.defaultApprovalPersonId ?? '');
      setNote('');
    }
  }, [isOpen, user?.defaultApprovalPersonId]);

  const options = [
    { value: '', label: 'Kies een persoon…' },
    ...(users ?? [])
      .filter((u) => u.id !== user?.id)
      .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

  const handleSubmit = async () => {
    if (!approverUserId) {
      showToast('Kies een persoon', 'error');
      return;
    }
    try {
      await mutation.mutateAsync({ approverUserId, note: note.trim() || undefined });
      showToast('Goedkeuring aan persoon gevraagd', 'success');
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Verzoek mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Goedkeuring vragen aan persoon`}>
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Vraag een specifieke collega om vrijblijvend mee te kijken naar offerte{' '}
          <strong>{quoteNumber}</strong>. Dit is adviserend en blokkeert het versturen niet.
        </p>
        <Select
          label="Persoon"
          options={options}
          value={approverUserId}
          onChange={(e) => setApproverUserId(e.target.value)}
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Notitie (optioneel)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button onClick={handleSubmit} isLoading={mutation.isPending}>Verzoek versturen</Button>
        </div>
      </div>
    </Modal>
  );
}
