import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  ProjectStatus,
  TaskEntityType,
  TaskStatus,
  DocumentEntityType,
  Role,
} from '@/types';
import type { Project, ProjectFollower } from '@/types';
import { ActionMenu, Button, Spinner, Input, Select, Card, Modal } from '@/components/ui';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { DocumentsSection, UploadDocumentModal } from '@/components/documents';
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
import type { ProjectLocation } from './hooks/use-projects';
import {
  useProjectFollowers,
  useAddProjectFollower,
  useRemoveProjectFollower,
} from './hooks/use-project-followers';
import { useTasks, useUpdateTask } from '../tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { LinkEntitiesModal } from './components/link-entities-modal';
import { apiClient } from '@/lib/api-client';
import { useEffect } from 'react';

// ─── Constants ─────────────────────────────────────────────

type Tab =
  | 'overzicht'
  | 'aanvragen'
  | 'offertes'
  | 'planning'
  | 'volgers';

const statusColors: Record<string, string> = {
  [ProjectStatus.ACTIEF]: 'bg-green-100 text-green-800',
  [ProjectStatus.ON_HOLD]: 'bg-yellow-100 text-yellow-800',
  [ProjectStatus.AFGEROND]: 'bg-blue-100 text-blue-800',
  [ProjectStatus.GEANNULEERD]: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  [ProjectStatus.ACTIEF]: 'Actief',
  [ProjectStatus.ON_HOLD]: 'On hold',
  [ProjectStatus.AFGEROND]: 'Afgerond',
  [ProjectStatus.GEANNULEERD]: 'Geannuleerd',
};

const statusOptions = [
  { value: ProjectStatus.ACTIEF, label: 'Actief' },
  { value: ProjectStatus.ON_HOLD, label: 'On hold' },
  { value: ProjectStatus.AFGEROND, label: 'Afgerond' },
  { value: ProjectStatus.GEANNULEERD, label: 'Geannuleerd' },
];

const canWrite = [
  Role.SUPERUSER,
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
];

// ─── Settings schema ────────────────────────────────────────

const settingsSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus),
  projectManagerId: z.string().optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  endDate: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

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
  const [isDocUploadOpen, setIsDocUploadOpen] = useState(false);
  const [addFollowerOpen, setAddFollowerOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

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
  const removeFollowerMutation = useRemoveProjectFollower(id!);

  // Users for PM dropdown
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);
  useEffect(() => {
    apiClient
      .get<any[]>('/users')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any).data ?? [];
        setUsers(
          list.map((u: any) => ({
            value: u.id,
            label: `${u.firstName} ${u.lastName}`,
          })),
        );
      })
      .catch(() => {});
  }, []);

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
  ) => {
    const payload: Record<string, string[]> = {};
    if (entityType === 'requests') payload.requestIds = [entityId];
    if (entityType === 'quotes') payload.quoteIds = [entityId];
    if (entityType === 'planning') payload.planningItemIds = [entityId];
    try {
      await unassignMutation.mutateAsync(payload);
      showToast('Ontkoppeld', 'success');
    } catch {
      showToast('Ontkoppelen mislukt', 'error');
    }
  };

  const handleRemoveFollower = async (followerId: string) => {
    try {
      await removeFollowerMutation.mutateAsync(followerId);
      showToast('Volger verwijderd', 'success');
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      showToast('Project verwijderd', 'success');
      navigate('/projects');
    } catch {
      showToast('Verwijderen mislukt', 'error');
    }
  };

  return (
    <>
      <DetailPageLayout
        iconStrip
        sidebar={
          <>
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

            <SidebarSection
              icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              label="Audit"
            >
              <AuditHistory entityType="Project" entityId={id} />
            </SidebarSection>
          </>
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
                <h1 className="text-2xl font-bold text-gray-900">
                  {project.projectNumber}
                </h1>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-800'}`}
                >
                  {statusLabels[project.status] || project.status}
                </span>
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
                  {
                    label: 'Document uploaden',
                    icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
                    onClick: () => setIsDocUploadOpen(true),
                  },
                ]}
              />
            )}
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-6">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                    activeTab === t.key
                      ? 'border-primary-500 text-primary-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                  {t.count !== undefined && t.count > 0 && (
                    <span className="ml-1.5 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      {t.count}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </div>

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
                } catch {
                  showToast('Bijwerken mislukt', 'error');
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
              onUnlink={(entityId) => handleUnassign('requests', entityId)}
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
              onUnlink={(entityId) => handleUnassign('quotes', entityId)}
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
              onUnlink={(entityId) => handleUnassign('planning', entityId)}
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

      {/* Upload document modal */}
      {isDocUploadOpen && (
        <UploadDocumentModal
          isOpen={isDocUploadOpen}
          onClose={() => setIsDocUploadOpen(false)}
          entityType={DocumentEntityType.PROJECT}
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
            } catch {
              showToast('Toevoegen mislukt', 'error');
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
    </>
  );
}

// ─── Overview Tab ──────────────────────────────────────────

function OverviewTab({
  project,
  contactName,
  canWrite,
  users,
  linkedLocations,
  onUpdate,
  isUpdating,
  onDelete,
}: {
  project: Project;
  contactName: string;
  canWrite: boolean;
  users: { value: string; label: string }[];
  linkedLocations: ProjectLocation[];
  onUpdate: (data: any) => Promise<void>;
  isUpdating: boolean;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  // Populate form with project data
  useEffect(() => {
    if (project) {
      resetForm({
        title: project.title,
        description: project.description || '',
        status: project.status,
        projectManagerId: project.projectManagerId || '',
        startDate: project.startDate?.split('T')[0] || '',
        expectedEndDate: project.expectedEndDate?.split('T')[0] || '',
        endDate: project.endDate?.split('T')[0] || '',
      });
    }
  }, [project, resetForm]);

  const handleSave = async (data: SettingsForm) => {
    await onUpdate(data);
    setIsEditing(false);
  };

  const handleCancel = () => {
    resetForm({
      title: project.title,
      description: project.description || '',
      status: project.status,
      projectManagerId: project.projectManagerId || '',
      startDate: project.startDate?.split('T')[0] || '',
      expectedEndDate: project.expectedEndDate?.split('T')[0] || '',
      endDate: project.endDate?.split('T')[0] || '',
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {!isEditing ? (
        /* ── Read-only mode ── */
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="mb-4 font-semibold text-gray-900">Projectgegevens</h3>
              <dl className="space-y-3">
                <InfoField label="Projectnummer" value={project.projectNumber} />
                <InfoField label="Titel" value={project.title} />
                <InfoField label="Beschrijving" value={project.description} />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[project.status] || 'bg-gray-100 text-gray-800'}`}
                    >
                      {statusLabels[project.status] || project.status}
                    </span>
                  </dd>
                </div>
              </dl>
            </Card>

            <Card>
              <h3 className="mb-4 font-semibold text-gray-900">Details</h3>
              <dl className="space-y-3">
                <InfoField label="Relatie" value={contactName} />
                <InfoField
                  label="Projectmanager"
                  value={
                    project.projectManager
                      ? `${project.projectManager.firstName} ${project.projectManager.lastName}`
                      : null
                  }
                />
                <InfoField
                  label="Startdatum"
                  value={project.startDate ? new Date(project.startDate).toLocaleDateString('nl-NL') : null}
                />
                <InfoField
                  label="Verwachte einddatum"
                  value={project.expectedEndDate ? new Date(project.expectedEndDate).toLocaleDateString('nl-NL') : null}
                />
                <InfoField
                  label="Einddatum"
                  value={project.endDate ? new Date(project.endDate).toLocaleDateString('nl-NL') : null}
                />
              </dl>
            </Card>

            <Card>
              <h3 className="mb-4 font-semibold text-gray-900">Locaties</h3>
              {linkedLocations.length > 0 ? (
                <ul className="space-y-2">
                  {linkedLocations.map((loc) => (
                    <li key={loc.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{loc.name}</div>
                      <div className="text-xs text-gray-500">
                        {loc.street} {loc.houseNumber}, {loc.postalCode} {loc.city}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">
                  Nog geen locaties gekoppeld via aanvragen, offertes of planregels.
                </p>
              )}
            </Card>

            {/* Quick counts */}
            {project._count && (
              <Card>
                <h3 className="mb-4 font-semibold text-gray-900">Gekoppelde items</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {project._count.requests}
                    </div>
                    <div className="text-xs text-gray-500">Aanvragen</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {project._count.quotes}
                    </div>
                    <div className="text-xs text-gray-500">Offertes</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {project._count.planningItems}
                    </div>
                    <div className="text-xs text-gray-500">Planregels</div>
                  </div>
                </div>
              </Card>
            )}
          </div>

          {/* Documenten */}
          <Card>
            <DocumentsSection
              entityType={DocumentEntityType.PROJECT}
              entityId={project.id}
              canUpload={canWrite}
            />
          </Card>

          {/* Bottom actions */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-400">
              Aangemaakt op {new Date(project.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {project.createdByUser && ` door ${project.createdByUser.firstName} ${project.createdByUser.lastName}`}
            </p>
            {canWrite && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  Bewerken
                </Button>
                <Button variant="danger" onClick={onDelete}>
                  Verwijderen
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Edit mode ── */
        <Card>
          <h3 className="mb-4 font-semibold text-gray-900">Project bewerken</h3>
          <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Titel *
                </label>
                <Input {...register('title')} />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <Select options={statusOptions} {...register('status')} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Beschrijving
              </label>
              <textarea
                {...register('description')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                rows={3}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Projectmanager
              </label>
              <Select
                options={[
                  { value: '', label: 'Geen' },
                  ...users,
                ]}
                {...register('projectManagerId')}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Startdatum
                </label>
                <Input type="date" {...register('startDate')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Verwachte einddatum
                </label>
                <Input type="date" {...register('expectedEndDate')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Einddatum
                </label>
                <Input type="date" {...register('endDate')} />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={isUpdating}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                isLoading={isUpdating}
                disabled={!isDirty}
              >
                Opslaan
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}

// ─── InfoField ─────────────────────────────────────────────

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

// ─── Linked Entities Tab ────────────────────────────────────

function LinkedEntitiesTab({
  items,
  entityType,
  canWrite,
  onLink,
  onUnlink,
  onNavigate,
  getLabel,
  getSubLabel,
}: {
  items: any[];
  entityType: string;
  canWrite: boolean;
  onLink: () => void;
  onUnlink: (id: string) => void;
  onNavigate: (id: string) => void;
  getLabel: (item: any) => string;
  getSubLabel: (item: any) => string;
}) {
  const entityLabels: Record<string, string> = {
    requests: 'Aanvragen',
    quotes: 'Offertes',
    planning: 'Planregels',
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">
          {entityLabels[entityType] || entityType}
        </h3>
        {canWrite && (
          <Button variant="secondary" onClick={onLink}>
            Koppelen
          </Button>
        )}
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
          >
            <button
              className="min-w-0 flex-1 text-left hover:text-primary-600"
              onClick={() => onNavigate(item.id)}
            >
              <div className="text-sm font-medium text-gray-900">
                {getLabel(item)}
              </div>
              <div className="text-xs text-gray-500">{getSubLabel(item)}</div>
            </button>
            {canWrite && (
              <Button
                variant="ghost"
                onClick={() => onUnlink(item.id)}
              >
                Ontkoppelen
              </Button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <p className="text-sm text-gray-500">
            Geen {entityLabels[entityType]?.toLowerCase() || 'items'} gekoppeld
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Followers Tab ──────────────────────────────────────────

function FollowersTab({
  followers,
  canWrite,
  onAdd,
  onRemove,
}: {
  followers: ProjectFollower[];
  canWrite: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">Volgers</h3>
        {canWrite && (
          <Button variant="secondary" onClick={onAdd}>
            Volger toevoegen
          </Button>
        )}
      </div>
      <div className="space-y-3">
        {followers.map((f) => {
          const email = f.user?.email ?? f.email ?? '—';
          const name = f.user
            ? `${f.user.firstName} ${f.user.lastName}`
            : f.name ?? email;
          return (
            <div
              key={f.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 p-3"
            >
              <div>
                <div className="text-sm font-medium text-gray-900">{name}</div>
                {!f.user && f.email && (
                  <div className="text-xs text-gray-500">{email}</div>
                )}
              </div>
              {canWrite && (
                <Button
                  variant="ghost"
                  onClick={() => onRemove(f.id)}
                >
                  Verwijderen
                </Button>
              )}
            </div>
          );
        })}
        {followers.length === 0 && (
          <p className="text-sm text-gray-500">Geen volgers toegevoegd</p>
        )}
      </div>
    </div>
  );
}

// ─── Danger Zone (Instellingen tab) ─────────────────────────

function DangerZone({
  canWrite,
  onDelete,
}: {
  canWrite: boolean;
  onDelete: () => void;
}) {
  if (!canWrite) {
    return (
      <p className="text-sm text-gray-500">
        Je hebt geen rechten om dit project te bewerken.
      </p>
    );
  }

  return (
    <Card>
      <h3 className="mb-2 font-semibold text-red-600">Gevarenzone</h3>
      <p className="mb-4 text-sm text-gray-500">
        Een verwijderd project kan niet worden hersteld.
      </p>
      <Button variant="danger" onClick={onDelete}>
        Project verwijderen
      </Button>
    </Card>
  );
}

// ─── Add Follower Modal ─────────────────────────────────────

function AddFollowerModal({
  projectId,
  onClose,
  onAdd,
  isAdding,
}: {
  projectId: string;
  onClose: () => void;
  onAdd: (data: { userId?: string; email?: string; name?: string }) => void;
  isAdding: boolean;
}) {
  const [mode, setMode] = useState<'user' | 'external'>('user');
  const [userId, setUserId] = useState('');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [users, setUsers] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    apiClient
      .get<any[]>('/users')
      .then((res) => {
        const list = Array.isArray(res) ? res : (res as any).data ?? [];
        setUsers(
          list.map((u: any) => ({
            value: u.id,
            label: `${u.firstName} ${u.lastName}`,
          })),
        );
      })
      .catch(() => {});
  }, []);

  const handleSubmit = () => {
    if (mode === 'user' && userId) {
      onAdd({ userId });
    } else if (mode === 'external' && email) {
      onAdd({ email, name: name || undefined });
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Volger toevoegen">
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            variant={mode === 'user' ? 'primary' : 'secondary'}
            onClick={() => setMode('user')}
          >
            Medewerker
          </Button>
          <Button
            variant={mode === 'external' ? 'primary' : 'secondary'}
            onClick={() => setMode('external')}
          >
            Extern
          </Button>
        </div>

        {mode === 'user' ? (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Medewerker
            </label>
            <Select
              options={[
                { value: '', label: 'Selecteer medewerker...' },
                ...users,
              ]}
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
        ) : (
          <>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                E-mailadres
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@voorbeeld.nl"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Naam
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Naam (optioneel)"
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button
            onClick={handleSubmit}
            isLoading={isAdding}
            disabled={mode === 'user' ? !userId : !email}
          >
            Toevoegen
          </Button>
        </div>
      </div>
    </Modal>
  );
}
