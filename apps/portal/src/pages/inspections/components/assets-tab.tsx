// Assets-tab van de inspectie-detailpagina. Bron van waarheid = de dedicated
// lijst-endpoint (GET /inspection-plans/:id/assets?flat=true), net als de
// plattegrond. Per asset zijn de bevindingen uitklapbaar (GET /assets/:id/findings),
// en daaronder de ingevulde meetstaten (GET /measurement-sheet-records?assetId=…).
import { useState } from 'react';
import { Card, Spinner, LookupBadge, StatusBadge } from '@/components/ui';
import { MEASUREMENT_SHEET_RECORD_STATUS } from '@/lib/status';
import { formatDate } from '@/lib/format';
import type {
  Asset,
  MeasurementSheetRecord,
  MeasurementSheetSnapshotField,
} from '@/types';
import { useAssetFindings } from '../hooks/use-location-images';
import { useAssetMeasurementRecords } from '../hooks/use-measurement-records';
import { useMeetmiddelen } from '@/pages/meetmiddelen/hooks/use-meetmiddelen';

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
        <div className="ml-6 mt-3 space-y-4">
          {/* Bevindingen (ongewijzigd) */}
          <div>
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

          {/* Meetstaten (nieuw) — mount alleen bij open, dus hook laadt lazy */}
          <AssetMeasurementRecords assetId={asset.id} />
        </div>
      )}
    </li>
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

// ── Read-only weergave van de ingevulde waarden per sectie/rij/veld ──
/** Read-only weergave van de gebruikte meetmiddelen (snapshot-first, anders live-lookup). */
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
