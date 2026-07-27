import { useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { Card, ErrorBox, Input, Button, Select, Spinner, Tabs, Checkbox, useToast } from '@/components/ui';
import {
  useOrganization,
  useUpdateOrganization,
  useUploadLogo,
  useDeleteLogo,
  getLogoUrl,
} from './hooks/use-organization';
import { CustomFieldsManagement } from './components/custom-fields-management';
import { DocumentTagsManagement } from './components/document-tags-management';
import { NumberingSchemesManagement } from './components/numbering-schemes-management';
import QuotaTab from './components/quota-tab';
import { SupportAccessSection } from './components/support-access-section';
import {
  useGroupNotificationPrefs,
  useSaveGroupNotificationPrefs,
} from '@/pages/notifications/hooks/use-notifications';
import { ContactDisplayMode, NotificationType, Role } from '@/types';
import { getTypeLabel } from '@/lib/notifications';
import { getErrorMessage } from '@/lib/api-client';
import { useFeatures } from '@/providers/feature-provider';
import { useAiReviewStatus } from '@/pages/inspections/hooks/use-ai-review';

const CONTACT_DISPLAY_OPTIONS = [
  { value: ContactDisplayMode.NONE, label: 'Geen' },
  { value: ContactDisplayMode.STATIC, label: 'Statisch' },
  { value: ContactDisplayMode.INSPECTOR, label: 'Inspecteur (met statische terugval)' },
];

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
  inspectorPhoneDisplay: z.nativeEnum(ContactDisplayMode),
  inspectorEmailDisplay: z.nativeEnum(ContactDisplayMode),
  inspectorStaticPhone: z.string().optional(),
  inspectorStaticEmail: z
    .union([z.string().email('Voer een geldig e-mailadres in'), z.literal('')])
    .optional(),
  quoteApprovalThreshold: z
    .union([z.coerce.number().min(0, 'Bedrag moet minimaal 0 zijn'), z.literal('')])
    .optional(),
  quoteApprovalRequiredRole: z.union([z.nativeEnum(Role), z.literal('')]).optional(),
  quoteApprovalSelfApprovalAllowed: z.boolean(),
  chatEnabled: z.boolean(),
  inspectionReviewEnabled: z.boolean(),
  aiReviewEnabled: z.boolean(),
  aiReviewInstructions: z.string().max(2000, 'Maximaal 2000 tekens').optional(),
  onlineRepairDefault: z.boolean(),
}).refine((d) => d.workdayEnd > d.workdayStart, {
  message: 'Eindtijd moet na begintijd liggen',
  path: ['workdayEnd'],
}).refine(
  (d) => d.quoteApprovalThreshold === '' || d.quoteApprovalThreshold === undefined || !!d.quoteApprovalRequiredRole,
  { message: 'Kies een vereiste rol wanneer u een goedkeuringsgrens instelt', path: ['quoteApprovalRequiredRole'] },
);

