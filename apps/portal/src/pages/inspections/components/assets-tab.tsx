// Assets-tab van de inspectie-detailpagina. Bron van waarheid = de geünificeerde
// planboom (GET /inspection-plans/:planId/tree); LOCATION-nodes binnen de scope
// worden gemarkeerd. Nieuwe objecten via POST /inspection-plans/:planId/asset-nodes
// (server kiest de default-parent; de ouder-selector is voorgevuld + bewerkbaar).
// Bij het selecteren van een ASSET-node tonen we zijn bevindingen + meetstaten.
import { useMemo, useState } from 'react';
import { Card, Spinner, LookupBadge, StatusBadge } from '@/components/ui';
import { MEASUREMENT_SHEET_RECORD_STATUS } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { AssetNodeType } from '@/types';
import type { MeasurementSheetRecord, MeasurementSheetSnapshotField } from '@/types';
import { TreeExplorer, normalizeTree, type TreeNode } from '@/components/asset-tree';
import { usePlanTree, useScopeLocations } from '../hooks/use-asset-nodes';
import { useAssetFindings } from '../hooks/use-location-images';
import { useAssetMeasurementRecords } from '../hooks/use-measurement-records';
import { useMeetmiddelen } from '@/pages/meetmiddelen/hooks/use-meetmiddelen';
import { ScopeLocationsManager } from './scope-locations-manager';

export function AssetsTab({ planId, canWrite }: { planId: string; canWrite: boolean }) {
  const { data: treeData, isLoading } = usePlanTree(planId);
  const { scopeLocations } = useScopeLocations(planId);
  const [selected, setSelected] = useState<TreeNode | null>(null);

  const tree = useMemo(() => normalizeTree(treeData), [treeData]);
  const rootId = tree[0]?.id ?? null;
  // Default-parent voor nieuwe objecten: de primaire scope-locatie, anders de root.
  const primaryScopeId = scopeLocations.find((s) => s.isPrimary)?.assetNodeId ?? null;
  const defaultParentId = primaryScopeId ?? rootId;

  return (
    <div className="space-y-4">
      <ScopeLocationsManager planId={planId} canWrite={canWrite} />

      <Card title="Objectboom">
        <TreeExplorer
          nodes={treeData}
          isLoading={isLoading}
          canWrite={canWrite}
          planId={planId}
          defaultParentId={defaultParentId}
          defaultNodeType={AssetNodeType.ASSET}
          highlightInScope
          selectedId={selected?.id ?? null}
          onSelect={setSelected}
          emptyMessage="Dit inspectieplan heeft nog geen objecten of locaties."
        />
      </Card>

      {selected && selected.nodeType === AssetNodeType.ASSET && (
        <Card title={`Object: ${selected.name}`}>
          <NodeExecutionDetail nodeId={selected.id} />
        </Card>
      )}
    </div>
  );
}

