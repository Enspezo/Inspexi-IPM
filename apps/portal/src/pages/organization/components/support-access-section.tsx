import { useState } from 'react';
import { Card, Button, Select, StatusBadge, Spinner, useConfirm, useToast } from '@/components/ui';
import { SUPPORT_ACCESS_ACTION } from '@/lib/status';
import { formatDateTime } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import {
  useSupportAccess,
  useSetSupportAccess,
  useSupportAccessLogs,
} from '../hooks/use-support-access';

const EXPIRY_OPTIONS = [
  { value: '4', label: '4 uur' },
  { value: '24', label: '24 uur' },
  { value: '72', label: '3 dagen' },
  { value: '', label: 'Niet automatisch' },
];

export function SupportAccessSection({ orgId }: { orgId: string }) {
  const confirm = useConfirm();
  const { showToast } = useToast();
  const { data: status, isLoading } = useSupportAccess(orgId);
  const { data: logs } = useSupportAccessLogs(orgId);
  const setAccess = useSetSupportAccess(orgId);
  const [hours, setHours] = useState('24');

  if (isLoading) {
    return (
      <Card>
        <Spinner size="sm" />
      </Card>
    );
  }

  const enabled = status?.supportAccessEnabled ?? false;

  function apply(data: { enabled: boolean; expiresInHours?: number }) {
    setAccess.mutate(data, {
      onSuccess: () =>
        showToast(
          data.enabled ? 'Support-toegang ingeschakeld' : 'Support-toegang ingetrokken',
          'success',
        ),
      onError: (err) => showToast(getErrorMessage(err, 'Wijzigen mislukt'), 'error'),
    });
  }

  async function toggle() {
    if (enabled) {
      const ok = await confirm({
        title: 'Support-toegang intrekken?',
        message:
          'InspeXi-support kan je organisatie dan niet meer met toestemming inzien.',
        confirmLabel: 'Intrekken',
      });
      if (ok) apply({ enabled: false });
    } else {
      apply({ enabled: true, expiresInHours: Number(hours) || undefined });
    }
  }

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">Support-toegang</h3>
          <p className="mt-1 max-w-prose text-sm text-gray-600">
            Geef InspeXi-support toestemming om je organisatie in te zien voor hulp. Je
            kunt dit altijd intrekken; elke wijziging en inzage wordt vastgelegd in het
            logboek hieronder.
          </p>
        </div>
        <StatusBadge map={SUPPORT_ACCESS_ACTION} status={enabled ? 'ENABLED' : 'DISABLED'} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {!enabled && (
          <div>
            <label className="mb-1 block text-xs text-gray-500">
              Automatisch verlopen na
            </label>
            <Select
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              options={EXPIRY_OPTIONS}
            />
          </div>
        )}
        <Button
          variant={enabled ? 'danger' : 'primary'}
          isLoading={setAccess.isPending}
          onClick={toggle}
        >
          {enabled ? 'Toegang intrekken' : 'Toegang verlenen'}
        </Button>
        {enabled && status?.supportAccessExpiresAt && (
          <span className="text-sm text-gray-500">
            Verloopt: {formatDateTime(status.supportAccessExpiresAt)}
          </span>
        )}
      </div>

      {/* Logboek */}
      <div className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          Logboek
        </h4>
        {!logs || logs.data.length === 0 ? (
          <p className="text-sm text-gray-500">Nog geen gebeurtenissen.</p>
        ) : (
          <ul className="divide-y text-sm">
            {logs.data.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <StatusBadge map={SUPPORT_ACCESS_ACTION} status={l.action} />
                  <span className="text-gray-700">
                    {l.performedBy
                      ? `${l.performedBy.firstName} ${l.performedBy.lastName}`
                      : 'Systeem'}
                    {l.ip ? ` · ${l.ip}` : ''}
                    {l.note ? ` · ${l.note}` : ''}
                  </span>
                </span>
                <span className="text-gray-400">{formatDateTime(l.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
