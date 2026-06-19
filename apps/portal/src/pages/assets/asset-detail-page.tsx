// READ-ONLY asset-detailpagina. Spiegelt het leesgedeelte van
// pages/inspections/inspection-detail-page.tsx (DetailPageLayout + AuditHistory +
// header + Card/InfoField + LookupBadge), maar zonder bewerk-/verwijder-modus.
// Eén scrollbare pagina (geen tabs); child-assets/inspectie zijn navigeerbaar.

import { useParams, useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  ErrorBox,
  InfoField,
  LookupBadge,
  Spinner,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { formatDate } from '@/lib/format';
import type { Asset, Finding } from '@/types';
import { useAsset } from './hooks/use-assets';
import { TechnicalDataList } from './components/technical-data-list';

// Pills voor assetType/identifier — Badge accepteert alleen role:Role, dus styled <span>.
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
      {children}
    </span>
  );
}

export default function AssetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: asset, isLoading, error } = useAsset(id!);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error || !asset) return <ErrorBox>Asset niet gevonden</ErrorBox>;

  const findings: Finding[] = asset.findings ?? [];
  const childAssets: Asset[] = asset.childAssets ?? [];
  const measurementRecords = asset.measurementRecords ?? [];
  const visualInspections = asset.visualInspections ?? [];
  const inspectionCount = measurementRecords.length + visualInspections.length;

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Asset" entityId={id} />}>
      <div className="space-y-6">
        <button
          onClick={() => navigate('/assets')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Terug naar assets
        </button>

        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900">{asset.name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <Pill>{asset.assetType}</Pill>
              {asset.identifier && <Pill>{asset.identifier}</Pill>}
              <LookupBadge kind="asset-status-types" code={asset.statusCode} />
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate(`/inspections/${asset.inspectionPlanId}`)}>
            Open inspectie
          </Button>
        </div>

        {/* Kerngegevens */}
        <Card title="Kerngegevens">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InfoField label="Naam" value={asset.name} />
            <InfoField label="Identifier" value={asset.identifier} />
            <InfoField label="Asset-type" value={asset.assetType} />
            <InfoField label="Status" value={<LookupBadge kind="asset-status-types" code={asset.statusCode} />} />
            <InfoField label="Locatie-omschrijving" value={asset.locationDescription} />
            <InfoField label="Notities" value={asset.notes} />
            <InfoField label="Aangemaakt" value={formatDate(asset.createdAt)} />
            <InfoField label="Bijgewerkt" value={formatDate(asset.updatedAt)} />
          </dl>
        </Card>

        {/* Technische gegevens */}
        <Card title="Technische gegevens">
          <TechnicalDataList data={asset.technicalData} />
        </Card>

        {/* Constateringen */}
        <Card title={`Constateringen (${findings.length})`}>
          {findings.length === 0 ? (
            <p className="text-sm text-gray-400">Geen constateringen vastgelegd.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {findings.map((f) => (
                <li key={f.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium text-gray-900">{f.shortDescription}</p>
                    <LookupBadge kind="finding-status-types" code={f.statusCode} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    {f.normReference && <span>Norm: {f.normReference}</span>}
                    {f.locationDescription && <span>Locatie: {f.locationDescription}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Metingen */}
        <Card title={`Metingen (${inspectionCount})`}>
          {inspectionCount === 0 ? (
            <p className="text-sm text-gray-400">Geen metingen of visuele inspecties vastgelegd.</p>
          ) : (
            <ul className="space-y-1 text-sm text-gray-700">
              {measurementRecords.length > 0 && (
                <li>
                  {measurementRecords.length} meetregistratie{measurementRecords.length !== 1 ? 's' : ''}
                </li>
              )}
              {visualInspections.length > 0 && (
                <li>
                  {visualInspections.length} visuele inspectie{visualInspections.length !== 1 ? 's' : ''}
                </li>
              )}
            </ul>
          )}
        </Card>

        {/* Onderliggende assets */}
        <Card title={`Onderliggende assets (${childAssets.length})`}>
          {childAssets.length === 0 ? (
            <p className="text-sm text-gray-400">Geen onderliggende assets.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {childAssets.map((child) => (
                <li key={child.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-3">
                    <button
                      onClick={() => navigate(`/assets/${child.id}`)}
                      className="text-left text-sm font-medium text-primary-600 hover:text-primary-700 hover:underline"
                    >
                      {child.name}
                    </button>
                    <LookupBadge kind="asset-status-types" code={child.statusCode} />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span>{child.assetType}</span>
                    {child.identifier && <span>{child.identifier}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </DetailPageLayout>
  );
}
