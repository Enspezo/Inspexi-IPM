import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  TaskEntityType,
  TaskStatus,
  DocumentEntityType,
  Role,
  NoteEntityType,
} from '@/types';
import { ActionMenu, Button, Spinner, StatusBadge, Modal, Tabs } from '@/components/ui';
import { PROJECT_STATUS } from '@/lib/status';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { FavoriteStar } from '@/components/favorites/favorite-star';
import { NotesSidebarSection, HistorySidebarSection, DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { useAuth } from '@/providers/auth-provider';
import { useToast } from '@/components/ui';
import {
  useProject,
  useUpdateProject,
  useDeleteProject,
  useProjectRequests,
  useProjectQuotes,
  useProjectPlanning,
  useProjectLocations,
  useUnassignFromProject,
} from './hooks/use-projects';
import {
  useProjectFollowers,
  useAddProjectFollower,
  useUpdateProjectFollower,
  useRemoveProjectFollower,
} from './hooks/use-project-followers';
import { useTasks, useUpdateTask } from '../tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { LinkEntitiesModal } from './components/link-entities-modal';
import { OverviewTab } from './components/project-overview-tab';
import { LinkedEntitiesTab } from './components/project-linked-entities-tab';
import { FollowersTab } from './components/project-followers-tab';
import { AddFollowerModal } from './components/add-follower-modal';
import { getErrorMessage } from '@/lib/api-client';
import { useUsers } from '@/pages/users/hooks/use-users';

// ─── Constants ─────────────────────────────────────────────

type Tab =
  | 'overzicht'
  | 'aanvragen'
  | 'offertes'
  | 'planning'
  | 'volgers';

const canWrite = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];

