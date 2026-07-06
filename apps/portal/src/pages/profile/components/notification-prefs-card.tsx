import { getErrorMessage } from '@/lib/api-client';
import { useEffect, useState, useCallback } from 'react';
import { Card, Button, Accordion, AccordionSection, useToast } from '@/components/ui';
import { NotificationType } from '@/types';
import {
  NOTIFICATION_MODELS,
  getTypeLabel,
} from '@/lib/notifications';
import {
  useNotificationPrefs,
  useSaveNotificationPrefs,
} from '@/pages/notifications/hooks/use-notifications';

// ─── Notification Preferences Component ───────────────────

type Channel = 'channelInApp' | 'channelEmail';

interface PrefRow {
  type: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

/** Tri-state header-checkbox (alles aan / alles uit / gemengd). */
function GroupToggle({
  label,
  state,
  onChange,
}: {
  label: string;
  state: 'all' | 'none' | 'mixed';
  onChange: (next: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 text-xs font-normal text-gray-600">
      <input
        type="checkbox"
        checked={state === 'all'}
        ref={(el) => {
          if (el) el.indeterminate = state === 'mixed';
        }}
        onChange={() => onChange(state !== 'all')}
        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
      />
      {label}
    </label>
  );
}

export function NotificationPrefsCard() {
  const { showToast } = useToast();
  const { data: prefs, isLoading } = useNotificationPrefs();
  const savePrefs = useSaveNotificationPrefs();
  const [rows, setRows] = useState<PrefRow[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (prefs && !initialized) {
      const prefMap = new Map(prefs.map((p) => [p.notificationType, p]));
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

  const togglePref = useCallback((type: NotificationType, channel: Channel) => {
    setRows((prev) =>
      prev.map((r) => (r.type === type ? { ...r, [channel]: !r[channel] } : r)),
    );
  }, []);

  /** Zet één kanaal aan/uit voor alle types binnen een model. */
  const toggleModelChannel = useCallback(
    (types: NotificationType[], channel: Channel, next: boolean) => {
      const typeSet = new Set<NotificationType>(types);
      setRows((prev) =>
        prev.map((r) =>
          typeSet.has(r.type) ? { ...r, [channel]: next } : r,
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
      /* foutmelding wordt centraal getoond via useApiMutation */
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

  const rowByType = new Map(rows.map((r) => [r.type, r]));

  /** Bepaal de groeps-state ('all' | 'none' | 'mixed') voor een kanaal. */
  const groupState = (
    types: NotificationType[],
    channel: Channel,
  ): 'all' | 'none' | 'mixed' => {
    const values = types.map((t) => rowByType.get(t)?.[channel] ?? true);
    if (values.every(Boolean)) return 'all';
    if (values.every((v) => !v)) return 'none';
    return 'mixed';
  };

  return (
    <Card title="Notificatie-instellingen">
      <Accordion>
        {NOTIFICATION_MODELS.map((model) => (
          <AccordionSection
            key={model.key}
            title={
              <span className="flex items-center gap-2">
                {model.label}
                <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-normal text-gray-600">
                  {model.types.length}
                </span>
              </span>
            }
            headerActions={
              <>
                <GroupToggle
                  label="In-app"
                  state={groupState(model.types, 'channelInApp')}
                  onChange={(next) =>
                    toggleModelChannel(model.types, 'channelInApp', next)
                  }
                />
                <GroupToggle
                  label="E-mail"
                  state={groupState(model.types, 'channelEmail')}
                  onChange={(next) =>
                    toggleModelChannel(model.types, 'channelEmail', next)
                  }
                />
              </>
            }
          >
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
                {model.types.map((type) => {
                  const row = rowByType.get(type);
                  if (!row) return null;
                  return (
                    <tr
                      key={type}
                      className="border-b border-gray-100 last:border-0"
                    >
                      <td className="py-2.5 pr-4 text-gray-700">
                        {getTypeLabel(type)}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.channelInApp}
                          onChange={() => togglePref(type, 'channelInApp')}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.channelEmail}
                          onChange={() => togglePref(type, 'channelEmail')}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </AccordionSection>
        ))}
      </Accordion>
      <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
        <Button onClick={handleSave} isLoading={savePrefs.isPending}>
          Opslaan
        </Button>
      </div>
    </Card>
  );
}
