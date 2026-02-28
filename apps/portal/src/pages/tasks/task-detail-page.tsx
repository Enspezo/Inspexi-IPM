import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { TaskStatus, TaskEntityType, DocumentEntityType, Role } from '@/types';
import { Button, Card, Spinner, Select, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import { useTask, useUpdateTask, useDeleteTask } from './hooks/use-tasks';
import { EditTaskModal } from './components/edit-task-modal';
import { DocumentsSection } from '@/components/documents';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

const statusColors: Record<string, string> = {
  [TaskStatus.TE_DOEN]: 'bg-blue-100 text-blue-800',
  [TaskStatus.MEE_BEZIG]: 'bg-yellow-100 text-yellow-800',
  [TaskStatus.VOLTOOID]: 'bg-green-100 text-green-800',
};

const statusLabels: Record<string, string> = {
  [TaskStatus.TE_DOEN]: 'Te doen',
  [TaskStatus.MEE_BEZIG]: 'Mee bezig',
  [TaskStatus.VOLTOOID]: 'Voltooid',
};

const statusOptions = Object.values(TaskStatus).map((s) => ({
  value: s,
  label: statusLabels[s] || s,
}));

const entityTypeLabels: Record<string, string> = {
  [TaskEntityType.CONTACT]: 'Relatie',
  [TaskEntityType.REQUEST]: 'Aanvraag',
  [TaskEntityType.QUOTE]: 'Offerte',
};

const entityTypeRoutes: Record<string, string> = {
  [TaskEntityType.CONTACT]: '/contacts',
  [TaskEntityType.REQUEST]: '/requests',
  [TaskEntityType.QUOTE]: '/quotes',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const { data: task, isLoading, error } = useTask(id!);
  const updateMutation = useUpdateTask();
  const deleteMutation = useDeleteTask();

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [newStatus, setNewStatus] = useState('');

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        Taak niet gevonden of fout bij het laden.
      </div>
    );
  }

  const isOverdue =
    task.deadline &&
    task.status !== TaskStatus.VOLTOOID &&
    new Date(task.deadline) < new Date();

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
    if (!confirm('Weet je zeker dat je deze taak wilt verwijderen?')) return;
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

  return (
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
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                statusColors[task.status] || 'bg-gray-100 text-gray-600'
              }`}
            >
              {statusLabels[task.status] || task.status}
            </span>
          </div>
        </div>
        {userCanWrite && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setIsEditOpen(true)}>
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Bewerken
            </Button>
            <Button
              variant="secondary"
              onClick={handleDelete}
              isLoading={deleteMutation.isPending}
            >
              <svg className="h-4 w-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Verwijderen
            </Button>
          </div>
        )}
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Details</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-gray-500">Status</dt>
              <dd>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    statusColors[task.status] || 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {statusLabels[task.status] || task.status}
                </span>
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
        </Card>

        <Card>
          <h3 className="mb-4 text-sm font-semibold text-gray-900">Gekoppeld aan</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Type</span>
              <span className="text-sm text-gray-900">
                {entityTypeLabels[task.entityType] || task.entityType}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {entityTypeLabels[task.entityType] || 'Entiteit'}
              </span>
              <Link
                to={`${entityTypeRoutes[task.entityType]}/${task.entityId}`}
                className="text-sm text-primary-600 hover:text-primary-800 hover:underline"
              >
                {task.entityName || `Bekijk ${entityTypeLabels[task.entityType]?.toLowerCase() || 'entiteit'}`}
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

      {/* Edit modal */}
      {isEditOpen && (
        <EditTaskModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          task={task}
        />
      )}
    </div>
  );
}
