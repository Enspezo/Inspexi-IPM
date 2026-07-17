// Online herstel-sectie (PRD-14 §14.10) op het Overzicht-tab van de
// inspectie-detailpagina. Toggle per plan; het aanzetten valideert server-side
// het rapportnummer (gevuld + uniek) — die 400-melding tonen we inline.
// Bij actief: infoblok met rapportnummer + kopieerbare herstel-URL naar het
// klantportaal (dev :5174, prod via VITE_CLIENT_PORTAL_BASE — zie lib/client-portal).
import { useState } from 'react';
import { Card, Checkbox, Button, ErrorBox, InfoField, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { clientPortalBaseUrl } from '@/lib/client-portal';
import { getTenantInfo } from '@/lib/tenant';
import type { InspectionPlan } from '@/types';
import { useSetOnlineRepairEnabled } from '../hooks/use-inspections';

/** URL van de herstel-ingang op het klantportaal (rapportnummer + postcode als login). */
export function buildRepairUrl(): string {
  return `${clientPortalBaseUrl()}/herstel`;
}

export function OnlineRepairSection({
  plan,
  canWrite,
}: {
  plan: InspectionPlan;
  canWrite: boolean;
}) {
  const { showToast } = useToast();
  const mutation = useSetOnlineRepairEnabled();
  const [toggleError, setToggleError] = useState<string | null>(null);

  const handleToggle = async (next: boolean) => {
    setToggleError(null);
    try {
      await mutation.mutateAsync({ id: plan.id, enabled: next });
      showToast(next ? 'Online herstel ingeschakeld' : 'Online herstel uitgeschakeld', 'success');
    } catch (err) {
      setToggleError(getErrorMessage(err, 'Er is iets misgegaan'));
    }
  };

  // Op het SUPERUSER-domein (mijn.…) zou de URL naar mijn.…:5174/herstel wijzen —
  // dat is geen org-subdomein en dus onbruikbaar (review #12). Verberg het
  // URL-blok daar; de toggle zelf blijft werken (API is org-onafhankelijk).
  const onOrgDomain = !getTenantInfo().isBaseDomain;
  const repairUrl = buildRepairUrl();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(repairUrl);
      showToast('Herstel-URL gekopieerd', 'success');
    } catch {
      showToast('Kopiëren mislukt — kopieer de URL handmatig', 'error');
    }
  };

  return (
    <Card title="Online herstel">
      <div className="space-y-3">
        <p className="text-sm text-gray-500">
          Externen en klanten melden hersteld werk aan constateringen online via het
          klantportaal en ronden af met een ondertekende herstelverklaring. Toegang
          verloopt via het rapportnummer (referentienummer) van deze inspectie.
        </p>
        <Checkbox
          label="Online herstel inschakelen voor deze inspectie"
          checked={plan.onlineRepairEnabled}
          disabled={!canWrite || mutation.isPending}
          onChange={(e) => handleToggle(e.target.checked)}
        />
        {toggleError && <ErrorBox>{toggleError}</ErrorBox>}

        {plan.onlineRepairEnabled && !onOrgDomain && (
          <p className="text-xs text-gray-500">
            De herstel-URL is alleen zichtbaar op het subdomein van de organisatie
            (niet op het beheerdomein).
          </p>
        )}
        {plan.onlineRepairEnabled && onOrgDomain && (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField label="Rapportnummer" value={plan.referenceNumber} />
              <div>
                <dt className="text-sm font-medium text-gray-500">Herstel-URL</dt>
                <dd className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 truncate rounded bg-white px-2 py-1 text-xs text-gray-900 ring-1 ring-gray-200">
                    {repairUrl}
                  </code>
                  <Button type="button" size="sm" variant="secondary" onClick={handleCopy}>
                    Kopiëren
                  </Button>
                </dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-gray-500">
              Herstellers loggen in met dit rapportnummer en de postcode van de
              inspectielocatie.
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
