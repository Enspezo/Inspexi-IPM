import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  RequestStatus,
  Priority,
  Role,
} from '@/types';
import { Button, Card, Spinner, Select, Input, useToast } from '@/components/ui';
import { useAuth } from '@/providers/auth-provider';
import {
  useRequest,
  useUpdateRequestStatus,
  useDeleteRequest,
} from './hooks/use-requests';
import { EditRequestModal } from './components/edit-request-modal';

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

const statusOptions = Object.values(RequestStatus).map((s) => ({
  value: s,
  label: statusLabels[s] || s,
}));

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
  const updateStatusMutation = useUpdateRequestStatus(id!);
  const deleteMutation = useDeleteRequest();

  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [isEditOpen, setIsEditOpen] = useState(false);

  const userCanWrite = user && canWrite.includes(user.role);

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
            <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(true)}>
              Bewerken
            </Button>
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Verwijderen
            </Button>
          </div>
        )}
      </div>

      {/* Info grid */}
      <Card>
        <div className="grid grid-cols-2 gap-6 lg:grid-cols-3">
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
              ) : (
                '—'
              )}
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

      {/* Edit modal */}
      {request && (
        <EditRequestModal
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
          request={request}
        />
      )}
    </div>
  );
}
