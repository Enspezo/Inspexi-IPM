import { useEffect, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { Card, Input, Button, Badge, useToast } from '@/components/ui';
import { NotificationType, Role } from '@/types';
import type { User, NotificationPref, NotificationGroupPref } from '@/types';
import {
  useNotificationPrefs,
  useSaveNotificationPrefs,
  useGroupNotificationPrefs,
  useSaveGroupNotificationPrefs,
} from '@/pages/notifications/hooks/use-notifications';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht'),
  lastName: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

const notifTypeLabels: Record<string, string> = {
  [NotificationType.OFFERTE_TER_GOEDKEURING]: 'Offerte ter goedkeuring',
  [NotificationType.OFFERTE_GOEDGEKEURD]: 'Offerte goedgekeurd',
  [NotificationType.OFFERTE_AFGEWEZEN]: 'Offerte afgewezen',
  [NotificationType.OFFERTE_VERSTUURD]: 'Offerte verstuurd',
  [NotificationType.OFFERTE_BEKEKEN]: 'Offerte bekeken',
  [NotificationType.OFFERTE_ONDERTEKEND]: 'Offerte ondertekend',
  [NotificationType.OFFERTE_VERLOPEN]: 'Offerte verlopen',
  [NotificationType.NIEUWE_VRAAG_KLANT]: 'Nieuwe vraag klant',
  [NotificationType.ANTWOORD_OP_VRAAG]: 'Antwoord op vraag',
  [NotificationType.AANVRAAG_TOEGEWEZEN]: 'Aanvraag toegewezen',
  [NotificationType.AANVRAAG_STATUS_GEWIJZIGD]: 'Aanvraag status gewijzigd',
};

const roleLabels: Record<string, string> = {
  [Role.ORG_ADMIN]: 'Org Admin',
  [Role.MANAGER]: 'Manager',
  [Role.BACKOFFICE]: 'Backoffice',
  [Role.WERKVOORBEREIDER]: 'Werkvoorbereider',
  [Role.INSPECTEUR]: 'Inspecteur',
};

const assignableRoles = [
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
];

// ─── Notification Preferences Component ───────────────────

interface PrefRow {
  type: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

function NotificationPrefsCard() {
  const { showToast } = useToast();
  const { data: prefs, isLoading } = useNotificationPrefs();
  const savePrefs = useSaveNotificationPrefs();
  const [rows, setRows] = useState<PrefRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (prefs && !initialized) {
      const prefMap = new Map(
        prefs.map((p) => [p.notificationType, p]),
      );
      const allRows = Object.values(NotificationType).map((type) => {
        const existing = prefMap.get(type);
        return {
          type,
          channelInApp: existing?.channelInApp ?? true,
          channelEmail: existing?.channelEmail ?? true,
        };
      });
      setRows(allRows);
      setInitialized(true);
    }
  }, [prefs, initialized]);

  const togglePref = useCallback(
    (type: NotificationType, channel: 'channelInApp' | 'channelEmail') => {
      setRows((prev) =>
        prev.map((r) =>
          r.type === type ? { ...r, [channel]: !r[channel] } : r,
        ),
      );
    },
    [],
  );

  const handleSave = async () => {
    try {
      await savePrefs.mutateAsync(
        rows.map((r) => ({
          type: r.type,
          channelInApp: r.channelInApp,
          channelEmail: r.channelEmail,
        })),
      );
      showToast('Notificatie-instellingen opgeslagen', 'success');
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  if (isLoading) {
    return (
      <Card title="Notificatie-instellingen">
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Laden...
        </div>
      </Card>
    );
  }

  return (
    <Card title="Notificatie-instellingen">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 text-left font-medium text-gray-700">
                Type
              </th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">
                In-app
              </th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">
                E-mail
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.type}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2.5 pr-4 text-gray-700">
                  {notifTypeLabels[row.type] || row.type}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.channelInApp}
                    onChange={() => togglePref(row.type, 'channelInApp')}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.channelEmail}
                    onChange={() => togglePref(row.type, 'channelEmail')}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
        <Button
          onClick={handleSave}
          isLoading={savePrefs.isPending}
        >
          Opslaan
        </Button>
      </div>
    </Card>
  );
}

// ─── Group Notification Preferences Component ─────────────

