import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { Card, Input, Button, Spinner, useToast } from '@/components/ui';
import {
  useOrganization,
  useUpdateOrganization,
  useUploadLogo,
  useDeleteLogo,
  getLogoUrl,
} from './hooks/use-organization';
import { CustomFieldsManagement } from './components/custom-fields-management';
import QuotaTab from './components/quota-tab';
import {
  useGroupNotificationPrefs,
  useSaveGroupNotificationPrefs,
} from '@/pages/notifications/hooks/use-notifications';
import { NotificationType, Role } from '@/types';

const orgSchema = z.object({
  name: z.string().min(1, 'Organisatienaam is verplicht'),
  slug: z.string(),
  primaryColor: z.string().nullable().optional(),
  defaultVat: z.coerce
    .number()
    .min(0, 'BTW moet minimaal 0 zijn')
    .max(100, 'BTW mag maximaal 100 zijn'),
  defaultValidityDays: z.coerce
    .number()
    .int('Moet een geheel getal zijn')
    .min(1, 'Minimaal 1 dag'),
  senderName: z.string().optional(),
  senderEmail: z
    .union([z.string().email('Voer een geldig e-mailadres in'), z.literal('')])
    .optional(),
  workdayStart: z.coerce.number().int().min(0).max(23),
  workdayEnd: z.coerce.number().int().min(1).max(24),
}).refine((d) => d.workdayEnd > d.workdayStart, {
  message: 'Eindtijd moet na begintijd liggen',
  path: ['workdayEnd'],
});

type OrgFormData = z.infer<typeof orgSchema>;

// ─── Notification Type Labels ────────────────────────────

const notifTypeLabels: Record<string, string> = {
  [NotificationType.OFFERTE_TER_GOEDKEURING]: 'Offerte ter goedkeuring',
  [NotificationType.OFFERTE_GOEDGEKEURD]: 'Offerte goedgekeurd',
  [NotificationType.OFFERTE_AFGEWEZEN]: 'Offerte afgewezen',
  [NotificationType.OFFERTE_VERSTUURD]: 'Offerte verstuurd',
  [NotificationType.OFFERTE_BEKEKEN]: 'Offerte bekeken',
  [NotificationType.OFFERTE_ONDERTEKEND]: 'Offerte ondertekend',
  [NotificationType.OFFERTE_VERLOPEN]: 'Offerte verlopen',
  [NotificationType.NIEUWE_VRAAG_KLANT]: 'Nieuwe vraag klant',
  [NotificationType.ANTWOORD_OP_VRAAG]: 'Antwoord op vraag',
  [NotificationType.AANVRAAG_TOEGEWEZEN]: 'Aanvraag toegewezen',
  [NotificationType.AANVRAAG_STATUS_GEWIJZIGD]: 'Aanvraag status gewijzigd',
  [NotificationType.TAAK_TOEGEWEZEN]: 'Taak toegewezen',
  [NotificationType.TAAK_STATUS_GEWIJZIGD]: 'Taak status gewijzigd',
  [NotificationType.DOCUMENT_GEUPLOAD]: 'Document geüpload',
  [NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK]: 'Afspraak acceptatieverzoek',
  [NotificationType.AFSPRAAK_GEACCEPTEERD]: 'Afspraak geaccepteerd',
  [NotificationType.AFSPRAAK_GEWEIGERD]: 'Afspraak geweigerd',
  [NotificationType.AFSPRAAK_VERPLAATST]: 'Afspraak verplaatst',
  [NotificationType.AFSPRAAK_VERZETTEN_VERZOEK]: 'Afspraak verzetverzoek',
  [NotificationType.AFSPRAAK_BEVESTIGING_VERSTUURD]: 'Afspraak bevestiging verstuurd',
  [NotificationType.PROJECT_AANGEMAAKT]: 'Project aangemaakt',
  [NotificationType.PROJECT_STATUS_GEWIJZIGD]: 'Project status gewijzigd',
};

