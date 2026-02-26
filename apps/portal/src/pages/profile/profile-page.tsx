import { useEffect, useState, useCallback, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { Card, Input, Button, Badge, Spinner, useToast, SignatureEditor } from '@/components/ui';
import { useUploadAvatar, useDeleteAvatar, getAvatarUrl } from './hooks/use-avatar';
import { useSignature, useSaveSignature, useDeleteSignature } from './hooks/use-signature';
import { NotificationType, Role, SignatureType } from '@/types';
import type { User, NotificationPref, NotificationGroupPref, Session } from '@/types';
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
  initials: z
    .string()
    .max(4, 'Maximaal 4 tekens')
    .regex(/^[A-Z]*$/, 'Alleen hoofdletters (A-Z)')
    .optional()
    .transform((v) => v || undefined),
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

// ─── Session Management Component ──────────────────────

function parseUserAgent(ua: string | null): string {
  if (!ua) return 'Onbekend apparaat';

  let browser = 'Onbekende browser';
  if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';

  let os = '';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

  return os ? `${browser} op ${os}` : browser;
}

function SessionsCard() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const { data: sessions, isLoading } = useQuery<Session[]>({
    queryKey: ['sessions'],
    queryFn: () => apiClient.get<Session[]>('/auth/sessions'),
  });

  const revokeMutation = useMutation({
    mutationFn: (sessionId: string) =>
      apiClient.delete(`/auth/sessions/${sessionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      showToast('Sessie beëindigd', 'success');
    },
    onError: () => {
      showToast('Sessie beëindigen mislukt', 'error');
    },
  });

  const revokeOthersMutation = useMutation({
    mutationFn: () => apiClient.delete('/auth/sessions'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sessions'] });
      showToast('Overige sessies beëindigd', 'success');
    },
    onError: () => {
      showToast('Sessies beëindigen mislukt', 'error');
    },
  });

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const activeSessions = sessions?.filter((s) => !s.revokedAt && new Date(s.expiresAt) > new Date()) ?? [];
  const historicalSessions = sessions?.filter((s) => s.revokedAt || new Date(s.expiresAt) <= new Date()) ?? [];
  const hasOtherActive = activeSessions.filter((s) => !s.isCurrent).length > 0;

  if (isLoading) {
    return (
      <Card title="Sessies">
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Laden...
        </div>
      </Card>
    );
  }

  return (
    <Card title="Sessies">
      <p className="mb-4 text-sm text-gray-500">
        Overzicht van uw actieve en eerdere sessies. U kunt actieve sessies beëindigen
        om ongeautoriseerde toegang te voorkomen.
      </p>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="mb-6">
          <h4 className="mb-3 text-sm font-medium text-gray-700">
            Actieve sessies ({activeSessions.length})
          </h4>
          <div className="space-y-3">
            {activeSessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between rounded-lg border p-3 ${
                  session.isCurrent
                    ? 'border-primary-200 bg-primary-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {parseUserAgent(session.userAgent)}
                    </p>
                    {session.isCurrent && (
                      <span className="inline-flex items-center rounded-full bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
                        Huidige sessie
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                    {session.ipAddress && (
                      <span>IP: {session.ipAddress}</span>
                    )}
                    <span>Ingelogd: {formatDate(session.createdAt)}</span>
                    <span>Verloopt: {formatDate(session.expiresAt)}</span>
                  </div>
                </div>
                {!session.isCurrent && (
                  <button
                    onClick={() => revokeMutation.mutate(session.id)}
                    disabled={revokeMutation.isPending}
                    className="ml-3 shrink-0 rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Beëindigen
                  </button>
                )}
              </div>
            ))}
          </div>

          {hasOtherActive && (
            <div className="mt-3 flex justify-end">
              <button
                onClick={() => revokeOthersMutation.mutate()}
                disabled={revokeOthersMutation.isPending}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                Alle andere sessies beëindigen
              </button>
            </div>
          )}
        </div>
      )}

      {/* Historical sessions */}
      {historicalSessions.length > 0 && (
        <div>
          <h4 className="mb-3 text-sm font-medium text-gray-700">
            Sessiegeschiedenis
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="py-2 pr-4 text-left font-medium text-gray-700">
                    Apparaat
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    IP-adres
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Ingelogd
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-700">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {historicalSessions.slice(0, 10).map((session) => (
                  <tr
                    key={session.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="py-2.5 pr-4 text-gray-700">
                      {parseUserAgent(session.userAgent)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {session.ipAddress || '-'}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {formatDate(session.createdAt)}
                    </td>
                    <td className="px-4 py-2.5">
                      {session.revokedAt ? (
                        <span className="text-xs text-amber-600">Beëindigd</span>
                      ) : (
                        <span className="text-xs text-gray-400">Verlopen</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSessions.length === 0 && historicalSessions.length === 0 && (
        <p className="py-8 text-center text-sm text-gray-400">
          Geen sessiegegevens beschikbaar.
        </p>
      )}
    </Card>
  );
}

// ─── Avatar Card Component ──────────────────────────────

function AvatarCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const uploadMutation = useUploadAvatar();
  const deleteMutation = useDeleteAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarCacheBust, setAvatarCacheBust] = useState(() => Date.now());
  const hasAvatar = Boolean(user?.avatarUrl);
  const avatarUrl = getAvatarUrl();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Alleen PNG, JPEG en WebP zijn toegestaan', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Bestand mag maximaal 5 MB zijn', 'error');
      return;
    }

    try {
      await uploadMutation.mutateAsync(file);
      setAvatarCacheBust(Date.now());
      refreshUser();
      showToast('Avatar geüpload', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Upload mislukt', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      setAvatarCacheBust(Date.now());
      refreshUser();
      showToast('Avatar verwijderd', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Verwijderen mislukt', 'error');
    }
  };

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '';

  return (
    <Card title="Profielfoto">
      <div className="flex items-center gap-6">
        {/* Avatar preview */}
        <div className="shrink-0">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border-2 border-gray-200 bg-gray-100">
            {uploadMutation.isPending ? (
              <Spinner size="md" />
            ) : hasAvatar ? (
              <img
                src={`${avatarUrl}?v=${avatarCacheBust}`}
                alt="Profielfoto"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <span className="text-xl font-semibold text-gray-500">
                {initials}
              </span>
            )}
          </div>
        </div>

        {/* Upload zone */}
        <div className="flex-1 space-y-3">
          <div>
            <p className="text-sm text-gray-500">
              Upload een profielfoto in PNG, JPEG of WebP formaat (max 5 MB).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              isLoading={uploadMutation.isPending}
            >
              {hasAvatar ? 'Foto wijzigen' : 'Foto uploaden'}
            </Button>
            {hasAvatar && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                isLoading={deleteMutation.isPending}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                Verwijderen
              </Button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </Card>
  );
}

// ─── Signature Card Component ─────────────────────────────

const SCRIPT_FONTS_PREVIEW = [
  { family: "'Dancing Script', cursive" },
  { family: "'Great Vibes', cursive" },
  { family: "'Alex Brush', cursive" },
  { family: "'Pacifico', cursive" },
];

function SignatureCard() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: signature, isLoading } = useSignature();
  const saveMutation = useSaveSignature();
  const deleteMutation = useDeleteSignature();
  const [isEditing, setIsEditing] = useState(false);

  const handleSave = async (type: SignatureType, data: string) => {
    try {
      await saveMutation.mutateAsync({ signatureType: type, signatureData: data });
      showToast('Handtekening opgeslagen', 'success');
      setIsEditing(false);
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      showToast('Handtekening verwijderd', 'success');
      setIsEditing(false);
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  if (isLoading) {
    return (
      <Card title="Standaard handtekening">
        <div className="flex h-24 items-center justify-center text-sm text-gray-400">
          Laden...
        </div>
      </Card>
    );
  }

  const hasSignature = signature?.signatureType && signature?.signatureData;

  // Render existing signature preview
  const renderPreview = () => {
    if (!signature?.signatureType || !signature?.signatureData) return null;

    if (signature.signatureType === SignatureType.DRAW || signature.signatureType === SignatureType.UPLOAD) {
      return (
        <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-4">
          <img
            src={signature.signatureData}
            alt="Handtekening"
            className="max-h-20 max-w-full object-contain"
          />
        </div>
      );
    }

    if (signature.signatureType === SignatureType.TEXT) {
      try {
        const parsed = JSON.parse(signature.signatureData);
        return (
          <div className="flex items-center justify-center rounded-lg border border-gray-200 bg-white p-4">
            <span
              className="text-3xl text-gray-800"
              style={{ fontFamily: parsed.font || SCRIPT_FONTS_PREVIEW[0].family }}
            >
              {parsed.text}
            </span>
          </div>
        );
      } catch {
        return null;
      }
    }

    return null;
  };

  return (
    <Card title="Standaard handtekening">
      <p className="mb-4 text-sm text-gray-500">
        Sla een standaard handtekening op die u kunt hergebruiken bij het goedkeuren van offertes.
      </p>

      {!isEditing ? (
        <div className="space-y-3">
          {hasSignature ? (
            <>
              {renderPreview()}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  Type: {signature.signatureType === SignatureType.DRAW ? 'Getekend' : signature.signatureType === SignatureType.UPLOAD ? 'Afbeelding' : 'Tekst'}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditing(true)}
                    className="text-xs font-medium text-primary-600 hover:text-primary-800 underline"
                  >
                    Wijzigen
                  </button>
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    className="text-xs font-medium text-red-500 hover:text-red-700 underline disabled:opacity-50"
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 py-8">
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              <p className="text-sm text-gray-500">Nog geen handtekening ingesteld</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setIsEditing(true)}
              >
                Handtekening instellen
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <SignatureEditor
            onSave={handleSave}
            initialType={signature?.signatureType ?? null}
            initialData={signature?.signatureData ?? null}
            isSaving={saveMutation.isPending}
            userName={user ? `${user.firstName} ${user.lastName}` : ''}
          />
          <button
            type="button"
            onClick={() => setIsEditing(false)}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Annuleren
          </button>
        </div>
      )}
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
        initials: user.initials ?? '',
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

      {/* Avatar */}
      <AvatarCard />

      {/* Signature */}
      <SignatureCard />

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

              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <Input
                    label="Initialen"
                    placeholder="bv. JDV"
                    maxLength={4}
                    error={errors.initials?.message}
                    {...register('initials', {
                      onChange: (e) => {
                        e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                      },
                    })}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Max. 4 hoofdletters (A–Z). Wordt gebruikt bij offertes en documentnaamgeving.
                  </p>
                </div>
              </div>

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

      {/* Sessions */}
      <SessionsCard />
    </div>
  );
}
