import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { clsx } from 'clsx';
import { Button, Card, ErrorBox, Spinner, useToast } from '@/components/ui';
import { addressLine, formatDate, formatDateTime } from '@/lib/format';
import { getErrorMessage } from '@/lib/api-client';
import { hasRepairToken } from '@/lib/repair-token';
import {
  downloadRepairDeclarationPdf,
  useRepairSession,
  useRepairSessionExpiredRedirect,
} from './hooks/use-repair';
import { HerstelShell } from './components/herstel-shell';
import { RepairFindingCard } from './components/repair-finding-card';
import { RepairClaimModal } from './components/repair-claim-modal';
import type { RepairFindingView, RepairSummaryGroup } from '@/types';

/** Samenvattingskaart per classificatie-groep (kritieke groepen gemarkeerd). */
function SummaryCard({ group }: { group: RepairSummaryGroup }) {
  return (
    <div
      className={clsx(
        'rounded-xl border bg-white p-3 shadow-sm',
        group.isCritical ? 'border-danger-500/40 ring-1 ring-danger-500/20' : 'border-gray-200',
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: group.color }}
          aria-hidden
        />
        <span className="truncate text-sm font-semibold text-gray-900">{group.label}</span>
        {group.isCritical && (
          <svg
            className="h-4 w-4 shrink-0 text-danger-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-label="Kritieke groep"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
            />
          </svg>
        )}
      </div>
      <p className="mt-1.5 text-xs text-gray-600">
        <span className={clsx('font-semibold', group.openCount > 0 ? 'text-warning-600' : 'text-gray-500')}>
          {group.openCount} open
        </span>
        {' · '}
        <span className="font-semibold text-success-600">{group.resolvedCount} hersteld</span>
      </p>
    </div>
  );
}

/**
 * Herstel-overzicht (PRD §14.9.2): plan-kop, samenvattingskaarten per
 * classificatie-groep en de constateringenlijst met volgnummers. Sticky
 * "Afronden"-knop zodra er minimaal één eigen herstelmelding is.
 */
export default function HerstelOverzichtPage() {
  useRepairSessionExpiredRedirect();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data, isLoading, error } = useRepairSession();
  const [reportFinding, setReportFinding] = useState<RepairFindingView | null>(null);

  if (!hasRepairToken()) {
    return <Navigate to="/herstel" replace />;
  }

  if (isLoading || (!data && !error)) {
    return (
      <HerstelShell subtitle="Online herstel" wide>
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      </HerstelShell>
    );
  }

  if (error || !data) {
    return (
      <HerstelShell subtitle="Online herstel" wide>
        <ErrorBox>Kon het herstel-overzicht niet laden. Probeer het opnieuw.</ErrorBox>
      </HerstelShell>
    );
  }

  const { session, plan, summary, findings } = data;
  const sessionActive = session.status === 'ACTIVE';
  const myReportedCount = findings.filter((f) => f.repair?.isMine).length;

  const handleDownloadPdf = async () => {
    try {
      await downloadRepairDeclarationPdf();
    } catch (err) {
      showToast(getErrorMessage(err, 'Download mislukt'), 'error');
    }
  };

  return (
    <HerstelShell subtitle="Online herstel van constateringen" wide>
      <div className="space-y-5">
        {/* Plan-kop: adres, inspectiedatum, inspecteur-contact */}
        <Card>
          <div className="space-y-1.5">
            <h2 className="text-base font-semibold text-gray-900">{plan.projectName}</h2>
            <p className="text-sm text-gray-700">{addressLine(plan)}</p>
            <p className="text-sm text-gray-600">
              Rapportnummer: <span className="font-medium text-gray-900">{plan.referenceNumber ?? '—'}</span>
            </p>
            <p className="text-sm text-gray-600">
              Inspectiedatum: <span className="font-medium text-gray-900">{formatDate(plan.plannedDate)}</span>
            </p>
            {plan.inspector && (
              <div className="border-t border-gray-100 pt-2 text-sm text-gray-600">
                Inspecteur:{' '}
                <span className="font-medium text-gray-900">
                  {plan.inspector.firstName} {plan.inspector.lastName}
                </span>
                {plan.inspector.phone && (
                  <a href={`tel:${plan.inspector.phone}`} className="block text-primary-600 hover:underline">
                    {plan.inspector.phone}
                  </a>
                )}
                {plan.inspector.email && (
                  <a href={`mailto:${plan.inspector.email}`} className="block text-primary-600 hover:underline">
                    {plan.inspector.email}
                  </a>
                )}
              </div>
            )}
            {sessionActive && (
              <p className="text-xs text-gray-400">
                Sessie geldig tot {formatDateTime(session.expiresAt)}
              </p>
            )}
          </div>
        </Card>

        {/* Afgeronde sessie: verklaring ondertekend */}
        {session.status === 'COMPLETED' && (
          <div className="rounded-xl border border-success-500/30 bg-success-50 p-4">
            <h3 className="text-sm font-semibold text-gray-900">Herstelverklaring ondertekend</h3>
            <p className="mt-1 text-sm text-gray-700">
              Uw herstelverklaring is ondertekend{session.completedAt ? ` op ${formatDateTime(session.completedAt)}` : ''}.
              Deze sessie is afgerond; nieuwe meldingen zijn niet meer mogelijk.
            </p>
            <Button variant="secondary" className="mt-3" onClick={handleDownloadPdf}>
              Herstelverklaring downloaden (PDF)
            </Button>
          </div>
        )}

        {/* Samenvatting per classificatie-groep */}
        {summary.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-gray-900">Samenvatting</h3>
            <div className="grid grid-cols-2 gap-3">
              {summary.map((group) => (
                <SummaryCard key={group.code} group={group} />
              ))}
            </div>
          </div>
        )}

        {/* Constateringenlijst */}
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-900">
            Constateringen ({findings.length})
          </h3>
          {findings.length === 0 ? (
            <div className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
              Geen constateringen voor deze inspectie.
            </div>
          ) : (
            <div className="space-y-3">
              {findings.map((finding) => (
                <RepairFindingCard
                  key={finding.id}
                  finding={finding}
                  sessionActive={sessionActive}
                  onReport={setReportFinding}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sticky afronden-balk */}
      {sessionActive && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {myReportedCount === 0
                ? 'Nog geen meldingen door u'
                : `${myReportedCount} melding${myReportedCount === 1 ? '' : 'en'} door u`}
            </p>
            <Button
              size="lg"
              disabled={myReportedCount === 0}
              onClick={() => navigate('/herstel/afronden')}
            >
              Afronden
            </Button>
          </div>
        </div>
      )}

      {reportFinding && (
        <RepairClaimModal finding={reportFinding} onClose={() => setReportFinding(null)} />
      )}
    </HerstelShell>
  );
}
