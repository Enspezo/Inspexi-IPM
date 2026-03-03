import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ContactType, ContactPersonRole, LogType, QuoteStatus, RequestStatus, Priority, TaskStatus, PlanningStatus, Role, TaskEntityType, DocumentEntityType, CustomFieldEntityType, ProjectStatus } from '@/types';
import type { Contact, ContactAddress, ContactLog, ContactEmail, Location, Task, PlanningItem, Request as RequestType } from '@/types';
import { ActionMenu, type ActionMenuItem, Button, Card, Input, Modal, Spinner, useToast, VatInput } from '@/components/ui';
import { getKvkProfile } from '@/lib/kvk';
import { type VatValidationResult } from '@/lib/vat';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { useAuth } from '@/providers/auth-provider';
import { useContact, useUpdateContact, useDeleteContact, useSetContactGroups, useDeleteAddress, useDeleteLocation } from './hooks/use-contacts';
import { useCustomerGroupsCompact } from '@/pages/customer-groups/hooks/use-customer-groups';
import { useUsers } from '@/pages/users/hooks/use-users';
import { useTasks, useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
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
import { EditTaskModal } from '@/pages/tasks/components/edit-task-modal';
import { CreateRequestModal } from '@/pages/requests/components/create-request-modal';
import { DocumentsSection, UploadDocumentModal } from '@/components/documents';
import { CustomFieldsDisplay, CustomFieldsForm } from '@/components/custom-fields';
import { NoteEntityType } from '@/types';
import { NotesSidebarSection, HistorySidebarSection } from '@/components/layout/sidebar-sections';

type Tab = 'algemeen' | 'adressen' | 'locaties' | 'aanvragen' | 'offertes' | 'planning' | 'projecten';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE];

