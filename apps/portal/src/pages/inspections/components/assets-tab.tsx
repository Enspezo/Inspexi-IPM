// Assets-tab van de inspectie-detailpagina. Bron van waarheid = de dedicated
// lijst-endpoint (GET /inspection-plans/:id/assets?flat=true), net als de
// plattegrond. Per asset zijn de bevindingen uitklapbaar (GET /assets/:id/findings).
import { useState } from 'react';
import { Card, Spinner, LookupBadge } from '@/components/ui';
import type { Asset } from '@/types';
import { useAssetFindings } from '../hooks/use-location-images';

interface AssetsTabProps {
  assets: Asset[];
  isLoading: boolean;
}

export function AssetsTab({ assets, isLoading }: AssetsTabProps) {
  if (isLoading) {
    return (
      <Card title="Assets">
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      </Card>
    );
  }

  return (
    <Card title={`Assets (${assets.length})`}>
      {assets.length === 0 ? (
        <p className="py-4 text-sm text-gray-500">Geen assets gekoppeld aan deze inspectie.</p>
      ) : (
        <ul className="-my-2 divide-y divide-gray-100">
          {assets.map((asset) => (
            <AssetRow key={asset.id} asset={asset} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function AssetRow({ asset }: { asset: Asset }) {
  const [expanded, setExpanded] = useState(false);
  // Bevindingen pas ophalen wanneer de rij uitgeklapt wordt.
  const { data: findings, isLoading } = useAssetFindings(expanded ? asset.id : undefined);
  const findingCount = asset.findingCount ?? findings?.length ?? 0;

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-start gap-2">
          <svg
            className={`mt-0.5 h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2">
              <span className="font-medium text-gray-900">{asset.name}</span>
              {asset.identifier && (
                <span className="text-sm text-gray-500">· {asset.identifier}</span>
              )}
            </div>
            <div className="mt-0.5 text-xs text-gray-500">{asset.assetType}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {findingCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
              {findingCount} {findingCount === 1 ? 'bevinding' : 'bevindingen'}
            </span>
          )}
          <LookupBadge kind="asset-status-types" code={asset.statusCode} />
        </div>
      </button>

      {expanded && (
        <div className="ml-6 mt-3">
          {isLoading ? (
            <div className="flex justify-center py-3">
              <Spinner size="sm" />
            </div>
          ) : findings && findings.length > 0 ? (
            <ul className="space-y-2">
              {findings.map((f) => (
                <li
                  key={f.id}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900">{f.shortDescription}</p>
                      {f.longDescription && (
                        <p className="mt-0.5 text-xs text-gray-600">{f.longDescription}</p>
                      )}
                      {f.normReference && (
                        <p className="mt-0.5 text-xs text-gray-400">Norm: {f.normReference}</p>
                      )}
                    </div>
                    <LookupBadge kind="finding-status-types" code={f.statusCode} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-1 text-sm text-gray-500">Geen bevindingen voor deze asset.</p>
          )}
        </div>
      )}
    </li>
  );
}
