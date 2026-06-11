import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContactType, Role } from '@/types';
import { Button, Card, ErrorBox, InfoField, Input, Select, Spinner, useConfirm, useToast } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import {
  useContactPerson,
  useUpdateContactPerson,
  useDeleteContactPerson,
  useContactPersonLocations,
  useContactPersonRoles,
} from './hooks/use-contacts';
import { roleColors } from '@/lib/contact-person-role';
import { AuditHistory } from '@/components/audit-history/audit-history';

const objectTypeColors: Record<string, string> = {
  woning: 'bg-blue-100 text-blue-800',
  kantoor: 'bg-purple-100 text-purple-800',
  industrieel: 'bg-orange-100 text-orange-800',
  winkel: 'bg-green-100 text-green-800',
  overig: 'bg-gray-100 text-gray-800',
};

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

const schema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht'),
  lastName: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional(),
  phone: z.string().optional(),
  roleId: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function ContactPersonDetailPage() {
  const { personId } = useParams<{ personId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: person, isLoading, error } = useContactPerson(personId!);
  const { data: locationLinks = [] } = useContactPersonLocations(personId!);
  const updateMutation = useUpdateContactPerson(personId!);
  const deleteMutation = useDeleteContactPerson();
  const { data: roles } = useContactPersonRoles();
  const roleOptions = (roles ?? []).map((r) => ({ value: r.id, label: r.label }));
  const [isEditing, setIsEditing] = useState(false);

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (person) {
      resetForm({
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        email: person.email || '',
        phone: person.phone || '',
        roleId: person.roleId || '',
        notes: person.notes || '',
      });
    }
  }, [person, resetForm]);

  const handleSave = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync(data);
      showToast('Contactpersoon bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  const handleCancel = () => {
    if (person) {
      resetForm({
        firstName: person.firstName || '',
        lastName: person.lastName || '',
        email: person.email || '',
        phone: person.phone || '',
        roleId: person.roleId || '',
        notes: person.notes || '',
      });
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!person) return;
    const confirmed = await confirm({
      title: 'Contactpersoon verwijderen',
      message: 'Weet u zeker dat u deze contactpersoon wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(person.id);
      showToast('Contactpersoon verwijderd', 'success');
      navigate(`/contacts/${person.contactId}`);
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

  if (error || !person) {
    return (
      <ErrorBox>{error?.message || 'Contactpersoon niet gevonden'}</ErrorBox>
    );
  }

  const contactName = person.contact
    ? person.contact.type === ContactType.COMPANY
      ? person.contact.companyName || '—'
      : [person.contact.firstName, person.contact.lastName].filter(Boolean).join(' ') || '—'
    : '—';

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="ContactPerson" entityId={personId} />}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/contacts/${person.contactId}`)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {person.firstName} {person.lastName}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  roleColors[person.role?.code ?? ''] || 'bg-gray-100 text-gray-800'
                }`}
              >
                {person.role?.label || '—'}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              Contactpersoon van{' '}
              <button
                onClick={() => navigate(`/contacts/${person.contactId}`)}
                className="text-primary-600 hover:underline"
              >
                {contactName}
              </button>
            </p>
          </div>
        </div>
      </div>

      {/* Details */}
      {isEditing ? (
        <form onSubmit={handleSubmit(handleSave)}>
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-900">Gegevens</h3>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Voornaam"
                {...register('firstName')}
                error={errors.firstName?.message}
              />
              <Input
                label="Achternaam"
                {...register('lastName')}
                error={errors.lastName?.message}
              />
              <Input
                label="E-mail"
                type="email"
                {...register('email')}
                error={errors.email?.message}
              />
              <Input
                label="Telefoon"
                {...register('phone')}
                error={errors.phone?.message}
              />
              <Select
                label="Rol"
                options={roleOptions}
                {...register('roleId')}
                error={errors.roleId?.message}
              />
              <div className="col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Notities</label>
                <textarea
                  {...register('notes')}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={handleCancel}>
                Annuleren
              </Button>
              <Button
                type="submit"
                variant="primary"
                disabled={!isDirty}
                isLoading={updateMutation.isPending}
              >
                Opslaan
              </Button>
            </div>
          </Card>
        </form>
      ) : (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">Gegevens</h3>
            {userCanWrite && (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                Bewerken
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <InfoField label="Voornaam" value={person.firstName} />
            <InfoField label="Achternaam" value={person.lastName} />
            <InfoField label="E-mail" value={person.email} />
            <InfoField label="Telefoon" value={person.phone} />
            <InfoField label="Rol" value={person.role?.label || '—'} />
            <div className="col-span-2">
              <InfoField label="Notities" value={person.notes} />
            </div>
          </div>
        </Card>
      )}

      {/* Gekoppelde locaties */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-900">
            Gekoppelde locaties
            {locationLinks.length > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                {locationLinks.length}
              </span>
            )}
          </h3>
        </div>

        {locationLinks.length === 0 ? (
          <p className="py-4 text-center text-sm text-gray-400">
            Niet gekoppeld aan locaties
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {locationLinks.map((link) => {
              const loc = link.location;
              if (!loc) return null;
              const isExternal = loc.contactId !== person.contactId;
              const locContactName = loc.contact
                ? loc.contact.type === ContactType.COMPANY
                  ? loc.contact.companyName
                  : [loc.contact.firstName, loc.contact.lastName].filter(Boolean).join(' ')
                : null;

              return (
                <li key={link.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => navigate(`/contacts/locations/${loc.id}`)}
                          className="text-sm font-medium text-primary-700 hover:underline"
                        >
                          {loc.name}
                        </button>
                        {loc.objectType && (
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${objectTypeColors[loc.objectType] || 'bg-gray-100 text-gray-800'}`}>
                            {loc.objectType.charAt(0).toUpperCase() + loc.objectType.slice(1)}
                          </span>
                        )}
                        {isExternal && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            Andere relatie
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">
                        {loc.street} {loc.houseNumber}, {loc.postalCode} {loc.city}
                        {isExternal && locContactName && (
                          <span className="ml-1 text-gray-400">· {locContactName}</span>
                        )}
                      </p>
                      {link.notes && (
                        <p className="mt-1 text-xs italic text-gray-400">"{link.notes}"</p>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Verwijderen */}
      {userCanWrite && (
        <div className="flex justify-end border-t border-gray-200 pt-6">
          <Button variant="danger" size="sm" onClick={handleDelete}>
            Contactpersoon verwijderen
          </Button>
        </div>
      )}
    </div>
    </DetailPageLayout>
  );
}