const contactSchema = z.object({
  companyName: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  email: z.string().email('Ongeldig e-mailadres').optional().or(z.literal('')),
  phone: z.string().optional(),
  website: z.string().optional(),
  vatNumber: z.string().optional(),
  cocNumber: z.string().optional(),
  notes: z.string().optional(),
  ownerId: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

type ContactFormData = z.infer<typeof contactSchema>;

function getContactDisplayName(contact: Contact): string {
  if (contact.type === ContactType.COMPANY) {
    return contact.companyName || '—';
  }
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ') || '—';
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatShortDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

const logTypeLabels: Record<string, string> = {
  [LogType.EMAIL]: 'E-mail',
  [LogType.PHONE]: 'Telefoon',
  [LogType.MEETING]: 'Vergadering',
  [LogType.NOTE]: 'Notitie',
};

const logTypeColors: Record<string, string> = {
  [LogType.EMAIL]: 'bg-blue-100 text-blue-800',
  [LogType.PHONE]: 'bg-green-100 text-green-800',
  [LogType.MEETING]: 'bg-purple-100 text-purple-800',
  [LogType.NOTE]: 'bg-gray-100 text-gray-800',
};

const contactPersonRoleLabels: Record<string, string> = {
  [ContactPersonRole.ALGEMEEN]: 'Algemeen',
  [ContactPersonRole.TECHNISCH]: 'Technisch',
  [ContactPersonRole.ADMINISTRATIEF]: 'Administratief',
  [ContactPersonRole.ANDERS]: 'Anders',
};

const contactPersonRoleColors: Record<string, string> = {
  [ContactPersonRole.ALGEMEEN]: 'bg-blue-100 text-blue-800',
  [ContactPersonRole.TECHNISCH]: 'bg-orange-100 text-orange-800',
  [ContactPersonRole.ADMINISTRATIEF]: 'bg-green-100 text-green-800',
  [ContactPersonRole.ANDERS]: 'bg-gray-100 text-gray-800',
};

const quoteStatusLabels: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'Concept',
  [QuoteStatus.TER_GOEDKEURING]: 'Ter goedkeuring',
  [QuoteStatus.GOEDGEKEURD]: 'Goedgekeurd',
  [QuoteStatus.VERSTUURD]: 'Verstuurd',
  [QuoteStatus.BEKEKEN]: 'Bekeken',
  [QuoteStatus.GEACCEPTEERD]: 'Geaccepteerd',
  [QuoteStatus.AFGEWEZEN]: 'Afgewezen',
  [QuoteStatus.VERLOPEN]: 'Verlopen',
};

const quoteStatusColors: Record<string, string> = {
  [QuoteStatus.CONCEPT]: 'bg-gray-100 text-gray-800',
  [QuoteStatus.TER_GOEDKEURING]: 'bg-yellow-100 text-yellow-800',
  [QuoteStatus.GOEDGEKEURD]: 'bg-green-100 text-green-800',
  [QuoteStatus.VERSTUURD]: 'bg-blue-100 text-blue-800',
  [QuoteStatus.BEKEKEN]: 'bg-purple-100 text-purple-800',
  [QuoteStatus.GEACCEPTEERD]: 'bg-emerald-100 text-emerald-800',
  [QuoteStatus.AFGEWEZEN]: 'bg-red-100 text-red-800',
  [QuoteStatus.VERLOPEN]: 'bg-orange-100 text-orange-800',
};

const requestStatusLabels: Record<string, string> = {
  [RequestStatus.NIEUW]: 'Nieuw',
  [RequestStatus.IN_BEHANDELING]: 'In behandeling',
  [RequestStatus.OFFERTE_GEMAAKT]: 'Offerte gemaakt',
  [RequestStatus.GEWONNEN]: 'Gewonnen',
  [RequestStatus.VERLOREN]: 'Verloren',
  [RequestStatus.ON_HOLD]: 'On hold',
};

const requestStatusColors: Record<string, string> = {
  [RequestStatus.NIEUW]: 'bg-blue-100 text-blue-800',
  [RequestStatus.IN_BEHANDELING]: 'bg-yellow-100 text-yellow-800',
  [RequestStatus.OFFERTE_GEMAAKT]: 'bg-purple-100 text-purple-800',
  [RequestStatus.GEWONNEN]: 'bg-green-100 text-green-800',
  [RequestStatus.VERLOREN]: 'bg-red-100 text-red-800',
  [RequestStatus.ON_HOLD]: 'bg-orange-100 text-orange-800',
};

const priorityLabels: Record<string, string> = {
  [Priority.LOW]: 'Laag',
  [Priority.NORMAL]: 'Normaal',
  [Priority.HIGH]: 'Hoog',
};

const priorityColors: Record<string, string> = {
  [Priority.LOW]: 'bg-gray-100 text-gray-700',
  [Priority.NORMAL]: 'bg-blue-100 text-blue-700',
  [Priority.HIGH]: 'bg-orange-100 text-orange-700',
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

const planningStatusLabels: Record<string, string> = {
  [PlanningStatus.NOG_TE_PLANNEN]: 'Nog te plannen',
  [PlanningStatus.CONCEPT]: 'Concept',
  [PlanningStatus.GEPLAND]: 'Gepland',
  [PlanningStatus.AFGEROND]: 'Afgerond',
  [PlanningStatus.VERVALLEN]: 'Vervallen',
};

const planningStatusColors: Record<string, string> = {
  [PlanningStatus.NOG_TE_PLANNEN]: 'bg-gray-100 text-gray-700',
  [PlanningStatus.CONCEPT]: 'bg-yellow-100 text-yellow-800',
  [PlanningStatus.GEPLAND]: 'bg-blue-100 text-blue-800',
  [PlanningStatus.AFGEROND]: 'bg-green-100 text-green-800',
  [PlanningStatus.VERVALLEN]: 'bg-red-100 text-red-800',
};

export default function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
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
  const [isDocUploadOpen, setIsDocUploadOpen] = useState(false);
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
    } catch {
      showToast('KvK-nummer niet gevonden', 'error');
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
        notes: data.notes || undefined,
        ownerId: data.ownerId || undefined,
        customFields: data.customFields,
      } as any);
      viesNameApplied.current = false;
      showToast('Relatie bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      showToast('Opslaan mislukt', 'error');
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
        notes: contact.notes || '',
        ownerId: contact.ownerId || '',
        customFields: contact.customFields ?? {},
      } as any);
    }
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (!contact) return;
    if (!window.confirm('Weet u zeker dat u deze relatie wilt verwijderen?')) return;
    try {
      await deleteMutation.mutateAsync(contact.id);
      showToast('Relatie verwijderd', 'success');
      navigate('/contacts');
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

  if (error || !contact) {
    return (
      <div className="rounded-lg bg-danger-50 p-4 text-sm text-danger-600">
        {error?.message || 'Relatie niet gevonden'}
      </div>
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

      {/* Tab content */}
      {activeTab === 'algemeen' && (
        <div className="space-y-6">
          {isEditing ? (
            <Card>
              <form onSubmit={handleSubmit(onSubmitContact)} className="space-y-4">
                {contact.type === ContactType.COMPANY && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Input label="Bedrijfsnaam" {...register('companyName')} />
                      <div>
                        <Input label="KvK-nummer" {...register('cocNumber')} />
                        <button
                          type="button"
                          onClick={handleKvkLookup}
                          disabled={isKvkLookingUp}
                          className="mt-1 flex items-center gap-1 text-xs text-primary-600 hover:text-primary-800 disabled:opacity-50"
                        >
                          {isKvkLookingUp ? (
                            <Spinner size="sm" />
                          ) : (
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                          )}
                          Gegevens ophalen uit KvK
                        </button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Controller
                        name="vatNumber"
                        control={control}
                        render={({ field }) => (
                          <VatInput
                            label="BTW-nummer"
                            value={field.value ?? ''}
                            onChange={field.onChange}
                            onValidationResult={handleVatValidationResult}
                          />
                        )}
                      />
                      <Input label="Website" {...register('website')} />
                    </div>
                  </>
                )}
                {contact.type === ContactType.INDIVIDUAL && (
                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Voornaam" {...register('firstName')} />
                    <Input label="Achternaam" {...register('lastName')} />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    label="E-mail"
                    type="email"
                    error={formErrors.email?.message}
                    {...register('email')}
                  />
                  <Input label="Telefoon" {...register('phone')} />
                </div>
                <div className="w-1/2">
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Eigenaar</label>
                  <select
                    {...register('ownerId')}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  >
                    <option value="">Geen eigenaar</option>
                    {(allUsers || []).filter((u) => u.isActive).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.firstName} {u.lastName}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700">Notities</label>
                  <textarea
                    {...register('notes')}
                    rows={3}
                    className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                  />
                </div>
                <CustomFieldsForm
                  entityType={CustomFieldEntityType.CONTACT}
                  register={register}
                  errors={formErrors}
                  control={control}
                />
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
              <div className="grid grid-cols-2 gap-6">
                {contact.type === ContactType.COMPANY && (
                  <>
                    <InfoField label="Bedrijfsnaam" value={contact.companyName} />
                    <InfoField label="KvK-nummer" value={contact.cocNumber} />
                    <InfoField label="BTW-nummer" value={contact.vatNumber} />
                    <InfoField label="Website" value={contact.website} />
                  </>
                )}
                {contact.type === ContactType.INDIVIDUAL && (
                  <>
                    <InfoField label="Voornaam" value={contact.firstName} />
                    <InfoField label="Achternaam" value={contact.lastName} />
                  </>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">E-mail</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-900">
                    {contact.email || '—'}
                    {contact.email && userCanWrite && (
                      <button
                        type="button"
                        onClick={() => setIsEmailOpen(true)}
                        title="E-mail versturen"
                        className="rounded p-0.5 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </button>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Telefoon</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm text-gray-900">
                    {contact.phone || '—'}
                    {contact.phone && (
                      <a
                        href={`tel:${contact.phone}`}
                        title="Bellen & contactmoment loggen"
                        className="rounded p-0.5 text-gray-400 transition-colors hover:bg-primary-50 hover:text-primary-600"
                        onClick={() => {
                          setLogInitialType(LogType.PHONE);
                          setLogInitialLoggedAt(new Date().toISOString().slice(0, 16));
                          setIsLogOpen(true);
                        }}
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </a>
                    )}
                  </dd>
                </div>
                <InfoField
                  label="Eigenaar"
                  value={contact.owner ? `${contact.owner.firstName} ${contact.owner.lastName}` : null}
                />
                <div className="col-span-2">
                  <InfoField label="Notities" value={contact.notes} />
                </div>
              </div>
            </Card>
          )}

          <CustomFieldsDisplay
            entityType={CustomFieldEntityType.CONTACT}
            customFields={contact.customFields}
          />

          {/* Klantgroepen */}
          <ContactCustomerGroups contactId={contact.id} contact={contact} userCanWrite={!!userCanWrite} />

          {/* Contactpersonen */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Contactpersonen
              </h3>
              {userCanWrite && (
                <Button size="sm" onClick={() => setIsContactPersonOpen(true)}>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Contactpersoon toevoegen
                </Button>
              )}
            </div>
            {(contact.contactPersons?.length || 0) === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                Nog geen contactpersonen toegevoegd
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-200">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Naam
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Rol
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        E-mail
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Telefoon
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white">
                    {contact.contactPersons?.map((person) => (
                      <tr
                        key={person.id}
                        className="cursor-pointer hover:bg-gray-50"
                        onClick={() => navigate(`/contacts/persons/${person.id}`)}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900">
                          {person.firstName} {person.lastName}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                              contactPersonRoleColors[person.role] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {contactPersonRoleLabels[person.role] || person.role}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {person.email || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                          {person.phone || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Documenten */}
          <Card>
            <DocumentsSection
              entityType={DocumentEntityType.CONTACT}
              entityId={contact.id}
              canUpload={!!userCanWrite}
            />
          </Card>
        </div>
      )}

      {activeTab === 'adressen' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsAddressOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Adres toevoegen
              </Button>
            </div>
          )}
          {(contact.addresses?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen adressen toegevoegd
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {contact.addresses?.map((addr) => (
                <Card key={addr.id}>
                  <div className="relative">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-sm font-medium text-gray-900">
                            {addr.label}
                          </span>
                          {addr.isPrimary && (
                            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              Primair
                            </span>
                          )}
                          {addr.isPostal && (
                            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              Postadres
                            </span>
                          )}
                          {addr.isInvoice && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              Factuuradres
                            </span>
                          )}
                        </div>
                      </div>
                      {userCanWrite && (
                        <CardMenu
                          onEdit={() => setEditingAddress(addr)}
                          onDelete={async () => {
                            if (!window.confirm('Weet u zeker dat u dit adres wilt verwijderen?')) return;
                            try {
                              await deleteAddressMutation.mutateAsync(addr.id);
                              showToast('Adres verwijderd', 'success');
                            } catch {
                              showToast('Verwijderen mislukt', 'error');
                            }
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {addr.street} {addr.houseNumber}
                    </p>
                    <p className="text-sm text-gray-600">
                      {addr.postalCode} {addr.city}
                    </p>
                    <p className="text-sm text-gray-400">{addr.country}</p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'locaties' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsLocationOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Locatie toevoegen
              </Button>
            </div>
          )}
          {(contact.locations?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen locaties toegevoegd
            </p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {contact.locations?.map((loc) => (
                <Card key={loc.id}>
                  <div className="relative">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-sm font-medium text-gray-900">
                            {loc.name}
                          </span>
                          {loc.objectType && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {loc.objectType}
                            </span>
                          )}
                        </div>
                      </div>
                      {userCanWrite && (
                        <CardMenu
                          onEdit={() => setEditingLocation(loc)}
                          onDelete={async () => {
                            if (!window.confirm('Weet u zeker dat u deze locatie wilt verwijderen?')) return;
                            try {
                              await deleteLocationMutation.mutateAsync(loc.id);
                              showToast('Locatie verwijderd', 'success');
                            } catch {
                              showToast('Verwijderen mislukt', 'error');
                            }
                          }}
                        />
                      )}
                    </div>
                    <p className="mt-1 text-sm text-gray-600">
                      {loc.street} {loc.houseNumber}
                    </p>
                    <p className="text-sm text-gray-600">
                      {loc.postalCode} {loc.city}
                    </p>
                    {loc.notes && (
                      <p className="mt-2 text-xs text-gray-400">{loc.notes}</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'aanvragen' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => setIsRequestOpen(true)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Aanvraag aanmaken
              </Button>
            </div>
          )}
          {(contact.requests?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen aanvragen voor deze relatie
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Titel
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Prioriteit
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Toegewezen aan
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Datum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {contact.requests?.map((request) => (
                    <tr
                      key={request.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/requests/${request.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-primary-600">
                        {request.title}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            requestStatusColors[request.status] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {requestStatusLabels[request.status] || request.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            priorityColors[request.priority] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {priorityLabels[request.priority] || request.priority}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {request.assignedUser
                          ? `${request.assignedUser.firstName} ${request.assignedUser.lastName}`
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatShortDate(request.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'offertes' && (
        <div className="space-y-4">
          {userCanWrite && (
            <div className="flex justify-end">
              <Button size="sm" onClick={() => navigate(`/quotes/new?contactId=${contact.id}`)}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Offerte aanmaken
              </Button>
            </div>
          )}
          {(contact.quotes?.length || 0) === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen offertes voor deze relatie
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Nummer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Onderwerp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500">
                      Totaal
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Datum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {contact.quotes?.map((quote) => (
                    <tr
                      key={quote.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/quotes/${quote.id}`)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-primary-600">
                        {quote.quoteNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {quote.subject}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            quoteStatusColors[quote.status] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {quoteStatusLabels[quote.status] || quote.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-gray-900">
                        {new Intl.NumberFormat('nl-NL', {
                          style: 'currency',
                          currency: 'EUR',
                        }).format(quote.total)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {formatShortDate(quote.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'planning' && (
        <div className="space-y-4">
          {contactPlanningItems.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen planning voor deze relatie
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Dienst
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Datum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Locatie
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Inspecteur(s)
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {contactPlanningItems.map((item) => (
                    <tr
                      key={item.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/planning/${item.id}`)}
                    >
                      <td className="px-4 py-3 text-sm font-medium text-primary-600">
                        {item.productName}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            item.isCancelled
                              ? 'bg-red-100 text-red-800'
                              : planningStatusColors[item.status] || 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {item.isCancelled ? 'Geannuleerd' : planningStatusLabels[item.status] || item.status}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        <div className="flex items-center gap-1.5">
                          {item.scheduledDate ? formatShortDate(item.scheduledDate) : '—'}
                          {item.isMultiDay && (
                            <span className="rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700">
                              Meerdaags
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {item.location
                          ? `${item.location.name}${item.location.city ? `, ${item.location.city}` : ''}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {item.inspectors && item.inspectors.length > 0
                          ? item.inspectors.map((i) =>
                              i.user ? `${i.user.firstName} ${i.user.lastName}` : '—'
                            ).join(', ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'projecten' && (
        <div className="space-y-4">
          {contactProjects.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-500">
              Nog geen projecten voor deze relatie
            </p>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Nummer
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Titel
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Projectleider
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      Startdatum
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {contactProjects.map((project) => (
                    <tr
                      key={project.id}
                      className="cursor-pointer hover:bg-gray-50"
                      onClick={() => navigate(`/projects/${project.id}`)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-primary-600">
                        {project.projectNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        {project.title}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            project.status === ProjectStatus.ACTIEF
                              ? 'bg-green-100 text-green-800'
                              : project.status === ProjectStatus.AFGEROND
                              ? 'bg-blue-100 text-blue-800'
                              : project.status === ProjectStatus.ON_HOLD
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {project.status === ProjectStatus.ACTIEF
                            ? 'Actief'
                            : project.status === ProjectStatus.AFGEROND
                            ? 'Afgerond'
                            : project.status === ProjectStatus.ON_HOLD
                            ? 'On hold'
                            : 'Geannuleerd'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {project.projectManager
                          ? `${project.projectManager.firstName} ${project.projectManager.lastName}`
                          : '—'}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-500">
                        {project.startDate
                          ? new Date(project.startDate).toLocaleDateString('nl-NL', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
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
      <UploadDocumentModal
        isOpen={isDocUploadOpen}
        onClose={() => setIsDocUploadOpen(false)}
        entityType={DocumentEntityType.CONTACT}
        entityId={contact.id}
      />

      {/* VIES naam-mismatch dialoog */}
      <Modal
        isOpen={viesNameSuggestion !== null}
        onClose={() => setViesNameSuggestion(null)}
        title="Bedrijfsnaam bijwerken?"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            De naam in het BTW-register (VIES) verschilt van de huidige bedrijfsnaam:
          </p>
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm space-y-1">
            <div>
              <span className="font-medium text-gray-500">Huidige naam: </span>
              <span className="text-gray-900">{getValues('companyName') || '—'}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">Naam in VIES: </span>
              <span className="text-gray-900 font-medium">{viesNameSuggestion}</span>
            </div>
          </div>
          <p className="text-sm text-gray-600">
            Wil je de bedrijfsnaam overschrijven met de naam uit VIES?
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setViesNameSuggestion(null)}>
              Nee, behouden
            </Button>
            <Button
              onClick={() => {
                if (viesNameSuggestion) {
                  setFormValue('companyName', viesNameSuggestion, { shouldDirty: true });
                  viesNameApplied.current = true;
                }
                setViesNameSuggestion(null);
              }}
            >
              Ja, bijwerken
            </Button>
          </div>
        </div>
      </Modal>
    </div>
    </DetailPageLayout>
  );
}

function ContactHistorySidebar({
  contact,
  timeline,
  userCanWrite,
  onLogOpen,
  onEmailOpen,
}: {
  contact: Contact;
  timeline: Array<
    | (ContactLog & { _kind: 'log' })
    | (ContactEmail & { _kind: 'email' })
  >;
  userCanWrite: boolean;
  onLogOpen: () => void;
  onEmailOpen: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const MAX_ITEMS = 5;
  const visibleTimeline = showAll ? timeline : timeline.slice(0, MAX_ITEMS);

  return (
    <div className="space-y-3">
      {timeline.length === 0 ? (
        <p className="text-xs text-gray-400">Nog geen contactgeschiedenis</p>
      ) : (
        <div className="space-y-2">
          {visibleTimeline.map((item) => {
            if (item._kind === 'log') {
              return (
                <div
                  key={`log-${item.id}`}
                  className="rounded-lg border border-gray-200 bg-white p-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        logTypeColors[item.type] || 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {logTypeLabels[item.type] || item.type}
                    </span>
                    <span className="text-xs text-gray-400">
                      {formatShortDate(item.loggedAt)}
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
              );
            }

            return (
              <div
                key={`email-${item.id}`}
                className="rounded-lg border border-gray-200 bg-white p-3"
              >
                <div className="mb-1 flex items-center justify-between">
                  <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                    E-mail
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatShortDate(item.sentAt)}
                  </span>
                </div>
                <p className="text-xs font-medium text-gray-900">{item.subject}</p>
                {item.bodyHtml && (
                  <p
                    className="mt-0.5 line-clamp-2 text-xs text-gray-600"
                    title={item.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                  >
                    {item.bodyHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()}
                  </p>
                )}
                {item.user && (
                  <p className="mt-1 text-xs text-gray-400">
                    {item.user.firstName} {item.user.lastName}
                  </p>
                )}
              </div>
            );
          })}

          {timeline.length > MAX_ITEMS && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full py-1 text-center text-xs font-medium text-primary-600 hover:text-primary-800"
            >
              {showAll
                ? 'Minder tonen'
                : `Alle ${timeline.length} items tonen`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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
      {/* Checkbox */}
      <button
        type="button"
        onClick={() =>
          onStatusChange(task.id, isCompleted ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID)
        }
        className={`mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded border transition-colors ${
          isCompleted
            ? 'border-green-500 bg-green-500 text-white'
            : 'border-gray-300 bg-white hover:border-primary-500'
        }`}
        style={{ width: 18, height: 18 }}
      >
        {isCompleted && (
          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      {/* Task info */}
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

      {/* 3-dot menu (canWrite only) */}
      {userCanWrite && (
        <div className="relative flex-shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
            }}
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
                onClick={() => {
                  setMenuOpen(false);
                  onEdit(task);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Bewerken
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(`/tasks/${task.id}`);
                }}
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

function ContactTasksSidebar({
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
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
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

function ContactCustomerGroups({
  contactId,
  contact,
  userCanWrite,
}: {
  contactId: string;
  contact: Contact;
  userCanWrite: boolean;
}) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: allGroups, isLoading: groupsLoading } = useCustomerGroupsCompact();
  const setGroupsMutation = useSetContactGroups(contactId);

  const assignedIds = new Set(
    (contact.customerGroups || []).map((cg) => cg.customerGroupId),
  );

  const handleToggle = async (groupId: string) => {
    const newIds = assignedIds.has(groupId)
      ? [...assignedIds].filter((id) => id !== groupId)
      : [...assignedIds, groupId];
    try {
      await setGroupsMutation.mutateAsync(newIds);
    } catch {
      showToast('Klantgroepen bijwerken mislukt', 'error');
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Klantgroepen</h3>
      </div>
      {groupsLoading ? (
        <div className="flex justify-center py-4">
          <Spinner size="sm" />
        </div>
      ) : !allGroups || allGroups.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">
          Er zijn nog geen klantgroepen aangemaakt
        </p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex flex-wrap gap-3">
            {allGroups.map((group) => {
              const isAssigned = assignedIds.has(group.id);
              return (
                <label
                  key={group.id}
                  className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    isAssigned
                      ? 'border-primary-300 bg-primary-50 text-primary-700'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  } ${!userCanWrite ? 'pointer-events-none opacity-75' : ''}`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={isAssigned}
                    disabled={!userCanWrite || setGroupsMutation.isPending}
                    onChange={() => handleToggle(group.id)}
                  />
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded border ${
                      isAssigned
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isAssigned && (
                      <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none">
                        <path
                          d="M2 6l3 3 5-5"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      navigate(`/contacts/groups/${group.id}`);
                    }}
                  >
                    {group.name}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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

function CardMenu({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative ml-2 flex-shrink-0" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
      >
        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onEdit();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Bewerken
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Verwijderen
          </button>
        </div>
      )}
    </div>
  );
}
