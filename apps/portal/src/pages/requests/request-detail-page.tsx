import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RequestStatus,
  RequestSource,
  Priority,
  Role,
  TaskEntityType,
  TaskStatus,
  DocumentEntityType,
} from '@/types';
import type { Task } from '@/types';
import { Button, Card, Spinner, Select, Input, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  useRequest,
  useUpdateRequest,
  useUpdateRequestStatus,
  useDeleteRequest,
  useOrgUsers,
} from './hooks/use-requests';
import { useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { ContactSearchInput } from '@/components/contacts/contact-search-input';
import { useCreateQuoteFromRequest } from '@/pages/quotes/hooks/use-quotes';
import { useTasks, useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { DocumentsSection } from '@/components/documents';

type Tab = 'algemeen' | 'taken';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

const statusColors: Record<string, string> = {
  [RequestStatus.NIEUW]: 'bg-blue-100 text-blue-800',
  [RequestStatus.IN_BEHANDELING]: 'bg-yellow-100 text-yellow-800',
  [RequestStatus.OFFERTE_GEMAAKT]: 'bg-purple-100 text-purple-800',
  [RequestStatus.GEWONNEN]: 'bg-green-100 text-green-800',
  [RequestStatus.VERLOREN]: 'bg-red-100 text-red-800',
  [RequestStatus.ON_HOLD]: 'bg-gray-100 text-gray-600',
};

const statusLabels: Record<string, string> = {
  [RequestStatus.NIEUW]: 'Nieuw',
  [RequestStatus.IN_BEHANDELING]: 'In behandeling',
  [RequestStatus.OFFERTE_GEMAAKT]: 'Offerte gemaakt',
  [RequestStatus.GEWONNEN]: 'Gewonnen',
  [RequestStatus.VERLOREN]: 'Verloren',
  [RequestStatus.ON_HOLD]: 'On hold',
};

const priorityColors: Record<string, string> = {
  [Priority.HIGH]: 'bg-red-100 text-red-800',
  [Priority.NORMAL]: 'bg-yellow-100 text-yellow-800',
  [Priority.LOW]: 'bg-gray-100 text-gray-600',
};

const priorityLabels: Record<string, string> = {
  [Priority.HIGH]: 'Hoog',
  [Priority.NORMAL]: 'Normaal',
  [Priority.LOW]: 'Laag',
};

const sourceLabels: Record<string, string> = {
  MANUAL: 'Handmatig',
  WEB_FORM: 'Webformulier',
  EMAIL: 'E-mail',
  PHONE: 'Telefoon',
};

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

const statusOptions = Object.values(RequestStatus).map((s) => ({
  value: s,
  label: statusLabels[s] || s,
}));

const priorityOptions = [
  { value: Priority.LOW, label: 'Laag' },
  { value: Priority.NORMAL, label: 'Normaal' },
  { value: Priority.HIGH, label: 'Hoog' },
];

const sourceOptions2 = [
  { value: RequestSource.MANUAL, label: 'Handmatig' },
  { value: RequestSource.PHONE, label: 'Telefoon' },
  { value: RequestSource.EMAIL, label: 'E-mail' },
  { value: RequestSource.WEB_FORM, label: 'Webformulier' },
];

const editSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  contactId: z.string().min(1, 'Relatie is verplicht'),
  locationId: z.string().optional(),
  source: z.nativeEnum(RequestSource),
  priority: z.nativeEnum(Priority),
  assignedTo: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getContactName(contact?: { companyName?: string | null; firstName?: string | null; lastName?: string | null }): string {
  if (!contact) return '—';
  if (contact.companyName) return contact.companyName;
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: request, isLoading, error } = useRequest(id!);
  const updateMutation = useUpdateRequest(id!);
  const updateStatusMutation = useUpdateRequestStatus(id!);
  const deleteMutation = useDeleteRequest();
  const createQuoteMutation = useCreateQuoteFromRequest();
  const updateTaskMutation = useUpdateTask();
  const { data: allUsers } = useOrgUsers();

  // Fetch tasks linked to this request
  const { data: tasksData } = useTasks({
    entityType: TaskEntityType.REQUEST,
    entityId: id,
    limit: 100,
  });
  const requestTasks = tasksData?.data || [];
  const incompleteTasks = requestTasks.filter((t) => t.status !== TaskStatus.VOLTOOID);

  const [activeTab, setActiveTab] = useState<Tab>('algemeen');
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [editContactId, setEditContactId] = useState('');

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  // Fetch locations for the selected contact in edit mode
  const { data: editLocationsData } = useContactLocations(editContactId);
  const editLocations = editLocationsData || [];

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue,
    formState: { errors: formErrors, isDirty },
  } = useForm<EditFormData>({ resolver: zodResolver(editSchema) });

  const handleEditContactSelect = (contactId: string) => {
    if (contactId !== editContactId) {
      setValue('contactId', contactId, { shouldValidate: true });
      setEditContactId(contactId);
      if (request && contactId !== request.contactId) {
        setValue('locationId', '');
      }
    }
  };

  useEffect(() => {
    if (request) {
      resetForm({
        title: request.title,
        description: request.description || '',
        contactId: request.contactId,
        locationId: request.locationId || '',
        source: request.source,
        priority: request.priority,
        assignedTo: request.assignedTo || '',
      });
      setEditContactId(request.contactId);
    }
  }, [request, resetForm]);

  const onSubmitEdit = async (data: EditFormData) => {
    try {
      await updateMutation.mutateAsync({
        title: data.title,
        description: data.description || undefined,
        contactId: data.contactId,
        locationId: data.locationId || undefined,
        source: data.source,
        priority: data.priority,
        assignedTo: data.assignedTo || undefined,
      });
      showToast('Aanvraag bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  const handleCancelEdit = () => {
    if (request) {
      resetForm({
        title: request.title,
        description: request.description || '',
        contactId: request.contactId,
        locationId: request.locationId || '',
        source: request.source,
        priority: request.priority,
        assignedTo: request.assignedTo || '',
      });
      setEditContactId(request.contactId);
    }
    setIsEditing(false);
  };

  const users = Array.isArray(allUsers) ? allUsers : [];

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'algemeen', label: 'Algemeen' },
    { key: 'taken', label: 'Taken', count: incompleteTasks.length },
  ];

  const handleCreateQuote = async () => {
    if (!request) return;
    try {
      const quote = await createQuoteMutation.mutateAsync(request.id);
      showToast('Offerte aangemaakt', 'success');
      navigate(`/quotes/${quote.id}/edit`);
    } catch {
      showToast('Offerte aanmaken mislukt', 'error');
    }
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    try {
      await updateStatusMutation.mutateAsync({
        status: newStatus,
        note: statusNote || undefined,
      });
      showToast('Status bijgewerkt', 'success');
      setNewStatus('');
      setStatusNote('');
    } catch {
      showToast('Status wijzigen mislukt', 'error');
    }
  };

  const handleDelete = async () => {
    if (!request) return;
    if (!window.confirm('Weet u zeker dat u deze aanvraag wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(request.id);
      showToast('Aanvraag verwijderd', 'success');
      navigate('/requests');
    } catch {
      showToast('Verwijderen mislukt', 'error');
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
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        {error?.message || 'Aanvraag niet gevonden'}
      </div>
    );
  }

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Request" entityId={id} />}>
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
              <h2 className="text-2xl font-bold text-gray-900">{request.title}</h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  statusColors[request.status] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {statusLabels[request.status] || request.status}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  priorityColors[request.priority] || 'bg-gray-100 text-gray-600'
                }`}
              >
                {priorityLabels[request.priority] || request.priority}
              </span>
            </div>
            {request.description && (
              <p className="mt-1 text-sm text-gray-500">{request.description}</p>
            )}
          </div>
        </div>
        {userCanWrite && (
          <div className="flex gap-2">
            {(request.status === RequestStatus.NIEUW ||
              request.status === RequestStatus.IN_BEHANDELING) && (
              <Button
                size="sm"
                onClick={handleCreateQuote}
                isLoading={createQuoteMutation.isPending}
              >
                Offerte aanmaken
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => setIsTaskOpen(true)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
              Taak aanmaken
            </Button>
            {!isEditing && (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Bewerken
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-100 px-1.5 text-xs font-semibold text-primary-700">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content: Algemeen */}
      {activeTab === 'algemeen' && (
        <div className="space-y-6">
          {isEditing ? (
            <Card>
              <form onSubmit={handleSubmit(onSubmitEdit)} className="space-y-4">
                <Input
                  label="Titel"
                  error={formErrors.title?.message}
                  {...register('title')}
                />
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Beschrijving</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    placeholder="Optionele toelichting"
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <ContactSearchInput
                    label="Relatie"
                    value={editContactId}
                    onSelect={handleEditContactSelect}
                    error={formErrors.contactId?.message}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Locatie</label>
                    <select
                      {...register('locationId')}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">Geen locatie</option>
                      {editLocations.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.name} — {l.city}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <Select
                    label="Bron"
                    options={sourceOptions2}
                    {...register('source')}
                  />
                  <Select
                    label="Prioriteit"
                    options={priorityOptions}
                    {...register('priority')}
                  />
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Toegewezen aan</label>
                    <select
                      {...register('assignedTo')}
                      className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    >
                      <option value="">Niet toegewezen</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.firstName} {u.lastName}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                {/* Read-only fields */}
                <div className="grid grid-cols-2 gap-6 border-t border-gray-100 pt-4 lg:grid-cols-3">
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Aangemaakt door</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {request.createdByUser
                        ? `${request.createdByUser.firstName} ${request.createdByUser.lastName}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Aangemaakt op</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {formatDate(request.createdAt)}
                    </dd>
                  </div>
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={handleCancelEdit}
                    disabled={updateMutation.isPending}
                  >
                    Annuleren
                  </Button>
                  <Button
                    type="submit"
                    isLoading={updateMutation.isPending}
                    disabled={!isDirty}
                  >
                    Opslaan
                  </Button>
                </div>
              </form>
            </Card>
          ) : (
            <Card>
              <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Titel</dt>
                  <dd className="mt-1 text-sm text-gray-900">{request.title}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Beschrijving</dt>
                  <dd className="mt-1 text-sm text-gray-900">{request.description || '—'}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Prioriteit</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        priorityColors[request.priority] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {priorityLabels[request.priority] || request.priority}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Relatie</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {request.contact ? (
                      <Link
                        to={`/contacts/${request.contactId}`}
                        className="text-primary-600 hover:text-primary-800 hover:underline"
                      >
                        {getContactName(request.contact)}
                      </Link>
                    ) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Locatie</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {request.location
                      ? `${request.location.name} — ${request.location.city}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Bron</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {sourceLabels[request.source] || request.source}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Toegewezen aan</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {request.assignedUser
                      ? `${request.assignedUser.firstName} ${request.assignedUser.lastName}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Aangemaakt door</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {request.createdByUser
                      ? `${request.createdByUser.firstName} ${request.createdByUser.lastName}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Aangemaakt op</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {formatDate(request.createdAt)}
                  </dd>
                </div>
              </div>
            </Card>
          )}

          {/* Status wijzigen */}
          {userCanWrite && (
            <Card>
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Status wijzigen</h3>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="w-56">
                  <Select
                    label="Nieuwe status"
                    options={statusOptions}
                    value={newStatus}
                    onChange={(e) => setNewStatus(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    label="Notitie (optioneel)"
                    placeholder="Toelichting bij statuswijziging..."
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                  />
                </div>
                <Button
                  onClick={handleStatusUpdate}
                  isLoading={updateStatusMutation.isPending}
                  disabled={!newStatus || newStatus === request.status}
                >
                  Bijwerken
                </Button>
              </div>
            </Card>
          )}

          {/* Status historie */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Statushistorie</h3>
            {(request.statusHistory?.length || 0) === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">
                Geen statushistorie beschikbaar
              </p>
            ) : (
              <div className="space-y-3">
                {request.statusHistory?.map((entry) => (
                  <Card key={entry.id}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {entry.fromStatus && (
                          <>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                statusColors[entry.fromStatus] || 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {statusLabels[entry.fromStatus] || entry.fromStatus}
                            </span>
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </>
                        )}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            statusColors[entry.toStatus] || 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {statusLabels[entry.toStatus] || entry.toStatus}
                        </span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDate(entry.changedAt)}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="mt-2 text-sm text-gray-600">{entry.note}</p>
                    )}
                    {entry.changedByUser && (
                      <p className="mt-1 text-xs text-gray-400">
                        Door {entry.changedByUser.firstName} {entry.changedByUser.lastName}
                      </p>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Documenten */}
          <Card>
            <DocumentsSection
              entityType={DocumentEntityType.REQUEST}
              entityId={request.id}
              canUpload={!!userCanWrite}
            />
          </Card>

          {/* Verwijderen */}
          {userCanWrite && (
            <div className="flex justify-end border-t border-gray-200 pt-6">
              <Button variant="danger" size="sm" onClick={handleDelete}>
                Aanvraag verwijderen
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Tab content: Taken */}
      {activeTab === 'taken' && (
        <RequestTasksTab
          tasks={requestTasks}
          userCanWrite={!!userCanWrite}
          onCreateTask={() => setIsTaskOpen(true)}
          onStatusChange={async (taskId, newStatus) => {
            try {
              await updateTaskMutation.mutateAsync({ id: taskId, data: { status: newStatus } });
              showToast('Taakstatus bijgewerkt', 'success');
            } catch {
              showToast('Status bijwerken mislukt', 'error');
            }
          }}
          navigate={navigate}
        />
      )}

      {request && (
        <CreateTaskModal
          isOpen={isTaskOpen}
          onClose={() => setIsTaskOpen(false)}
          entityType={TaskEntityType.REQUEST}
          entityId={request.id}
        />
      )}
    </div>
    </DetailPageLayout>
  );
}

// ─── RequestTasksTab ───────────────────────────────────

function RequestTasksTab({
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
        <p className="py-8 text-center text-sm text-gray-500">
          Nog geen taken voor deze aanvraag
        </p>
      ) : (
        <div className="space-y-6">
          {incomplete.length > 0 && (
            <div className="space-y-2">
              {incomplete.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={onStatusChange}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
          {completed.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-500">
                Voltooid ({completed.length})
              </h4>
              {completed.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onStatusChange={onStatusChange}
                  navigate={navigate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── TaskCard ──────────────────────────────────────────

function TaskCard({
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
      className={`group flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-gray-50 ${
        isCompleted ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      {/* Checkbox for quick status toggle */}
      <button
        type="button"
        onClick={() =>
          onStatusChange(
            task.id,
            isCompleted ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID,
          )
        }
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

      {/* Task info */}
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
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
              taskStatusColors[task.status] || 'bg-gray-100 text-gray-600'
            }`}
          >
            {taskStatusLabels[task.status] || task.status}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
          {task.assignee && (
            <span>
              {task.assignee.firstName} {task.assignee.lastName}
            </span>
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
