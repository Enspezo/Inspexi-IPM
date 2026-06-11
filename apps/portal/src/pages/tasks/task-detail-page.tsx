import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { TaskStatus, TaskType, TaskEntityType, DocumentEntityType, Role } from '@/types';
import { ActionMenu, Button, Card, ErrorBox, Input, Spinner, StatusBadge, Select, useConfirm, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { ENTITY_TYPE_LABELS, TASK_STATUS, TASK_TYPE } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { HistorySidebarSection } from '@/components/layout/sidebar-sections';
import { useAuth } from '@/providers/auth-provider';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useTask, useUpdateTask, useDeleteTask } from './hooks/use-tasks';
import { DocumentsSection, UploadDocumentModal } from '@/components/documents';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

const statusOptions = Object.values(TaskStatus).map((s) => ({
  value: s,
  label: TASK_STATUS[s]?.label || s,
}));

const taskTypeOptions = Object.values(TaskType).map((t) => ({
  value: t,
  label: TASK_TYPE[t]?.label || t,
}));

const taskSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  taskType: z.string().optional(),
  assigneeId: z.string().optional(),
  deadline: z.string().optional(),
  description: z.string().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

const entityTypeRoutes: Record<string, string> = {
  [TaskEntityType.CONTACT]: '/contacts',
  [TaskEntityType.REQUEST]: '/requests',
  [TaskEntityType.QUOTE]: '/quotes',
  [TaskEntityType.USER]: '/users',
};

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { user } = useAuth();
  const { data: task, isLoading, error } = useTask(id!);
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();
  const { data: users } = useUsers();

  const [isEditing, setIsEditing] = useState(false);
  const [isDocUploadOpen, setIsDocUploadOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors: formErrors, isDirty },
  } = useForm<TaskFormData>({ resolver: zodResolver(taskSchema) });

  useEffect(() => {
    if (task) {
      resetForm({
        title: task.title,
        taskType: task.taskType || 'TO_DO',
        assigneeId: task.assigneeId || '',
        deadline: task.deadline ? task.deadline.split('T')[0] : '',
        description: task.description || '',
      });
    }
  }, [task, resetForm]);

  // Opties voor "Toegewezen aan": Niet toegewezen → Ikzelf → overige actieve gebruikers
  const assigneeOptions = [
    { value: '', label: 'Niet toegewezen' },
    ...(user ? [{ value: user.id, label: 'Ikzelf' }] : []),
    ...(users || [])
      .filter((u) => u.id !== user?.id && u.isActive)
      .map((u) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <ErrorBox>
        Taak niet gevonden of fout bij het laden.
      </ErrorBox>
    );
  }

  const isOverdue =
    task.deadline &&
    task.status !== TaskStatus.VOLTOOID &&
    new Date(task.deadline) < new Date();

  const onSubmitTask = async (data: TaskFormData) => {
    try {
      await updateMutation.mutateAsync({
        id: task.id,
        data: {
          title: data.title,
          description: data.description || undefined,
          taskType: (data.taskType as TaskType) || undefined,
          assigneeId: data.assigneeId || null,
          deadline: data.deadline || null,
        },
      });
      showToast('Taak bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Bijwerken mislukt',
        'error',
      );
    }
  };

  const handleCancelEdit = () => {
    resetForm({
      title: task.title,
      taskType: task.taskType || 'TO_DO',
      assigneeId: task.assigneeId || '',
      deadline: task.deadline ? task.deadline.split('T')[0] : '',
      description: task.description || '',
    });
    setIsEditing(false);
  };

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    try {
      await updateMutation.mutateAsync({
        id: task.id,
        data: { status: newStatus as TaskStatus },
      });
      showToast('Status bijgewerkt', 'success');
      setNewStatus('');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Status wijzigen mislukt',
        'error',
      );
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Taak verwijderen',
      message: 'Weet je zeker dat je deze taak wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(task.id);
      showToast('Taak verwijderd', 'success');
      navigate('/tasks');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    }
  };

  const sidebarContent = (
    <HistorySidebarSection entityType="Task" entityId={id} />
  );

  return (
    <DetailPageLayout iconStrip sidebar={sidebarContent}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <Link
              to="/tasks"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Taken
            </Link>
            <span className="text-sm text-gray-400">/</span>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-gray-900">{task.title}</h2>
            <StatusBadge status={task.status} map={TASK_STATUS} />
          </div>
        </div>
        {userCanWrite && (
          <ActionMenu
            primaryActions={
              task.status !== TaskStatus.VOLTOOID
                ? [
                    {
                      label: 'Taak voltooid',
                      icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
                      onClick: async () => {
                        try {
                          await updateMutation.mutateAsync({ id: task.id, data: { status: TaskStatus.VOLTOOID } });
                          showToast('Taak voltooid', 'success');
                        } catch {
                          showToast('Status wijzigen mislukt', 'error');
                        }
                      },
                    },
                  ]
                : []
            }
            secondaryActions={[
              {
                label: 'Document uploaden',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>,
                onClick: () => setIsDocUploadOpen(true),
              },
            ]}
          />
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            {userCanWrite && !isEditing && (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                Bewerken
              </Button>
            )}
          </div>
          {isEditing ? (
            <form onSubmit={handleSubmit(onSubmitTask)} className="space-y-4">
              <Input
                label="Titel"
                error={formErrors.title?.message}
                {...register('title')}
              />
              <Select
                label="Type"
                options={taskTypeOptions}
                {...register('taskType')}
              />
              <Select
                label="Toegewezen aan"
                options={assigneeOptions}
                {...register('assigneeId')}
              />
              <Input
                label="Deadline"
                type="date"
                {...register('deadline')}
              />
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Omschrijving
                </label>
                <textarea
                  {...register('description')}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  placeholder="Optionele omschrijving..."
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={handleCancelEdit}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>
                  Opslaan
                </Button>
              </div>
            </form>
          ) : (
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Status</dt>
              <dd>
                <StatusBadge status={task.status} map={TASK_STATUS} />
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Type</dt>
              <dd className="text-sm text-gray-900">
                {TASK_TYPE[task.taskType]?.label || 'To-do'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Toegewezen aan</dt>
              <dd className="text-sm text-gray-900">
                {task.assignee
                  ? `${task.assignee.firstName} ${task.assignee.lastName}`
                  : 'Niet toegewezen'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Deadline</dt>
              <dd className={`text-sm ${isOverdue ? 'font-medium text-red-600' : 'text-gray-900'}`}>
                {task.deadline ? formatDate(task.deadline) : '—'}
                {isOverdue && ' (verlopen)'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Aangemaakt door</dt>
              <dd className="text-sm text-gray-900">
                {task.createdBy
                  ? `${task.createdBy.firstName} ${task.createdBy.lastName}`
                  : '—'}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Aangemaakt op</dt>
              <dd className="text-sm text-gray-900">{formatDate(task.createdAt)}</dd>
            </div>
          </dl>
          )}
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Gekoppeld aan</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Type</span>
              <span className="text-sm text-gray-900">
                {ENTITY_TYPE_LABELS[task.entityType] || task.entityType}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {ENTITY_TYPE_LABELS[task.entityType] || 'Entiteit'}
              </span>
              <Link
                to={`${entityTypeRoutes[task.entityType]}/${task.entityId}`}
                className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
              >
                {task.entityName || `Bekijk ${ENTITY_TYPE_LABELS[task.entityType]?.toLowerCase() || 'entiteit'}`}
              </Link>
            </div>
          </div>

          {task.description && (
            <>
              <hr className="my-4 border-gray-200" />
              <h3 className="mb-2 text-sm font-semibold text-gray-900">Omschrijving</h3>
              <p className="whitespace-pre-wrap text-sm text-gray-600">{task.description}</p>
            </>
          )}
        </Card>
      </div>

      {/* Status wijzigen */}
      {userCanWrite && (
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Status wijzigen</h3>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-56">
              <Select
                label="Nieuwe status"
                options={statusOptions}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              />
            </div>
            <Button
              onClick={handleStatusUpdate}
              isLoading={updateMutation.isPending}
              disabled={!newStatus || newStatus === task.status}
            >
              Bijwerken
            </Button>
          </div>
        </Card>
      )}

      {/* Bijlagen */}
      <Card>
        <DocumentsSection
          entityType={DocumentEntityType.TASK}
          entityId={task.id}
          canUpload={!!userCanWrite}
        />
      </Card>

      {/* Acties onderaan */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-6">
        <p className="text-xs text-gray-400">
          Aangemaakt op {new Date(task.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {task.createdBy && ` door ${task.createdBy.firstName} ${task.createdBy.lastName}`}
        </p>
        {userCanWrite && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Bewerken
            </Button>
            <Button
              variant="danger"
              onClick={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              Verwijderen
            </Button>
          </div>
        )}
      </div>

      {isDocUploadOpen && (
        <UploadDocumentModal
          isOpen={isDocUploadOpen}
          onClose={() => setIsDocUploadOpen(false)}
          entityType={DocumentEntityType.TASK}
          entityId={task.id}
        />
      )}
    </div>
    </DetailPageLayout>
  );
}
