import { useState } from 'react';
import {
  Button,
  Card,
  ErrorBox,
  Select,
  Spinner,
  StatusBadge,
  useConfirm,
  useToast,
} from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { AvailabilityExceptionType, EmploymentType } from '@/types';
import type { AvailabilityException, UserScheduleAssignment } from '@/types';
import { AVAILABILITY_EXCEPTION_TYPE, EMPLOYMENT_TYPE } from '@/lib/status';
import { formatDate } from '@/lib/format';
import {
  useUserSchedule,
  useAvailabilityExceptions,
  useUpdateEmploymentType,
  useDeleteScheduleAssignment,
  useDeleteAvailabilityException,
} from '@/pages/availability/hooks/use-availability';
import { ExceptionFormModal } from './exception-form-modal';
import { ScheduleAssignModal } from './schedule-assign-modal';
import { AvailabilityMonthPreview } from './availability-month-preview';
import { formatExceptionPeriod } from './format-availability';

interface UserAvailabilitySectionProps {
  userId: string;
  /** MANAGEMENT_ROLES: mag dienstvorm + weekschema + andermans uitzonderingen beheren. */
  canManage: boolean;
  /** Dienstvorm van de bekeken gebruiker (bekend bij management-weergave). */
  employmentType?: EmploymentType | null;
}

const EMPLOYMENT_OPTIONS = [
  { value: '', label: 'Niet ingesteld' },
  { value: EmploymentType.DIENSTVERBAND, label: 'Dienstverband' },
  { value: EmploymentType.FREELANCE, label: 'Freelance' },
];

/**
 * Herbruikbare beschikbaarheid-sectie voor één inspecteur (PRD-12 §12.8b/c).
 * Gebruikt op Gebruikers → tab "Beschikbaarheid" (management) en op
 * "Mijn beschikbaarheid" (inspecteur, `canManage=false`).
 */