interface GroupPrefRow {
  role: Role;
  type: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

function GroupNotificationPrefsCard() {
  const { showToast } = useToast();
  const { data: groupPrefs, isLoading } = useGroupNotificationPrefs();
  const saveGroupPrefs = useSaveGroupNotificationPrefs();
  const [rows, setRows] = useState<GroupPrefRow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(Role.MANAGER);

  useEffect(() => {
    if (groupPrefs && !initialized) {
      const prefMap = new Map(
        groupPrefs.map((p) => [`${p.role}_${p.notificationType}`, p]),
      );
      const allRows: GroupPrefRow[] = [];
      for (const role of assignableRoles) {
        for (const type of Object.values(NotificationType)) {
          const key = `${role}_${type}`;
          const existing = prefMap.get(key);
          allRows.push({
            role,
            type,
            channelInApp: existing?.channelInApp ?? true,
            channelEmail: existing?.channelEmail ?? true,
          });
        }
      }
      setRows(allRows);
      setInitialized(true);
    }
  }, [groupPrefs, initialized]);

  const toggleGroupPref = useCallback(
    (
      role: Role,
      type: NotificationType,
      channel: 'channelInApp' | 'channelEmail',
    ) => {
      setRows((prev) =>
        prev.map((r) =>
          r.role === role && r.type === type
            ? { ...r, [channel]: !r[channel] }
            : r,
        ),
      );
    },
    [],
  );

  const handleSave = async () => {
    try {
      await saveGroupPrefs.mutateAsync(
        rows.map((r) => ({
          role: r.role,
          type: r.type,
          channelInApp: r.channelInApp,
          channelEmail: r.channelEmail,
        })),
      );
      showToast('Standaard notificatie-instellingen opgeslagen', 'success');
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  const filteredRows = rows.filter((r) => r.role === selectedRole);

  if (isLoading) {
    return (
      <Card title="Standaard notificatie-instellingen per rol">
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Laden...
        </div>
      </Card>
    );
  }

  return (
    <Card title="Standaard notificatie-instellingen per rol">
      <p className="mb-4 text-sm text-gray-500">
        Deze instellingen gelden als standaard voor nieuwe gebruikers per rol.
        Gebruikers kunnen hun eigen voorkeuren aanpassen.
      </p>

      {/* Role tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {assignableRoles.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedRole === role
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {roleLabels[role] || role}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 text-left font-medium text-gray-700">
                Type
              </th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">
                In-app
              </th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">
                E-mail
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={`${row.role}_${row.type}`}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2.5 pr-4 text-gray-700">
                  {notifTypeLabels[row.type] || row.type}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.channelInApp}
                    onChange={() =>
                      toggleGroupPref(row.role, row.type, 'channelInApp')
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.channelEmail}
                    onChange={() =>
                      toggleGroupPref(row.role, row.type, 'channelEmail')
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
        <Button
          onClick={handleSave}
          isLoading={saveGroupPrefs.isPending}
        >
          Opslaan
        </Button>
      </div>
    </Card>
  );
}

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormData) =>
      apiClient.patch<User>('/users/profile', data),
    onSuccess: () => {
      refreshUser();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfileMutation.mutateAsync(data);
      showToast('Profiel bijgewerkt', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Profiel bijwerken mislukt',
        'error',
      );
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profiel</h2>
        <p className="mt-1 text-sm text-gray-500">
          Beheer uw persoonlijke gegevens
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Edit form */}
        <div className="lg:col-span-2">
          <Card title="Persoonlijke gegevens">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Input
                  label="Voornaam"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Achternaam"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                label="E-mailadres"
                type="email"
                error={errors.email?.message}
                {...register('email')}
              />

              <div className="flex justify-end border-t border-gray-200 pt-4">
                <Button
                  type="submit"
                  isLoading={updateProfileMutation.isPending}
                  disabled={!isDirty}
                >
                  Opslaan
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Read-only info */}
        <div className="space-y-6">
          <Card title="Accountgegevens">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Rol</p>
                <div className="mt-1">
                  {user && <Badge role={user.role} />}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">Organisatie</p>
                <p className="mt-1 text-sm text-gray-900">
                  {user?.organization?.name || '-'}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Account aangemaakt
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(user?.createdAt)}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  E-mail geverifieerd
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {user?.emailVerifiedAt
                    ? formatDate(user.emailVerifiedAt)
                    : 'Niet geverifieerd'}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                <p className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm ${
                      user?.isActive ? 'text-green-700' : 'text-gray-500'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        user?.isActive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                    {user?.isActive ? 'Actief' : 'Inactief'}
                  </span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* Notification preferences */}
      <NotificationPrefsCard />

      {/* Group preferences (OA/SU only) */}
      {user &&
        (user.role === Role.SUPERUSER || user.role === Role.ORG_ADMIN) && (
          <GroupNotificationPrefsCard />
        )}
    </div>
  );
}
