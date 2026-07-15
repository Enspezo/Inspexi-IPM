import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role, TaskEntityType, DocumentEntityType, TaskStatus } from '@/types';
import type { User } from '@/types';
import { ActionMenu, Button, Card, Checkbox, ErrorBox, InfoField, Input, Spinner, Badge, Tabs, useToast } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { DetailPageLayout, SidebarSection } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { useUser, useAdminUpdateUser, useDeactivateUser, useActivateUser } from './hooks/use-users';
import { useTasks, useUpdateTask } from '@/pages/tasks/hooks/use-tasks';
import { ChangeRoleModal } from './components/change-role-modal';
import { ResetPasswordModal } from './components/reset-password-modal';
import { DeleteUserModal } from './components/delete-user-modal';
import { CreateTaskModal } from '@/pages/tasks/components/create-task-modal';
import { EditTaskModal } from '@/pages/tasks/components/edit-task-modal';
import { DocumentsSidebarSection } from '@/components/layout/sidebar-sections';
import { AddressSearchInput } from '@/components/ui';
import type { ParsedAddress } from '@/lib/geocoding';
import { getErrorMessage } from '@/lib/api-client';
import { InspectorCertificatesSection } from '@/components/inspector-certificates';
import { UserAvailabilitySection } from '@/components/availability';
import { MANAGEMENT_ROLES } from '@/lib/roles';

type Tab = 'overzicht' | 'certificering' | 'beschikbaarheid' | 'instellingen';

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN];

