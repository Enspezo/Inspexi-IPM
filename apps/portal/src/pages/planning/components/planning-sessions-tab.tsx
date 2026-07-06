import { useState } from 'react';
import { AcceptanceStatus, SessionStatus } from '@/types';
import type { PlanningSession } from '@/types';
import { Button, useConfirm, useToast } from '@/components/ui';
import { SESSION_STATUS, getStatusConfig } from '@/lib/status';
import {
  useUpdatePlanningSession,
  useCancelSession,
  useAcceptSession,
  useConfirmSession,
  useCompleteSession,
} from '../hooks/use-planning-sessions';
import { toDatetimeLocal } from './planning-detail-shared';
import { getErrorMessage } from '@/lib/api-client';

export function SessionsTab({
  sessions,
  userId,
  userCanWrite,
  onOpenReject,
  onOpenReschedule,
  onAddSession,
  isAddingSession,
  planningItemId,
}: {
  sessions: PlanningSession[];
  userId?: string;
  userCanWrite: boolean;
  onOpenReject: (id: string) => void;
  onOpenReschedule: (id: string) => void;
  onAddSession: () => void;
  isAddingSession: boolean;
  planningItemId: string;
}) {
  const totalSessions = sessions.length;

  return (
    <div className="space-y-4">
      {sessions.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Nog geen sessies aangemaakt</p>
      ) : (
        sessions.map((session) => (
          <SessionCard
            key={session.id}
            session={session}
            totalSessions={totalSessions}
            userId={userId}
            userCanWrite={userCanWrite}
            onOpenReject={() => onOpenReject(session.id)}
            onOpenReschedule={() => onOpenReschedule(session.id)}
            planningItemId={planningItemId}
          />
        ))
      )}
      {userCanWrite && (
        <div className="flex justify-end mt-4">
          <Button variant="secondary" size="sm" onClick={onAddSession} disabled={isAddingSession}>
            + Sessie toevoegen
          </Button>
        </div>
      )}
    </div>
  );
}

