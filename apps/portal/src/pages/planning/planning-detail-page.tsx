import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { PlanningStatus, AcceptanceStatus, SessionStatus, DocumentEntityType, TaskEntityType, TaskStatus, Role } from '@/types';
import type { PlanningFollower, ContactPerson, Task, PlanningSession } from '@/types';
import {
  ActionMenu,
  Button,
  Spinner,
  Card,
  Modal,
  Input,
  useToast,
} from '@/components/ui';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { DocumentsSection } from '@/components/documents/documents-section';
import { UploadDocumentModal } from '@/components/documents';
import { useAuth } from '@/providers/auth-provider';
import { useTasks, useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { useContactPersons, useContacts, useContactLocations, useAddContactPerson } from '@/pages/contacts/hooks/use-contacts';
import {
  usePlanningItem,
  useCreatePlanningItem,
  useUpdatePlanningItem,
  useCompletePlanningItem,
  useReschedulePlanningItem,
  useSendConfirmation,
  useAcceptPlanningItem,
  useRejectPlanningItem,
} from './hooks/use-planning';
import { usePlanningFollowers, useAddFollower, useRemoveFollower } from './hooks/use-planning-followers';
import { usePlanningQuestions, useAddPlanningQuestion } from './hooks/use-planning-questions';
import {
  useCreatePlanningSession,
  useUpdatePlanningSession,
  useCancelSession,
  useAcceptSession,
  useRejectSession,
  useConfirmSession,
  useRescheduleSession,
  useCompleteSession,
} from './hooks/use-planning-sessions';

type Tab = 'algemeen' | 'sessies' | 'klantportaal' | 'volgers' | 'geschiedenis';

const statusColors: Record<string, string> = {
  [PlanningStatus.NOG_TE_PLANNEN]: 'bg-gray-100 text-gray-700',
  [PlanningStatus.CONCEPT]: 'bg-yellow-100 text-yellow-800',
  [PlanningStatus.GEPLAND]: 'bg-blue-100 text-blue-800',
  [PlanningStatus.AFGEROND]: 'bg-green-100 text-green-800',
  [PlanningStatus.VERVALLEN]: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  [PlanningStatus.NOG_TE_PLANNEN]: 'Nog te plannen',
  [PlanningStatus.CONCEPT]: 'Concept — wacht op acceptatie',
  [PlanningStatus.GEPLAND]: 'Gepland',
  [PlanningStatus.AFGEROND]: 'Afgerond',
  [PlanningStatus.VERVALLEN]: 'Vervallen',
};

const sessionStatusColors: Record<string, string> = {
  [SessionStatus.NOG_TE_PLANNEN]: 'bg-gray-100 text-gray-700',
  [SessionStatus.CONCEPT]: 'bg-blue-100 text-blue-800',
  [SessionStatus.DEFINITIEF]: 'bg-green-100 text-green-800',
  [SessionStatus.AFGEROND]: 'bg-green-200 text-green-900',
  [SessionStatus.VERVALLEN]: 'bg-red-100 text-red-800',
};

const sessionStatusLabels: Record<string, string> = {
  [SessionStatus.NOG_TE_PLANNEN]: 'Nog te plannen',
  [SessionStatus.CONCEPT]: 'Concept',
  [SessionStatus.DEFINITIEF]: 'Definitief',
  [SessionStatus.AFGEROND]: 'Afgerond',
  [SessionStatus.VERVALLEN]: 'Vervallen',
};

const acceptanceColors: Record<string, string> = {
  [AcceptanceStatus.PENDING]: 'bg-yellow-100 text-yellow-800',
  [AcceptanceStatus.ACCEPTED]: 'bg-green-100 text-green-800',
  [AcceptanceStatus.REJECTED]: 'bg-red-100 text-red-800',
};

const acceptanceLabels: Record<string, string> = {
  [AcceptanceStatus.PENDING]: 'In afwachting',
  [AcceptanceStatus.ACCEPTED]: 'Geaccepteerd',
  [AcceptanceStatus.REJECTED]: 'Geweigerd',
};

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

/** Statussen waarbij de planregel direct bewerkt kan worden (geen verzetten nodig) */
const editableStatuses = [PlanningStatus.NOG_TE_PLANNEN, PlanningStatus.CONCEPT];

/** Zet ISO datetime string om naar datetime-local inputwaarde */
function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function PlanningDetailView({ id }: { id: string }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('algemeen');

  // Bewerken-modus (voor NOG_TE_PLANNEN en CONCEPT)
  const [editMode, setEditMode] = useState(false);
  const [editProductName, setEditProductName] = useState('');
  const [editScheduledDate, setEditScheduledDate] = useState('');
  const [editDurationHours, setEditDurationHours] = useState('');
  const [editInternalNotes, setEditInternalNotes] = useState('');
  const [editContactPersonId, setEditContactPersonId] = useState<string | null>(null);
  const [editLocationId, setEditLocationId] = useState<string | null>(null);

  // Inline contactpersoon bewerken (werkt voor alle statussen)
  const [editingContactPerson, setEditingContactPerson] = useState(false);
  const [quickContactPersonId, setQuickContactPersonId] = useState<string | null>(null);

  // Verzetten modal (alleen voor GEPLAND)
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState('');

  // Weigeren modal
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Taak aanmaken modal
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isDocUploadOpen, setIsDocUploadOpen] = useState(false);

  // Volger toevoegen modal
  const [addFollowerOpen, setAddFollowerOpen] = useState(false);
  const [followerSearch, setFollowerSearch] = useState('');
  const [showFollowerDropdown, setShowFollowerDropdown] = useState(false);
  const [newFollowerEmail, setNewFollowerEmail] = useState('');
  const [newFollowerName, setNewFollowerName] = useState('');
  const followerSearchRef = useRef<HTMLDivElement>(null);

  // Geschiedenis
  const [newQuestion, setNewQuestion] = useState('');

  const { data: item, isLoading } = usePlanningItem(id);
  const { data: followers } = usePlanningFollowers(id);
  const { data: questions } = usePlanningQuestions(id);
  const { data: tasksData } = useTasks({ entityType: TaskEntityType.PLANNING, entityId: id });

  // Contactpersonen van dezelfde relatie als de opdrachtgever (voor volgers-dropdown en bewerkformulier)
  const { data: contactPersonsData } = useContactPersons({
    contactId: item?.contactId ?? undefined,
    search: followerSearch || undefined,
    limit: 20,
  });
  const contactPersons = contactPersonsData?.data ?? [];

  // Alle contactpersonen voor het bewerkformulier (zonder zoekfilter)
  const { data: allContactPersonsData } = useContactPersons({
    contactId: item?.contactId ?? undefined,
    limit: 100,
  });
  const allContactPersons = allContactPersonsData?.data ?? [];

  // Locaties van dezelfde relatie als de opdrachtgever
  const { data: editLocationsData } = useContactLocations(item?.contactId ?? '');
  const editLocations = editLocationsData ?? [];

  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionRejectOpen, setSessionRejectOpen] = useState(false);
  const [sessionRejectReason, setSessionRejectReason] = useState('');
  const [sessionRescheduleOpen, setSessionRescheduleOpen] = useState(false);
  const [sessionRescheduleReason, setSessionRescheduleReason] = useState('');
  const [sessionNotesEdit, setSessionNotesEdit] = useState<Record<string, string>>({});

  const updateTaskMutation = useUpdateTask();
  const updateItem = useUpdatePlanningItem(id!);
  const complete = useCompletePlanningItem(id!);
  const reschedule = useReschedulePlanningItem(id!);
  const sendConfirmation = useSendConfirmation(id!);
  const accept = useAcceptPlanningItem(id!);
  const reject = useRejectPlanningItem(id!);
  const addFollower = useAddFollower(id!);
  const removeFollower = useRemoveFollower(id!);
  const addQuestion = useAddPlanningQuestion(id!);

  // Session mutations
  const addSession = useCreatePlanningSession(id!);
  const rejectSessionMut = useRejectSession(id!, activeSessionId ?? '');
  const rescheduleSessionMut = useRescheduleSession(id!, activeSessionId ?? '');

  // Vul bewerkformulier als item geladen is
  useEffect(() => {
    if (item && editMode) {
      setEditProductName(item.productName ?? '');
      setEditScheduledDate(toDatetimeLocal(item.scheduledDate));
      setEditDurationHours(item.durationHours ? String(item.durationHours) : '');
      setEditInternalNotes(item.internalNotes ?? '');
      setEditContactPersonId(item.contactPersonId ?? null);
      setEditLocationId(item.locationId ?? null);
    }
  }, [item, editMode]);

  // Sluit volger-dropdown bij klik buiten
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (followerSearchRef.current && !followerSearchRef.current.contains(e.target as Node)) {
        setShowFollowerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (isLoading) {
    return (
      <DetailPageLayout>
        <div className="flex justify-center py-12"><Spinner /></div>
      </DetailPageLayout>
    );
  }

  if (!item) {
    return (
      <DetailPageLayout>
        <div className="py-12 text-center text-gray-500">Planregel niet gevonden</div>
      </DetailPageLayout>
    );
  }

  const isInspector = item.inspectors?.some((i) => i.userId === user?.id);
  const myInspectorRecord = item.inspectors?.find((i) => i.userId === user?.id);
  // For single-day items the inspector can act on the item itself; for multi-day they act on sessions
  const canActAsInspector = !item.isMultiDay && isInspector && myInspectorRecord?.acceptanceStatus === AcceptanceStatus.PENDING;
  const canEditDirectly = user && user.roles.some(r => canWrite.includes(r)) && !item.isCancelled && editableStatuses.includes(item.status);
  const canReschedule = user && user.roles.some(r => canWrite.includes(r)) && !item.isCancelled && !item.isMultiDay && item.status === PlanningStatus.GEPLAND;

  // Multi-day summary
  const sessions = item.sessions ?? [];
  const activeSessions = sessions.filter(s => !s.isCancelled);
  const definitiefCount = activeSessions.filter(s => s.status === SessionStatus.DEFINITIEF || s.status === SessionStatus.AFGEROND).length;
  const totalActiveCount = activeSessions.length;

  const contactName = item.contact
    ? item.contact.companyName ||
      `${item.contact.firstName ?? ''} ${item.contact.lastName ?? ''}`.trim()
    : '—';

  const locationStr = item.location
    ? [item.location.street, item.location.houseNumber, item.location.city]
        .filter(Boolean)
        .join(' ')
    : '—';

  // ─── Handlers ────────────────────────────────────────────────

  const handleOpenEdit = () => {
    setEditProductName(item.productName ?? '');
    setEditScheduledDate(toDatetimeLocal(item.scheduledDate));
    setEditDurationHours(item.durationHours ? String(item.durationHours) : '');
    setEditInternalNotes(item.internalNotes ?? '');
    setEditContactPersonId(item.contactPersonId ?? null);
    setEditLocationId(item.locationId ?? null);
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    try {
      await updateItem.mutateAsync({
        productName: editProductName || undefined,
        scheduledDate: editScheduledDate ? new Date(editScheduledDate).toISOString() : null,
        durationHours: editDurationHours ? Number(editDurationHours) : null,
        internalNotes: editInternalNotes || null,
        contactPersonId: editContactPersonId ?? null,
        locationId: editLocationId ?? undefined,
      });
      setEditMode(false);
      showToast('Planregel bijgewerkt', 'success');
    } catch {
      showToast('Fout bij opslaan', 'error');
    }
  };

  const handleReschedule = async () => {
    if (!rescheduleReason.trim()) return;
    try {
      const newItem = await reschedule.mutateAsync({ reason: rescheduleReason });
      setRescheduleOpen(false);
      setRescheduleReason('');
      showToast('Afspraak verplaatst. Nieuwe planregel aangemaakt.', 'success');
      navigate(`/planning/${(newItem as any).id}`);
    } catch {
      showToast('Fout bij verzetten afspraak', 'error');
    }
  };

  const handleComplete = async () => {
    try {
      await complete.mutateAsync(undefined);
      showToast('Afspraak afgerond', 'success');
    } catch {
      showToast('Fout bij afronden afspraak', 'error');
    }
  };

  const handleSendConfirmation = async () => {
    try {
      await sendConfirmation.mutateAsync(undefined);
      showToast('Bevestiging verstuurd', 'success');
    } catch {
      showToast('Fout bij versturen bevestiging', 'error');
    }
  };

  const handleAccept = async () => {
    try {
      await accept.mutateAsync(undefined);
      showToast('Afspraak geaccepteerd', 'success');
    } catch {
      showToast('Fout bij accepteren afspraak', 'error');
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await reject.mutateAsync({ reason: rejectReason });
      setRejectOpen(false);
      setRejectReason('');
      showToast('Afspraak geweigerd', 'success');
    } catch {
      showToast('Fout bij weigeren afspraak', 'error');
    }
  };

  const handleAddFollowerFromContactPerson = async (person: ContactPerson) => {
    if (!person.email) {
      showToast('Contactpersoon heeft geen e-mailadres', 'error');
      return;
    }
    try {
      await addFollower.mutateAsync({
        email: person.email,
        name: `${person.firstName} ${person.lastName}`.trim(),
      });
      setAddFollowerOpen(false);
      setFollowerSearch('');
      setShowFollowerDropdown(false);
      showToast('Volger toegevoegd', 'success');
    } catch {
      showToast('Fout bij toevoegen volger', 'error');
    }
  };

  const handleAddFollower = async () => {
    if (!newFollowerEmail.trim()) return;
    try {
      await addFollower.mutateAsync({ email: newFollowerEmail, name: newFollowerName || undefined });
      setAddFollowerOpen(false);
      setNewFollowerEmail('');
      setNewFollowerName('');
      setFollowerSearch('');
      showToast('Volger toegevoegd', 'success');
    } catch {
      showToast('Fout bij toevoegen volger', 'error');
    }
  };

  const handleRemoveFollower = async (followerId: string) => {
    try {
      await removeFollower.mutateAsync(followerId);
      showToast('Volger verwijderd', 'success');
    } catch {
      showToast('Fout bij verwijderen volger', 'error');
    }
  };

  const handleAddQuestion = async () => {
    if (!newQuestion.trim()) return;
    try {
      await addQuestion.mutateAsync({ message: newQuestion });
      setNewQuestion('');
      showToast('Vraag/opmerking toegevoegd', 'success');
    } catch {
      showToast('Fout bij toevoegen vraag', 'error');
    }
  };

  // Reeds bestaande volger-emails om duplicaten te tonen
  const existingFollowerEmails = new Set(
    followers?.map((f: PlanningFollower) => f.user?.email ?? f.email ?? '').filter(Boolean)
  );

  // Session handlers
  const handleOpenSessionReject = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSessionRejectOpen(true);
  };

  const handleRejectSession = async () => {
    if (!sessionRejectReason.trim()) return;
    try {
      await rejectSessionMut.mutateAsync({ reason: sessionRejectReason });
      setSessionRejectOpen(false);
      setSessionRejectReason('');
      showToast('Sessie geweigerd', 'success');
    } catch {
      showToast('Fout bij weigeren sessie', 'error');
    }
  };

  const handleOpenSessionReschedule = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSessionRescheduleOpen(true);
  };

  const handleRescheduleSession = async () => {
    if (!sessionRescheduleReason.trim()) return;
    try {
      await rescheduleSessionMut.mutateAsync({ reason: sessionRescheduleReason });
      setSessionRescheduleOpen(false);
      setSessionRescheduleReason('');
      showToast('Sessie verzet. Nieuwe sessie aangemaakt.', 'success');
    } catch {
      showToast('Fout bij verzetten sessie', 'error');
    }
  };

  const handleAddSession = async () => {
    try {
      await addSession.mutateAsync({});
      showToast('Sessie toegevoegd', 'success');
    } catch {
      showToast('Fout bij toevoegen sessie', 'error');
    }
  };

  const incompleteTasks = (tasksData?.data ?? []).filter(t => t.status !== TaskStatus.VOLTOOID);
  const allTasks = tasksData?.data ?? [];

  const sidebar = (
    <>
      <SidebarSection
        icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
        label="Taken"
        count={incompleteTasks.length}
      >
        <div className="space-y-2">
          {allTasks.length === 0 ? (
            <p className="text-sm text-gray-400">Geen taken</p>
          ) : (
            allTasks.map((task) => (
              <div key={task.id} className="group flex items-start gap-2 rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
                <button
                  type="button"
                  onClick={async () => {
                    const newStatus = task.status === TaskStatus.VOLTOOID ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID;
                    try {
                      await updateTaskMutation.mutateAsync({ id: task.id, data: { status: newStatus } });
                    } catch {
                      showToast('Status wijzigen mislukt', 'error');
                    }
                  }}
                  className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    task.status === TaskStatus.VOLTOOID
                      ? 'border-green-500 bg-green-500 text-white'
                      : 'border-gray-300 hover:border-primary-400'
                  }`}
                >
                  {task.status === TaskStatus.VOLTOOID && (
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/tasks/${task.id}`}
                    className={`block text-sm font-medium hover:text-primary-600 ${
                      task.status === TaskStatus.VOLTOOID ? 'text-gray-400 line-through' : 'text-gray-900'
                    }`}
                  >
                    {task.title}
                  </Link>
                  {task.deadline && (
                    <p className="text-xs text-gray-400">
                      {new Date(task.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
          {user && user.roles.some(r => canWrite.includes(r)) && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setIsTaskOpen(true)}
                className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Nieuwe taak
              </button>
            </div>
          )}
        </div>
      </SidebarSection>

      <SidebarSection
        icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        label="Audit"
      >
        <AuditHistory entityType="PlanningItem" entityId={id} />
      </SidebarSection>
    </>
  );

  const tabLabels: Record<Tab, string> = {
    algemeen: 'Algemeen',
    sessies: item.isMultiDay
      ? `Sessies (${definitiefCount}/${totalActiveCount} definitief)`
      : 'Sessies',
    klantportaal: 'Klantportaal',
    volgers: followers?.length ? `Volgers (${followers.length})` : 'Volgers',
    geschiedenis: 'Geschiedenis',
  };

  return (
    <DetailPageLayout iconStrip sidebar={sidebar}>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/planning')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1"
        >
          ← Terug naar planning
        </button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{item.productName}</h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[item.status] ?? 'bg-gray-100 text-gray-700'}`}>
                {statusLabels[item.status] ?? item.status}
              </span>
              {item.isMultiDay && (
                <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-medium text-indigo-800">
                  Meerdaags · {definitiefCount}/{totalActiveCount} definitief
                </span>
              )}
              {item.labels.map((l) => (
                <span key={l} className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {l}
                </span>
              ))}
              {item.project && (
                <button
                  onClick={() => navigate(`/projects/${item.project!.id}`)}
                  className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
                >
                  {item.project.projectNumber}
                </button>
              )}
            </div>
          </div>
          <ActionMenu
            primaryActions={[
              ...(canActAsInspector ? [
                {
                  label: 'Accepteren',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                  onClick: handleAccept,
                  disabled: accept.isPending,
                },
                {
                  label: 'Weigeren',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
                  onClick: () => setRejectOpen(true),
                  variant: 'danger' as const,
                },
              ] : []),
              ...(user && user.roles.some(r => canWrite.includes(r)) && !item.isCancelled && item.status !== PlanningStatus.AFGEROND ? [
                {
                  label: 'Afronden',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                  onClick: handleComplete,
                  disabled: complete.isPending,
                },
                ...(canReschedule ? [{
                  label: 'Verzetten',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>,
                  onClick: () => setRescheduleOpen(true),
                }] : []),
                ...(item.status === PlanningStatus.GEPLAND ? [{
                  label: 'Bevestiging sturen',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
                  onClick: handleSendConfirmation,
                  disabled: sendConfirmation.isPending,
                }] : []),
              ] : []),
            ]}
            secondaryActions={[
              {
                label: 'Taak aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
                onClick: () => setIsTaskOpen(true),
              },
              {
                label: 'Document uploaden',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
                onClick: () => setIsDocUploadOpen(true),
              },
            ]}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6">
          {(['algemeen', ...(item.isMultiDay ? ['sessies'] : []), 'klantportaal', 'volgers', 'geschiedenis'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`pb-3 text-sm font-medium capitalize border-b-2 transition-colors ${
                tab === t
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tabLabels[t]}
            </button>
          ))}
        </nav>
      </div>

      {/* ── Algemeen ── */}
      {tab === 'algemeen' && (
        <div className="space-y-6">
          {/* Afspraakgegevens */}
          <Card>
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Afspraakgegevens</h3>
                {canEditDirectly && !editMode && (
                  <Button variant="secondary" size="sm" onClick={handleOpenEdit}>
                    Bewerken
                  </Button>
                )}
              </div>

              {editMode ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon (optioneel)</label>
                    <select
                      value={editContactPersonId ?? ''}
                      onChange={(e) => setEditContactPersonId(e.target.value || null)}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— Geen contactpersoon —</option>
                      {allContactPersons.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.firstName} {p.lastName}{p.role ? ` (${p.role.charAt(0) + p.role.slice(1).toLowerCase()})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {editLocations.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Locatie (optioneel)</label>
                      <select
                        value={editLocationId ?? ''}
                        onChange={(e) => setEditLocationId(e.target.value || null)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— Geen locatie —</option>
                        {editLocations.map((l: any) => (
                          <option key={l.id} value={l.id}>
                            {l.name ? `${l.name} — ` : ''}{[l.street, l.houseNumber, l.city].filter(Boolean).join(' ')}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Dienst / omschrijving</label>
                    <Input
                      value={editProductName}
                      onChange={(e) => setEditProductName(e.target.value)}
                      placeholder="Naam van de dienst"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Datum & tijd</label>
                      <input
                        type="datetime-local"
                        value={editScheduledDate}
                        onChange={(e) => setEditScheduledDate(e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Duur (uur)</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.5"
                        value={editDurationHours}
                        onChange={(e) => setEditDurationHours(e.target.value)}
                        placeholder="bijv. 2"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Interne notities</label>
                    <textarea
                      value={editInternalNotes}
                      onChange={(e) => setEditInternalNotes(e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optionele notities..."
                    />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleSaveEdit} disabled={updateItem.isPending}>
                      {updateItem.isPending ? 'Opslaan...' : 'Opslaan'}
                    </Button>
                    <Button variant="secondary" onClick={() => setEditMode(false)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Opdrachtgever</dt>
                    <dd className="mt-1 text-sm text-gray-900">{contactName}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Contactpersoon</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {editingContactPerson ? (
                        <div className="flex items-center gap-2">
                          <select
                            value={quickContactPersonId ?? ''}
                            onChange={(e) => setQuickContactPersonId(e.target.value || null)}
                            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            autoFocus
                          >
                            <option value="">— Geen —</option>
                            {allContactPersons.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.firstName} {p.lastName}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={async () => {
                              try {
                                await updateItem.mutateAsync({ contactPersonId: quickContactPersonId });
                                setEditingContactPerson(false);
                                showToast('Contactpersoon opgeslagen', 'success');
                              } catch {
                                showToast('Fout bij opslaan', 'error');
                              }
                            }}
                            disabled={updateItem.isPending}
                            className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                          >
                            {updateItem.isPending ? '…' : 'Opslaan'}
                          </button>
                          <button
                            onClick={() => setEditingContactPerson(false)}
                            className="text-xs text-gray-500 hover:text-gray-700"
                          >
                            Annuleren
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 group">
                          <span>
                            {item.contactPerson
                              ? `${item.contactPerson.firstName} ${item.contactPerson.lastName}`
                              : '—'}
                          </span>
                          {!item.isCancelled && user && user.roles.some(r => canWrite.includes(r)) && (
                            <button
                              onClick={() => {
                                setQuickContactPersonId(item.contactPersonId ?? null);
                                setEditingContactPerson(true);
                              }}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                              title="Contactpersoon wijzigen"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                          )}
                        </div>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Locatie</dt>
                    <dd className="mt-1 text-sm text-gray-900">{locationStr}</dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Datum & tijd</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {item.scheduledDate
                        ? new Date(item.scheduledDate).toLocaleString('nl-NL', {
                            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })
                        : 'Nog te plannen'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Duur</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {item.durationHours ? `${item.durationHours} uur` : '—'}
                    </dd>
                  </div>
                  {item.internalNotes && (
                    <div className="col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Interne notities</dt>
                      <dd className="mt-1 text-sm text-gray-900 whitespace-pre-line">{item.internalNotes}</dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </Card>

          {/* Inspectors */}
          <Card>
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-4">Inspecteurs</h3>
              {item.inspectors && item.inspectors.length > 0 ? (
                <div className="space-y-3">
                  {item.inspectors.map((inspector) => (
                    <div key={inspector.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                          style={{ backgroundColor: inspector.user?.color ?? '#6B7280' }}
                        >
                          {inspector.user?.initials ??
                            `${inspector.user?.firstName?.[0] ?? ''}${inspector.user?.lastName?.[0] ?? ''}`}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {inspector.user?.firstName} {inspector.user?.lastName}
                            {inspector.isPrimary && (
                              <span className="ml-2 text-xs text-gray-500">(Primair)</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500">{inspector.user?.email}</div>
                        </div>
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${acceptanceColors[inspector.acceptanceStatus]}`}>
                        {acceptanceLabels[inspector.acceptanceStatus]}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Nog geen inspecteurs toegewezen</p>
              )}
            </div>
          </Card>

          {/* Documenten */}
          <Card>
            <div className="p-6">
              <DocumentsSection
                entityType={DocumentEntityType.PLANNING}
                entityId={id!}
                canUpload={!!(user && user.roles.some(r => canWrite.includes(r)))}
                showSharedWithClient
              />
            </div>
          </Card>

          <div className="flex items-center justify-between border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-400">
              Aangemaakt op {new Date(item.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {item.createdByUser && ` door ${item.createdByUser.firstName} ${item.createdByUser.lastName}`}
            </p>
            {canEditDirectly && !editMode && (
              <Button variant="secondary" onClick={handleOpenEdit}>
                Bewerken
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Sessies ── */}
      {tab === 'sessies' && item.isMultiDay && (
        <SessionsTab
          sessions={activeSessions}
          userId={user?.id}
          userCanWrite={!!(user && user.roles.some(r => canWrite.includes(r)))}
          onOpenReject={handleOpenSessionReject}
          onOpenReschedule={handleOpenSessionReschedule}
          onAddSession={handleAddSession}
          isAddingSession={addSession.isPending}
          planningItemId={id!}
        />
      )}

      {/* ── Klantportaal ── */}
      {tab === 'klantportaal' && (
        <div className="space-y-6">
          <Card>
            <div className="p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Klantportaal</h3>
              <p className="text-sm text-gray-500 mb-3">
                Deel deze link met de klant voor toegang tot de afspraakpagina.
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-gray-50 rounded px-3 py-2 text-sm text-gray-700 truncate">
                  {window.location.origin}/afspraak/{item.publicToken}
                </code>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(`${window.location.origin}/afspraak/${item.publicToken}`);
                    showToast('Link gekopieerd', 'success');
                  }}
                >
                  Kopiëren
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Volgers ── */}
      {tab === 'volgers' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Volgers</h3>
            {user && user.roles.some(r => canWrite.includes(r)) && (
              <Button variant="secondary" size="sm" onClick={() => setAddFollowerOpen(true)}>
                Volger toevoegen
              </Button>
            )}
          </div>
          <div className="space-y-3">
            {followers?.map((f: PlanningFollower) => {
              const email = f.user?.email ?? f.email ?? '—';
              const name = f.user
                ? `${f.user.firstName} ${f.user.lastName}`
                : f.name ?? email;
              return (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
                  <div>
                    <div className="text-sm font-medium text-gray-900">{name}</div>
                    {!f.user && <div className="text-xs text-gray-500">{email}</div>}
                  </div>
                  {user && user.roles.some(r => canWrite.includes(r)) && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleRemoveFollower(f.id)}
                    >
                      Verwijderen
                    </Button>
                  )}
                </div>
              );
            })}
            {(!followers || followers.length === 0) && (
              <p className="text-sm text-gray-500">Geen volgers toegevoegd</p>
            )}
          </div>
        </div>
      )}

      {/* ── Geschiedenis ── */}
      {tab === 'geschiedenis' && (
        <div>
          <div className="mb-4">
            <div className="flex gap-2">
              <Input
                placeholder="Opmerking of vraag toevoegen..."
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleAddQuestion} disabled={addQuestion.isPending || !newQuestion.trim()}>
                Toevoegen
              </Button>
            </div>
          </div>
          <div className="space-y-3">
            {item.history?.map((entry) => (
              <div key={entry.id} className="flex gap-3">
                <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-2" />
                <div className="flex-1">
                  <div className="text-sm text-gray-900">{entry.description}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {entry.user
                      ? `${entry.user.firstName} ${entry.user.lastName}`
                      : 'Systeem / Klant'}{' '}
                    · {new Date(entry.createdAt).toLocaleString('nl-NL')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Taak aanmaken modal ── */}
      <CreateTaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        entityType={TaskEntityType.PLANNING}
        entityId={id!}
      />

      {isDocUploadOpen && (
        <UploadDocumentModal
          isOpen={isDocUploadOpen}
          onClose={() => setIsDocUploadOpen(false)}
          entityType={DocumentEntityType.PLANNING}
          entityId={id!}
        />
      )}

      {/* ── Verzetten modal (alleen GEPLAND) ── */}
      <Modal
        isOpen={rescheduleOpen}
        onClose={() => setRescheduleOpen(false)}
        title="Afspraak verzetten"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Hiermee wordt de huidige planregel als vervallen gemarkeerd en wordt er een nieuwe aangemaakt.
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reden</label>
            <textarea
              value={rescheduleReason}
              onChange={(e) => setRescheduleReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Vul een reden in (verplicht)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRescheduleOpen(false)}>Annuleren</Button>
            <Button onClick={handleReschedule} disabled={!rescheduleReason.trim() || reschedule.isPending}>
              Verzetten
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Weigeren modal ── */}
      <Modal
        isOpen={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title="Afspraak weigeren"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reden voor weigering</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Vul een reden in (verplicht)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRejectOpen(false)}>Annuleren</Button>
            <Button onClick={handleReject} disabled={!rejectReason.trim() || reject.isPending}>
              Weigeren
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Sessie weigeren modal ── */}
      <Modal
        isOpen={sessionRejectOpen}
        onClose={() => { setSessionRejectOpen(false); setSessionRejectReason(''); }}
        title="Sessie weigeren"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reden voor weigering</label>
            <textarea
              value={sessionRejectReason}
              onChange={(e) => setSessionRejectReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Vul een reden in (verplicht)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setSessionRejectOpen(false); setSessionRejectReason(''); }}>Annuleren</Button>
            <Button onClick={() => void handleRejectSession()} disabled={!sessionRejectReason.trim() || rejectSessionMut.isPending}>
              Weigeren
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Sessie verzetten modal ── */}
      <Modal
        isOpen={sessionRescheduleOpen}
        onClose={() => { setSessionRescheduleOpen(false); setSessionRescheduleReason(''); }}
        title="Sessie verzetten"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Hiermee wordt de huidige sessie als vervallen gemarkeerd en wordt er een nieuwe sessie aangemaakt (nog te plannen).
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reden</label>
            <textarea
              value={sessionRescheduleReason}
              onChange={(e) => setSessionRescheduleReason(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Vul een reden in (verplicht)"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => { setSessionRescheduleOpen(false); setSessionRescheduleReason(''); }}>Annuleren</Button>
            <Button onClick={() => void handleRescheduleSession()} disabled={!sessionRescheduleReason.trim() || rescheduleSessionMut.isPending}>
              Verzetten
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── Volger toevoegen modal ── */}
      <Modal
        isOpen={addFollowerOpen}
        onClose={() => {
          setAddFollowerOpen(false);
          setFollowerSearch('');
          setShowFollowerDropdown(false);
          setNewFollowerEmail('');
          setNewFollowerName('');
        }}
        title="Volger toevoegen"
      >
        <div className="space-y-5">
          {/* Sectie 1: contactpersonen opdrachtgever */}
          {item.contactId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contactpersonen van {contactName}
              </label>
              <div ref={followerSearchRef} className="relative">
                <Input
                  placeholder="Zoek op naam of e-mail..."
                  value={followerSearch}
                  onChange={(e) => {
                    setFollowerSearch(e.target.value);
                    setShowFollowerDropdown(true);
                  }}
                  onFocus={() => setShowFollowerDropdown(true)}
                />
                {showFollowerDropdown && (
                  <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-52 overflow-y-auto">
                    {contactPersons.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">
                        {followerSearch ? 'Geen resultaten' : 'Geen contactpersonen gevonden'}
                      </div>
                    ) : (
                      contactPersons.map((person) => {
                        const alreadyFollower = person.email ? existingFollowerEmails.has(person.email) : false;
                        return (
                          <button
                            key={person.id}
                            type="button"
                            disabled={alreadyFollower || !person.email}
                            onClick={() => handleAddFollowerFromContactPerson(person)}
                            className={`w-full text-left px-3 py-2.5 text-sm transition-colors ${
                              alreadyFollower || !person.email
                                ? 'cursor-not-allowed opacity-50'
                                : 'hover:bg-gray-50'
                            }`}
                          >
                            <div className="font-medium text-gray-900">
                              {person.firstName} {person.lastName}
                              {alreadyFollower && (
                                <span className="ml-2 text-xs text-gray-400">(al toegevoegd)</span>
                              )}
                            </div>
                            {person.email ? (
                              <div className="text-xs text-gray-500">{person.email}</div>
                            ) : (
                              <div className="text-xs text-amber-600">Geen e-mailadres</div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Scheidingslijn */}
          {item.contactId && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-white px-2 text-gray-400">Of voeg handmatig toe</span>
              </div>
            </div>
          )}

          {/* Sectie 2: handmatig naam + email */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mailadres</label>
              <Input
                type="email"
                value={newFollowerEmail}
                onChange={(e) => setNewFollowerEmail(e.target.value)}
                placeholder="naam@bedrijf.nl"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Naam (optioneel)</label>
              <Input
                value={newFollowerName}
                onChange={(e) => setNewFollowerName(e.target.value)}
                placeholder="Naam volger"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => {
                setAddFollowerOpen(false);
                setFollowerSearch('');
                setShowFollowerDropdown(false);
                setNewFollowerEmail('');
                setNewFollowerName('');
              }}>Annuleren</Button>
              <Button
                onClick={handleAddFollower}
                disabled={!newFollowerEmail.trim() || addFollower.isPending}
              >
                Toevoegen
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </DetailPageLayout>
  );
}

// ─── Taken tab ─────────────────────────────────────────────────────────────

const taskStatusLabels: Record<string, string> = {
  [TaskStatus.TE_DOEN]: 'Te doen',
  [TaskStatus.MEE_BEZIG]: 'Mee bezig',
  [TaskStatus.VOLTOOID]: 'Voltooid',
};

const taskStatusColors: Record<string, string> = {
  [TaskStatus.TE_DOEN]: 'bg-blue-100 text-blue-800',
  [TaskStatus.MEE_BEZIG]: 'bg-yellow-100 text-yellow-800',
  [TaskStatus.VOLTOOID]: 'bg-green-100 text-green-800',
};

function PlanningTasksTab({
  tasks,
  userCanWrite,
  onCreateTask,
  onStatusChange,
  navigate,
}: {
  tasks: Task[];
  userCanWrite: boolean;
  onCreateTask: () => void;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const incomplete = tasks.filter((t) => t.status !== TaskStatus.VOLTOOID);
  const completed = tasks.filter((t) => t.status === TaskStatus.VOLTOOID);

  return (
    <div className="space-y-4">
      {userCanWrite && (
        <div className="flex justify-end">
          <Button size="sm" onClick={onCreateTask}>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Taak aanmaken
          </Button>
        </div>
      )}
      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Nog geen taken voor deze planregel</p>
      ) : (
        <div className="space-y-6">
          {incomplete.length > 0 && (
            <div className="space-y-2">
              {incomplete.map((task) => (
                <PlanningTaskCard key={task.id} task={task} onStatusChange={onStatusChange} navigate={navigate} />
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-500">Voltooid ({completed.length})</h4>
              {completed.map((task) => (
                <PlanningTaskCard key={task.id} task={task} onStatusChange={onStatusChange} navigate={navigate} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlanningTaskCard({
  task,
  onStatusChange,
  navigate,
}: {
  task: Task;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const isCompleted = task.status === TaskStatus.VOLTOOID;
  const isOverdue = !isCompleted && task.deadline && new Date(task.deadline) < new Date();

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50 ${
        isCompleted ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Checkbox voor snelle status-toggle */}
      <button
        type="button"
        onClick={() => onStatusChange(task.id, isCompleted ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID)}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 bg-white hover:border-primary-500'
        }`}
      >
        {isCompleted && (
          <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Taakinfo */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/tasks/${task.id}`)}
            className={`text-sm font-medium hover:underline ${
              isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
            }`}
          >
            {task.title}
          </button>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${taskStatusColors[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
            {taskStatusLabels[task.status] ?? task.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          {task.assignee && (
            <span>{task.assignee.firstName} {task.assignee.lastName}</span>
          )}
          {task.deadline && (
            <span className={isOverdue ? 'font-medium text-red-600' : ''}>
              {isOverdue && (
                <svg className="mr-0.5 inline h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
              {new Date(task.deadline).toLocaleDateString('nl-NL')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sessions Tab ───────────────────────────────────────────────────────────

function SessionsTab({
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
  const updateSession = useUpdatePlanningSession(planningItemId, session.id);
  const acceptSessionMut = useAcceptSession(planningItemId, session.id);
  const confirmSessionMut = useConfirmSession(planningItemId, session.id);
  const completeSessionMut = useCompleteSession(planningItemId, session.id);
  const cancelSessionMut = useCancelSession(planningItemId, session.id);

  const mySessionInspector = session.sessionInspectors?.find(si => si.userId === userId);
  const canActAsInspector = mySessionInspector?.acceptanceStatus === AcceptanceStatus.PENDING;

  const statusColor = sessionStatusColors[session.status] ?? 'bg-gray-100 text-gray-700';
  const statusLabel = sessionStatusLabels[session.status] ?? session.status;

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
      showToast('Fout bij opslaan notitie', 'error');
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
      showToast('Fout bij opslaan datum', 'error');
    }
  };

  const handleAccept = async () => {
    try {
      await acceptSessionMut.mutateAsync(undefined);
      showToast('Sessie geaccepteerd', 'success');
    } catch {
      showToast('Fout bij accepteren sessie', 'error');
    }
  };

  const handleConfirm = async () => {
    try {
      await confirmSessionMut.mutateAsync(undefined);
      showToast('Sessie bevestigd als definitief', 'success');
    } catch {
      showToast('Fout bij bevestigen sessie', 'error');
    }
  };

  const handleComplete = async () => {
    try {
      await completeSessionMut.mutateAsync(undefined);
      showToast('Sessie afgerond', 'success');
    } catch {
      showToast('Fout bij afronden sessie', 'error');
    }
  };

  const handleCancel = async () => {
    if (!window.confirm('Weet u zeker dat u deze sessie wilt annuleren?')) return;
    try {
      await cancelSessionMut.mutateAsync(undefined);
      showToast('Sessie geannuleerd', 'success');
    } catch {
      showToast('Fout bij annuleren sessie', 'error');
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

// ─── Page entry point (wrapper prevents hooks-before-return violation) ────────

export default function PlanningDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (id === 'new') return <CreatePlanningForm />;
  return <PlanningDetailView id={id!} />;
}

// ─── Create Planning Form ───────────────────────────────────────────────────

function CreatePlanningForm() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const createItem = useCreatePlanningItem();
  const { data: contactsData } = useContacts({ limit: 100 });
  const contacts = contactsData?.data ?? [];

  const [contactId, setContactId] = useState('');
  const [contactPersonId, setContactPersonId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [productName, setProductName] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [sessionCount, setSessionCount] = useState('');

  // Inline contactpersoon aanmaken
  const [showCreatePerson, setShowCreatePerson] = useState(false);
  const [newPersonFirstName, setNewPersonFirstName] = useState('');
  const [newPersonLastName, setNewPersonLastName] = useState('');
  const [newPersonEmail, setNewPersonEmail] = useState('');
  const [newPersonPhone, setNewPersonPhone] = useState('');

  const { data: locationsData } = useContactLocations(contactId);
  const locations = locationsData ?? [];

  const { data: contactPersonsData } = useContactPersons({ contactId: contactId || undefined, limit: 100 });
  const contactPersons = contactPersonsData?.data ?? [];
  const addContactPersonMutation = useAddContactPerson(contactId);

  const suggestedSessionCount = durationHours
    ? Math.ceil(Number(durationHours) / 8)
    : 0;

  const handleContactChange = (value: string) => {
    setContactId(value);
    setLocationId('');
    setContactPersonId('');
    setShowCreatePerson(false);
  };

  const handleCreatePerson = async () => {
    if (!newPersonFirstName.trim() || !newPersonLastName.trim()) {
      showToast('Voornaam en achternaam zijn verplicht', 'error');
      return;
    }
    try {
      const created = await addContactPersonMutation.mutateAsync({
        firstName: newPersonFirstName.trim(),
        lastName: newPersonLastName.trim(),
        email: newPersonEmail.trim() || undefined,
        phone: newPersonPhone.trim() || undefined,
        role: 'ALGEMEEN' as any,
      });
      setContactPersonId((created as any).id);
      setShowCreatePerson(false);
      setNewPersonFirstName('');
      setNewPersonLastName('');
      setNewPersonEmail('');
      setNewPersonPhone('');
      showToast('Contactpersoon aangemaakt', 'success');
    } catch {
      showToast('Fout bij aanmaken contactpersoon', 'error');
    }
  };

  const handleSubmit = async () => {
    if (!contactId || !productName.trim()) {
      showToast('Opdrachtgever en dienstnaam zijn verplicht', 'error');
      return;
    }
    if (isMultiDay) {
      const sc = Number(sessionCount);
      if (!sc || sc < 2 || sc > 30) {
        showToast('Aantal sessies moet tussen 2 en 30 liggen', 'error');
        return;
      }
    }
    try {
      const newItem = await createItem.mutateAsync({
        contactId,
        contactPersonId: contactPersonId || undefined,
        locationId: locationId || undefined,
        productName: productName.trim(),
        scheduledDate: scheduledDate ? new Date(scheduledDate).toISOString() : undefined,
        durationHours: durationHours ? Number(durationHours) : undefined,
        internalNotes: internalNotes.trim() || undefined,
        isMultiDay,
        sessionCount: isMultiDay ? Number(sessionCount) : undefined,
      });
      showToast('Planregel aangemaakt', 'success');
      navigate(`/planning/${(newItem as any).id}`);
    } catch {
      showToast('Fout bij aanmaken planregel', 'error');
    }
  };

  return (
    <DetailPageLayout>
      <div className="mb-6">
        <button
          onClick={() => navigate('/planning')}
          className="text-sm text-gray-500 hover:text-gray-700 mb-3 flex items-center gap-1"
        >
          ← Terug naar planning
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nieuwe planregel</h1>
      </div>

      <Card>
        <div className="p-6 space-y-5">
          {/* Contact */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Opdrachtgever <span className="text-red-500">*</span>
            </label>
            <select
              value={contactId}
              onChange={(e) => handleContactChange(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— Selecteer opdrachtgever —</option>
              {contacts.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.companyName || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim()}
                </option>
              ))}
            </select>
          </div>

          {/* Contactpersoon */}
          {contactId && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon (optioneel)</label>
              {contactPersons.length > 0 ? (
                <select
                  value={contactPersonId}
                  onChange={(e) => setContactPersonId(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Geen contactpersoon —</option>
                  {contactPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}{p.email ? ` — ${p.email}` : ''}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500 mb-2">Geen contactpersonen gevonden voor deze opdrachtgever.</p>
              )}
              {!showCreatePerson && (
                <button
                  type="button"
                  onClick={() => setShowCreatePerson(true)}
                  className="mt-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Nieuwe contactpersoon aanmaken
                </button>
              )}
              {showCreatePerson && (
                <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">Nieuwe contactpersoon</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Voornaam <span className="text-red-500">*</span></label>
                      <Input
                        value={newPersonFirstName}
                        onChange={(e) => setNewPersonFirstName(e.target.value)}
                        placeholder="Voornaam"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Achternaam <span className="text-red-500">*</span></label>
                      <Input
                        value={newPersonLastName}
                        onChange={(e) => setNewPersonLastName(e.target.value)}
                        placeholder="Achternaam"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">E-mail</label>
                      <Input
                        type="email"
                        value={newPersonEmail}
                        onChange={(e) => setNewPersonEmail(e.target.value)}
                        placeholder="jan@voorbeeld.nl"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Telefoon</label>
                      <Input
                        value={newPersonPhone}
                        onChange={(e) => setNewPersonPhone(e.target.value)}
                        placeholder="+31 6 12345678"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={handleCreatePerson}
                      disabled={addContactPersonMutation.isPending}
                    >
                      {addContactPersonMutation.isPending ? 'Aanmaken...' : 'Aanmaken'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { setShowCreatePerson(false); setNewPersonFirstName(''); setNewPersonLastName(''); setNewPersonEmail(''); setNewPersonPhone(''); }}
                    >
                      Annuleren
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Location */}
          {contactId && locations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Locatie (optioneel)</label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Selecteer locatie —</option>
                {locations.map((l: any) => (
                  <option key={l.id} value={l.id}>
                    {l.name || [l.street, l.houseNumber, l.city].filter(Boolean).join(' ')}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Product name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Dienst / product <span className="text-red-500">*</span>
            </label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="bijv. NEN1010 Inspectie"
            />
          </div>

          {/* Date/Duration row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Datum & tijd (optioneel)</label>
              <input
                type="datetime-local"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Totale duur (uur, optioneel)</label>
              <Input
                type="number"
                min="0"
                step="0.5"
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder="bijv. 40"
              />
            </div>
          </div>

          {/* Multi-day toggle */}
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 p-4">
            <input
              id="multiday"
              type="checkbox"
              checked={isMultiDay}
              onChange={(e) => {
                setIsMultiDay(e.target.checked);
                if (e.target.checked && suggestedSessionCount >= 2) {
                  setSessionCount(String(suggestedSessionCount));
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600"
            />
            <div className="flex-1">
              <label htmlFor="multiday" className="text-sm font-medium text-gray-900 cursor-pointer">
                Meerdaagse planning
              </label>
              <p className="text-xs text-gray-500 mt-0.5">
                Splits de opdracht op in meerdere sessies op afzonderlijke dagen.
              </p>
              {isMultiDay && (
                <div className="mt-3 space-y-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Aantal sessies <span className="text-red-500">*</span>
                    </label>
                    <Input
                      type="number"
                      min="2"
                      max="30"
                      value={sessionCount}
                      onChange={(e) => setSessionCount(e.target.value)}
                      placeholder="Aantal sessies (2–30)"
                    />
                    {durationHours && suggestedSessionCount >= 2 && (
                      <p className="text-xs text-blue-600 mt-1">
                        Op basis van {durationHours} uur adviseren wij {suggestedSessionCount} sessies van ±8 uur.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Internal notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Interne notities (optioneel)</label>
            <textarea
              value={internalNotes}
              onChange={(e) => setInternalNotes(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optionele interne notities..."
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSubmit} disabled={createItem.isPending}>
              {createItem.isPending ? 'Aanmaken...' : 'Planregel aanmaken'}
            </Button>
            <Button variant="secondary" onClick={() => navigate('/planning')}>
              Annuleren
            </Button>
          </div>
        </div>
      </Card>
    </DetailPageLayout>
  );
}
