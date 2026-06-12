import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { PlanningStatus, AcceptanceStatus, SessionStatus, TaskEntityType, TaskStatus, Role } from '@/types';
import type { PlanningFollower } from '@/types';
import { Spinner, Tabs, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { useContactPersons, useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { usePlanningItem } from './hooks/use-planning';
import { usePlanningWorkOrders } from '@/pages/work-orders/hooks/use-work-orders';
import { usePlanningFollowers } from './hooks/use-planning-followers';
import { usePlanningQuestions } from './hooks/use-planning-questions';
import { useCreatePlanningSession } from './hooks/use-planning-sessions';
import { toDatetimeLocal } from './components/planning-detail-shared';
import { PlanningDetailHeader } from './components/planning-detail-header';
import { PlanningDetailSidebar } from './components/planning-detail-sidebar';
import { PlanningAlgemeenTab } from './components/planning-algemeen-tab';
import { SessionsTab } from './components/planning-sessions-tab';
import { PlanningKlantportaalTab } from './components/planning-klantportaal-tab';
import { PlanningVolgersTab } from './components/planning-volgers-tab';
import { PlanningStatusTab } from './components/planning-status-tab';
import { PlanningGeschiedenisTab } from './components/planning-geschiedenis-tab';
import {
  PlanningRescheduleModal,
  PlanningRejectModal,
  SessionRejectModal,
  SessionRescheduleModal,
} from './components/planning-detail-modals';
import { PlanningAddFollowerModal } from './components/planning-add-follower-modal';
import { CreatePlanningForm } from './components/create-planning-form';
import { getErrorMessage } from '@/lib/api-client';

type Tab = 'algemeen' | 'sessies' | 'klantportaal' | 'volgers' | 'status' | 'geschiedenis';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

/** Statussen waarbij de planregel direct bewerkt kan worden (geen verzetten nodig) */
const editableStatuses = [PlanningStatus.NOG_TE_PLANNEN, PlanningStatus.CONCEPT];

function PlanningDetailView({ id }: { id: string }) {
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

  // Weigeren modal
  const [rejectOpen, setRejectOpen] = useState(false);

  // Taak aanmaken modal
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  // Volger toevoegen modal
  const [addFollowerOpen, setAddFollowerOpen] = useState(false);
  const [followerSearch, setFollowerSearch] = useState('');

  // Geschiedenis
  const [newQuestion, setNewQuestion] = useState('');

  const { data: item, isLoading } = usePlanningItem(id);
  const { data: followers } = usePlanningFollowers(id);
  const { data: questions } = usePlanningQuestions(id);
  const { data: tasksData } = useTasks({ entityType: TaskEntityType.PLANNING, entityId: id });
  const { data: workOrdersData } = usePlanningWorkOrders(id);

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
  const [sessionRescheduleOpen, setSessionRescheduleOpen] = useState(false);
  const [sessionNotesEdit, setSessionNotesEdit] = useState<Record<string, string>>({});

  // Status tab state
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');

  // Session mutations
  const addSession = useCreatePlanningSession(id!);

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
  const userCanWrite = !!(user && user.roles.some(r => canWrite.includes(r)));

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

  // Reeds bestaande volger-emails om duplicaten te tonen
  const existingFollowerEmails = new Set(
    followers?.map((f: PlanningFollower) => f.user?.email ?? f.email ?? '').filter(Boolean)
  );

  // Session handlers
  const handleOpenSessionReject = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSessionRejectOpen(true);
  };

  const handleOpenSessionReschedule = (sessionId: string) => {
    setActiveSessionId(sessionId);
    setSessionRescheduleOpen(true);
  };

  const handleAddSession = async () => {
    try {
      await addSession.mutateAsync({});
      showToast('Sessie toegevoegd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij toevoegen sessie'), 'error');
    }
  };

  const incompleteTasks = (tasksData?.data ?? []).filter(t => t.status !== TaskStatus.VOLTOOID);
  const allTasks = tasksData?.data ?? [];

  const sidebar = (
    <PlanningDetailSidebar
      id={id!}
      allTasks={allTasks}
      incompleteTasks={incompleteTasks}
      userCanWrite={userCanWrite}
      setIsTaskOpen={setIsTaskOpen}
    />
  );

  const STATUS_ACTIONS = new Set([
    'AANGEMAAKT', 'GEACCEPTEERD', 'GEWEIGERD', 'GEPLAND', 'AFGEROND', 'VERPLAATST', 'STATUS_GEWIJZIGD',
  ]);
  const statusHistory = (item.history ?? []).filter((e) => STATUS_ACTIONS.has(e.action));

  const tabLabels: Record<Tab, string> = {
    algemeen: 'Algemeen',
    sessies: item.isMultiDay
      ? `Sessies (${definitiefCount}/${totalActiveCount} definitief)`
      : 'Sessies',
    klantportaal: 'Klantportaal',
    volgers: followers?.length ? `Volgers (${followers.length})` : 'Volgers',
    status: 'Status',
    geschiedenis: 'Geschiedenis',
  };

  return (
    <DetailPageLayout iconStrip sidebar={sidebar}>
      {/* Header */}
      <PlanningDetailHeader
        id={id!}
        item={item}
        definitiefCount={definitiefCount}
        totalActiveCount={totalActiveCount}
        canActAsInspector={!!canActAsInspector}
        canReschedule={!!canReschedule}
        userCanWrite={userCanWrite}
        setRejectOpen={setRejectOpen}
        setRescheduleOpen={setRescheduleOpen}
        setIsTaskOpen={setIsTaskOpen}
      />

      {/* Tabs */}
      <div className="mb-6">
        <Tabs
          tabs={(['algemeen', ...(item.isMultiDay ? ['sessies'] : []), 'klantportaal', 'volgers', 'status', 'geschiedenis'] as Tab[]).map((t) => ({
            key: t,
            label: tabLabels[t],
            count: t === 'status' ? statusHistory.length : undefined,
          }))}
          active={tab}
          onChange={setTab}
        />
      </div>

      {/* ── Algemeen ── */}
      {tab === 'algemeen' && (
        <PlanningAlgemeenTab
          id={id!}
          item={item}
          canEditDirectly={!!canEditDirectly}
          userCanWrite={userCanWrite}
          contactName={contactName}
          locationStr={locationStr}
          editMode={editMode}
          setEditMode={setEditMode}
          editProductName={editProductName}
          setEditProductName={setEditProductName}
          editScheduledDate={editScheduledDate}
          setEditScheduledDate={setEditScheduledDate}
          editDurationHours={editDurationHours}
          setEditDurationHours={setEditDurationHours}
          editInternalNotes={editInternalNotes}
          setEditInternalNotes={setEditInternalNotes}
          editContactPersonId={editContactPersonId}
          setEditContactPersonId={setEditContactPersonId}
          editLocationId={editLocationId}
          setEditLocationId={setEditLocationId}
          editingContactPerson={editingContactPerson}
          setEditingContactPerson={setEditingContactPerson}
          quickContactPersonId={quickContactPersonId}
          setQuickContactPersonId={setQuickContactPersonId}
          allContactPersons={allContactPersons}
          editLocations={editLocations}
          workOrdersData={workOrdersData}
        />
      )}

      {/* ── Sessies ── */}
      {tab === 'sessies' && item.isMultiDay && (
        <SessionsTab
          sessions={activeSessions}
          userId={user?.id}
          userCanWrite={userCanWrite}
          onOpenReject={handleOpenSessionReject}
          onOpenReschedule={handleOpenSessionReschedule}
          onAddSession={handleAddSession}
          isAddingSession={addSession.isPending}
          planningItemId={id!}
        />
      )}

      {/* ── Klantportaal ── */}
      {tab === 'klantportaal' && (
        <PlanningKlantportaalTab item={item} />
      )}

      {/* ── Volgers ── */}
      {tab === 'volgers' && (
        <PlanningVolgersTab
          id={id!}
          followers={followers}
          userCanWrite={userCanWrite}
          setAddFollowerOpen={setAddFollowerOpen}
        />
      )}

      {/* ── Status ── */}
      {tab === 'status' && (
        <PlanningStatusTab
          id={id!}
          item={item}
          userCanWrite={userCanWrite}
          newStatus={newStatus}
          setNewStatus={setNewStatus}
          statusNote={statusNote}
          setStatusNote={setStatusNote}
          statusHistory={statusHistory}
        />
      )}

      {/* ── Geschiedenis ── */}
      {tab === 'geschiedenis' && (
        <PlanningGeschiedenisTab
          id={id!}
          item={item}
          newQuestion={newQuestion}
          setNewQuestion={setNewQuestion}
        />
      )}

      {/* ── Taak aanmaken modal ── */}
      <CreateTaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        entityType={TaskEntityType.PLANNING}
        entityId={id!}
      />

      {/* ── Verzetten modal (alleen GEPLAND) ── */}
      <PlanningRescheduleModal
        id={id!}
        rescheduleOpen={rescheduleOpen}
        setRescheduleOpen={setRescheduleOpen}
      />

      {/* ── Weigeren modal ── */}
      <PlanningRejectModal
        id={id!}
        rejectOpen={rejectOpen}
        setRejectOpen={setRejectOpen}
      />

      {/* ── Sessie weigeren modal ── */}
      <SessionRejectModal
        id={id!}
        activeSessionId={activeSessionId}
        sessionRejectOpen={sessionRejectOpen}
        setSessionRejectOpen={setSessionRejectOpen}
      />

      {/* ── Sessie verzetten modal ── */}
      <SessionRescheduleModal
        id={id!}
        activeSessionId={activeSessionId}
        sessionRescheduleOpen={sessionRescheduleOpen}
        setSessionRescheduleOpen={setSessionRescheduleOpen}
      />

      {/* ── Volger toevoegen modal ── */}
      <PlanningAddFollowerModal
        id={id!}
        contactId={item.contactId}
        contactName={contactName}
        addFollowerOpen={addFollowerOpen}
        setAddFollowerOpen={setAddFollowerOpen}
        followerSearch={followerSearch}
        setFollowerSearch={setFollowerSearch}
        contactPersons={contactPersons}
        existingFollowerEmails={existingFollowerEmails}
      />
    </DetailPageLayout>
  );
}

// ─── Page entry point (wrapper prevents hooks-before-return violation) ────────

export default function PlanningDetailPage() {
  const { id } = useParams<{ id: string }>();
  if (id === 'new') return <CreatePlanningForm />;
  return <PlanningDetailView id={id!} />;
}
