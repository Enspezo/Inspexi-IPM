import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ContactType, LogType, TaskStatus, Role, TaskEntityType, DocumentEntityType, CustomFieldEntityType } from '@/types';
import type { Contact, ContactAddress, ContactLog, ContactEmail, Location } from '@/types';
import { ActionMenu, Button, ErrorBox, Spinner, Tabs, useConfirm, useToast } from '@/components/ui';
import { getKvkProfile } from '@/lib/kvk';
import { type VatValidationResult } from '@/lib/vat';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { FavoriteStar } from '@/components/favorites/favorite-star';
import { StartChatButton } from '@/components/chat';
import { useAuth } from '@/providers/auth-provider';
import { useContact, useUpdateContact, useDeleteContact, useDeleteAddress, useDeleteLocation } from './hooks/use-contacts';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { usePlanningItems } from '@/pages/planning/hooks/use-planning';
import { useProjects } from '@/pages/projects/hooks/use-projects';
import { AddAddressModal } from './components/add-address-modal';
import { EditAddressModal } from './components/edit-address-modal';
import { AddContactPersonModal } from './components/add-contact-person-modal';
import { AddLocationModal } from './components/add-location-modal';
import { EditLocationModal } from './components/edit-location-modal';
import { AddLogModal } from './components/add-log-modal';
import { SendEmailModal } from './components/send-email-modal';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { CreateRequestModal } from '@/pages/requests/components/create-request-modal';
import { CustomFieldsDisplay } from '@/components/custom-fields';
import { NoteEntityType } from '@/types';
import { NotesSidebarSection, HistorySidebarSection, DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { ContactEditForm, contactSchema, type ContactFormData } from './components/contact-edit-form';
import { ContactInfoCard } from './components/contact-info-card';
import { ContactCustomerGroups } from './components/contact-customer-groups';
import { ContactPersonsSection } from './components/contact-persons-section';
import { ContactAddressesTab } from './components/contact-addresses-tab';
import { ContactLocationsTab } from './components/contact-locations-tab';
import { ContactRequestsTab } from './components/contact-requests-tab';
import { ContactQuotesTab } from './components/contact-quotes-tab';
import { ContactPlanningTab } from './components/contact-planning-tab';
import { ContactProjectsTab } from './components/contact-projects-tab';
import { ContactInkoopTab } from './components/contact-inkoop-tab';
import { ContactHistorySidebar } from './components/contact-history-sidebar';
import { ContactTasksSidebar } from './components/contact-tasks-sidebar';
import { ViesNameModal } from './components/vies-name-modal';
import { getErrorMessage } from '@/lib/api-client';

type Tab = 'algemeen' | 'adressen' | 'locaties' | 'aanvragen' | 'offertes' | 'planning' | 'projecten' | 'inkoop';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: contact, isLoading, error } = useContact(id!);
  const updateMutation = useUpdateContact(id!);
  const deleteMutation = useDeleteContact();
  const { data: allUsers } = useUsers();

  const deleteAddressMutation = useDeleteAddress(id!);
  const deleteLocationMutation = useDeleteLocation(id!);
  // Fetch tasks linked to this contact
  const { data: tasksData } = useTasks({
    entityType: TaskEntityType.CONTACT,
    entityId: id,
    limit: 100,
  });
  const contactTasks = tasksData?.data || [];
  const incompleteTasks = contactTasks.filter((t) => t.status !== TaskStatus.VOLTOOID);

  // Fetch planning items linked to this contact
  const { data: planningData } = usePlanningItems({ contactId: id, limit: 100 });
  const contactPlanningItems = planningData?.data ?? [];

  // Fetch projects linked to this contact
  const { data: projectsData } = useProjects({ contactId: id, limit: 100 });
  const contactProjects = projectsData?.data ?? [];

  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('algemeen');
  const [isAddressOpen, setIsAddressOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<ContactAddress | null>(null);
  const [isContactPersonOpen, setIsContactPersonOpen] = useState(false);
  const [isLocationOpen, setIsLocationOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logInitialType, setLogInitialType] = useState<LogType | undefined>(undefined);
  const [logInitialLoggedAt, setLogInitialLoggedAt] = useState<string | undefined>(undefined);
  const [isEmailOpen, setIsEmailOpen] = useState(false);
  const [isTaskOpen, setIsTaskOpen] = useState(false);
  const [isRequestOpen, setIsRequestOpen] = useState(false);

  const userCanWrite = user && user.roles.some(r => canWrite.includes(r));

  // Eigenaar, ORG_ADMIN of SUPERUSER mag eigenaar wijzigen en relatie verwijderen
  const userCanManage =
    user &&
    (user.roles.includes(Role.SUPERUSER) ||
      user.roles.includes(Role.ORG_ADMIN) ||
      (contact?.ownerId != null && contact.ownerId === user.id));

  const [isKvkLookingUp, setIsKvkLookingUp] = useState(false);
  const [vatValidation, setVatValidation] = useState<VatValidationResult | null>(null);
  const [viesNameSuggestion, setViesNameSuggestion] = useState<string | null>(null);
  const viesNameApplied = useRef(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue: setFormValue,
    getValues,
    control,
    formState: { errors: formErrors, isDirty },
  } = useForm<ContactFormData>({ resolver: zodResolver(contactSchema) });

  const handleVatValidationResult = (result: VatValidationResult | null) => {
    setVatValidation(result);
    if (result?.isValid && result.name) {
      const currentName = getValues('companyName')?.trim();
      const viesName = result.name.trim();
      if (currentName && viesName && currentName.toLowerCase() !== viesName.toLowerCase()) {
        setViesNameSuggestion(viesName);
      }
    }
  };

  const handleKvkLookup = async () => {
    const kvkNummer = getValues('cocNumber');
    if (!kvkNummer) return;
    setIsKvkLookingUp(true);
    try {
      const profile = await getKvkProfile(kvkNummer);
      setFormValue('companyName', profile.naam, { shouldDirty: true });
      if (profile.website) {
        setFormValue('website', profile.website, { shouldDirty: true });
      }
      showToast('Gegevens opgehaald uit KvK', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'KvK-nummer niet gevonden'), 'error');
    } finally {
      setIsKvkLookingUp(false);
    }
  };

  useEffect(() => {
    if (contact) {
      resetForm({
        companyName: contact.companyName || '',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email || '',
        phone: contact.phone || '',
        website: contact.website || '',
        vatNumber: contact.vatNumber || '',
        cocNumber: contact.cocNumber || '',
        isSupplier: contact.isSupplier ?? false,
        notes: contact.notes || '',
        ownerId: contact.ownerId || '',
        customFields: contact.customFields ?? {},
      } as any);
    }
  }, [contact, resetForm]);

  const onSubmitContact = async (data: ContactFormData) => {
    try {
      await updateMutation.mutateAsync({
        companyName: data.companyName || undefined,
        firstName: data.firstName || undefined,
        lastName: data.lastName || undefined,
        email: data.email || undefined,
        phone: data.phone || undefined,
        website: data.website || undefined,
        vatNumber: data.vatNumber || undefined,
        ...(vatValidation ? { vatValidation: vatValidation as any } : {}),
        ...(viesNameApplied.current ? { viesNameApplied: true } : {}),
        cocNumber: data.cocNumber || undefined,
        isSupplier: data.isSupplier,
        notes: data.notes || undefined,
        ownerId: data.ownerId || undefined,
        customFields: data.customFields,
      } as any);
      viesNameApplied.current = false;
      showToast('Relatie bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  const handleCancelEdit = () => {
    if (contact) {
      resetForm({
        companyName: contact.companyName || '',
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        email: contact.email || '',
        phone: contact.phone || '',
        website: contact.website || '',
        vatNumber: contact.vatNumber || '',
        cocNumber: contact.cocNumber || '',
        isSupplier: contact.isSupplier ?? false,
        notes: contact.notes || '',
        ownerId: contact.ownerId || '',
        customFields: contact.customFields ?? {},
      } as any);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!contact) return;
    const confirmed = await confirm({
      title: 'Relatie verwijderen',
      message: 'Weet u zeker dat u deze relatie wilt verwijderen?',
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(contact.id);
      showToast('Relatie verwijderd', 'success');
      navigate('/contacts');
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

  if (error || !contact) {
    return (
      <ErrorBox>{error?.message || 'Relatie niet gevonden'}</ErrorBox>
    );
  }

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'algemeen', label: 'Algemeen' },
    { key: 'adressen', label: `Adressen (${contact.addresses?.length || 0})` },
    { key: 'locaties', label: `Locaties (${contact.locations?.length || 0})` },
    { key: 'aanvragen', label: `Aanvragen (${contact.requests?.length || 0})` },
    { key: 'offertes', label: `Offertes (${contact.quotes?.length || 0})` },
    { key: 'planning', label: `Planning (${contactPlanningItems.length})` },
    { key: 'projecten', label: `Projecten (${contactProjects.length})` },
    ...(contact.isSupplier ? [{ key: 'inkoop' as Tab, label: 'Inkoop' }] : []),
  ];

  // Merge logs + emails into timeline
  const timeline: Array<
    | (ContactLog & { _kind: 'log' })
    | (ContactEmail & { _kind: 'email' })
  > = [
    ...(contact.logs || []).map((l) => ({ ...l, _kind: 'log' as const })),
    ...(contact.emails || []).map((e) => ({ ...e, _kind: 'email' as const })),
  ].sort((a, b) => {
    const dateA = a._kind === 'log' ? a.loggedAt : a.sentAt;
    const dateB = b._kind === 'log' ? b.loggedAt : b.sentAt;
    return new Date(dateB).getTime() - new Date(dateA).getTime();
  });

  const sidebarContent = (
    <div className="space-y-8">
      <SidebarSection
        icon={
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        label="Contactmomenten"
        count={timeline.length}
      >
        <ContactHistorySidebar
          contact={contact}
          timeline={timeline}
          userCanWrite={!!userCanWrite}
          onLogOpen={() => setIsLogOpen(true)}
          onEmailOpen={() => setIsEmailOpen(true)}
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
        <ContactTasksSidebar
          tasks={contactTasks}
          userCanWrite={!!userCanWrite}
          onCreateTask={() => setIsTaskOpen(true)}
        />
      </SidebarSection>

      <NotesSidebarSection entityType={NoteEntityType.CONTACT} entityId={id!} />

      <DocumentsSidebarSection
        entityType={DocumentEntityType.CONTACT}
        entityId={contact.id}
        canUpload={!!userCanWrite}
      />

      <HistorySidebarSection entityType="Contact" entityId={id} />
    </div>
  );

  return (
    <DetailPageLayout iconStrip sidebar={sidebarContent}>
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/contacts')}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-3">
              <FavoriteStar entityType="Contact" entityId={contact.id} />
              <h2 className="text-2xl font-bold text-gray-900">
                {getContactDisplayName(contact)}
              </h2>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  contact.type === ContactType.COMPANY
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-purple-100 text-purple-800'
                }`}
              >
                {contact.type === ContactType.COMPANY ? 'Bedrijf' : 'Particulier'}
              </span>
            </div>
            {contact.email && (
              <p className="mt-0.5 text-sm text-gray-500">{contact.email}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StartChatButton
            entityType="Contact"
            entityId={contact.id}
            label={getContactDisplayName(contact)}
          />
          {userCanWrite && (
          <ActionMenu
            primaryActions={[
              {
                label: 'Moment loggen',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
                onClick: () => setIsLogOpen(true),
              },
              {
                label: 'E-mail sturen',
                icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
                onClick: () => setIsEmailOpen(true),
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
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      {activeTab === 'algemeen' && (
        <div className="space-y-6">
          {isEditing ? (
            <ContactEditForm
              contact={contact}
              allUsers={allUsers}
              register={register}
              control={control}
              formErrors={formErrors}
              isDirty={isDirty}
              isSaving={updateMutation.isPending}
              isKvkLookingUp={isKvkLookingUp}
              onKvkLookup={handleKvkLookup}
              onVatValidationResult={handleVatValidationResult}
              onSubmit={handleSubmit(onSubmitContact)}
              onCancel={handleCancelEdit}
            />
          ) : (
            <ContactInfoCard
              contact={contact}
              userCanWrite={!!userCanWrite}
              onEmailOpen={() => setIsEmailOpen(true)}
              onLogCall={() => {
                setLogInitialType(LogType.PHONE);
                setLogInitialLoggedAt(new Date().toISOString().slice(0, 16));
                setIsLogOpen(true);
              }}
            />
          )}

          <CustomFieldsDisplay
            entityType={CustomFieldEntityType.CONTACT}
            customFields={contact.customFields}
          />

          {/* Klantgroepen */}
          <ContactCustomerGroups contactId={contact.id} contact={contact} userCanWrite={!!userCanWrite} />

          {/* Contactpersonen */}
          <ContactPersonsSection
            contact={contact}
            userCanWrite={!!userCanWrite}
            onAdd={() => setIsContactPersonOpen(true)}
          />

        </div>
      )}

      {activeTab === 'adressen' && (
        <ContactAddressesTab
          contact={contact}
          userCanWrite={!!userCanWrite}
          onAdd={() => setIsAddressOpen(true)}
          onEdit={setEditingAddress}
          deleteAddressMutation={deleteAddressMutation}
        />
      )}

      {activeTab === 'locaties' && (
        <ContactLocationsTab
          contact={contact}
          userCanWrite={!!userCanWrite}
          onAdd={() => setIsLocationOpen(true)}
          onEdit={setEditingLocation}
          deleteLocationMutation={deleteLocationMutation}
        />
      )}

      {activeTab === 'aanvragen' && (
        <ContactRequestsTab
          contact={contact}
          userCanWrite={!!userCanWrite}
          onCreateRequest={() => setIsRequestOpen(true)}
        />
      )}

      {activeTab === 'offertes' && (
        <ContactQuotesTab contact={contact} userCanWrite={!!userCanWrite} />
      )}

      {activeTab === 'planning' && (
        <ContactPlanningTab items={contactPlanningItems} />
      )}

      {activeTab === 'projecten' && (
        <ContactProjectsTab projects={contactProjects} />
      )}

      {activeTab === 'inkoop' && contact.isSupplier && (
        <ContactInkoopTab contact={contact} userCanWrite={!!userCanWrite} />
      )}

      {/* Acties onderaan */}
      <div className="flex items-center justify-between border-t border-gray-200 pt-6">
        <p className="text-xs text-gray-400">
          Aangemaakt op {new Date(contact.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        {(userCanWrite || userCanManage) && (
          <div className="flex gap-2">
            {userCanWrite && !isEditing && (
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                Bewerken
              </Button>
            )}
            {userCanManage && (
              <Button variant="danger" size="sm" onClick={handleDelete}>
                Relatie verwijderen
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AddAddressModal
        isOpen={isAddressOpen}
        onClose={() => setIsAddressOpen(false)}
        contactId={contact.id}
      />
      {editingAddress && (
        <EditAddressModal
          isOpen={!!editingAddress}
          onClose={() => setEditingAddress(null)}
          contactId={contact.id}
          address={editingAddress}
        />
      )}
      <AddContactPersonModal
        isOpen={isContactPersonOpen}
        onClose={() => setIsContactPersonOpen(false)}
        contactId={contact.id}
      />
      <AddLocationModal
        isOpen={isLocationOpen}
        onClose={() => setIsLocationOpen(false)}
        contactId={contact.id}
      />
      {editingLocation && (
        <EditLocationModal
          isOpen={!!editingLocation}
          onClose={() => setEditingLocation(null)}
          contactId={contact.id}
          location={editingLocation}
        />
      )}
      <AddLogModal
        isOpen={isLogOpen}
        onClose={() => {
          setIsLogOpen(false);
          setLogInitialType(undefined);
          setLogInitialLoggedAt(undefined);
        }}
        contactId={contact.id}
        initialType={logInitialType}
        initialLoggedAt={logInitialLoggedAt}
      />
      <SendEmailModal
        isOpen={isEmailOpen}
        onClose={() => setIsEmailOpen(false)}
        contactId={contact.id}
        contactEmail={contact.email}
      />
      <CreateTaskModal
        isOpen={isTaskOpen}
        onClose={() => setIsTaskOpen(false)}
        entityType={TaskEntityType.CONTACT}
        entityId={contact.id}
      />
      <CreateRequestModal
        isOpen={isRequestOpen}
        onClose={() => setIsRequestOpen(false)}
        contactId={contact.id}
      />

      {/* VIES naam-mismatch dialoog */}
      <ViesNameModal
        suggestion={viesNameSuggestion}
        currentName={getValues('companyName')}
        onClose={() => setViesNameSuggestion(null)}
        onApply={() => {
          if (viesNameSuggestion) {
            setFormValue('companyName', viesNameSuggestion, { shouldDirty: true });
            viesNameApplied.current = true;
          }
          setViesNameSuggestion(null);
        }}
      />
    </div>
    </DetailPageLayout>
  );
}
