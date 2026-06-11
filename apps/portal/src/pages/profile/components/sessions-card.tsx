import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { Card, useToast } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Session } from '@/types';

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

export function SessionsCard() {
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
                    <span>Ingelogd: {formatDateTime(session.createdAt)}</span>
                    <span>Verloopt: {formatDateTime(session.expiresAt)}</span>
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
                      {formatDateTime(session.createdAt)}
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
