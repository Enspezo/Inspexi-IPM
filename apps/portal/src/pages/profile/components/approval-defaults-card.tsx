import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { Card, Button, Select, useToast } from '@/components/ui';
import { useSelectableUsers } from '@/pages/users/hooks/use-users';
import type { User } from '@/types';

/**
 * Profiel-kaart: standaard vrijwillige goedkeurder (persoon). Deze persoon wordt
 * voorgevuld in het "Vraag goedkeuring aan persoon"-dialoog op de offerte-detail
 * (REQ5).
 */
export function ApprovalDefaultsCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const { data: users } = useSelectableUsers(undefined, { enabled: true });
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    setSelected(user?.defaultApprovalPersonId ?? '');
  }, [user?.defaultApprovalPersonId]);

  const mutation = useMutation({
    mutationFn: (defaultApprovalPersonId: string | null) =>
      apiClient.patch<User>('/users/profile', { defaultApprovalPersonId }),
    onSuccess: () => refreshUser(),
  });

  const options = [
    { value: '', label: 'Geen standaard goedkeurder' },
    ...(users ?? [])
      .filter((u) => u.id !== user?.id)
      .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

  const isDirty = selected !== (user?.defaultApprovalPersonId ?? '');

  const handleSave = async () => {
    try {
      await mutation.mutateAsync(selected || null);
      showToast('Standaard goedkeurder opgeslagen', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Card title="Goedkeuring">
      <p className="mb-4 text-sm text-gray-500">
        Kies een standaard goedkeurder. Deze persoon wordt voorgevuld wanneer u op een
        offerte vrijwillig goedkeuring aan een specifieke persoon vraagt.
      </p>
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Select
            label="Standaard goedkeurder (persoon)"
            options={options}
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          />
        </div>
        <Button onClick={handleSave} isLoading={mutation.isPending} disabled={!isDirty}>
          Opslaan
        </Button>
      </div>
    </Card>
  );
}