// ─── Component ──────────────────────────────────────────────

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [linkType, setLinkType] = useState<
    'requests' | 'quotes' | 'planning' | null
  >(null);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [addFollowerOpen, setAddFollowerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState<{
    entityType: 'requests' | 'quotes' | 'planning';
    entityId: string;
    label: string;
  } | null>(null);
  const [confirmRemoveFollower, setConfirmRemoveFollower] = useState<{
    followerId: string;
    name: string;
  } | null>(null);

  const { data: project, isLoading, error } = useProject(id!);
  const updateMutation = useUpdateProject(id!);
  const deleteMutation = useDeleteProject(id!);

  const { data: requests } = useProjectRequests(id!);
  const { data: quotes } = useProjectQuotes(id!);
  const { data: planning } = useProjectPlanning(id!);
  const { data: linkedLocations } = useProjectLocations(id!);
  const { data: followers } = useProjectFollowers(id!);
  const { data: tasksData } = useTasks({
    entityType: TaskEntityType.PROJECT,
    entityId: id,
    limit: 100,
  });
  const updateTaskMutation = useUpdateTask();
  const unassignMutation = useUnassignFromProject(id!);
  const addFollowerMutation = useAddProjectFollower(id!);
  const updateFollowerMutation = useUpdateProjectFollower(id!);
  const removeFollowerMutation = useRemoveProjectFollower(id!);

  // Users for PM dropdown — shared TanStack cache (deduped across components)
  const { data: allUsers } = useUsers();
  const users = useMemo(
    () =>
      (allUsers ?? []).map((u) => ({
        value: u.id,
        label: `${u.firstName} ${u.lastName}`,
      })),
    [allUsers],
  );

  const userCanWrite = user?.roles.some((r) => canWrite.includes(r));
  const tasks = tasksData?.data || [];

  const incompleteTasks = tasks.filter(t => t.status !== TaskStatus.VOLTOOID);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'aanvragen', label: 'Aanvragen', count: requests?.length },
    { key: 'offertes', label: 'Offertes', count: quotes?.length },
    { key: 'planning', label: 'Planning', count: planning?.length },
    { key: 'volgers', label: 'Volgers', count: followers?.length },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex h-64 items-center justify-center text-red-600">
        Project niet gevonden
      </div>
    );
  }

  const contactName =
    project.contact?.companyName ||
    [project.contact?.firstName, project.contact?.lastName]
      .filter(Boolean)
      .join(' ') ||
    '—';

  const handleUnassign = async (
    entityType: 'requests' | 'quotes' | 'planning',
    entityId: string,
    label: string,
  ) => {
    setConfirmUnlink({ entityType, entityId, label });
  };

  const confirmUnlinkAction = async () => {
    if (!confirmUnlink) return;
    const { entityType, entityId } = confirmUnlink;
    const payload: Record<string, string[]> = {};
    if (entityType === 'requests') payload.requestIds = [entityId];
    if (entityType === 'quotes') payload.quoteIds = [entityId];
    if (entityType === 'planning') payload.planningItemIds = [entityId];
    try {
      await unassignMutation.mutateAsync(payload);
      showToast('Ontkoppeld', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Ontkoppelen mislukt'), 'error');
    } finally {
      setConfirmUnlink(null);
    }
  };

  const handleRemoveFollower = (followerId: string, name: string) => {
    setConfirmRemoveFollower({ followerId, name });
  };

  const confirmRemoveFollowerAction = async () => {
    if (!confirmRemoveFollower) return;
    try {
      await removeFollowerMutation.mutateAsync(confirmRemoveFollower.followerId);
      showToast('Volger verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    } finally {
      setConfirmRemoveFollower(null);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      showToast('Project verwijderd', 'success');
      navigate('/projects');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  return (
    <>
      <DetailPageLayout
        iconStrip
        sidebar={
          <div className="space-y-8">
            <SidebarSection
              icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>}
              label="Taken"
              count={incompleteTasks.length}
            >
              <div className="space-y-2">
                {tasks.length === 0 ? (
                  <p className="text-sm text-gray-400">Geen taken</p>
                ) : (
                  tasks.map((task) => (
                    <div key={task.id} className="group flex items-start gap-2 rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
                      <button
                        type="button"
                        onClick={async () => {
                          const newStatus = task.status === TaskStatus.VOLTOOID ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID;
                          try {
                            await updateTaskMutation.mutateAsync({ id: task.id, data: { status: newStatus } });
                          } catch (err) {
                            showToast(getErrorMessage(err, 'Status wijzigen mislukt'), 'error');
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
                {userCanWrite && (
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

            <NotesSidebarSection entityType={NoteEntityType.PROJECT} entityId={id!} />

            <DocumentsSidebarSection
              entityType={DocumentEntityType.PROJECT}
              entityId={project.id}
              canUpload={userCanWrite}
            />

            <HistorySidebarSection entityType="Project" entityId={id} />
          </div>
        }
      >
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Link to="/projects" className="text-sm text-gray-500 hover:text-gray-700">
                  Projecten
                </Link>
                <span className="text-sm text-gray-400">/</span>
              </div>
              <div className="flex items-center gap-3">
                <FavoriteStar entityType="Project" entityId={project.id} />
                <h1 className="text-2xl font-bold text-gray-900">
                  {project.projectNumber}
                </h1>
                <StatusBadge status={project.status} map={PROJECT_STATUS} />
              </div>
              <p className="mt-1 text-gray-600">{project.title}</p>
            </div>
            {userCanWrite && (
              <ActionMenu
                primaryActions={[
                  {
                    label: 'Volger toevoegen',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>,
                    onClick: () => setAddFollowerOpen(true),
                  },
                ]}
                secondaryActions={[
                  {
                    label: 'Taak aanmaken',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
                    onClick: () => setIsTaskOpen(true),
                  },
                ]}
              />
            )}
          </div>

          {/* Tabs */}
          <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

          {/* Tab: Overzicht */}
          {activeTab === 'overzicht' && (
            <OverviewTab
              project={project}
              contactName={contactName}
              canWrite={!!userCanWrite}
              users={users}
              linkedLocations={linkedLocations ?? []}
              onUpdate={async (data) => {
                try {
                  await updateMutation.mutateAsync(data);
                  showToast('Project bijgewerkt', 'success');
                } catch (err) {
                  showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
                }
              }}
              isUpdating={updateMutation.isPending}
              onDelete={() => setConfirmDelete(true)}
            />
          )}

          {/* Tab: Aanvragen */}
          {activeTab === 'aanvragen' && (
            <LinkedEntitiesTab
              items={requests || []}
              entityType="requests"
              canWrite={!!userCanWrite}
              onLink={() => setLinkType('requests')}
              onUnlink={(entityId, label) => handleUnassign('requests', entityId, label)}
              onNavigate={(entityId) => navigate(`/requests/${entityId}`)}
              getLabel={(item) => item.title}
              getSubLabel={(item) => item.status}
            />
          )}

          {/* Tab: Offertes */}
          {activeTab === 'offertes' && (
            <LinkedEntitiesTab
              items={quotes || []}
              entityType="quotes"
              canWrite={!!userCanWrite}
              onLink={() => setLinkType('quotes')}
              onUnlink={(entityId, label) => handleUnassign('quotes', entityId, label)}
              onNavigate={(entityId) => navigate(`/quotes/${entityId}`)}
              getLabel={(item) => item.quoteNumber || item.subject}
              getSubLabel={(item) => item.status}
            />
          )}

          {/* Tab: Planning */}
          {activeTab === 'planning' && (
            <LinkedEntitiesTab
              items={planning || []}
              entityType="planning"
              canWrite={!!userCanWrite}
              onLink={() => setLinkType('planning')}
              onUnlink={(entityId, label) => handleUnassign('planning', entityId, label)}
              onNavigate={(entityId) => navigate(`/planning/${entityId}`)}
              getLabel={(item) => item.productName}
              getSubLabel={(item) =>
                item.scheduledDate
                  ? new Date(item.scheduledDate).toLocaleDateString('nl-NL')
                  : 'Nog niet gepland'
              }
            />
          )}

          {/* Tab: Volgers */}
          {activeTab === 'volgers' && (
            <FollowersTab
              followers={followers || []}
              canWrite={!!userCanWrite}
              onAdd={() => setAddFollowerOpen(true)}
              onRemove={handleRemoveFollower}
              onUpdatePermissions={(followerId, data) =>
                updateFollowerMutation.mutateAsync({ followerId, data })
              }
            />
          )}

        </div>
      </DetailPageLayout>

      {/* Link entities modal */}
      {linkType && (
        <LinkEntitiesModal
          projectId={id!}
          entityType={linkType}
          onClose={() => setLinkType(null)}
        />
      )}

      {/* Create task modal */}
      {isTaskOpen && (
        <CreateTaskModal
          isOpen={isTaskOpen}
          onClose={() => setIsTaskOpen(false)}
          entityType={TaskEntityType.PROJECT}
          entityId={project.id}
        />
      )}

      {/* Add follower modal */}
      {addFollowerOpen && (
        <AddFollowerModal
          projectId={id!}
          onClose={() => setAddFollowerOpen(false)}
          onAdd={async (data) => {
            try {
              await addFollowerMutation.mutateAsync(data);
              showToast('Volger toegevoegd', 'success');
              setAddFollowerOpen(false);
            } catch (err) {
              showToast(getErrorMessage(err, 'Toevoegen mislukt'), 'error');
            }
          }}
          isAdding={addFollowerMutation.isPending}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Modal
          isOpen
          onClose={() => setConfirmDelete(false)}
          title="Project verwijderen"
        >
          <p className="text-sm text-gray-600">
            Weet je zeker dat je dit project wilt verwijderen? Dit kan niet
            ongedaan worden gemaakt.
          </p>
          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setConfirmDelete(false)}
            >
              Annuleren
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              Verwijderen
            </Button>
          </div>
        </Modal>
      )}

      {/* Confirm unlink */}
      {confirmUnlink && (
        <Modal
          isOpen
          onClose={() => setConfirmUnlink(null)}
          title="Ontkoppelen bevestigen"
        >
          <p className="text-sm text-gray-600">
            Weet je zeker dat je <span className="font-medium">{confirmUnlink.label}</span> wilt ontkoppelen van dit project?
          </p>
          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setConfirmUnlink(null)}
            >
              Annuleren
            </Button>
            <Button
              variant="danger"
              onClick={confirmUnlinkAction}
              isLoading={unassignMutation.isPending}
            >
              Ontkoppelen
            </Button>
          </div>
        </Modal>
      )}

      {/* Confirm remove follower */}
      {confirmRemoveFollower && (
        <Modal
          isOpen
          onClose={() => setConfirmRemoveFollower(null)}
          title="Volger verwijderen"
        >
          <p className="text-sm text-gray-600">
            Weet je zeker dat je <span className="font-medium">{confirmRemoveFollower.name}</span> als volger wilt verwijderen?
          </p>
          <div className="mt-4 flex justify-end gap-3">
            <Button
              variant="secondary"
              onClick={() => setConfirmRemoveFollower(null)}
            >
              Annuleren
            </Button>
            <Button
              variant="danger"
              onClick={confirmRemoveFollowerAction}
              isLoading={removeFollowerMutation.isPending}
            >
              Verwijderen
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