const roleLabels: Record<string, string> = {
  [Role.ORG_ADMIN]: 'Org Admin',
  [Role.MANAGER]: 'Manager',
  [Role.BACKOFFICE]: 'Backoffice',
  [Role.WERKVOORBEREIDER]: 'Werkvoorbereider',
  [Role.INSPECTEUR]: 'Inspecteur',
};

const assignableRoles = [
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
];

// ─── Group Notification Preferences Component ─────────────

interface GroupPrefRow {
  role: Role;
  type: NotificationType;
  channelInApp: boolean;
  channelEmail: boolean;
}

function GroupNotificationPrefsCard() {
  const { showToast } = useToast();
  const { data: groupPrefs, isLoading } = useGroupNotificationPrefs();
  const saveGroupPrefs = useSaveGroupNotificationPrefs();
  const [rows, setRows] = useState<GroupPrefRow[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>(Role.MANAGER);

  useEffect(() => {
    if (groupPrefs && !initialized) {
      const prefMap = new Map(
        groupPrefs.map((p) => [`${p.role}_${p.notificationType}`, p]),
      );
      const allRows: GroupPrefRow[] = [];
      for (const role of assignableRoles) {
        for (const type of Object.values(NotificationType)) {
          const key = `${role}_${type}`;
          const existing = prefMap.get(key);
          allRows.push({
            role,
            type,
            channelInApp: existing?.channelInApp ?? true,
            channelEmail: existing?.channelEmail ?? true,
          });
        }
      }
      setRows(allRows);
      setInitialized(true);
    }
  }, [groupPrefs, initialized]);

  const toggleGroupPref = useCallback(
    (
      role: Role,
      type: NotificationType,
      channel: 'channelInApp' | 'channelEmail',
    ) => {
      setRows((prev) =>
        prev.map((r) =>
          r.role === role && r.type === type
            ? { ...r, [channel]: !r[channel] }
            : r,
        ),
      );
    },
    [],
  );

  const handleSave = async () => {
    try {
      await saveGroupPrefs.mutateAsync(
        rows.map((r) => ({
          role: r.role,
          type: r.type,
          channelInApp: r.channelInApp,
          channelEmail: r.channelEmail,
        })),
      );
      showToast('Standaard notificatie-instellingen opgeslagen', 'success');
    } catch {
      showToast('Opslaan mislukt', 'error');
    }
  };

  const filteredRows = rows.filter((r) => r.role === selectedRole);

  if (isLoading) {
    return (
      <Card title="Standaard notificatie-instellingen per rol">
        <div className="flex h-32 items-center justify-center text-sm text-gray-400">
          Laden...
        </div>
      </Card>
    );
  }

  return (
    <Card title="Standaard notificatie-instellingen per rol">
      <p className="mb-4 text-sm text-gray-500">
        Deze instellingen gelden als standaard voor nieuwe gebruikers per rol.
        Gebruikers kunnen hun eigen voorkeuren aanpassen.
      </p>

      {/* Role tabs */}
      <div className="mb-4 flex flex-wrap gap-2">
        {assignableRoles.map((role) => (
          <button
            key={role}
            onClick={() => setSelectedRole(role)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              selectedRole === role
                ? 'bg-primary-100 text-primary-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {roleLabels[role] || role}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="py-2 pr-4 text-left font-medium text-gray-700">
                Type
              </th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">
                In-app
              </th>
              <th className="px-4 py-2 text-center font-medium text-gray-700">
                E-mail
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr
                key={`${row.role}_${row.type}`}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="py-2.5 pr-4 text-gray-700">
                  {notifTypeLabels[row.type] || row.type}
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.channelInApp}
                    onChange={() =>
                      toggleGroupPref(row.role, row.type, 'channelInApp')
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
                <td className="px-4 py-2.5 text-center">
                  <input
                    type="checkbox"
                    checked={row.channelEmail}
                    onChange={() =>
                      toggleGroupPref(row.role, row.type, 'channelEmail')
                    }
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
        <Button
          onClick={handleSave}
          isLoading={saveGroupPrefs.isPending}
        >
          Opslaan
        </Button>
      </div>
    </Card>
  );
}

export default function OrganizationSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: organization, isLoading } = useOrganization(user?.orgId);
  const updateMutation = useUpdateOrganization(user?.orgId);
  const uploadLogoMutation = useUploadLogo(user?.orgId);
  const deleteLogoMutation = useDeleteLogo(user?.orgId);

  // Tab state
  const [activeTab, setActiveTab] = useState<'huisstijl' | 'financieel' | 'communicatie' | 'notificaties' | 'eigen-velden' | 'quota'>('huisstijl');

  // Logo preview state
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // Tijdstempel voor cache-busting van de logo URL
  const [logoCacheBust, setLogoCacheBust] = useState(() => Date.now());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
  });

  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        slug: organization.slug,
        primaryColor: organization.primaryColor ?? '#1E40AF',
        defaultVat: organization.defaultVat,
        defaultValidityDays: organization.defaultValidityDays,
        senderName: organization.senderName ?? '',
        senderEmail: organization.senderEmail ?? '',
        workdayStart: organization.workdayStart ?? 8,
        workdayEnd: organization.workdayEnd ?? 17,
      });
    }
  }, [organization, reset]);

  const onSubmit = async (data: OrgFormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        primaryColor: data.primaryColor,
        defaultVat: data.defaultVat,
        defaultValidityDays: data.defaultValidityDays,
        senderName: data.senderName || null,
        senderEmail: data.senderEmail || null,
        workdayStart: data.workdayStart,
        workdayEnd: data.workdayEnd,
      });
      showToast('Organisatie-instellingen opgeslagen', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Opslaan mislukt',
        'error',
      );
    }
  };

  const handleFileSelected = async (file: File) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Alleen PNG, JPEG, SVG en WebP zijn toegestaan', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Bestand mag maximaal 5 MB zijn', 'error');
      return;
    }

    // Toon direct een preview
    const reader = new FileReader();
    reader.onload = (e) => setLogoPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    try {
      await uploadLogoMutation.mutateAsync(file);
      setLogoCacheBust(Date.now());
      setLogoPreview(null);
      showToast('Logo geüpload', 'success');
    } catch (err) {
      setLogoPreview(null);
      showToast(
        err instanceof Error ? err.message : 'Upload mislukt',
        'error',
      );
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    // Reset zodat dezelfde file opnieuw geselecteerd kan worden
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelected(file);
  };

  const handleDeleteLogo = async () => {
    try {
      await deleteLogoMutation.mutateAsync();
      setLogoCacheBust(Date.now());
      showToast('Logo verwijderd', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Verwijderen mislukt',
        'error',
      );
    }
  };

  const logoUrl = getLogoUrl(user?.orgId);
  const hasLogo = Boolean(organization?.logoUrl);
  const isUploading = uploadLogoMutation.isPending;
  const isDeleting = deleteLogoMutation.isPending;

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'huisstijl', label: 'Huisstijl' },
    { key: 'financieel', label: 'Financieel' },
    { key: 'communicatie', label: 'Communicatie' },
    { key: 'notificaties', label: 'Notificaties' },
    { key: 'eigen-velden', label: 'Eigen velden' },
    { key: 'quota', label: 'Quota' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Organisatie-instellingen
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Beheer de instellingen van uw organisatie
        </p>
      </div>

      {/* Tab navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex items-center whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'eigen-velden' && <CustomFieldsManagement />}

      {activeTab === 'notificaties' && <GroupNotificationPrefsCard />}

      {activeTab === 'quota' && <QuotaTab />}

      {activeTab === 'huisstijl' && (
      <>
      {/* Logo sectie */}
      <Card>
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Organisatielogo
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Upload een logo in PNG, JPEG, SVG of WebP formaat (max 5 MB).
              Het logo wordt getoond op de loginpagina en in offertes.
            </p>
          </div>

          <div className="flex items-start gap-6">
            {/* Huidige logo / preview */}
            <div className="flex-shrink-0">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-lg border-2 border-gray-200 bg-gray-50">
                {isUploading ? (
                  <Spinner size="md" />
                ) : logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="h-full w-full object-contain"
                  />
                ) : hasLogo && logoUrl ? (
                  <img
                    src={`${logoUrl}?v=${logoCacheBust}`}
                    alt="Organisatielogo"
                    className="h-full w-full object-contain"
                    onError={() => {
                      /* verberg bij laad-fout */
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center text-gray-400">
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M13.5 12a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z"
                      />
                    </svg>
                    <span className="mt-1 text-xs">Geen logo</span>
                  </div>
                )}
              </div>
            </div>

            {/* Upload zone en knoppen */}
            <div className="flex-1 space-y-3">
              {/* Drag & drop zone */}
              <div
                className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-6 transition-colors ${
                  isDraggingOver
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
                }`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingOver(true);
                }}
                onDragLeave={() => setIsDraggingOver(false)}
                onDrop={handleDrop}
              >
                <svg
                  className="mb-2 h-6 w-6 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                <p className="text-sm text-gray-600">
                  <span className="font-medium text-blue-600">
                    Klik om te uploaden
                  </span>{' '}
                  of sleep een bestand hierheen
                </p>
                <p className="mt-1 text-xs text-gray-400">
                  PNG, JPEG, SVG, WebP — max 5 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={handleInputChange}
                />
              </div>

              {/* Verwijder knop */}
              {hasLogo && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    isLoading={isDeleting}
                    onClick={handleDeleteLogo}
                    className="text-red-600 hover:bg-red-50 hover:text-red-700"
                  >
                    Logo verwijderen
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      {/* Organisatie-identiteit */}
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              label="Organisatienaam"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Slug"
              disabled
              helperText="De slug kan niet worden gewijzigd"
              {...register('slug')}
            />

            <Input
              label="Primaire kleur"
              type="color"
              helperText="Kies een huiskleur voor uw organisatie"
              error={errors.primaryColor?.message}
              {...register('primaryColor')}
            />
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
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
      </>
      )}

      {activeTab === 'financieel' && (
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              label="Standaard BTW (%)"
              type="number"
              step="0.01"
              error={errors.defaultVat?.message}
              {...register('defaultVat')}
            />

            <Input
              label="Standaard geldigheid (dagen)"
              type="number"
              error={errors.defaultValidityDays?.message}
              {...register('defaultValidityDays')}
            />
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
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
      )}

      {activeTab === 'communicatie' && (
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              E-mail afzender
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Optioneel: gebruik een organisatie-specifiek afzendernaam en e-mailadres voor uitgaande e-mails (notificaties, offertes). Laat leeg om de standaard InspeXi-afzender te gebruiken.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              label="Afzendernaam"
              placeholder="Bijv. InspeXi Demo"
              helperText="Naam die ontvangers zien als afzender"
              error={errors.senderName?.message}
              {...register('senderName')}
            />

            <Input
              label="Afzender e-mailadres"
              type="email"
              placeholder="Bijv. offerte@mijnbedrijf.nl"
              helperText="Moet geverifieerd zijn in Resend"
              error={errors.senderEmail?.message}
              {...register('senderEmail')}
            />
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Standaard werktijden
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              De agenda in de planningsmodule toont standaard dit tijdsvenster. Inspecteurs kunnen hier buiten plannen als dat nodig is.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Begintijd
              </label>
              <select
                {...register('workdayStart', { valueAsNumber: true })}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i} value={i}>
                    {String(i).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              {errors.workdayStart && (
                <p className="text-xs text-red-600">{errors.workdayStart.message}</p>
              )}
            </div>

            <div className="space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                Eindtijd
              </label>
              <select
                {...register('workdayEnd', { valueAsNumber: true })}
                className="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    {String(i + 1).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
              {errors.workdayEnd && (
                <p className="text-xs text-red-600">{errors.workdayEnd.message}</p>
              )}
            </div>
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
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
      )}
    </div>
  );
}
