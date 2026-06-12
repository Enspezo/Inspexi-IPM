import { getErrorMessage } from '@/lib/api-client';
import { useEffect, useState, useCallback } from 'react';
import { Card, Button, useToast } from '@/components/ui';
import { NotificationType } from '@/types';
import {
  useNotificationPrefs,
  useSaveNotificationPrefs,
} from '@/pages/notifications/hooks/use-notifications';

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

export function NotificationPrefsCard() {
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
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
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