type OrgFormData = z.infer<typeof orgSchema>;


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
      /* foutmelding wordt centraal getoond via useApiMutation */
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
                  {getTypeLabel(row.type)}
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
  const { data: organization, isLoading, error: loadError } = useOrganization(user?.orgId);
  const updateMutation = useUpdateOrganization(user?.orgId);
  const uploadLogoMutation = useUploadLogo(user?.orgId);
  const deleteLogoMutation = useDeleteLogo(user?.orgId);

  // Tab state
  const [activeTab, setActiveTab] = useState<'huisstijl' | 'financieel' | 'communicatie' | 'inspecties' | 'inspecteur-portal' | 'notificaties' | 'eigen-velden' | 'document-tags' | 'nummering' | 'quota' | 'support'>('huisstijl');

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
    watch,
    formState: { errors, isDirty },
  } = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
  });

  const phoneDisplayMode = watch('inspectorPhoneDisplay');
  const emailDisplayMode = watch('inspectorEmailDisplay');

  // PRD-13 §13.9.2: AI-toggle alleen actief met het AI_REVIEW-entitlement én een
  // geconfigureerde AI-dienst; de instructies-textarea alleen als de toggle aan staat.
  const { hasFeature } = useFeatures();
  const { data: aiStatus } = useAiReviewStatus();
  const hasAiEntitlement = hasFeature('AI_REVIEW');
  const aiServiceUnavailable = aiStatus?.available === false;
  const aiToggleDisabled = !hasAiEntitlement || aiServiceUnavailable;
  const aiReviewOn = watch('aiReviewEnabled');
  // PRD-14 §14.4: online-herstel-default alleen instelbaar met het ONLINE_HERSTEL-entitlement.
  const hasOnlineRepairEntitlement = hasFeature('ONLINE_HERSTEL');

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
        inspectorPhoneDisplay: organization.inspectorPhoneDisplay ?? ContactDisplayMode.NONE,
        inspectorEmailDisplay: organization.inspectorEmailDisplay ?? ContactDisplayMode.NONE,
        inspectorStaticPhone: organization.inspectorStaticPhone ?? '',
        inspectorStaticEmail: organization.inspectorStaticEmail ?? '',
        quoteApprovalThreshold: organization.quoteApprovalThreshold ?? '',
        quoteApprovalRequiredRole: organization.quoteApprovalRequiredRole ?? '',
        quoteApprovalSelfApprovalAllowed: organization.quoteApprovalSelfApprovalAllowed ?? false,
        chatEnabled: organization.chatEnabled ?? true,
        inspectionReviewEnabled: organization.inspectionReviewEnabled ?? true,
        aiReviewEnabled: organization.aiReviewEnabled ?? false,
        aiReviewInstructions: organization.aiReviewInstructions ?? '',
        onlineRepairDefault: organization.onlineRepairDefault ?? false,
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
        inspectorPhoneDisplay: data.inspectorPhoneDisplay,
        inspectorEmailDisplay: data.inspectorEmailDisplay,
        inspectorStaticPhone: data.inspectorStaticPhone?.trim() || null,
        inspectorStaticEmail: data.inspectorStaticEmail?.trim() || null,
        quoteApprovalThreshold:
          data.quoteApprovalThreshold === '' || data.quoteApprovalThreshold === undefined
            ? null
            : Number(data.quoteApprovalThreshold),
        quoteApprovalRequiredRole: data.quoteApprovalRequiredRole || null,
        quoteApprovalSelfApprovalAllowed: data.quoteApprovalSelfApprovalAllowed,
        chatEnabled: data.chatEnabled,
        inspectionReviewEnabled: data.inspectionReviewEnabled,
        aiReviewEnabled: data.aiReviewEnabled,
        aiReviewInstructions: data.aiReviewInstructions?.trim() || null,
        onlineRepairDefault: data.onlineRepairDefault,
      });
      showToast('Organisatie-instellingen opgeslagen', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleFileSelected = async (file: File) => {
    // SVG is bewust geschrapt (WP-B4/B-507): een SVG kan scripts bevatten en werd
    // vanaf het app-origin teruggeserveerd. De API weigert het type ook.
    const allowed = ['image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      showToast('Alleen PNG, JPEG en WebP zijn toegestaan', 'error');
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
    } catch {
      setLogoPreview(null);
      /* foutmelding wordt centraal getoond via useApiMutation */
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
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
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

  // WP-C1 (B-509): bij een mislukte load (bv. 403 voor een rol zonder toegang)
  // GEEN leeg-maar-bewerkbaar formulier renderen, maar een nette errorstate.
  if (loadError || !organization) {
    return (
      <div>
        <h1 className="mb-6 text-2xl font-bold text-gray-900">
          Organisatie-instellingen
        </h1>
        <ErrorBox>
          De organisatiegegevens konden niet geladen worden. Controleer of u de juiste
          rechten heeft of probeer het later opnieuw.
        </ErrorBox>
      </div>
    );
  }

  const tabs: { key: typeof activeTab; label: string }[] = [
    { key: 'huisstijl', label: 'Huisstijl' },
    { key: 'financieel', label: 'Financieel' },
    { key: 'communicatie', label: 'Communicatie' },
    { key: 'inspecties', label: 'Inspecties' },
    { key: 'inspecteur-portal', label: 'Inspecteur klantportaal' },
    { key: 'notificaties', label: 'Notificaties' },
    { key: 'eigen-velden', label: 'Eigen velden' },
    { key: 'document-tags', label: 'Document-tags' },
    { key: 'nummering', label: 'Nummering' },
    { key: 'quota', label: 'Quota' },
    { key: 'support', label: 'Support-toegang' },
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
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'eigen-velden' && <CustomFieldsManagement />}

      {activeTab === 'document-tags' && <DocumentTagsManagement />}

      {activeTab === 'nummering' && <NumberingSchemesManagement />}

      {activeTab === 'notificaties' && <GroupNotificationPrefsCard />}

      {activeTab === 'quota' && <QuotaTab />}

      {activeTab === 'support' && user?.orgId && (
        <SupportAccessSection orgId={user.orgId} />
      )}

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
              Upload een logo in PNG, JPEG of WebP formaat (max 5 MB).
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
                  PNG, JPEG, WebP — max 5 MB
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
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

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm font-semibold text-gray-900">Offerte-goedkeuring</h3>
            <p className="mt-1 text-sm text-gray-500">
              Offertes met een totaal <strong>boven</strong> deze grens kunnen pas verstuurd worden
              nadat iemand met de vereiste rol ze heeft goedgekeurd. Laat de grens leeg om geen
              verplichte goedkeuring af te dwingen.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Input
                label="Goedkeuringsgrens (€)"
                type="number"
                step="0.01"
                min="0"
                placeholder="Geen grens"
                error={errors.quoteApprovalThreshold?.message}
                {...register('quoteApprovalThreshold')}
              />
              <Select
                label="Vereiste goedkeur-rol"
                error={errors.quoteApprovalRequiredRole?.message}
                options={[
                  { value: '', label: 'Geen' },
                  ...assignableRoles.map((role) => ({ value: role, label: roleLabels[role] })),
                ]}
                {...register('quoteApprovalRequiredRole')}
              />
            </div>
            <div className="mt-4">
              <Checkbox
                label="Aanvrager mag eigen goedkeuringsverzoek afhandelen (self-approval)"
                {...register('quoteApprovalSelfApprovalAllowed')}
              />
              <p className="mt-1 text-xs text-gray-500">
                Standaard uit (vier-ogen-principe). Alleen aanzetten als uw organisatie maar
                één persoon met de vereiste goedkeur-rol heeft.
              </p>
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

          <div>
            <h3 className="text-base font-semibold text-gray-900">Interne chat</h3>
            <p className="mt-1 text-sm text-gray-500">
              De interne chat tussen medewerkers (en richting de inspecteur-app) voor deze organisatie. Uitschakelen verbergt de chat overal; bestaande gesprekken blijven bewaard en komen terug bij heractiveren.
            </p>
            <div className="mt-3">
              <Checkbox label="Interne chat inschakelen" {...register('chatEnabled')} />
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

      {activeTab === 'inspecties' && (
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div>
            <h3 className="text-base font-semibold text-gray-900">Vier-ogen-controle</h3>
            <p className="mt-1 text-sm text-gray-500">
              Met deze controle aan moet een inspectieplan eerst ingediend en door een tweede
              persoon beoordeeld worden voordat het afgerond kan worden. Uitschakelen laat
              inspecties direct afronden zonder beoordelingsstap.
            </p>
            <div className="mt-3">
              <Checkbox label="Vier-ogen-controle verplicht" {...register('inspectionReviewEnabled')} />
            </div>
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-900">AI-voorcontrole</h3>
            <p className="mt-1 text-sm text-gray-500">
              Laat een AI-model ingediende inspectierapporten voorcontroleren op volledigheid,
              consistentie en normering. De aandachtspunten zijn adviserend: alleen de menselijke
              beoordelaar bepaalt of een rapport wordt goedgekeurd. Bij de analyse wordt uitsluitend
              de inspectie-inhoud (assets, constateringen, metingen) naar de AI-dienst (Anthropic)
              gestuurd — geen klantcontactgegevens of foto&apos;s.
            </p>
            <div className="mt-3">
              <Checkbox
                label="AI-voorcontrole inschakelen"
                disabled={aiToggleDisabled}
                {...register('aiReviewEnabled')}
              />
            </div>
            {!hasAiEntitlement && (
              <p className="mt-2 text-xs text-gray-500">Niet beschikbaar in uw abonnement.</p>
            )}
            {hasAiEntitlement && aiServiceUnavailable && (
              <p className="mt-2 text-xs text-gray-500">AI-dienst niet geconfigureerd.</p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Extra AI-instructies
            </label>
            <textarea
              {...register('aiReviewInstructions')}
              rows={4}
              maxLength={2000}
              disabled={aiToggleDisabled || !aiReviewOn}
              placeholder="Bijv. Let extra op NEN 3140-terminologie."
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
            />
            <p className="mt-1 text-xs text-gray-500">
              Optionele organisatie-specifieke aanwijzingen voor de AI-voorcontrole (max 2000 tekens).
            </p>
            {errors.aiReviewInstructions && (
              <p className="mt-1 text-xs text-red-600">{errors.aiReviewInstructions.message}</p>
            )}
          </div>

          <div>
            <h3 className="text-base font-semibold text-gray-900">Online herstel</h3>
            <p className="mt-1 text-sm text-gray-500">
              Met online herstel kunnen externen en klanten hersteld werk aan constateringen
              online melden en afronden met een ondertekende herstelverklaring. Deze instelling
              bepaalt de standaardwaarde voor <strong>nieuwe</strong> inspecties; per inspectie
              blijft de toggle aanpasbaar. Het e-mailadres van de invuller wordt uitsluitend
              gebruikt voor de bevestiging en eventuele conflictafhandeling (AVG).
            </p>
            <div className="mt-3">
              <Checkbox
                label="Online herstel standaard aan voor nieuwe inspecties"
                disabled={!hasOnlineRepairEntitlement}
                {...register('onlineRepairDefault')}
              />
            </div>
            {!hasOnlineRepairEntitlement && (
              <p className="mt-2 text-xs text-gray-500">Niet beschikbaar in uw abonnement.</p>
            )}
          </div>

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button type="submit" isLoading={updateMutation.isPending} disabled={!isDirty}>
              Opslaan
            </Button>
          </div>
        </form>
      </Card>
      )}

      {activeTab === 'inspecteur-portal' && (
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">
          <div>
            <h3 className="text-base font-semibold text-gray-900">
              Contactgegevens inspecteur in klantportaal
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Bepaal per kanaal of en hoe de contactgegevens van de inspecteur aan klanten worden getoond in het klantportaal.
            </p>
          </div>

          {/* Telefoon */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Select
                label="Telefoon weergave"
                options={CONTACT_DISPLAY_OPTIONS}
                error={errors.inspectorPhoneDisplay?.message}
                {...register('inspectorPhoneDisplay')}
              />
              {(phoneDisplayMode === ContactDisplayMode.STATIC ||
                phoneDisplayMode === ContactDisplayMode.INSPECTOR) && (
                <Input
                  label="Statisch telefoonnummer"
                  placeholder="Bijv. 088 123 4567"
                  error={errors.inspectorStaticPhone?.message}
                  {...register('inspectorStaticPhone')}
                />
              )}
            </div>
            <p className="text-xs text-gray-500">
              <strong>Geen</strong>: telefoonnummer niet tonen.{' '}
              <strong>Statisch</strong>: toon altijd het ingevoerde vaste nummer.{' '}
              <strong>Inspecteur</strong>: toon het nummer van de inspecteur zelf, met terugval op het statische nummer als de inspecteur niets heeft ingevuld of geen toestemming geeft.
            </p>
          </div>

          {/* E-mail */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <Select
                label="E-mail weergave"
                options={CONTACT_DISPLAY_OPTIONS}
                error={errors.inspectorEmailDisplay?.message}
                {...register('inspectorEmailDisplay')}
              />
              {(emailDisplayMode === ContactDisplayMode.STATIC ||
                emailDisplayMode === ContactDisplayMode.INSPECTOR) && (
                <Input
                  label="Statisch e-mailadres"
                  type="email"
                  placeholder="Bijv. inspecteur@mijnbedrijf.nl"
                  error={errors.inspectorStaticEmail?.message}
                  {...register('inspectorStaticEmail')}
                />
              )}
            </div>
            <p className="text-xs text-gray-500">
              <strong>Geen</strong>: e-mailadres niet tonen.{' '}
              <strong>Statisch</strong>: toon altijd het ingevoerde vaste e-mailadres.{' '}
              <strong>Inspecteur</strong>: toon het e-mailadres van de inspecteur zelf, met terugval op het statische e-mailadres als de inspecteur niets heeft ingevuld of geen toestemming geeft.
            </p>
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
