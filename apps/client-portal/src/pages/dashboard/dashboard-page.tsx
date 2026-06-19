import { Link } from 'react-router-dom';
import { useDashboard } from '@/pages/inspections/hooks/use-inspections';
import { useClientAuth } from '@/providers/client-auth-provider';
import { Spinner, Card, LookupBadge, ErrorBox } from '@/components/ui';
import { addressLine, formatDate } from '@/lib/format';
import { normTypeLabel, documentTypeLabel } from '@/lib/labels';
import type { InspectionListItem } from '@/types';

export default function DashboardPage() {
  const { user } = useClientAuth();
  const { data, isLoading, error } = useDashboard();

  const pending = data?.pendingSignatures ?? [];
  const openFindings = data?.openFindingsCount ?? 0;
  const showActions = pending.length > 0 || openFindings > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Welkom, {user?.firstName}</h1>
        <p className="mt-1 text-sm text-gray-600">Uw inspecties en acties in één overzicht.</p>
      </div>

      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      )}

      {error && <ErrorBox>Kon het dashboard niet laden. Probeer het later opnieuw.</ErrorBox>}

      {data && (
        <>
          {showActions && (
            <div className="rounded-xl border border-warning-500/30 bg-warning-50 p-4">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-warning-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-sm font-semibold text-gray-900">Actie vereist</h2>
              </div>
              <div className="mt-3 space-y-2">
                {pending.map((sig) => (
                  <Link
                    key={sig.signatureId}
                    to={`/documents/${sig.documentId}`}
                    className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <span className="text-gray-700">
                      {documentTypeLabel(sig.documentType)} ondertekenen — {sig.projectName}
                      {sig.city ? `, ${sig.city}` : ''}
                    </span>
                    <span className="font-medium text-primary-600">Bekijk →</span>
                  </Link>
                ))}
                {openFindings > 0 && (
                  <Link
                    to="/inspections"
                    className="flex items-center justify-between rounded-lg bg-white px-4 py-3 text-sm shadow-sm transition-colors hover:bg-gray-50"
                  >
                    <span className="text-gray-700">
                      {openFindings} openstaande constatering{openFindings === 1 ? '' : 'en'}
                    </span>
                    <span className="font-medium text-primary-600">Bekijk →</span>
                  </Link>
                )}
              </div>
            </div>
          )}

          <Card title="Recente inspecties">
            {data.recentInspections.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">Nog geen inspecties gevonden.</p>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.recentInspections.map((inspection) => (
                  <RecentRow key={inspection.id} inspection={inspection} />
                ))}
              </div>
            )}
          </Card>

          <div className="flex flex-wrap gap-3">
            <Link
              to="/inspections"
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
            >
              Alle inspecties bekijken
            </Link>
            <Link
              to="/requests/new"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              Nieuwe opdracht aanvragen
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function RecentRow({ inspection }: { inspection: InspectionListItem }) {
  return (
    <Link
      to={`/inspections/${inspection.id}`}
      className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-gray-900">{inspection.projectName}</p>
        <p className="truncate text-xs text-gray-500">{addressLine(inspection)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="hidden text-xs text-gray-500 sm:block">{normTypeLabel(inspection.normTypeCode)}</span>
        <span className="hidden text-xs text-gray-500 md:block">{formatDate(inspection.plannedDate)}</span>
        <LookupBadge kind="plan-status-types" code={inspection.statusCode} />
      </div>
    </Link>
  );
}
