import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContactType, Role } from '@/types';
import { roleColors as contactPersonRoleColors } from '@/lib/contact-person-role';
import { Button, Card, ErrorBox, InfoField, Input, Select, Spinner, useConfirm, useToast } from '@/components/ui';
import { AddressSearchInput } from '@/components/ui/address-search-input';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { LocationTypeBadge } from '@/components/location-type-badge';
import { useAuth } from '@/providers/auth-provider';
import {
  useLocation,
  useUpdateLocationById,
  useDeleteLocationById,
  useLocationContactPersons,
  useUpdateLocationContactPerson,
  useUnlinkContactPerson,
} from './hooks/use-contacts';
import { useLocationTypes } from '@/pages/location-types/hooks/use-location-types';
import { LinkContactPersonModal } from './components/link-contact-person-modal';
import { AuditHistory } from '@/components/audit-history/audit-history';
import type { ParsedAddress } from '@/lib/geocoding';
import { getErrorMessage } from '@/lib/api-client';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  street: z.string().min(1, 'Straat is verplicht'),
  houseNumber: z.string().min(1, 'Huisnummer is verplicht'),
  postalCode: z.string().min(1, 'Postcode is verplicht'),
  city: z.string().min(1, 'Stad is verplicht'),
  locationTypeId: z.string().optional(),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function LocationDetailPage() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: location, isLoading, error } = useLocation(locationId!);
  const { data: locationTypes = [] } = useLocationTypes({ scope: 'CRM' });
  const { data: linkedPersons = [] } = useLocationContactPersons(locationId!);

  const locationTypeOptions = [
    { value: '', label: 'Geen type' },
    ...locationTypes.map((t) => ({ value: t.id, label: t.name })),
  ];
  const unlinkMutation = useUnlinkContactPerson(locationId!);
  const updateMutation = useUpdateLocationById();
  const deleteMutation = useDeleteLocationById();
  const [isEditing, setIsEditing] = useState(false);
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState<{ linkId: string; notes: string } | null>(null);
  const [pdokData, setPdokData] = useState<Record<string, unknown> | null>(null);

  const userCanWrite = user && user.roles.some((r) => canWrite.includes(r));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  useEffect(() => {
    if (location) {
      resetForm({
        name: location.name || '',
        street: location.street || '',
        houseNumber: location.houseNumber || '',
        postalCode: location.postalCode || '',
        city: location.city || '',
        locationTypeId: location.locationTypeId || '',
        notes: location.notes || '',
      });
      setPdokData(location.pdokData ?? null);
    }
  }, [location, resetForm]);

  const handleAddressSelect = (address: ParsedAddress) => {
    setValue('street', address.street, { shouldValidate: true });
    setValue('houseNumber', address.houseNumber, { shouldValidate: true });
    setValue('postalCode', address.postalCode, { shouldValidate: true });
    setValue('city', address.city, { shouldValidate: true });
    setPdokData(address.pdokData);
  };

  const handleSave = async (data: FormData) => {
    if (!location) return;
    try {
      await updateMutation.mutateAsync({
        locationId: location.id,
        data: {
          ...data,
          locationTypeId: data.locationTypeId || undefined,
          notes: data.notes || undefined,
          pdokData: pdokData ?? undefined,
        },
      });
      showToast('Locatie bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  const handleCancel = () => {
    if (location) {
      resetForm({
        name: location.name || '',
        street: location.street || '',
        houseNumber: location.houseNumber || '',
        postalCode: location.postalCode || '',
        city: location.city || '',
        locationTypeId: location.locationTypeId || '',
        notes: location.notes || '',
      });
      setPdokData(location.pdokData ?? null);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!location) return;
    const confirmed = await confirm({
      title: 'Locatie verwijderen',
      message: 'Weet u zeker dat u deze locatie wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(location.id);
      showToast('Locatie verwijderd', 'success');
      navigate('/contacts/locations');
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

  if (error || !location) {
    return (
      <ErrorBox>{error?.message || 'Locatie niet gevonden'}</ErrorBox>
    );
  }

  const contact = location.contact;
  const contactName = contact
    ? contact.type === ContactType.COMPANY
      ? contact.companyName || '—'
      : [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—'
    : '—';

  const currentAddressLabel = `${location.street} ${location.houseNumber}, ${location.postalCode} ${location.city}`;

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Location" entityId={locationId} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/contacts/locations')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">{location.name}</h2>
              {location.locationType && (
                <LocationTypeBadge locationType={location.locationType} />
              )}
            </div>
            <p className="mt-0.5 text-sm text-gray-500">
              Locatie van{' '}
              <button
                onClick={() => contact && navigate(`/contacts/${contact.id}`)}
                className="text-primary-600 hover:underline"
              >
                {contactName}
              </button>
            </p>
          </div>
        </div>

        {/* Details */}
        {isEditing ? (
          <form onSubmit={handleSubmit(handleSave)}>
            <Card>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">Gegevens</h3>
              </div>
              <div className="space-y-4">
                <Input
                  label="Naam"
                  {...register('name')}
                  error={errors.name?.message}
                />

                <AddressSearchInput
                  label="Adres zoeken (PDOK)"
                  placeholder="Zoek een adres…"
                  initialValue={currentAddressLabel}
                  onSelect={handleAddressSelect}
                />

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Input
                      label="Straat"
                      {...register('street')}
                      error={errors.street?.message}
                    />
                  </div>
                  <Input
                    label="Huisnr."
                    {...register('houseNumber')}
                    error={errors.houseNumber?.message}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="Postcode"
                    {...register('postalCode')}
                    error={errors.postalCode?.message}
                  />
                  <Input
                    label="Stad"
                    {...register('city')}
                    error={errors.city?.message}
                  />
                </div>

                <Select
                  label="Locatietype"
                  options={locationTypeOptions}
                  {...register('locationTypeId')}
                />

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">
                    Notities
                  </label>
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
              <InfoField label="Naam" value={location.name} />
              <div>
                <dt className="text-sm font-medium text-gray-500">Locatietype</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  <LocationTypeBadge locationType={location.locationType} />
                </dd>
              </div>
              <InfoField
                label="Adres"
                value={`${location.street} ${location.houseNumber}`}
              />
              <InfoField label="Postcode" value={location.postalCode} />
              <InfoField label="Stad" value={location.city} />
              <div className="col-span-2">
                <InfoField label="Notities" value={location.notes} />
              </div>
            </div>
          </Card>
        )}

        {/* Contactpersonen */}
        <ContactPersonsSection
          locationId={locationId!}
          locationContactId={location.contactId}
          linkedPersons={linkedPersons}
          userCanWrite={!!userCanWrite}
          unlinkMutation={unlinkMutation}
          editingNotes={editingNotes}
          setEditingNotes={setEditingNotes}
          onOpenLinkModal={() => setIsLinkModalOpen(true)}
        />

        {/* Verwijderen */}
        {userCanWrite && (
          <div className="flex justify-end border-t border-gray-200 pt-6">
            <Button variant="danger" size="sm" onClick={handleDelete}>
              Locatie verwijderen
            </Button>
          </div>
        )}
      </div>

      <LinkContactPersonModal
        isOpen={isLinkModalOpen}
        onClose={() => setIsLinkModalOpen(false)}
        locationId={locationId!}
        locationContactId={location.contactId}
        alreadyLinkedIds={linkedPersons.map((l) => l.contactPersonId)}
      />
    </DetailPageLayout>
  );
}

interface ContactPersonsSectionProps {
  locationId: string;
  locationContactId: string;
  linkedPersons: import('@/types').LocationContactPerson[];
  userCanWrite: boolean;
  unlinkMutation: ReturnType<typeof useUnlinkContactPerson>;
  editingNotes: { linkId: string; notes: string } | null;
  setEditingNotes: (v: { linkId: string; notes: string } | null) => void;
  onOpenLinkModal: () => void;
}

function ContactPersonsSection({
  locationId,
  locationContactId,
  linkedPersons,
  userCanWrite,
  unlinkMutation,
  editingNotes,
  setEditingNotes,
  onOpenLinkModal,
}: ContactPersonsSectionProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const updateNotesMutation = useUpdateLocationContactPerson(
    editingNotes?.linkId ?? '',
    locationId,
  );

  const getContactName = (contact: { type: string; companyName: string | null; firstName: string | null; lastName: string | null } | undefined) => {
    if (!contact) return null;
    if (contact.type === ContactType.COMPANY) return contact.companyName || null;
    return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null;
  };

  const handleUnlink = async (linkId: string) => {
    const confirmed = await confirm({
      title: 'Contactpersoon ontkoppelen',
      message: 'Contactpersoon ontkoppelen van deze locatie?',
      confirmLabel: 'Ontkoppelen',
    });
    if (!confirmed) return;
    try {
      await unlinkMutation.mutateAsync(linkId);
      showToast('Contactpersoon ontkoppeld', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Ontkoppelen mislukt'), 'error');
    }
  };

  const handleSaveNotes = async () => {
    if (!editingNotes) return;
    try {
      await updateNotesMutation.mutateAsync({ notes: editingNotes.notes || undefined });
      showToast('Opmerking opgeslagen', 'success');
      setEditingNotes(null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">
          Contactpersonen
          {linkedPersons.length > 0 && (
            <span className="ml-2 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              {linkedPersons.length}
            </span>
          )}
        </h3>
        {userCanWrite && (
          <Button variant="secondary" size="sm" onClick={onOpenLinkModal}>
            <svg className="mr-1.5 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Contactpersoon koppelen
          </Button>
        )}
      </div>

      {linkedPersons.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-400">
          Nog geen contactpersonen gekoppeld
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {linkedPersons.map((link) => {
            const person = link.contactPerson;
            if (!person) return null;
            const isExternal = person.contactId !== locationContactId;
            const contactName = getContactName(person.contact as any);
            const isEditingThis = editingNotes?.linkId === link.id;

            return (
              <li key={link.id} className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {person.firstName} {person.lastName}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          contactPersonRoleColors[person.role?.code ?? ''] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {person.role?.label || '—'}
                      </span>
                      {isExternal && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                          Andere relatie
                        </span>
                      )}
                    </div>
                    {contactName && (
                      <p className="mt-0.5 text-xs text-gray-500">{contactName}</p>
                    )}
                    <div className="mt-1 flex gap-3 text-xs text-gray-400">
                      {person.email && <span>{person.email}</span>}
                      {person.phone && <span>{person.phone}</span>}
                    </div>

                    {/* Notes per link */}
                    {isEditingThis ? (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={editingNotes.notes}
                          onChange={(e) => setEditingNotes({ linkId: link.id, notes: e.target.value })}
                          rows={2}
                          placeholder="Opmerkingen..."
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                        />
                        <div className="flex gap-2">
                          <Button size="sm" variant="primary" onClick={handleSaveNotes} isLoading={updateNotesMutation.isPending}>
                            Opslaan
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingNotes(null)}>
                            Annuleren
                          </Button>
                        </div>
                      </div>
                    ) : link.notes ? (
                      <p className="mt-2 text-xs italic text-gray-500">"{link.notes}"</p>
                    ) : null}
                  </div>

                  {userCanWrite && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setEditingNotes({ linkId: link.id, notes: link.notes || '' })}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                        title="Opmerkingen bewerken"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleUnlink(link.id)}
                        className="rounded p-1 text-gray-400 hover:bg-danger-50 hover:text-danger-600"
                        title="Ontkoppelen"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
