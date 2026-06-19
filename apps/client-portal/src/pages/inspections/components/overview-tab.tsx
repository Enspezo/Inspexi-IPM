import { useState } from 'react';
import { clsx } from 'clsx';
import { Card, InfoField, LookupBadge, Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { contactName, personName, normTypeLabel } from '@/lib/labels';
import { ReinspectionRequestModal } from '@/pages/requests/components/reinspection-request-modal';
import type { InspectionDetail } from '@/types';
import type { InspectionTabKey } from '../inspection-detail-page';

const STEPS = [
  { code: 'planned', label: 'Gepland' },
  { code: 'in_progress', label: 'Uitgevoerd' },
  { code: 'pending_review', label: 'Ter review' },
  { code: 'approved', label: 'Goedgekeurd' },
  { code: 'completed', label: 'Afgerond' },
];

const ORDER = ['draft', 'planned', 'in_progress', 'pending_review', 'reviewed', 'approved', 'completed'];

interface OverviewTabProps {
  inspection: InspectionDetail;
  onNavigateTab: (tab: InspectionTabKey) => void;
}

export function OverviewTab({ inspection, onNavigateTab }: OverviewTabProps) {
  const [showReinspection, setShowReinspection] = useState(false);
  const currentIdx = ORDER.indexOf(inspection.statusCode);
  const isCancelled = inspection.statusCode === 'cancelled';
  const counts = inspection.findingCounts;
  const hasOpenFindings = counts.open > 0;

  return (
    <div className="space-y-6">
      <Card title="Status">
        {isCancelled ? (
          <div className="flex items-center gap-2 text-sm text-danger-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Deze inspectie is geannuleerd.
          </div>
        ) : (
          <div className="flex items-center">
            {STEPS.map((step, i) => {
              const stepIdx = ORDER.indexOf(step.code);
              const done = currentIdx >= stepIdx;
              const current = currentIdx === stepIdx;
              return (
                <div key={step.code} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={clsx(
                        'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                        done ? 'bg-primary-600 text-white' : 'bg-gray-200 text-gray-500',
                      )}
                    >
                      {done ? '✓' : i + 1}
                    </div>
                    <span
                      className={clsx(
                        'mt-1 whitespace-nowrap text-[11px]',
                        current ? 'font-semibold text-primary-700' : 'text-gray-500',
                      )}
                    >
                      {step.label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={clsx('mx-1 h-0.5 flex-1', currentIdx > stepIdx ? 'bg-primary-600' : 'bg-gray-200')} />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card title="Details">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoField label="Status" value={<LookupBadge kind="plan-status-types" code={inspection.statusCode} />} />
          <InfoField label="Rapportnummer" value={inspection.referenceNumber} />
          <InfoField
            label="Type inspectie"
            value={<LookupBadge kind="inspection-types" code={inspection.inspectionTypeCode} />}
          />
          <InfoField label="Norm" value={normTypeLabel(inspection.normTypeCode)} />
          <InfoField label="Inspectiedatum" value={formatDate(inspection.plannedDate)} />
          <InfoField
            label="Inspecteur"
            value={inspection.assignedUser ? personName(inspection.assignedUser) : null}
          />
          <InfoField label="Reviewer" value={inspection.reviewer ? personName(inspection.reviewer) : null} />
          <InfoField
            label="Installatieverantwoordelijke"
            value={inspection.installationResponsible ? personName(inspection.installationResponsible) : null}
          />
          <InfoField label="Opdrachtgever" value={contactName(inspection.contact)} />
          <InfoField
            label="Afgerond op"
            value={inspection.completedAt ? formatDate(inspection.completedAt) : null}
          />
        </dl>
        {inspection.description && (
          <div className="mt-4 border-t border-gray-100 pt-4">
            <dt className="text-sm font-medium text-gray-500">Omschrijving</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-gray-900">{inspection.description}</dd>
          </div>
        )}
      </Card>

      {counts.total > 0 && (
        <div
          className={clsx(
            'rounded-xl border p-4',
            hasOpenFindings ? 'border-warning-500/30 bg-warning-50' : 'border-success-500/30 bg-success-50',
          )}
        >
          <h3 className="text-sm font-semibold text-gray-900">
            {hasOpenFindings ? 'Constateringen gevonden' : 'Alle constateringen opgelost'}
          </h3>
          <p className="mt-1 text-sm text-gray-700">
            {counts.total} constatering{counts.total === 1 ? '' : 'en'} totaal
            {hasOpenFindings ? ` · ${counts.open} openstaand · ${counts.resolved} opgelost` : ''}
          </p>
          <button
            type="button"
            onClick={() => onNavigateTab('findings')}
            className="mt-2 text-sm font-medium text-primary-600 hover:underline"
          >
            Constateringen bekijken →
          </button>
        </div>
      )}

      {inspection.statusCode === 'completed' && (
        <div>
          <Button variant="secondary" onClick={() => setShowReinspection(true)}>
            Herinspectie aanvragen
          </Button>
        </div>
      )}

      {showReinspection && (
        <ReinspectionRequestModal
          inspectionPlanId={inspection.id}
          projectName={inspection.projectName}
          onClose={() => setShowReinspection(false)}
        />
      )}
    </div>
  );
}