function SessionCard({
  session,
  totalSessions,
  userId,
  userCanWrite,
  onOpenReject,
  onOpenReschedule,
  planningItemId,
}: {
  session: PlanningSession;
  totalSessions: number;
  userId?: string;
  userCanWrite: boolean;
  onOpenReject: () => void;
  onOpenReschedule: () => void;
  planningItemId: string;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesValue, setNotesValue] = useState(session.notes ?? '');
  const [dateEditOpen, setDateEditOpen] = useState(false);
  const [dateEditValue, setDateEditValue] = useState('');
  const { showToast } = useToast();
  const confirm = useConfirm();
  const updateSession = useUpdatePlanningSession(planningItemId, session.id);
  const acceptSessionMut = useAcceptSession(planningItemId, session.id);
  const confirmSessionMut = useConfirmSession(planningItemId, session.id);
  const completeSessionMut = useCompleteSession(planningItemId, session.id);
  const cancelSessionMut = useCancelSession(planningItemId, session.id);

  const mySessionInspector = session.sessionInspectors?.find(si => si.userId === userId);
  const canActAsInspector = mySessionInspector?.acceptanceStatus === AcceptanceStatus.PENDING;

  const { classes: statusColor, label: statusLabel } = getStatusConfig(SESSION_STATUS, session.status);

  const scheduledDate = session.scheduledDate ? new Date(session.scheduledDate) : null;
  const dateStr = scheduledDate
    ? scheduledDate.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : 'Datum nog niet bepaald';
  const timeStr = scheduledDate
    ? scheduledDate.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : '';

  const handleSaveNotes = async () => {
    try {
      await updateSession.mutateAsync({ notes: notesValue || null });
      setNotesOpen(false);
      showToast('Notitie opgeslagen', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleOpenDateEdit = () => {
    setDateEditValue(toDatetimeLocal(session.scheduledDate));
    setDateEditOpen(true);
  };

  const handleSaveDate = async () => {
    try {
      await updateSession.mutateAsync({
        scheduledDate: dateEditValue ? new Date(dateEditValue).toISOString() : null,
      });
      setDateEditOpen(false);
      showToast('Datum opgeslagen', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleAccept = async () => {
    try {
      await acceptSessionMut.mutateAsync(undefined);
      showToast('Sessie geaccepteerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleConfirm = async () => {
    try {
      await confirmSessionMut.mutateAsync(undefined);
      showToast('Sessie bevestigd als definitief', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleComplete = async () => {
    try {
      await completeSessionMut.mutateAsync(undefined);
      showToast('Sessie afgerond', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleCancel = async () => {
    const confirmed = await confirm({
      title: 'Sessie annuleren',
      message: 'Weet u zeker dat u deze sessie wilt annuleren?',
      confirmLabel: 'Annuleren',
      cancelLabel: 'Terug',
    });
    if (!confirmed) return;
    try {
      await cancelSessionMut.mutateAsync(undefined);
      showToast('Sessie geannuleerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">
            Sessie {session.sessionNumber} van {totalSessions}
          </span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColor}`}>
            {statusLabel}
          </span>
          {session.originalDate && (
            <span className="text-xs text-amber-600">
              Verzet (was {new Date(session.originalDate).toLocaleDateString('nl-NL')})
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Date/time/duration */}
        {dateEditOpen ? (
          <div className="space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Datum &amp; tijd</label>
              <input
                type="datetime-local"
                value={dateEditValue}
                onChange={(e) => setDateEditValue(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveDate} disabled={updateSession.isPending}>Opslaan</Button>
              <Button size="sm" variant="secondary" onClick={() => setDateEditOpen(false)}>Annuleren</Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span className={scheduledDate ? 'font-medium' : 'font-medium text-amber-600'}>{dateStr}</span>
            {timeStr && <span className="text-gray-500"> · {timeStr}</span>}
            {session.durationHours && (
              <span className="text-gray-500"> · {session.durationHours} uur</span>
            )}
            {userCanWrite && (session.status === SessionStatus.NOG_TE_PLANNEN || session.status === SessionStatus.CONCEPT) && (
              <button
                onClick={handleOpenDateEdit}
                className="text-xs text-blue-600 hover:text-blue-800 underline ml-1"
              >
                {scheduledDate ? 'Wijzigen' : 'Datum instellen'}
              </button>
            )}
          </div>
        )}

        {/* Notes */}
        {notesOpen ? (
          <div className="space-y-2">
            <textarea
              value={notesValue}
              onChange={(e) => setNotesValue(e.target.value)}
              rows={2}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optionele notitie voor deze sessie..."
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveNotes} disabled={updateSession.isPending}>Opslaan</Button>
              <Button size="sm" variant="secondary" onClick={() => { setNotesOpen(false); setNotesValue(session.notes ?? ''); }}>Annuleren</Button>
            </div>
          </div>
        ) : (
          <div
            className="text-sm text-gray-500 italic cursor-pointer hover:text-gray-700 min-h-[1.5rem]"
            onClick={() => setNotesOpen(true)}
          >
            {session.notes || <span className="text-gray-300">Notitie toevoegen...</span>}
          </div>
        )}

        {/* Inspectors */}
        {session.sessionInspectors && session.sessionInspectors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {session.sessionInspectors.map((si) => (
              <div key={si.id} className="flex items-center gap-1.5">
                <div
                  className="h-7 w-7 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                  style={{ backgroundColor: si.user?.color ?? '#6B7280' }}
                  title={`${si.user?.firstName} ${si.user?.lastName}`}
                >
                  {si.user?.initials ?? `${si.user?.firstName?.[0] ?? ''}${si.user?.lastName?.[0] ?? ''}`}
                </div>
                <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium ${
                  si.acceptanceStatus === AcceptanceStatus.ACCEPTED ? 'bg-green-100 text-green-800' :
                  si.acceptanceStatus === AcceptanceStatus.REJECTED ? 'bg-red-100 text-red-800' :
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {si.acceptanceStatus === AcceptanceStatus.ACCEPTED ? '✓' :
                   si.acceptanceStatus === AcceptanceStatus.REJECTED ? '✗' : '…'}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {/* Inspector: accept/reject own session */}
          {canActAsInspector && (
            <>
              <Button size="sm" onClick={handleAccept} disabled={acceptSessionMut.isPending}>Accepteren</Button>
              <Button size="sm" variant="secondary" onClick={onOpenReject}>Weigeren</Button>
            </>
          )}

          {/* Planner actions */}
          {userCanWrite && session.status === SessionStatus.CONCEPT && (
            <Button size="sm" variant="secondary" onClick={handleConfirm} disabled={confirmSessionMut.isPending}>Bevestigen</Button>
          )}
          {userCanWrite && (session.status === SessionStatus.NOG_TE_PLANNEN || session.status === SessionStatus.CONCEPT || session.status === SessionStatus.DEFINITIEF) && (
            <Button size="sm" variant="secondary" onClick={onOpenReschedule}>Verzetten</Button>
          )}
          {userCanWrite && session.status === SessionStatus.DEFINITIEF && (
            <Button size="sm" variant="secondary" onClick={handleComplete} disabled={completeSessionMut.isPending}>Afronden</Button>
          )}
          {userCanWrite && (session.status === SessionStatus.NOG_TE_PLANNEN || session.status === SessionStatus.CONCEPT) && (
            <Button size="sm" variant="danger" onClick={handleCancel} disabled={cancelSessionMut.isPending}>Annuleren</Button>
          )}
        </div>
      </div>
    </div>
  );
}
