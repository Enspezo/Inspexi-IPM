import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  RequestSource,
  Priority,
  CustomFieldEntityType,
} from '@/types';
import type { Request } from '@/types';
import { Button, Card, Select, Input, useToast } from '@/components/ui';
import { getStatusConfig, PRIORITY, REQUEST_SOURCE_LABELS } from '@/lib/status';
import { useOrgUsers } from '../hooks/use-requests';
import type { useUpdateRequest } from '../hooks/use-requests';
import { useContactLocations } from '@/pages/contacts/hooks/use-contacts';
import { ContactSearchInput } from '@/components/contacts/contact-search-input';
import { CustomFieldsDisplay, CustomFieldsForm } from '@/components/custom-fields';
import { formatDate, getContactName } from './request-detail-helpers';
import { getErrorMessage } from '@/lib/api-client';

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

export function RequestOverviewTab({
  request,
  isEditing,
  setIsEditing,
  updateMutation,
}: {
  request: Request;
  isEditing: boolean;
  setIsEditing: (editing: boolean) => void;
  updateMutation: ReturnType<typeof useUpdateRequest>;
}) {
  const { showToast } = useToast();
  const { data: allUsers } = useOrgUsers();
  const [editContactId, setEditContactId] = useState('');

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
      /* foutmelding wordt centraal getoond via useApiMutation */
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

  return (
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
  );
}
