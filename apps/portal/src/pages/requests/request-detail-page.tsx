import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Role,
  TaskEntityType,
  TaskStatus,
  DocumentEntityType,
  NoteEntityType,
} from '@/types';
import { ActionMenu, Button, ErrorBox, Spinner, StatusBadge, Tabs, useConfirm, useToast } from '@/components/ui';
import { PRIORITY, REQUEST_STATUS } from '@/lib/status';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { FavoriteStar } from '@/components/favorites/favorite-star';
import { StartChatButton } from '@/components/chat';
import { NotesSidebarSection, HistorySidebarSection, DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { useAuth } from '@/providers/auth-provider';
import { useWindowTabSync } from '@/providers/window-tabs';
import {
  useRequest,
  useUpdateRequest,
  useUpdateRequestStatus,
  useDeleteRequest,
} from './hooks/use-requests';
import { useContactLogs } from '@/pages/contacts/hooks/use-contacts';
import { AddLogModal } from '@/pages/contacts/components/add-log-modal';
import { useCreateQuoteFromRequest } from '@/pages/quotes/hooks/use-quotes';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { useCreateProjectFromRequest } from '@/pages/projects/hooks/use-projects';
import { RequestOverviewTab } from './components/request-overview-tab';
import { RequestStatusTab } from './components/request-status-tab';
import { RequestTasksSidebar } from './components/request-tasks-sidebar';
import { ContactLogsSidebar } from './components/request-contact-logs-sidebar';
import { formatDate } from './components/request-detail-helpers';
import { getErrorMessage } from '@/lib/api-client';

type Tab = 'overzicht' | 'status';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: request, isLoading, error } = useRequest(id!);
  const updateMutation = useUpdateRequest(id!);
  const updateStatusMutation = useUpdateRequestStatus(id!);
  const deleteMutation = useDeleteRequest();
  const createQuoteMutation = useCreateQuoteFromRequest();
  const createProjectMutation = useCreateProjectFromRequest();

  // Fetch tasks linked to this request
  const { data: tasksData } = useTasks({
    entityType: TaskEntityType.REQUEST,
    entityId: id,
    limit: 100,
  });
  const requestTasks = tasksData?.data || [];
  const incompleteTasks = requestTasks.filter((t) => t.status !== TaskStatus.VOLTOOID);

  // Fetch contact logs for this request's contact
  const { data: contactLogs } = useContactLogs(request?.contactId || '');

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);

  // Keep this record's in-window tab title fresh, and flag it if the record 404s.
  useWindowTabSync('request', id, {
    title: request?.title,
    notFound: !isLoading && (!!error || !request),
  });

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const handleCreateQuote = async () => {
    if (!request) return;
    try {
      const quote = await createQuoteMutation.mutateAsync(request.id);
      showToast('Offerte aangemaakt', 'success');
      navigate(`/quotes/${quote.id}/edit`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Offerte aanmaken mislukt'), 'error');
    }
  };

  const handleDelete = async () => {
    if (!request) return;
    const confirmed = await confirm({
      title: 'Aanvraag verwijderen',
      message: 'Weet u zeker dat u deze aanvraag wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(request.id);
      showToast('Aanvraag verwijderd', 'success');
      navigate('/requests');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !request) {
    return (
      <ErrorBox>
        {error?.message || 'Aanvraag niet gevonden'}
      </ErrorBox>
    );
  }

  const logs = contactLogs || [];

  const sidebarContent = (
    <div className="space-y-8">
      <SidebarSection
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        label="Contactmomenten"
        count={logs.length}
      >
        <ContactLogsSidebar
          logs={logs}
          userCanWrite={!!userCanWrite}
          onLogOpen={() => setIsLogOpen(true)}
        />
      </SidebarSection>

      <SidebarSection
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
        }
        label="Taken"
        count={incompleteTasks.length}
      >
        <RequestTasksSidebar
          tasks={requestTasks}
          userCanWrite={!!userCanWrite}
          onCreateTask={() => setIsTaskOpen(true)}
        />
      </SidebarSection>

      <NotesSidebarSection entityType={NoteEntityType.REQUEST} entityId={id!} />

      <DocumentsSidebarSection
        entityType={DocumentEntityType.REQUEST}
        entityId={request.id}
        canUpload={!!userCanWrite}
      />

      <HistorySidebarSection entityType="Request" entityId={id} />
    </div>
  );

  return (
    <DetailPageLayout iconStrip sidebar={sidebarContent}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/requests')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <FavoriteStar entityType="Request" entityId={request.id} />
              {request.requestNumber && (
                <span className="font-mono text-sm text-gray-500">{request.requestNumber}</span>
              )}
              <h2 className="text-2xl font-bold text-gray-900">{request.title}</h2>
              <StatusBadge status={request.status} map={REQUEST_STATUS} />
              <StatusBadge status={request.priority} map={PRIORITY} />
              {request.project && (
                <button
                  onClick={() => navigate(`/projects/${request.project!.id}`)}
                  className="inline-flex items-center rounded-full bg-primary-100 px-2.5 py-0.5 text-xs font-medium text-primary-700 hover:bg-primary-200"
                >
                  {request.project.projectNumber}
                </button>
              )}
            </div>
            {request.description && (
              <p className="mt-1 text-sm text-gray-500">{request.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StartChatButton entityType="Request" entityId={request.id} label={request.title} />
          {userCanWrite && (
          <ActionMenu
            primaryActions={[
              {
                label: 'Offerte aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>,
                onClick: handleCreateQuote,
                isLoading: createQuoteMutation.isPending,
              },
              ...(!request.projectId ? [{
                label: 'Project toekennen',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>,
                onClick: async () => {
                  try {
                    const project = await createProjectMutation.mutateAsync(request.id);
                    showToast('Project aangemaakt', 'success');
                    navigate(`/projects/${project.id}`);
                  } catch (err) {
                    showToast(getErrorMessage(err, 'Project aanmaken mislukt'), 'error');
                  }
                },
                isLoading: createProjectMutation.isPending,
              }] : []),
            ]}
            secondaryActions={[
              {
                label: 'Contactmoment loggen',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                onClick: () => setIsLogOpen(true),
              },
              {
                label: 'Taak aanmaken',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
                onClick: () => setIsTaskOpen(true),
              },
            ]}
          />
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        tabs={[
          { key: 'overzicht' as Tab, label: 'Overzicht' },
          { key: 'status' as Tab, label: 'Status', count: request.statusHistory?.length || 0 },
        ]}
        active={activeTab}
        onChange={setActiveTab}
      />

      {/* Tab: Overzicht */}
      {activeTab === 'overzicht' && (
        <RequestOverviewTab
          request={request}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          updateMutation={updateMutation}
        />
      )}

      {/* Tab: Status */}
      {activeTab === 'status' && (
        <RequestStatusTab
          request={request}
          userCanWrite={!!userCanWrite}
          updateStatusMutation={updateStatusMutation}
        />
      )}


      {/* Acties onderaan */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-6">
        <p className="text-xs text-gray-400">
          Aangemaakt op {formatDate(request.createdAt)}
          {request.createdByUser && ` door ${request.createdByUser.firstName} ${request.createdByUser.lastName}`}
        </p>
        {userCanWrite && (
          <div className="flex gap-2">
            {!isEditing && (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                Bewerken
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Aanvraag verwijderen
            </Button>
          </div>
        )}
      </div>

      {request && (
        <>
          <CreateTaskModal
            isOpen={isTaskOpen}
            onClose={() => setIsTaskOpen(false)}
            entityType={TaskEntityType.REQUEST}
            entityId={request.id}
          />
          <AddLogModal
            isOpen={isLogOpen}
            onClose={() => setIsLogOpen(false)}
            contactId={request.contactId}
          />
        </>
      )}
    </div>
    </DetailPageLayout>
  );
}
