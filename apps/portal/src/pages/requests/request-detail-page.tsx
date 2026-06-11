import { useState, useEffect, useRef } from 'react';
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
  CustomFieldEntityType,
  NoteEntityType,
} from '@/types';
import type { Task, ContactLog } from '@/types';
import { ActionMenu, type ActionMenuItem, Button, Card, ErrorBox, Spinner, StatusBadge, Select, Input, Tabs, useConfirm, useToast } from '@/components/ui';
import { getStatusConfig, LOG_TYPE, PRIORITY, REQUEST_SOURCE_LABELS, REQUEST_STATUS } from '@/lib/status';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { NotesSidebarSection, HistorySidebarSection, DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { useAuth } from '@/providers/auth-provider';
import {
  useRequest,
  useUpdateRequest,
  useUpdateRequestStatus,
  useDeleteRequest,
  useOrgUsers,
} from './hooks/use-requests';
import { useContactLocations, useContactLogs } from '@/pages/contacts/hooks/use-contacts';
import { AddLogModal } from '@/pages/contacts/components/add-log-modal';
import { ContactSearchInput } from '@/components/contacts/contact-search-input';
import { useCreateQuoteFromRequest } from '@/pages/quotes/hooks/use-quotes';
import { useTasks, useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { EditTaskModal } from '@/pages/tasks/components/edit-task-modal';
import { CustomFieldsDisplay, CustomFieldsForm } from '@/components/custom-fields';
import { useCreateProjectFromRequest } from '@/pages/projects/hooks/use-projects';

type Tab = 'overzicht' | 'status';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

const statusOptions = Object.values(RequestStatus).map((s) => ({
  value: s,
  label: REQUEST_STATUS[s]?.label || s,
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
  customFields: z.record(z.any()).optional(),
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
  const confirm = useConfirm();
  const { data: request, isLoading, error } = useRequest(id!);
  const updateMutation = useUpdateRequest(id!);
  const updateStatusMutation = useUpdateRequestStatus(id!);
  const deleteMutation = useDeleteRequest();
  const createQuoteMutation = useCreateQuoteFromRequest();
  const createProjectMutation = useCreateProjectFromRequest();
  const { data: allUsers } = useOrgUsers();

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
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
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
    control,
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
        customFields: request.customFields ?? {},
      } as any);
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
        customFields: data.customFields,
      } as any);
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
        customFields: request.customFields ?? {},
      } as any);
      setEditContactId(request.contactId);
    }
    setIsEditing(false);
  };

  const users = Array.isArray(allUsers) ? allUsers : [];

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
                  } catch {
                    showToast('Project aanmaken mislukt', 'error');
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
                <CustomFieldsForm
                  entityType={CustomFieldEntityType.REQUEST}
                  register={register}
                  errors={formErrors}
                  control={control}
                />
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
                        getStatusConfig(PRIORITY, request.priority).classes
                      }`}
                    >
                      {getStatusConfig(PRIORITY, request.priority).label}
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
                    {REQUEST_SOURCE_LABELS[request.source] || request.source}
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

          <CustomFieldsDisplay
            entityType={CustomFieldEntityType.REQUEST}
            customFields={request.customFields}
          />

        </div>
      )}

      {/* Tab: Status */}
      {activeTab === 'status' && (
        <div className="space-y-6">
          {/* Huidige status */}
          <Card>
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Huidige status</h3>
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${
                  getStatusConfig(REQUEST_STATUS, request.status).classes
                }`}
              >
                {getStatusConfig(REQUEST_STATUS, request.status).label}
              </span>
            </div>
          </Card>

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
                                getStatusConfig(REQUEST_STATUS, entry.fromStatus).classes
                              }`}
                            >
                              {getStatusConfig(REQUEST_STATUS, entry.fromStatus).label}
                            </span>
                            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </>
                        )}
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            getStatusConfig(REQUEST_STATUS, entry.toStatus).classes
                          }`}
                        >
                          {getStatusConfig(REQUEST_STATUS, entry.toStatus).label}
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
        </div>
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

// ─── RequestTasksSidebar ───────────────────────────────