// ── Bevindingen + meetstaten van één geselecteerde ASSET-node ──
function NodeExecutionDetail({ nodeId }: { nodeId: string }) {
  const { data: findings, isLoading } = useAssetFindings(nodeId);

  return (
    <div className="space-y-5">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Bevindingen
        </h4>
        {isLoading ? (
          <div className="flex justify-center py-3">
            <Spinner size="sm" />
          </div>
        ) : findings && findings.length > 0 ? (
          <ul className="space-y-2">
            {findings.map((f) => (
              <li key={f.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
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
          <p className="py-1 text-sm text-gray-500">Geen bevindingen voor dit object.</p>
        )}
      </div>

      <AssetMeasurementRecords assetId={nodeId} />
    </div>
  );
}

// ── Meetstaten van één asset ──
function AssetMeasurementRecords({ assetId }: { assetId: string }) {
  const { data: records, isLoading } = useAssetMeasurementRecords(assetId);

  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
        Meetstaten
      </h4>
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Spinner size="sm" />
        </div>
      ) : records && records.length > 0 ? (
        <ul className="space-y-2">
          {records.map((record) => (
            <MeasurementRecordRow key={record.id} record={record} />
          ))}
        </ul>
      ) : (
        <p className="py-1 text-sm text-gray-500">Geen meetstaten ingevuld.</p>
      )}
    </div>
  );
}

// ── Eén meetstaat-record: kop (template + status + pass/fail) en uitklapbare waarden ──
function MeasurementRecordRow({ record }: { record: MeasurementSheetRecord }) {
  const [open, setOpen] = useState(false);
  const templateName = record.templateSnapshot?.name ?? record.template?.name ?? 'Meetstaat';
  const version =
    record.templateSnapshot?.version ?? record.template?.version ?? record.templateVersion;

  return (
    <li className="rounded-lg border border-gray-100 bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={open}
      >
        <div className="flex min-w-0 items-center gap-2">
          <svg
            className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {templateName}{' '}
              {version && <span className="font-normal text-gray-400">v{version}</span>}
            </p>
            {record.completedAt && (
              <p className="text-xs text-gray-500">Afgerond op {formatDate(record.completedAt)}</p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <FinalCheckBadge passed={record.finalCheckPassed} />
          <StatusBadge map={MEASUREMENT_SHEET_RECORD_STATUS} status={record.status} />
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2">
          <MeasurementRecordValues record={record} />
        </div>
      )}
    </li>
  );
}

// ── Pass/fail-indicatie op recordniveau (finalCheckPassed) ──
function FinalCheckBadge({ passed }: { passed: boolean | null }) {
  const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (passed === true) {
    return <span className={`${pill} bg-green-100 text-green-800`}>Geslaagd</span>;
  }
  if (passed === false) {
    return <span className={`${pill} bg-red-100 text-red-800`}>Afgekeurd</span>;
  }
  return <span className={`${pill} bg-gray-100 text-gray-600`}>n.v.t.</span>;
}

// ── Read-only weergave van de gebruikte meetmiddelen (snapshot-first, anders live-lookup). ──
function UsedInstrumentsBlock({ record }: { record: MeasurementSheetRecord }) {
  const { data: list } = useMeetmiddelen({ limit: 200 });
  const snapshot = (record.data as Record<string, unknown> | null)?.__usedInstrumentsSnapshot as
    | Array<{ code: string; brand: string; type: string }>
    | undefined;
  const ids = record.usedInstrumentIds ?? [];
  if ((!snapshot || snapshot.length === 0) && ids.length === 0) return null;

  const byId = new Map((list?.data ?? []).map((m) => [m.id, m]));
  const labels =
    snapshot && snapshot.length > 0
      ? snapshot.map((s) => `${s.code} — ${s.brand} ${s.type}`)
      : ids.map((id) => {
          const m = byId.get(id);
          return m ? `${m.code} — ${m.brand} ${m.type}` : 'Onbekend meetmiddel';
        });

  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-gray-700">Gebruikte meetmiddelen</p>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((label, i) => (
          <span key={i} className="rounded-md bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function MeasurementRecordValues({ record }: { record: MeasurementSheetRecord }) {
  const sections = record.templateSnapshot?.sections ?? [];
  const data = record.data ?? {};
  const failedChecks = (record.finalCheckResults?.results ?? []).filter((r) => !r.passed);

  if (sections.length === 0) {
    return <p className="py-1 text-sm text-gray-500">Geen velden in deze meetstaat.</p>;
  }

  return (
    <div className="space-y-3">
      {failedChecks.length > 0 && (
        <ul className="space-y-1">
          {failedChecks.map((check, i) => (
            <li
              key={`${check.ruleType}-${i}`}
              className="rounded-md bg-red-50 px-2 py-1 text-xs text-red-700"
            >
              {check.message ?? 'Eindcontrole niet geslaagd'}
            </li>
          ))}
        </ul>
      )}

      <UsedInstrumentsBlock record={record} />

      {sections.map((section) => {
        const rows = data[section.code] ?? {};
        const rowKeys = Object.keys(rows).sort((a, b) => Number(a) - Number(b));
        return (
          <div key={section.code}>
            <p className="mb-1 text-xs font-semibold text-gray-700">{section.name}</p>
            {rowKeys.length === 0 ? (
              <p className="text-xs text-gray-400">Niet ingevuld</p>
            ) : (
              <div className="space-y-2">
                {rowKeys.map((rowKey, rowIdx) => (
                  <div key={rowKey} className="rounded-md bg-white px-3 py-2">
                    {section.isRepeating && (
                      <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-gray-300">
                        Rij {rowIdx + 1}
                      </p>
                    )}
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
                      {section.fields.map((field) => (
                        <FieldValueRow
                          key={field.code}
                          field={field}
                          value={rows[rowKey]?.[field.code]?.value}
                          passFail={rows[rowKey]?.[field.code]?.passFail ?? null}
                        />
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Eén veld: label, waarde (+eenheid) en optionele pass/fail-pill ──
function FieldValueRow({
  field,
  value,
  passFail,
}: {
  field: MeasurementSheetSnapshotField;
  value: unknown;
  passFail: 'pass' | 'fail' | null;
}) {
  const display = formatFieldValue(value);
  const showUnit = field.unit && display !== '—';

  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-gray-500">{field.name}</dt>
      <dd className="flex items-center gap-1.5 text-right text-xs font-medium text-gray-900">
        <span>
          {display}
          {showUnit ? ` ${field.unit}` : ''}
        </span>
        {passFail === 'pass' && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[11px] font-medium text-green-700">
            Geslaagd
          </span>
        )}
        {passFail === 'fail' && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-medium text-red-700">
            Afgekeurd
          </span>
        )}
      </dd>
    </div>
  );
}

/** Veldwaarde → leesbare string (nl-NL getallen, Ja/Nee, '—' voor leeg). */
function formatFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nee';
  if (typeof value === 'number') return new Intl.NumberFormat('nl-NL').format(value);
  if (typeof value === 'string') return value;
  return '—';
}
