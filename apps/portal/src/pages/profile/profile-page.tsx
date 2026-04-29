import { useEffect, useState, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { Card, Input, Button, Badge, Spinner, useToast, SignatureEditor, AddressSearchInput } from '@/components/ui';
import type { ParsedAddress } from '@/lib/geocoding';
import { useUploadAvatar, useDeleteAvatar, getAvatarUrl } from './hooks/use-avatar';
import { useSignature, useSaveSignature, useDeleteSignature } from './hooks/use-signature';
import { NotificationType, Role, SignatureType, AuditAction } from '@/types';
import { hasRole } from '@/lib/has-role';
import type { User, NotificationPref, Session, AuditLogEntry } from '@/types';
import { useMyActivity } from '@/hooks/use-my-activity';
import {
  ENTITY_TYPE_LABELS,
  getEntityTypeLabel,
  getEntityLink,
  getEntityDisplayName,
} from '@/lib/audit-entity-helpers';
import { getFieldLabel } from '@/lib/audit-field-labels';
import { formatAuditValue, isHiddenAuditField } from '@/lib/audit-value-format';

// ─── Inspector Color & iCal Card ──────────────────────────

const PRESET_COLORS = [
  '#EF4444', '#F97316', '#EAB308', '#22C55E',
  '#06B6D4', '#3B82F6', '#8B5CF6', '#EC4899',
  '#14B8A6', '#6366F1', '#F43F5E', '#84CC16',
];

function InspectorCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [color, setColor] = useState(user?.color || '#3B82F6');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (user?.color) setColor(user.color);
  }, [user?.color]);

  const handleSaveColor = async () => {
    setSaving(true);
    try {
      await apiClient.patch(`/users/${user!.id}/color`, { color });
      refreshUser();
      showToast('Kleur opgeslagen', 'success');
    } catch {
      showToast('Opslaan mislukt', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyIcal = () => {
    const icalUrl = `${window.location.origin}/api/v1/ical/${user?.icalToken}.ics`;
    navigator.clipboard.writeText(icalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <Card title="Inspecteur-instellingen">
      <div className="space-y-6">
        {/* Color picker */}
        <div>
          <p className="mb-3 text-sm font-medium text-gray-700">Kleur in planning</p>
          <p className="mb-3 text-xs text-gray-500">
            Deze kleur wordt gebruikt om u te onderscheiden in de planningsoverzichten.
          </p>
          <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full border-2 transition-all ${
                  color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded-full border-2 border-gray-300 p-0.5"
              title="Aangepaste kleur"
            />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: color }}
            >
              {user?.initials || `${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`}
            </div>
            <span className="text-sm text-gray-500">Zo ziet uw avatar eruit in de planning</span>
          </div>
          <div className="mt-4">
            <Button size="sm" onClick={handleSaveColor} isLoading={saving}>
              Kleur opslaan
            </Button>
          </div>
        </div>

        {/* iCal feed */}
        <div className="border-t border-gray-200 pt-6">
          <p className="mb-2 text-sm font-medium text-gray-700">Persoonlijke agendafeed (iCal)</p>
          <p className="mb-3 text-xs text-gray-500">
            Abonneer u op uw afspraken vanuit elke agenda-app (Google Calendar, Outlook, Apple Calendar, etc.).
            De URL is persoonlijk en beveiligd — deel deze niet.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 text-xs text-gray-700">
              {`${window.location.origin}/api/v1/ical/${user?.icalToken}.ics`}
            </code>
            <Button
              size="sm"
              variant="secondary"
              onClick={handleCopyIcal}
            >
              {copied ? 'Gekopieerd!' : 'Kopieer'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
import {
  useNotificationPrefs,
  useSaveNotificationPrefs,
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
  [NotificationType.TAAK_TOEGEWEZEN]: 'Taak toegewezen',
  [NotificationType.TAAK_STATUS_GEWIJZIGD]: 'Taak status gewijzigd',
  [NotificationType.DOCUMENT_GEUPLOAD]: 'Document geüpload',
  [NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK]: 'Afspraak acceptatieverzoek',
  [NotificationType.AFSPRAAK_GEACCEPTEERD]: 'Afspraak geaccepteerd',
  [NotificationType.AFSPRAAK_GEWEIGERD]: 'Afspraak geweigerd',
  [NotificationType.AFSPRAAK_VERPLAATST]: 'Afspraak verplaatst',
  [NotificationType.AFSPRAAK_VERZETTEN_VERZOEK]: 'Afspraak verzetverzoek',
  [NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD]: 'Afspraak bevestiging verstuurd',
  [NotificationType.PROJECT_AANGEMAAKT]: 'Project aangemaakt',
  [NotificationType.PROJECT_STATUS_GEWIJZIGD]: 'Project status gewijzigd',
};


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

// ─── Home Address Card ────────────────────────────────────

function HomeAddressCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [street, setStreet] = useState('');
  const [houseNumber, setHouseNumber] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hasAddress = !!(user?.homeStreet && user?.homeCity);

  // Reset form to current user values when opening edit mode
  const openEdit = () => {
    setStreet(user?.homeStreet ?? '');
    setHouseNumber(user?.homeHouseNumber ?? '');
    setPostalCode(user?.homePostalCode ?? '');
    setCity(user?.homeCity ?? '');
    setLat(user?.homeLat ?? null);
    setLng(user?.homeLng ?? null);
    setIsEditing(true);
  };

  const handleAddressSelect = (address: ParsedAddress) => {
    setStreet(address.street);
    setHouseNumber(address.houseNumber);
    setPostalCode(address.postalCode);
    setCity(address.city);
    setLat(address.lat);
    setLng(address.lng);
  };

  const handleSave = async () => {
    if (!street || !houseNumber || !postalCode || !city) {
      showToast('Vul alle adresvelden in', 'error');
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch('/users/profile', {
        homeStreet: street,
        homeHouseNumber: houseNumber,
        homePostalCode: postalCode,
        homeCity: city,
        homeLat: lat,
        homeLng: lng,
      });
      refreshUser();
      showToast('Thuisadres opgeslagen', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Opslaan mislukt',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await apiClient.patch('/users/profile', {
        homeStreet: null,
        homeHouseNumber: null,
        homePostalCode: null,
        homeCity: null,
        homeLat: null,
        homeLng: null,
      });
      refreshUser();
      showToast('Thuisadres verwijderd', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    } finally {
      setSaving(false);
    }
  };

  // Build the autocomplete initial display value
  const addressLabel =
    hasAddress
      ? `${user.homeStreet} ${user.homeHouseNumber}, ${user.homePostalCode} ${user.homeCity}`
      : undefined;

  return (
    <Card title="Thuisadres">
      {!isEditing ? (
        <div className="flex items-start justify-between">
          <div>
            {hasAddress ? (
              <div className="flex items-start gap-2">
                <svg
                  className="mt-0.5 h-4 w-4 flex-shrink-0 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <div className="text-sm text-gray-900">
                  <p>
                    {user.homeStreet} {user.homeHouseNumber}
                  </p>
                  <p className="text-gray-500">
                    {user.homePostalCode} {user.homeCity}
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">
                  Nog geen thuisadres ingesteld
                </p>
                <p className="mt-0.5 text-xs text-gray-400">
                  Wordt gebruikt voor routeplanning
                </p>
              </div>
            )}
          </div>
          <Button variant="secondary" onClick={openEdit}>
            {hasAddress ? 'Wijzigen' : 'Instellen'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* PDOK autocomplete */}
          <AddressSearchInput
            label="Zoek adres"
            placeholder="Typ een straat, huisnummer of postcode…"
            initialValue={addressLabel}
            onSelect={handleAddressSelect}
          />

          {/* Manual fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Input
                label="Straat"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="Hoofdstraat"
              />
            </div>
            <Input
              label="Huisnummer"
              value={houseNumber}
              onChange={(e) => setHouseNumber(e.target.value)}
              placeholder="1A"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Postcode"
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="1234 AB"
              maxLength={10}
            />
            <Input
              label="Stad"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Amsterdam"
            />
          </div>

          <div className="flex items-center justify-between border-t border-gray-200 pt-4">
            <div className="flex gap-2">
              <Button onClick={handleSave} isLoading={saving}>
                Opslaan
              </Button>
              <Button
                variant="secondary"
                onClick={() => setIsEditing(false)}
                disabled={saving}
              >
                Annuleren
              </Button>
            </div>
            {hasAddress && (
              <Button variant="danger" onClick={handleClear} isLoading={saving}>
                Adres wissen
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Activity Tab ────────────────────────────────────────

const ITEMS_PER_PAGE = 20;

const actionBadgeClasses: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'bg-green-100 text-green-800',
  [AuditAction.UPDATE]: 'bg-blue-100 text-blue-800',
  [AuditAction.DELETE]: 'bg-red-100 text-red-800',
};

const actionLabels: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'Aangemaakt',
  [AuditAction.UPDATE]: 'Bijgewerkt',
  [AuditAction.DELETE]: 'Verwijderd',
};

function formatActivityDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`;
  return formatActivityDateTime(dateStr);
}

function ChangesSummary({ entry }: { entry: AuditLogEntry }) {
  if (entry.action === AuditAction.CREATE) {
    return <p className="text-sm text-gray-500">Record aangemaakt</p>;
  }
  if (entry.action === AuditAction.DELETE) {
    return <p className="text-sm text-gray-500">Record verwijderd</p>;
  }
  if (!entry.changes) {
    return <p className="text-sm text-gray-500">Gegevens bijgewerkt</p>;
  }
  const visibleEntries = Object.entries(entry.changes).filter(
    ([field]) => !isHiddenAuditField(field),
  );
  if (visibleEntries.length === 0) {
    return <p className="text-sm text-gray-500">Gegevens bijgewerkt</p>;
  }
  return (
    <ul className="space-y-0.5">
      {visibleEntries.slice(0, 3).map(([field, change]) => (
        <li key={field} className="text-sm text-gray-600">
          <span className="font-medium text-gray-700">
            {getFieldLabel(entry.entityType, field)}
          </span>{' '}
          gewijzigd van{' '}
          <span className="rounded bg-red-50 px-1 text-xs text-red-700">
            {formatAuditValue(change.from, field)}
          </span>{' '}
          naar{' '}
          <span className="rounded bg-green-50 px-1 text-xs text-green-700">
            {formatAuditValue(change.to, field)}
          </span>
        </li>
      ))}
      {visibleEntries.length > 3 && (
        <li className="text-xs text-gray-400">
          en {visibleEntries.length - 3} andere{' '}
          {visibleEntries.length - 3 === 1 ? 'wijziging' : 'wijzigingen'}
        </li>
      )}
    </ul>
  );
}

function ActivityItem({ entry }: { entry: AuditLogEntry }) {
  const link = getEntityLink(entry.entityType, entry.entityId, entry.snapshot);
  const name = getEntityDisplayName(entry.entityType, entry.snapshot);
  const typeLabel = getEntityTypeLabel(entry.entityType);

  return (
    <div className="flex gap-4 py-4">
      <div className="relative flex flex-col items-center">
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${actionBadgeClasses[entry.action]}`}
        >
          {entry.action === AuditAction.CREATE ? '+' : entry.action === AuditAction.DELETE ? '×' : '~'}
        </div>
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${actionBadgeClasses[entry.action]}`}
            >
              {actionLabels[entry.action]}
            </span>
            <span className="text-sm font-medium text-gray-900">{typeLabel}</span>
            {name !== typeLabel && (
              <>
                <span className="text-gray-400">&mdash;</span>
                {link ? (
                  <Link to={link} className="text-sm text-primary-600 hover:underline">
                    {name}
                  </Link>
                ) : (
                  <span className="text-sm text-gray-600">{name}</span>
                )}
              </>
            )}
            {name === typeLabel && link && (
              <Link to={link} className="text-sm text-primary-600 hover:underline">
                Bekijk record
              </Link>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="text-xs font-medium text-gray-500">
              {formatRelativeTime(entry.createdAt)}
            </span>
            <span className="text-xs text-gray-400" title={formatActivityDateTime(entry.createdAt)}>
              {formatActivityDateTime(entry.createdAt)}
            </span>
          </div>
        </div>
        <div className="mt-1.5">
          <ChangesSummary entry={entry} />
        </div>
      </div>
    </div>
  );
}

const entityTypeOptions = [
  { value: '', label: 'Alle types' },
  ...Object.entries(ENTITY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
];

const actionOptions = [
  { value: '', label: 'Alle acties' },
  { value: 'CREATE', label: 'Aangemaakt' },
  { value: 'UPDATE', label: 'Bijgewerkt' },
  { value: 'DELETE', label: 'Verwijderd' },
];

function ActivityTab() {
  const [page, setPage] = useState(1);
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const { data, isLoading, error } = useMyActivity({
    entityType: entityType || undefined,
    action: action || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page,
    limit: ITEMS_PER_PAGE,
  });

  const totalPages = data ? Math.ceil(data.total / ITEMS_PER_PAGE) : 0;

  function handleFilterChange() {
    setPage(1);
  }

  function resetFilters() {
    setEntityType('');
    setAction('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const hasActiveFilters = !!(entityType || action || dateFrom || dateTo);

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[160px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Type</label>
            <select
              value={entityType}
              onChange={(e) => { setEntityType(e.target.value); handleFilterChange(); }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {entityTypeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Actie</label>
            <select
              value={action}
              onChange={(e) => { setAction(e.target.value); handleFilterChange(); }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            >
              {actionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Datum vanaf</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); handleFilterChange(); }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          <div className="min-w-[140px] flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">Datum tot</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); handleFilterChange(); }}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="secondary" size="sm" onClick={resetFilters}>Wissen</Button>
          )}
        </div>
      </Card>

      {/* Activity list */}
      <Card>
        {isLoading && (
          <div className="flex h-48 items-center justify-center">
            <Spinner size="md" />
          </div>
        )}
        {error && (
          <div className="flex h-48 items-center justify-center">
            <p className="text-sm text-red-600">Fout bij laden activiteiten</p>
          </div>
        )}
        {!isLoading && data && data.data.length === 0 && (
          <div className="flex h-48 items-center justify-center">
            <div className="text-center">
              <svg className="mx-auto mb-3 h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-500">
                {hasActiveFilters ? 'Geen activiteiten gevonden met deze filters' : 'Nog geen activiteiten'}
              </p>
            </div>
          </div>
        )}
        {!isLoading && data && data.data.length > 0 && (
          <>
            <div className="divide-y divide-gray-100">
              {data.data.map((entry) => (
                <ActivityItem key={entry.id} entry={entry} />
              ))}
            </div>
            {totalPages > 1 && (
              <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-4">
                <p className="text-sm text-gray-500">
                  Pagina {page} van {totalPages} &nbsp;&middot;&nbsp; {data.total.toLocaleString('nl-NL')} resultaten
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
                    Vorige
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    Volgende
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────

type ProfileTab = 'profiel' | 'notificaties' | 'activiteiten';

const VALID_TABS: ProfileTab[] = ['profiel', 'notificaties', 'activiteiten'];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ProfileTab | null;
  const initialTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'profiel';
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

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

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'profiel', label: 'Profiel' },
    { key: 'notificaties', label: 'Notificaties' },
    { key: 'activiteiten', label: 'Activiteiten' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profiel</h2>
        <p className="mt-1 text-sm text-gray-500">
          Beheer uw persoonlijke gegevens
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'profiel' && (
        <>
          {/* Avatar */}
          <AvatarCard />

          {/* Inspector color + iCal (only for inspectors) */}
          {user && hasRole(user, Role.INSPECTEUR) && <InspectorCard />}

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
                      {user && (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((r) => (
                            <Badge key={r} role={r} />
                          ))}
                        </div>
                      )}
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

          {/* Home address */}
          <HomeAddressCard />

          {/* Sessions */}
          <SessionsCard />
        </>
      )}

      {activeTab === 'notificaties' && <NotificationPrefsCard />}

      {activeTab === 'activiteiten' && <ActivityTab />}
    </div>
  );
}
