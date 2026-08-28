import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Role, TimesheetStatus } from '@/types';
import type { TimeEntry } from '@/types';
import {
  Button,
  Card,
  ErrorBox,
  Modal,
  Spinner,
  StatusBadge,
  useToast,
} from '@/components/ui';
import { TIMESHEET_STATUS, TIME_ACTIVITY, TIME_ENTRY_SOURCE, TIME_ACTIVITY_LABELS } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { HistorySidebarSection } from '@/components/layout/sidebar-sections';
import { useAuth } from '@/providers/auth-provider';
import {
  formatMinutes,
  useApproveTimesheet,
  useRejectTimesheet,
  useTimesheet,
} from './hooks/use-time-tracking';
import { EditTimeEntryModal } from './components/edit-time-entry-modal';

const reviewRoles = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER];

const timeFmt = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit' });

export default function TimesheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: timesheet, isLoading, error } = useTimesheet(id!);
  const approveMutation = useApproveTimesheet(id!);
  const rejectMutation = useRejectTimesheet(id!);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [editEntry, setEditEntry] = useState<TimeEntry | null>(null);

  const canReview =
    !!user &&
    user.roles.some((r) => reviewRoles.includes(r)) &&
    timesheet?.status === TimesheetStatus.INGEDIEND;

  // Regels per dag groeperen (lokale datum van startedAt).
  const entriesByDay = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of timesheet?.entries ?? []) {
      const key = new Date(entry.startedAt).toDateString();
      map.set(key, [...(map.get(key) ?? []), entry]);
    }
    return [...map.entries()];
  }, [timesheet?.entries]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }
  if (error || !timesheet) {
    return <ErrorBox>Weekstaat niet gevonden</ErrorBox>;
  }

  const handleApprove = () => {
    approveMutation.mutate(undefined, {
      onSuccess: () => showToast('Weekstaat goedgekeurd', 'success'),
    });
  };

  const handleReject = () => {
    rejectMutation.mutate(rejectNote, {
      onSuccess: () => {
        showToast('Weekstaat afgewezen', 'success');
        setRejectOpen(false);
        setRejectNote('');
      },
      // Foutmelding komt van de gedeelde `useApiMutation`-default; een eigen
      // onError hier zou een tweede toast opleveren.
    });
  };

  const totals = timesheet.totals;

  return (
    <DetailPageLayout
      sidebar={<HistorySidebarSection entityType="Timesheet" entityId={timesheet.id} />}
    >
      <div className="space-y-6">
        <div>
          <Link to="/timesheets" className="text-sm text-primary-600 hover:underline">
            ← Terug naar weekstaten
          </Link>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Week {timesheet.weekNumber} — {timesheet.year}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {timesheet.user
                ? `${timesheet.user.firstName} ${timesheet.user.lastName}`.trim()
                : '—'}
              {timesheet.submittedAt && <> · ingediend op {formatDate(timesheet.submittedAt)}</>}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge map={TIMESHEET_STATUS} status={timesheet.status} />
            {canReview && (
              <>
                <Button variant="secondary" onClick={() => setRejectOpen(true)}>
                  Afwijzen
                </Button>
                <Button onClick={handleApprove} isLoading={approveMutation.isPending}>
                  Goedkeuren
                </Button>
              </>
            )}
          </div>
        </div>

        {timesheet.status === TimesheetStatus.AFGEWEZEN && timesheet.reviewNote && (
          <ErrorBox>
            Afgewezen{timesheet.reviewedBy && (
              <> door {timesheet.reviewedBy.firstName} {timesheet.reviewedBy.lastName}</>
            )}: {timesheet.reviewNote}
          </ErrorBox>
        )}

        {/* Totalen per activiteit */}
        <Card>
          <div className="flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Totaal</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-900">
                {formatMinutes(totals?.totalMinutes ?? 0)}
              </dd>
            </div>
            {Object.entries(totals?.byActivity ?? {}).map(([activity, minutes]) => (
              <div key={activity}>
                <dt className="text-sm font-medium text-gray-500">
                  {TIME_ACTIVITY_LABELS[activity] ?? activity}
                </dt>
                <dd className="mt-1 text-lg text-gray-900">{formatMinutes(minutes)}</dd>
              </div>
            ))}
          </div>
        </Card>

        {/* Regels per dag */}
        {entriesByDay.length === 0 && (
          <Card>
            <p className="text-sm text-gray-500">Deze weekstaat bevat nog geen urenregels.</p>
          </Card>
        )}
        {entriesByDay.map(([dayKey, entries]) => (
          <Card key={dayKey}>
            <h2 className="mb-3 text-sm font-semibold text-gray-700">
              {formatDate(entries[0].startedAt)}
            </h2>
            <ul className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-3 py-2">
                  <span className="w-24 shrink-0 text-sm tabular-nums text-gray-600">
                    {timeFmt.format(new Date(entry.startedAt))}
                    {' – '}
                    {entry.endedAt ? timeFmt.format(new Date(entry.endedAt)) : '…'}
                  </span>
                  <StatusBadge map={TIME_ACTIVITY} status={entry.activityType} />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-900">
                    {entry.project
                      ? `${entry.project.projectNumber} — ${entry.project.title}`
                      : entry.needsProjectAssignment
                        ? 'Nog toe te wijzen'
                        : '—'}
                    {entry.notes && <span className="text-gray-500"> · {entry.notes}</span>}
                  </span>
                  {entry.needsProjectAssignment && (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      Toewijzen
                    </span>
                  )}
                  <StatusBadge map={TIME_ENTRY_SOURCE} status={entry.source} />
                  {entry.correctedBy && (
                    <span
                      className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
                      title={`Gecorrigeerd door ${entry.correctedBy.firstName} ${entry.correctedBy.lastName}`}
                    >
                      Gecorrigeerd
                    </span>
                  )}
                  <span className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-gray-900">
                    {formatMinutes(entry.durationMinutes)}
                  </span>
                  {timesheet.status !== TimesheetStatus.GOEDGEKEURD &&
                    user?.roles.some((r) => reviewRoles.includes(r)) && (
                      <Button variant="secondary" size="sm" onClick={() => setEditEntry(entry)}>
                        Corrigeren
                      </Button>
                    )}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      {rejectOpen && (
        <Modal isOpen={rejectOpen} onClose={() => setRejectOpen(false)} title="Weekstaat afwijzen">
          <div className="space-y-4">
            <label className="block text-sm font-medium text-gray-700" htmlFor="reject-note">
              Toelichting voor de inspecteur
            </label>
            <textarea
              id="reject-note"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              rows={4}
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Bijv. reistijd op dinsdag lijkt dubbel geregistreerd"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejectOpen(false)}>
                Annuleren
              </Button>
              <Button
                onClick={handleReject}
                disabled={rejectNote.trim().length < 3}
                isLoading={rejectMutation.isPending}
              >
                Afwijzen
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editEntry && (
        <EditTimeEntryModal
          key={editEntry.id}
          entry={editEntry}
          isOpen={!!editEntry}
          onClose={() => setEditEntry(null)}
        />
      )}
    </DetailPageLayout>
  );
}
