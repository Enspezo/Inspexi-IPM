// Detailpagina normtype: DetailPageLayout + AuditHistory + tabs.
// Overzicht is inline bewerkbaar (canon: asset-type-detail-page). Schrijfacties = SUPERUSER.
// NB: dit model gebruikt 'label' i.p.v. 'name' en heeft soft-delete via 'deletedAt'.

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
  Select,
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
import { useClassificationModels } from '@/pages/classification-models/hooks/use-classification-models';
import {
  useNormType,
  useUpdateNormType,
  useDeleteNormType,
  useRestoreNormType,
} from './hooks/use-norm-types';

type Tab = 'overzicht' | 'instellingen';

const schema = z.object({
  label: z.string().min(2, 'Minimaal 2 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().optional(),
  assetTypes: z.string().optional(),
  classificationModelId: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function NormTypeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: normType, isLoading, error } = useNormType(id!);
  const { data: models } = useClassificationModels();
  const updateMutation = useUpdateNormType();
  const deleteMutation = useDeleteNormType();
  const restoreMutation = useRestoreNormType();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (normType) {
      resetForm({
        label: normType.label || '',
        description: normType.description || '',
        assetTypes: normType.assetTypes.join(', '),
        classificationModelId: normType.classificationModelId || '',
        sortOrder: normType.sortOrder ?? 0,
        isActive: normType.isActive,
      });
    }
  }, [normType, resetForm]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !normType) {
    return <ErrorBox>Normtype niet gevonden</ErrorBox>;
  }

  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const canManage = isSuperuser;
  const isDeleted = !!normType.deletedAt;

  const modelOptions = [
    { value: '', label: '— Geen —' },
    ...(models ?? []).map((m) => ({ value: m.id, label: m.name })),
  ];
  const modelName =
    normType.classificationModel?.name ??
    (models ?? []).find((m) => m.id === normType.classificationModelId)?.name ??
    null;

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const onSubmit = async (data: FormData) => {
    const assetTypes = (data.assetTypes ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          label: data.label,
          description: data.description || undefined,
          assetTypes,
          classificationModelId: data.classificationModelId || null,
          sortOrder: data.sortOrder,
          isActive: data.isActive ?? true,
        },
      });
      showToast('Normtype bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Normtype verwijderen',
      message: `Weet je zeker dat je "${normType.label}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Normtype verwijderd', 'success');
      navigate('/norm-types');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleRestore = async () => {
    try {
      await restoreMutation.mutateAsync(id!);
      showToast('Normtype hersteld', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="NormTypeDefinition" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/norm-types')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{normType.label}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {normType.code}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  normType.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {normType.isActive ? 'Actief' : 'Inactief'}
              </span>
              {isDeleted && (
                <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                  Verwijderd
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Verwijderd-notice met prominente Herstellen-actie */}
        {isDeleted && (
          <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-red-800">Dit normtype is verwijderd</p>
              <p className="text-sm text-red-700">
                Verwijderd op {formatDate(normType.deletedAt)}. Herstel het om het weer te kunnen gebruiken.
              </p>
            </div>
            {canManage && (
              <Button onClick={handleRestore} isLoading={restoreMutation.isPending}>
                Herstellen
              </Button>
            )}
          </div>
        )}

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Overzicht — inline bewerkbaar */}
        {activeTab === 'overzicht' && (
          <Card
            title="Normtype gegevens"
            actions={
              canManage && !isEditing && !isDeleted ? (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  Bewerken
                </Button>
              ) : undefined
            }
          >
            {isEditing ? (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* Code is onveranderbaar bij bewerken */}
                <InfoField label="Code" value={normType.code} />
                <Input label="Label" {...register('label')} error={errors.label?.message} />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <Input
                  label="Asset-types"
                  placeholder="komma-gescheiden codes, bijv. pomp, leiding"
                  helperText="Asset-type codes die bij deze norm horen. Scheid meerdere met een komma."
                  {...register('assetTypes')}
                />
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Select
                    label="Classificatiemodel"
                    options={modelOptions}
                    error={errors.classificationModelId?.message}
                    {...register('classificationModelId')}
                  />
                  <Input label="Volgorde" type="number" min={0} {...register('sortOrder')} />
                </div>
                <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    {...register('isActive')}
                  />
                  Actief
                </label>
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
                <InfoField label="Label" value={normType.label} />
                <InfoField label="Code" value={normType.code} />
                <InfoField
                  label="Asset-types"
                  value={normType.assetTypes.length ? normType.assetTypes.join(', ') : null}
                />
                <InfoField label="Classificatiemodel" value={modelName} />
                <InfoField label="Volgorde" value={normType.sortOrder} />
                <InfoField label="Actief" value={normType.isActive ? 'Ja' : 'Nee'} />
                <InfoField label="Aangemaakt" value={formatDate(normType.createdAt)} />
                <InfoField
                  label="Verwijderd"
                  value={isDeleted ? formatDate(normType.deletedAt) : null}
                />
                <div className="sm:col-span-2">
                  <InfoField label="Beschrijving" value={normType.description} />
                </div>
              </dl>
            )}
          </Card>
        )}

        {/* Instellingen — gevarenzone / herstel */}
        {activeTab === 'instellingen' && (
          <div className="space-y-6">
            {isDeleted ? (
              <Card title="Herstellen">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Normtype herstellen</p>
                    <p className="text-sm text-gray-500">Maakt dit normtype weer beschikbaar.</p>
                  </div>
                  <Button
                    onClick={handleRestore}
                    isLoading={restoreMutation.isPending}
                    disabled={!canManage}
                  >
                    Herstellen
                  </Button>
                </div>
              </Card>
            ) : (
              <Card title="Gevarenzone" className="border-danger-200">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">Normtype verwijderen</p>
                    <p className="text-sm text-gray-500">Dit verwijdert het normtype (soft-delete).</p>
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
            )}
          </div>
        )}
      </div>
    </DetailPageLayout>
  );
}