function SidebarTaskCard({
  task,
  userCanWrite,
  onStatusChange,
  onEdit,
  navigate,
}: {
  task: Task;
  userCanWrite: boolean;
  onStatusChange: (taskId: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isCompleted = task.status === TaskStatus.VOLTOOID;
  const isOverdue = !isCompleted && task.deadline && new Date(task.deadline) < new Date();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      className={`group flex items-start gap-2.5 rounded-lg border p-2.5 transition-colors hover:bg-gray-50 ${
        isCompleted ? 'border-gray-100 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => onStatusChange(task.id, isCompleted ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID)}
        style={{ width: 18, height: 18 }}
        className={`mt-0.5 flex shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted ? 'border-green-500 bg-green-500 text-white' : 'border-gray-300 bg-white hover:border-primary-500'
        }`}
      >
        {isCompleted && (
          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div className="min-w-0 flex-1">
        <button
          onClick={() => navigate(`/tasks/${task.id}`)}
          className={`text-xs font-medium leading-snug hover:underline ${
            isCompleted ? 'text-gray-400 line-through' : 'text-gray-900'
          }`}
        >
          {task.title}
        </button>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-gray-500">
          {task.assignee && (
            <span title={`${task.assignee.firstName} ${task.assignee.lastName}`}>
              {task.assignee.initials || `${task.assignee.firstName[0]}${task.assignee.lastName[0]}`}
            </span>
          )}
          {task.deadline && (
            <span className={isOverdue ? 'font-medium text-red-600' : ''}>
              {new Date(task.deadline).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>
      </div>

      {userCanWrite && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
            className="rounded p-0.5 text-gray-300 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
            </svg>
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => { setMenuOpen(false); onEdit(task); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Bewerken
              </button>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); navigate(`/tasks/${task.id}`); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                Ga naar taak
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequestTasksSidebar({
  tasks,
  userCanWrite,
  onCreateTask,
}: {
  tasks: Task[];
  userCanWrite: boolean;
  onCreateTask: () => void;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const updateTaskMutation = useUpdateTask();
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);

  const incomplete = tasks.filter((t) => t.status !== TaskStatus.VOLTOOID);
  const completed = tasks.filter((t) => t.status === TaskStatus.VOLTOOID);

  const handleStatusChange = async (taskId: string, status: TaskStatus) => {
    try {
      await updateTaskMutation.mutateAsync({ id: taskId, data: { status } });
    } catch {
      showToast('Status bijwerken mislukt', 'error');
    }
  };

  return (
    <div className="space-y-2">
      {userCanWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onCreateTask}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Nieuwe taak
          </button>
        </div>
      )}

      {tasks.length === 0 ? (
        <p className="text-xs text-gray-400">Nog geen taken</p>
      ) : (
        <>
          {incomplete.length === 0 && (
            <p className="text-xs text-gray-400">Geen openstaande taken</p>
          )}
          {incomplete.map((task) => (
            <SidebarTaskCard
              key={task.id}
              task={task}
              userCanWrite={userCanWrite}
              onStatusChange={handleStatusChange}
              onEdit={setEditingTask}
              navigate={navigate}
            />
          ))}

          {completed.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowCompleted(!showCompleted)}
                className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              >
                <svg
                  className={`h-3.5 w-3.5 transition-transform ${showCompleted ? 'rotate-90' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                Voltooid ({completed.length})
              </button>
              {showCompleted && (
                <div className="mt-2 space-y-2">
                  {completed.map((task) => (
                    <SidebarTaskCard
                      key={task.id}
                      task={task}
                      userCanWrite={userCanWrite}
                      onStatusChange={handleStatusChange}
                      onEdit={setEditingTask}
                      navigate={navigate}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {editingTask && (
        <EditTaskModal
          isOpen={!!editingTask}
          onClose={() => setEditingTask(null)}
          task={editingTask}
        />
      )}
    </div>
  );
}

// ─── ContactLogsSidebar ───────────────────────────────

function ContactLogsSidebar({
  logs,
  userCanWrite,
  onLogOpen,
}: {
  logs: ContactLog[];
  userCanWrite: boolean;
  onLogOpen: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const MAX_ITEMS = 5;
  const sorted = [...logs].sort(
    (a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime(),
  );
  const visible = showAll ? sorted : sorted.slice(0, MAX_ITEMS);

  return (
    <div className="space-y-3">
      {userCanWrite && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onLogOpen}
            className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Contactmoment loggen
          </button>
        </div>
      )}

      {logs.length === 0 ? (
        <p className="text-xs text-gray-400">Nog geen contactmomenten</p>
      ) : (
        <div className="space-y-2">
          {visible.map((item) => (
            <div
              key={item.id}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    getStatusConfig(LOG_TYPE, item.type).classes
                  }`}
                >
                  {getStatusConfig(LOG_TYPE, item.type).label}
                </span>
                <span className="text-xs text-gray-400">
                  {new Date(item.loggedAt).toLocaleDateString('nl-NL', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
              {item.subject && (
                <p className="text-xs font-medium text-gray-900">{item.subject}</p>
              )}
              {item.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-600" title={item.body}>
                  {item.body}
                </p>
              )}
              {item.user && (
                <p className="mt-1 text-xs text-gray-400">
                  {item.user.firstName} {item.user.lastName}
                </p>
              )}
            </div>
          ))}

          {sorted.length > MAX_ITEMS && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full py-1 text-center text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              {showAll
                ? 'Minder tonen'
                : `Alle ${sorted.length} items tonen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
