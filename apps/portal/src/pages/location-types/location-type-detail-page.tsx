// Golden-path detailpagina locatie-type: DetailPageLayout + AuditHistory + tabs.
// Overzicht is inline bewerkbaar (canon: asset-type-detail-page).

import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  ErrorBox,
  InfoField,
  Input,
  Spinner,
  Tabs,
  useConfirm,
  useToast,
  type TabDef,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { getErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Role } from '@/types';
import {
  useLocationType,
  useUpdateLocationType,
  useDeleteLocationType,
  useDuplicateLocationType,
  useLocationTypeFields,
} from './hooks/use-location-types';
import { LocationTypeFieldsTab } from './components/location-type-fields-tab';
import { LocationTypeConstraintsTab } from './components/location-type-constraints-tab';

type Tab = 'overzicht' | 'velden' | 'constraints' | 'instellingen';

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  shortCode: z.string().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  color: z.string().optional(),
  normTypes: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

/** normTypes is getypt als unknown[]; veilig naar string[] voor weergave/bewerking. */
function normTypesToStrings(value: unknown[]): string[] {
  return value.filter((v): v is string => typeof v === 'string');
}

export default function LocationTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: locationType, isLoading, error } = useLocationType(id!);
  const { data: fields } = useLocationTypeFields(id!);
  const updateMutation = useUpdateLocationType();
  const deleteMutation = useDeleteLocationType();
  const duplicateMutation = useDuplicateLocationType();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (locationType) {
      resetForm({
        name: locationType.name || '',
        shortCode: locationType.shortCode || '',
        description: locationType.description || '',
        icon: locationType.icon || '',
        color: locationType.color || '',
        normTypes: normTypesToStrings(locationType.normTypes).join(', '),
        sortOrder: locationType.sortOrder ?? 0,
        isActive: locationType.isActive,
      });
    }
  }, [locationType, resetForm]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !locationType) {
    return <ErrorBox>Locatie-type niet gevonden</ErrorBox>;
  }

  const isManager = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));
  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  // Org-admins kunnen systeem-types niet bewerken, maar wel dupliceren (org-kopie).
  const systemOk = locationType.isSystem ? isSuperuser : true;
  const canManage = isManager && systemOk;

  const normTypeLabels = normTypesToStrings(locationType.normTypes);

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'velden', label: 'Velden', count: fields?.length ?? 0 },
    { key: 'constraints', label: 'Constraints' },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const onSubmit = async (data: FormData) => {
    const normTypes = (data.normTypes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          name: data.name,
          shortCode: data.shortCode || null,
          description: data.description || null,
          icon: data.icon || null,
          color: data.color || null,
          normTypes,
          sortOrder: data.sortOrder,
          isActive: data.isActive ?? true,
        },
      });
      showToast('Locatie-type bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleDuplicate = async () => {
    try {
      const created = await duplicateMutation.mutateAsync(id!);
      showToast('Locatie-type gedupliceerd', 'success');
      navigate(`/location-types/${created.id}`);
    } catch (err) {
      showToast(getErrorMessage(err, 'Dupliceren mislukt'), 'error');
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Locatie-type verwijderen',
      message: `Weet je zeker dat je "${locationType.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Locatie-type verwijderd', 'success');
      navigate('/location-types');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="LocationTypeDefinition" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/location-types')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{locationType.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {locationType.code}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {locationType.isSystem ? 'Systeem' : 'Eigen'}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  locationType.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {locationType.isActive ? 'Actief' : 'Inactief'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Overzicht — inline bewerkbaar */}
        {activeTab === 'overzicht' && (
          <Card
            title="Locatie-type gegevens"
            actions={
              canManage && !isEditing ? (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  Bewerken
                </Button>
              ) : undefined
            }
          >
            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label="Naam" {...register('name')} error={errors.name?.message} />
                <Input
                  label="Shortcode"
                  placeholder="bijv. GEB"
                  helperText="Gebruikt voor de [typecode]-placeholder in de locatie-nummering."
                  {...register('shortCode')}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Icoon" {...register('icon')} />
                  <Input label="Kleur" type="color" {...register('color')} />
                </div>
                <Input
                  label="Normtypes"
                  placeholder="komma-gescheiden, bijv. NEN3140, SCIOS"
                  helperText="Scheid meerdere normtypes met een komma."
                  {...register('normTypes')}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Volgorde" type="number" min={0} {...register('sortOrder')} />
                  <div className="flex items-end">
                    <label className="inline-flex items-center gap-2 pb-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        {...register('isActive')}
                      />
                      Actief
                    </label>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>
                    Opslaan
                  </Button>
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
                </div>
              </form>
            ) : (
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoField label="Naam" value={locationType.name} />
                <InfoField label="Code" value={locationType.code} />
                <InfoField label="Shortcode" value={locationType.shortCode} />
                <InfoField
                  label="Kleur"
                  value={
                    locationType.color ? (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="inline-block h-4 w-4 rounded border border-gray-200"
                          style={{ backgroundColor: locationType.color }}
                        />
                        {locationType.color}
                      </span>
                    ) : null
                  }
                />
                <InfoField label="Icoon" value={locationType.icon} />
                <InfoField label="Normtypes" value={normTypeLabels.length ? normTypeLabels.join(', ') : null} />
                <InfoField label="Volgorde" value={locationType.sortOrder} />
                <InfoField label="Actief" value={locationType.isActive ? 'Ja' : 'Nee'} />
                <InfoField label="Herkomst" value={locationType.isSystem ? 'Systeem' : 'Eigen'} />
                <InfoField label="Aangemaakt" value={formatDate(locationType.createdAt)} />
                <div className="sm:col-span-2">
                  <InfoField label="Beschrijving" value={locationType.description} />
                </div>
              </dl>
            )}
          </Card>
        )}

        {/* Velden */}
        {activeTab === 'velden' && <LocationTypeFieldsTab locationTypeId={id!} canManage={canManage} />}

        {/* Constraints */}
        {activeTab === 'constraints' && <LocationTypeConstraintsTab locationTypeId={id!} canManage={canManage} />}

        {/* Instellingen — gevarenzone */}
        {activeTab === 'instellingen' && (
          <div className="space-y-6">
            <Card title="Dupliceren">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Locatie-type dupliceren</p>
                  <p className="text-sm text-gray-500">
                    Maakt een eigen kopie van dit locatie-type (inclusief velden) binnen jouw organisatie.
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={handleDuplicate}
                  isLoading={duplicateMutation.isPending}
                  disabled={!isManager}
                >
                  Dupliceren
                </Button>
              </div>
            </Card>

            <Card title="Gevarenzone" className="border-danger-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Locatie-type verwijderen</p>
                  <p className="text-sm text-gray-500">Dit verwijdert het locatie-type (soft-delete).</p>
                </div>
                <Button
                  variant="danger"
                  onClick={handleDelete}
                  isLoading={deleteMutation.isPending}
                  disabled={!canManage}
                >
                  Verwijderen
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </DetailPageLayout>
  );
}
