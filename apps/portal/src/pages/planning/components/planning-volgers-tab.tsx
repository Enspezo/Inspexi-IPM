import type { PlanningFollower } from '@/types';
import { Button, useToast } from '@/components/ui';
import { useRemoveFollower } from '../hooks/use-planning-followers';
import { getErrorMessage } from '@/lib/api-client';

export function PlanningVolgersTab({
  id,
  followers,
  userCanWrite,
  setAddFollowerOpen,
}: {
  id: string;
  followers: PlanningFollower[] | undefined;
  userCanWrite: boolean;
  setAddFollowerOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const { showToast } = useToast();
  const removeFollower = useRemoveFollower(id);

  const handleRemoveFollower = async (followerId: string) => {
    try {
      await removeFollower.mutateAsync(followerId);
      showToast('Volger verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">Volgers</h3>
        {userCanWrite && (
          <Button variant="secondary" size="sm" onClick={() => setAddFollowerOpen(true)}>
            Volger toevoegen
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {followers?.map((f: PlanningFollower) => {
          const email = f.user?.email ?? f.email ?? '—';
          const name = f.user
            ? `${f.user.firstName} ${f.user.lastName}`
            : f.name ?? email;
          return (
            <div key={f.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
              <div>
                <div className="text-sm font-medium text-gray-900">{name}</div>
                {!f.user && <div className="text-xs text-gray-500">{email}</div>}
              </div>
              {userCanWrite && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleRemoveFollower(f.id)}
                >
                  Verwijderen
                </Button>
              )}
            </div>
          );
        })}
        {(!followers || followers.length === 0) && (
          <p className="text-sm text-gray-500">Geen volgers toegevoegd</p>
        )}
      </div>
    </div>
  );
}
