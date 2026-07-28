import { useState } from 'react';
import { Button, Card, useConfirm, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import { bagViewerUrl, luchtfotoUrl } from '@/lib/pdok';
import { useRefreshLocationPdok } from '../hooks/use-contacts';
import type { Location, PdokDiffChange } from '@/types';

interface LocationPdokSectionProps {
  location: Location;
  userCanWrite: boolean;
}

/** Toon een veldwaarde menselijk (oppervlakte met m², null → "—"). */
function formatValue(field: string, value: string | number | null | undefined): string {
  if (value == null || value === '') return '—';
  if (field === 'oppervlakte') {
    return `${Number(value).toLocaleString('nl-NL')} m²`;
  }
  return String(value);
}

/** Diff-tabel (oud → nieuw) voor de overschrijf-bevestiging. */
function DiffTable({ changes }: { changes: PdokDiffChange[] }) {
  return (
    <div className="space-y-2">
      <p>De volgende gegevens wijken af van de opgeslagen waarden:</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500">
            <th className="py-1 pr-3 font-medium">Veld</th>
            <th className="py-1 pr-3 font-medium">Huidig</th>
            <th className="py-1 font-medium">Nieuw</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.field} className="border-t border-gray-100">
              <td className="py-1 pr-3 font-medium text-gray-700">{c.label}</td>
              <td className="py-1 pr-3 text-gray-500 line-through">
                {formatValue(c.field, c.oldValue)}
              </td>
              <td className="py-1 font-medium text-gray-900">
                {formatValue(c.field, c.newValue)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-500">Wilt u de gegevens overschrijven?</p>
    </div>
  );
}

export function LocationPdokSection({ location, userCanWrite }: LocationPdokSectionProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const refresh = useRefreshLocationPdok(location.id);
  const [imgFailed, setImgFailed] = useState(false);

  const aerial = luchtfotoUrl(location.lat, location.lng);

  const handleRefresh = async () => {
    try {
      const result = await refresh.mutateAsync(false);
      if (!result.applied && result.changes.length > 0) {
        const confirmed = await confirm({
          title: 'PDOK-gegevens overschrijven',
          message: <DiffTable changes={result.changes} />,
          confirmLabel: 'Overschrijven',
        });
        if (!confirmed) return;
        await refresh.mutateAsync(true);
        showToast('PDOK-gegevens bijgewerkt', 'success');
        return;
      }
      showToast(
        result.changes.length > 0
          ? 'PDOK-gegevens opgehaald'
          : 'PDOK-gegevens zijn al actueel',
        'success',
      );
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">PDOK-gegevens</h3>
        {userCanWrite && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            isLoading={refresh.isPending}
          >
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Vernieuw vanuit PDOK
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div>
          <dt className="text-sm font-medium text-gray-500">Gebruiksfunctie</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {formatValue('gebruiksfunctie', location.gebruiksfunctie)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Bouwjaar</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {formatValue('bouwjaar', location.bouwjaar)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">Oppervlakte</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {formatValue('oppervlakte', location.oppervlakte)}
          </dd>
        </div>
        <div>
          <dt className="text-sm font-medium text-gray-500">BAG-ID</dt>
          <dd className="mt-1 text-sm text-gray-900">
            {location.bagId ? (
              <a
                href={bagViewerUrl(location.bagId)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-primary-600 hover:underline"
              >
                {location.bagId}
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ) : (
              '—'
            )}
          </dd>
        </div>
      </div>

      {aerial && !imgFailed && (
        <figure className="mt-6">
          <img
            src={aerial}
            alt="Luchtfoto van de locatie (PDOK)"
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="h-64 w-full rounded-lg border border-gray-200 object-cover"
          />
          <figcaption className="mt-1 text-xs text-gray-400">
            Luchtfoto: PDOK (Actueel ortho 25cm)
          </figcaption>
        </figure>
      )}
    </Card>
  );
}