export function UserAvailabilitySection({
  userId,
  canManage,
  employmentType,
}: UserAvailabilitySectionProps) {
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const canEditExceptions = canManage || currentUser?.id === userId;

  const [isExceptionOpen, setIsExceptionOpen] = useState(false);
  const [editingException, setEditingException] = useState<AvailabilityException | null>(null);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);

  const updateEmployment = useUpdateEmploymentType(userId);
  const deleteAssignment = useDeleteScheduleAssignment(userId);
  const deleteException = useDeleteAvailabilityException();

  const showWeekSchedule = employmentType === EmploymentType.DIENSTVERBAND;

  const { data: schedule, isLoading: scheduleLoading } = useUserSchedule(userId, {
    enabled: showWeekSchedule,
  });
  const {
    data: exceptions,
    isLoading: exceptionsLoading,
    error: exceptionsError,
  } = useAvailabilityExceptions({ userId });

  const handleEmploymentChange = async (value: string) => {
    try {
      await updateEmployment.mutateAsync((value || null) as EmploymentType | null);
      showToast('Dienstvorm bijgewerkt', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDeleteAssignment = async (assignment: UserScheduleAssignment) => {
    const ok = await confirm({
      title: 'Toewijzing verwijderen',
      message: 'Weet je zeker dat je deze toekomstige schema-toewijzing wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteAssignment.mutateAsync(assignment.id);
      showToast('Toewijzing verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDeleteException = async (exc: AvailabilityException) => {
    const ok = await confirm({
      title: 'Uitzondering verwijderen',
      message: 'Weet je zeker dat je deze uitzondering wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteException.mutateAsync(exc.id);
      showToast('Uitzondering verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const assignments = schedule ?? [];
  const now = Date.now();
  const current = assignments.find(
    (a) => !a.validUntil || new Date(a.validUntil).getTime() > now,
  );
  const exceptionList = exceptions ?? [];

  return (
    <div className="space-y-6">
      {/* Dienstvorm */}
      <Card>
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Dienstvorm</h3>
            <p className="mt-1 text-xs text-gray-500">
              Dienstverband = standaard beschikbaar volgens een weekschema. Freelance = standaard
              niet beschikbaar; beschikbaarheid wordt met uitzonderingen toegevoegd.
            </p>
          </div>
          {employmentType != null && (
            <StatusBadge map={EMPLOYMENT_TYPE} status={employmentType} />
          )}
        </div>

        <div className="mt-4 max-w-xs">
          {canManage ? (
            <Select
              label="Dienstvorm"
              options={EMPLOYMENT_OPTIONS}
              value={employmentType ?? ''}
              disabled={updateEmployment.isPending}
              onChange={(e) => handleEmploymentChange(e.target.value)}
            />
          ) : (
            <p className="text-sm text-gray-700">
              {employmentType != null
                ? EMPLOYMENT_TYPE[employmentType]?.label
                : 'De dienstvorm wordt door je organisatie beheerd.'}
            </p>
          )}
        </div>
      </Card>

      {/* Weekschema (alleen dienstverband + kijker mag schema lezen) */}
      {showWeekSchedule && (
        <Card>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Weekschema</h3>
            {canManage && (
              <Button size="sm" variant="secondary" onClick={() => setIsScheduleOpen(true)}>
                Schema wijzigen
              </Button>
            )}
          </div>

          {scheduleLoading ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : assignments.length === 0 ? (
            <p className="mt-3 text-sm text-gray-500">Nog geen weekschema toegewezen.</p>
          ) : (
            <div className="mt-4 space-y-2">
              {assignments.map((a) => {
                const isCurrent = a.id === current?.id;
                const isFuture = new Date(a.validFrom).getTime() > now;
                return (
                  <div
                    key={a.id}
                    className={`flex items-center justify-between rounded-lg border p-3 ${
                      isCurrent ? 'border-primary-200 bg-primary-50/40' : 'border-gray-200'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {a.template?.name ?? 'Onbekend schema'}
                        {isCurrent && (
                          <span className="ml-2 rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                            Actueel
                          </span>
                        )}
                        {isFuture && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                            Toekomstig
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        Vanaf {formatDate(a.validFrom)}
                        {a.validUntil ? ` t/m ${formatDate(a.validUntil)}` : ' (doorlopend)'}
                      </p>
                    </div>
                    {canManage && isFuture && (
                      <button
                        type="button"
                        onClick={() => handleDeleteAssignment(a)}
                        title="Verwijderen"
                        className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Uitzonderingen */}
      <Card>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Uitzonderingen</h3>
          {canEditExceptions && (
            <Button
              size="sm"
              onClick={() => {
                setEditingException(null);
                setIsExceptionOpen(true);
              }}
            >
              Uitzondering toevoegen
            </Button>
          )}
        </div>

        {exceptionsLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : exceptionsError ? (
          <ErrorBox>Kon de uitzonderingen niet laden.</ErrorBox>
        ) : exceptionList.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">Nog geen uitzonderingen vastgelegd.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {exceptionList.map((exc) => (
              <div
                key={exc.id}
                className="flex items-start justify-between rounded-lg border border-gray-200 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge map={AVAILABILITY_EXCEPTION_TYPE} status={exc.type} />
                    <span className="text-sm font-medium text-gray-900">
                      {formatExceptionPeriod(exc)}
                    </span>
                  </div>
                  {exc.reason && <p className="mt-1 text-xs text-gray-500">{exc.reason}</p>}
                </div>
                {canEditExceptions && (
                  <div className="ml-3 flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingException(exc);
                        setIsExceptionOpen(true);
                      }}
                      title="Bewerken"
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteException(exc)}
                      title="Verwijderen"
                      className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Maandkalender-preview */}
      <AvailabilityMonthPreview userId={userId} />

      {/* Modals */}
      <ExceptionFormModal
        isOpen={isExceptionOpen}
        onClose={() => {
          setIsExceptionOpen(false);
          setEditingException(null);
        }}
        userId={userId}
        exception={editingException}
      />
      <ScheduleAssignModal
        isOpen={isScheduleOpen}
        onClose={() => setIsScheduleOpen(false)}
        userId={userId}
      />
    </div>
  );
}