const userSchema = z.object({
  firstName: z.string().min(1, 'Verplicht'),
  lastName: z.string().min(1, 'Verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
  initials: z
    .string()
    .max(4, 'Maximaal 4 tekens')
    .regex(/^[A-Z]*$/, 'Alleen hoofdletters (A-Z)')
    .optional()
    .transform((v) => v || undefined),
  homeStreet: z.string().optional().nullable(),
  homeHouseNumber: z.string().optional().nullable(),
  homePostalCode: z.string().max(10).optional().nullable(),
  homeCity: z.string().optional().nullable(),
  contactPhone: z.string().optional(),
  contactEmail: z
    .union([z.string().email('Voer een geldig e-mailadres in'), z.literal('')])
    .optional(),
  sharePhoneWithClients: z.boolean(),
  shareEmailWithClients: z.boolean(),
});

type UserFormData = z.infer<typeof userSchema>;

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { showToast } = useToast();
  const { data: userRecord, isLoading, error } = useUser(id!);
  const updateMutation = useAdminUpdateUser();
  const deactivateMutation = useDeactivateUser();
  const activateMutation = useActivateUser();
  const updateTaskMutation = useUpdateTask();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);
  const [changeRoleUser, setChangeRoleUser] = useState<User | null>(null);
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<any>(null);
  const [homeLat, setHomeLat] = useState<number | null>(null);
  const [homeLng, setHomeLng] = useState<number | null>(null);

  // Fetch tasks linked to this user
  const { data: tasksData } = useTasks({
    entityType: TaskEntityType.USER,
    entityId: id,
    limit: 100,
  });

  const userCanWrite = currentUser && currentUser.roles.some(r => canWrite.includes(r));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
  });

  useEffect(() => {
    if (userRecord) {
      resetForm({
        firstName: userRecord.firstName,
        lastName: userRecord.lastName,
        email: userRecord.email,
        initials: userRecord.initials ?? '',
        homeStreet: userRecord.homeStreet ?? '',
        homeHouseNumber: userRecord.homeHouseNumber ?? '',
        homePostalCode: userRecord.homePostalCode ?? '',
        homeCity: userRecord.homeCity ?? '',
        contactPhone: userRecord.contactPhone ?? '',
        contactEmail: userRecord.contactEmail ?? '',
        sharePhoneWithClients: userRecord.sharePhoneWithClients ?? false,
        shareEmailWithClients: userRecord.shareEmailWithClients ?? false,
      });
      setHomeLat(userRecord.homeLat ?? null);
      setHomeLng(userRecord.homeLng ?? null);
    }
  }, [userRecord, resetForm]);

  // Klantportaal-contactgegevens: toestemming kan alleen aan met een ingevulde waarde.
  const contactPhoneValue = watch('contactPhone');
  const contactEmailValue = watch('contactEmail');
  const hasContactPhone = Boolean(contactPhoneValue && contactPhoneValue.trim());
  const hasContactEmail = Boolean(contactEmailValue && contactEmailValue.trim());

  useEffect(() => {
    if (!hasContactPhone) setValue('sharePhoneWithClients', false);
  }, [hasContactPhone, setValue]);
  useEffect(() => {
    if (!hasContactEmail) setValue('shareEmailWithClients', false);
  }, [hasContactEmail, setValue]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !userRecord) {
    return (
      <ErrorBox>Gebruiker niet gevonden of fout bij het laden.</ErrorBox>
    );
  }

  const handleSave = async (data: UserFormData) => {
    try {
      await updateMutation.mutateAsync({
        userId: userRecord.id,
        data: {
          ...data,
          homeStreet: data.homeStreet || null,
          homeHouseNumber: data.homeHouseNumber || null,
          homePostalCode: data.homePostalCode || null,
          homeCity: data.homeCity || null,
          homeLat,
          homeLng,
          contactPhone: data.contactPhone?.trim() || '',
          contactEmail: data.contactEmail?.trim() || '',
          sharePhoneWithClients: hasContactPhone ? data.sharePhoneWithClients : false,
          shareEmailWithClients: hasContactEmail ? data.shareEmailWithClients : false,
        },
      });
      showToast('Gebruiker bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDeactivate = async () => {
    try {
      await deactivateMutation.mutateAsync(userRecord.id);
      showToast('Gebruiker gedeactiveerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleActivate = async () => {
    try {
      await activateMutation.mutateAsync(userRecord.id);
      showToast('Gebruiker geactiveerd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleAddressSelect = (address: ParsedAddress) => {
    setValue('homeStreet', address.street, { shouldDirty: true });
    setValue('homeHouseNumber', address.houseNumber, { shouldDirty: true });
    setValue('homePostalCode', address.postalCode, { shouldDirty: true });
    setValue('homeCity', address.city, { shouldDirty: true });
    setHomeLat(address.lat);
    setHomeLng(address.lng);
  };

  const handleToggleTaskStatus = async (task: any) => {
    const newStatus = task.status === TaskStatus.VOLTOOID ? TaskStatus.TE_DOEN : TaskStatus.VOLTOOID;
    try {
      await updateTaskMutation.mutateAsync({ id: task.id, data: { status: newStatus } });
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const currentStreet = watch('homeStreet');
  const currentHouseNumber = watch('homeHouseNumber');
  const currentPostalCode = watch('homePostalCode');
  const currentCity = watch('homeCity');
  const hasAddress = !!(currentStreet && currentCity);
  const addressLabel = hasAddress
    ? `${currentStreet} ${currentHouseNumber}, ${currentPostalCode} ${currentCity}`
    : undefined;

  // De certificering- en beschikbaarheid-tabs zijn alleen relevant voor inspecteurs (PRD-11/PRD-12).
  const isInspector = userRecord.roles.includes(Role.INSPECTEUR);
  const isManagement = !!currentUser && currentUser.roles.some((r) => MANAGEMENT_ROLES.includes(r));
  const tabs: { key: Tab; label: string }[] = [
    { key: 'overzicht', label: 'Overzicht' },
    ...(isInspector
      ? [
          { key: 'certificering' as Tab, label: 'Certificering' },
          { key: 'beschikbaarheid' as Tab, label: 'Beschikbaarheid' },
        ]
      : []),
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const tasks = tasksData?.data || [];

  return (
    <DetailPageLayout
      iconStrip
      sidebar={
        <>
          <SidebarSection
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>}
            label="Taken"
            count={tasks.filter(t => t.status !== TaskStatus.VOLTOOID).length}
          >
            <div className="space-y-2">
              {tasks.length === 0 ? (
                <p className="text-sm text-gray-400">Geen taken</p>
              ) : (
                tasks.map((task) => (
                  <div key={task.id} className="group flex items-start gap-2 rounded-lg border border-gray-100 bg-white p-2 shadow-sm">
                    <button
                      type="button"
                      onClick={() => handleToggleTaskStatus(task)}
                      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                        task.status === TaskStatus.VOLTOOID
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-gray-300 hover:border-primary-400'
                      }`}
                    >
                      {task.status === TaskStatus.VOLTOOID && (
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <Link
                        to={`/tasks/${task.id}`}
                        className={`block text-sm font-medium hover:text-primary-600 ${
                          task.status === TaskStatus.VOLTOOID ? 'text-gray-400 line-through' : 'text-gray-900'
                        }`}
                      >
                        {task.title}
                      </Link>
                      {task.deadline && (
                        <p className="text-xs text-gray-400">{formatDate(task.deadline)}</p>
                      )}
                    </div>
                    {userCanWrite && (
                      <button
                        type="button"
                        onClick={() => setEditTask(task)}
                        className="invisible shrink-0 rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 group-hover:visible"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))
              )}
              {userCanWrite && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setIsTaskModalOpen(true)}
                    className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    Nieuwe taak
                  </button>
                </div>
              )}
            </div>
          </SidebarSection>

          <DocumentsSidebarSection
            entityType={DocumentEntityType.USER}
            entityId={userRecord.id}
            canUpload={!!userCanWrite}
          />

          <SidebarSection
            icon={<svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            label="Audit"
          >
            <AuditHistory entityType="User" entityId={id} />
          </SidebarSection>
        </>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Link to="/users" className="text-sm text-gray-500 hover:text-gray-700">
                Gebruikers
              </Link>
              <span className="text-sm text-gray-400">/</span>
            </div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {userRecord.firstName} {userRecord.lastName}
              </h2>
              <div className="flex items-center gap-2">
                {userRecord.roles.map((r) => (
                  <Badge key={r} role={r} />
                ))}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    userRecord.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      userRecord.isActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  {userRecord.isActive ? 'Actief' : 'Inactief'}
                </span>
              </div>
            </div>
          </div>
          {userCanWrite && (
            <ActionMenu
              primaryActions={[
                {
                  label: 'Rol wijzigen',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>,
                  onClick: () => setChangeRoleUser(userRecord),
                },
                {
                  label: 'Wachtwoord resetten',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>,
                  onClick: () => setResetPasswordUser(userRecord),
                },
              ]}
              secondaryActions={[
                {
                  label: 'Taak aanmaken',
                  icon: <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>,
                  onClick: () => setIsTaskModalOpen(true),
                },
              ]}
            />
          )}
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'overzicht' && (
          <div className="space-y-6">
            {/* Persoonlijke informatie */}
            <Card>
              <h3 className="mb-4 text-sm font-semibold text-gray-900">Persoonlijke informatie</h3>

              {isEditing ? (
                <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Input
                      label="Voornaam"
                      error={errors.firstName?.message}
                      {...register('firstName')}
                    />
                    <Input
                      label="Achternaam"
                      error={errors.lastName?.message}
                      {...register('lastName')}
                    />
                  </div>

                  <Input
                    label="E-mailadres"
                    type="email"
                    error={errors.email?.message}
                    {...register('email')}
                  />

                  <div>
                    <Input
                      label="Initialen"
                      placeholder="bv. JDV"
                      maxLength={4}
                      error={errors.initials?.message}
                      {...register('initials', {
                        onChange: (e) => {
                          e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                        },
                      })}
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Max. 4 hoofdletters (A–Z). Wordt gebruikt bij offertes en documentnaamgeving.
                    </p>
                  </div>

                  {/* Home address */}
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-700">Thuisadres</p>

                    <AddressSearchInput
                      label="Zoek adres"
                      placeholder="Typ een straat, huisnummer of postcode…"
                      initialValue={addressLabel}
                      onSelect={handleAddressSelect}
                    />

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <Input label="Straat" placeholder="Hoofdstraat" {...register('homeStreet')} />
                      </div>
                      <Input label="Huisnummer" placeholder="1A" {...register('homeHouseNumber')} />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Postcode" placeholder="1234 AB" maxLength={10} {...register('homePostalCode')} />
                      <Input label="Stad" placeholder="Amsterdam" {...register('homeCity')} />
                    </div>
                  </div>

                  {/* Klantportaal-contactgegevens */}
                  <div className="space-y-3 border-t border-gray-200 pt-4">
                    <p className="text-sm font-medium text-gray-700">Contactgegevens in klantportaal</p>
                    <p className="text-xs text-gray-500">
                      Aparte gegevens, los van het login-e-mailadres. Worden alleen aan klanten getoond
                      als de organisatie dit per kanaal op &ldquo;inspecteur&rdquo; zet én de toestemming
                      hieronder aanstaat.
                    </p>

                    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                      <div className="space-y-3">
                        <Input
                          label="Telefoonnummer (klantportaal)"
                          placeholder="Bijv. 06 12345678"
                          error={errors.contactPhone?.message}
                          {...register('contactPhone')}
                        />
                        <Checkbox
                          label="Toon telefoonnummer in het klantportaal"
                          disabled={!hasContactPhone}
                          {...register('sharePhoneWithClients')}
                        />
                        {!hasContactPhone && (
                          <p className="text-xs text-gray-400">
                            Vul eerst een telefoonnummer in om dit aan te kunnen zetten.
                          </p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <Input
                          label="E-mailadres (klantportaal)"
                          type="email"
                          placeholder="Bijv. inspecteur@mijnbedrijf.nl"
                          error={errors.contactEmail?.message}
                          {...register('contactEmail')}
                        />
                        <Checkbox
                          label="Toon e-mailadres in het klantportaal"
                          disabled={!hasContactEmail}
                          {...register('shareEmailWithClients')}
                        />
                        {!hasContactEmail && (
                          <p className="text-xs text-gray-400">
                            Vul eerst een e-mailadres in om dit aan te kunnen zetten.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        resetForm();
                        setIsEditing(false);
                      }}
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
              ) : (
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <InfoField label="Voornaam" value={userRecord.firstName} />
                  <InfoField label="Achternaam" value={userRecord.lastName} />
                  <InfoField label="E-mailadres" value={userRecord.email} />
                  <InfoField label="Initialen" value={userRecord.initials} />
                  <InfoField
                    label="Rollen"
                    value={userRecord.roles.join(', ')}
                  />
                  <InfoField
                    label="Status"
                    value={userRecord.isActive ? 'Actief' : 'Inactief'}
                  />
                  <InfoField
                    label="Aangemaakt op"
                    value={formatDate(userRecord.createdAt)}
                  />
                  <InfoField
                    label="E-mail geverifieerd"
                    value={userRecord.emailVerifiedAt ? formatDate(userRecord.emailVerifiedAt) : null}
                  />
                </dl>
              )}
            </Card>

            {/* Thuisadres (read-only when not editing) */}
            {!isEditing && (
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Thuisadres</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <InfoField label="Straat" value={userRecord.homeStreet} />
                  <InfoField label="Huisnummer" value={userRecord.homeHouseNumber} />
                  <InfoField label="Postcode" value={userRecord.homePostalCode} />
                  <InfoField label="Stad" value={userRecord.homeCity} />
                </dl>
              </Card>
            )}

            {/* Klantportaal-contactgegevens (read-only when not editing) */}
            {!isEditing && (
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-gray-900">Contactgegevens in klantportaal</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
                  <InfoField label="Telefoonnummer" value={userRecord.contactPhone} />
                  <InfoField label="E-mailadres" value={userRecord.contactEmail} />
                  <InfoField
                    label="Telefoon tonen aan klant"
                    value={userRecord.sharePhoneWithClients ? 'Ja' : 'Nee'}
                  />
                  <InfoField
                    label="E-mail tonen aan klant"
                    value={userRecord.shareEmailWithClients ? 'Ja' : 'Nee'}
                  />
                </dl>
                <p className="mt-4 text-xs text-gray-400">
                  Of deze gegevens daadwerkelijk zichtbaar zijn, hangt ook af van de modus in
                  Organisatie → Instellingen (algemeen vast nummer vs. inspecteur).
                </p>
              </Card>
            )}

            <div className="flex items-center justify-between border-t border-gray-200 pt-6">
              <p className="text-xs text-gray-400">
                Aangemaakt op {new Date(userRecord.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
              {userCanWrite && !isEditing && (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  Bewerken
                </Button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'certificering' && (
          <InspectorCertificatesSection userId={userRecord.id} canEdit />
        )}

        {activeTab === 'beschikbaarheid' && (
          <UserAvailabilitySection
            userId={userRecord.id}
            canManage={isManagement}
            employmentType={userRecord.employmentType ?? null}
          />
        )}

        {activeTab === 'instellingen' && (
          <div className="space-y-6">
            {/* Danger zone */}
            {currentUser?.id !== userRecord.id ? (
              <Card>
                <h3 className="mb-4 text-sm font-semibold text-red-600">Gevarenzone</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 p-4">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {userRecord.isActive ? 'Gebruiker deactiveren' : 'Gebruiker activeren'}
                      </p>
                      <p className="text-xs text-gray-500">
                        {userRecord.isActive
                          ? 'De gebruiker kan niet meer inloggen.'
                          : 'De gebruiker kan weer inloggen.'}
                      </p>
                    </div>
                    {userRecord.isActive ? (
                      <Button
                        variant="danger"
                        onClick={handleDeactivate}
                        isLoading={deactivateMutation.isPending}
                      >
                        Deactiveren
                      </Button>
                    ) : (
                      <Button
                        onClick={handleActivate}
                        isLoading={activateMutation.isPending}
                      >
                        Activeren
                      </Button>
                    )}
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 p-4">
                    <div>
                      <p className="text-sm font-medium text-red-800">Gebruiker verwijderen</p>
                      <p className="text-xs text-red-600">
                        Dit verwijdert de gebruiker permanent en draagt alle records over.
                      </p>
                    </div>
                    <Button
                      variant="danger"
                      onClick={() => setDeleteUser(userRecord)}
                    >
                      Verwijderen
                    </Button>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-gray-500">
                  Je kunt jezelf niet deactiveren of verwijderen. Ga naar je <Link to="/profile" className="text-primary-600 hover:underline">profiel</Link> om je eigen gegevens te bewerken.
                </p>
              </Card>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <ChangeRoleModal
        isOpen={!!changeRoleUser}
        onClose={() => setChangeRoleUser(null)}
        user={changeRoleUser}
      />

      <ResetPasswordModal
        isOpen={!!resetPasswordUser}
        onClose={() => setResetPasswordUser(null)}
        user={resetPasswordUser}
      />

      <DeleteUserModal
        isOpen={!!deleteUser}
        onClose={() => {
          setDeleteUser(null);
          if (deleteUser) navigate('/users');
        }}
        user={deleteUser}
      />

      {isTaskModalOpen && (
        <CreateTaskModal
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          entityType={TaskEntityType.USER}
          entityId={userRecord.id}
        />
      )}

      {editTask && (
        <EditTaskModal
          isOpen={!!editTask}
          onClose={() => setEditTask(null)}
          task={editTask}
        />
      )}
    </DetailPageLayout>
  );
}
