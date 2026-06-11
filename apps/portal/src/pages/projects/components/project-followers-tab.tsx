import type { ProjectFollower } from '@/types';
import { Button, Checkbox } from '@/components/ui';
import type { UpdateProjectFollowerData } from '../hooks/use-project-followers';

// ─── Permission labels ──────────────────────────────────────

const PERMISSION_FIELDS = [
  { key: 'canViewGeneral' as const, label: 'Algemeen' },
  { key: 'canViewRequests' as const, label: 'Aanvragen' },
  { key: 'canViewQuotes' as const, label: 'Offertes' },
  { key: 'canViewPlanning' as const, label: 'Planning' },
  { key: 'canViewDocuments' as const, label: 'Documenten (gedeeld)' },
];

// ─── Followers Tab ──────────────────────────────────────────

export function FollowersTab({
  followers,
  canWrite,
  onAdd,
  onRemove,
  onUpdatePermissions,
}: {
  followers: ProjectFollower[];
  canWrite: boolean;
  onAdd: () => void;
  onRemove: (id: string, name: string) => void;
  onUpdatePermissions: (followerId: string, data: UpdateProjectFollowerData) => Promise<any>;
}) {
  const internalFollowers = followers.filter((f) => !!f.userId);
  const externalFollowers = followers.filter((f) => !f.userId);

  return (
    <div className="space-y-6">
      {/* Internal followers (Medewerkers) */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Medewerkers</h3>
          {canWrite && (
            <Button variant="secondary" onClick={onAdd}>
              Volger toevoegen
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {internalFollowers.map((f) => {
            const firstName = f.user?.firstName ?? '';
            const lastName = f.user?.lastName ?? '';
            const name = `${firstName} ${lastName}`.trim() || f.user?.email || '—';
            const initials =
              f.user?.initials ??
              `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
            const color = f.user?.color ?? '#6B7280';

            return (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: color }}
                    title={name}
                  >
                    {initials}
                  </span>
                  <div>
                    <div className="text-sm font-medium text-gray-900">{name}</div>
                    <div className="text-xs text-gray-500">{f.user?.email}</div>
                  </div>
                </div>
                {canWrite && (
                  <Button variant="ghost" onClick={() => onRemove(f.id, name)}>
                    Verwijderen
                  </Button>
                )}
              </div>
            );
          })}
          {internalFollowers.length === 0 && (
            <p className="text-sm text-gray-500">Geen medewerkers als volger</p>
          )}
        </div>
      </div>

      {/* External followers */}
      <div>
        <h3 className="mb-3 font-semibold text-gray-900">Externe volgers</h3>
        <div className="space-y-3">
          {externalFollowers.map((f) => {
            const email = f.email ?? '—';
            const name = f.name ?? email;

            return (
              <div
                key={f.id}
                className="rounded-lg border border-gray-200 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </span>
                    <div>
                      <div className="text-sm font-medium text-gray-900">{name}</div>
                      {f.name && <div className="text-xs text-gray-500">{email}</div>}
                    </div>
                  </div>
                  {canWrite && (
                    <Button variant="ghost" onClick={() => onRemove(f.id, name)}>
                      Verwijderen
                    </Button>
                  )}
                </div>

                {/* Permissions */}
                <div className="mt-3 border-t border-gray-100 pt-3">
                  <p className="mb-2 text-xs font-medium text-gray-500">Zichtbare informatie</p>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {PERMISSION_FIELDS.map(({ key, label }) => (
                      <Checkbox
                        key={key}
                        label={label}
                        checked={f[key]}
                        disabled={!canWrite}
                        onChange={(e) => {
                          onUpdatePermissions(f.id, { [key]: e.target.checked });
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
          {externalFollowers.length === 0 && (
            <p className="text-sm text-gray-500">Geen externe volgers</p>
          )}
        </div>
      </div>
    </div>
  );
}
