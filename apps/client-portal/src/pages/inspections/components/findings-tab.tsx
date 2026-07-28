import { useState } from 'react';
import { clsx } from 'clsx';
import { useInspectionFindings } from '../hooks/use-inspections';
import { Spinner, LookupBadge, ErrorBox } from '@/components/ui';
import { useFeatures } from '@/providers/feature-provider';
import { FindingDetailModal } from './finding-detail-modal';
import { formatDate } from '@/lib/format';
import type { Finding } from '@/types';

interface FindingsTabProps {
  inspectionId: string;
  /** Online herstel (PRD-14 §14.9.6): per-plan vlag — stuurt de meld-flow om. */
  onlineRepairEnabled?: boolean;
  /** B-409 (A4): vanuit de constatering doorverwijzen naar de Documenten-tab. */
  onNavigateTab?: (tab: 'documents') => void;
}

export function FindingsTab({
  inspectionId,
  onlineRepairEnabled = false,
  onNavigateTab,
}: FindingsTabProps) {
  const { data, isLoading, error } = useInspectionFindings(inspectionId);
  const { hasFeature } = useFeatures();
  const [selected, setSelected] = useState<string | null>(null);
  const findings = data ?? [];

  // Met de add-on én de plan-vlag verwijst de findings-tab naar de herstel-flow
  // (één consistente route); zonder add-on blijft het bestaande gedrag intact.
  const onlineRepair = onlineRepairEnabled && hasFeature('ONLINE_HERSTEL');

  return (
    <div className="space-y-4">
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon de constateringen niet laden.</ErrorBox>}

      {data && (
        <>
          <p className="text-sm text-gray-600">
            {findings.length} constatering{findings.length === 1 ? '' : 'en'}
          </p>
          {findings.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Geen constateringen voor deze inspectie.
            </div>
          ) : (
            <div className="space-y-3">
              {findings.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  dimmed={onlineRepair && finding.statusCode === 'resolved'}
                  onClick={() => setSelected(finding.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {selected && (
        <FindingDetailModal
          findingId={selected}
          inspectionId={inspectionId}
          onlineRepair={onlineRepair}
          onClose={() => setSelected(null)}
          onShowDocuments={
            onNavigateTab
              ? () => {
                  setSelected(null);
                  onNavigateTab('documents');
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

function FindingCard({
  finding,
  dimmed,
  onClick,
}: {
  finding: Finding;
  dimmed: boolean;
  onClick: () => void;
}) {
  const resolution = finding.resolutions[0];
  const chips = Object.entries(finding.classificationValues ?? {});
  // B-401: de server levert `assetNode` ({id, name, description}) — er is geen `asset`
  // meer en geen `locationDescription` op de node. Defensief lezen: een ontbrekende
  // node mag de kaart nooit laten crashen.
  const location = finding.locationDescription ?? finding.assetNode?.description ?? null;
  const locationLine = [location, finding.assetNode?.name].filter(Boolean).join(' · ');

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'block w-full rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-colors hover:border-gray-300',
        dimmed && 'bg-gray-50 opacity-70',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {finding.normReference && (
            <p className="text-xs font-semibold text-gray-700">{finding.normReference}</p>
          )}
          <p className="text-sm font-medium text-gray-900">{finding.shortDescription}</p>
          {chips.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {chips.map(([key, value]) => (
                <span key={key} className="rounded bg-orange-50 px-1.5 py-0.5 text-[11px] text-orange-700">
                  {key}: {String(value)}
                </span>
              ))}
            </div>
          )}
          {locationLine && (
            <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {locationLine}
            </p>
          )}
        </div>
        <LookupBadge kind="finding-status-types" code={finding.statusCode} />
      </div>

      {resolution && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
          <LookupBadge kind="resolution-status-types" code={resolution.statusCode} />
          <span>Gemeld op {formatDate(resolution.resolvedAt)}</span>
        </div>
      )}
    </button>
  );
}
