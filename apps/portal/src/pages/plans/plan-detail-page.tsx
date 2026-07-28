import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Button,
  Card,
  Checkbox,
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
import { forcedDependencies } from '@/lib/entitlements';
import {
  usePlan,
  useFeatureCatalog,
  useUpdatePlan,
  useDeletePlan,
} from './hooks/use-plans';
import { FeatureChecklist } from './components/feature-checklist';

type Tab = 'overzicht' | 'functies' | 'instellingen';

const metaSchema = z.object({
  name: z.string().min(2, 'Naam moet minimaal 2 tekens bevatten'),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0),
  isActive: z.boolean(),
});

type MetaFormData = z.infer<typeof metaSchema>;

export default function PlanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: plan, isLoading, error } = usePlan(id!);
  const { data: catalog } = useFeatureCatalog();
  const updateMutation = useUpdatePlan(id!);
  const deleteMutation = useDeletePlan();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<MetaFormData>({ resolver: zodResolver(metaSchema) });

  useEffect(() => {
    if (plan) {
      reset({
        name: plan.name,
        description: plan.description ?? '',
        sortOrder: plan.sortOrder,
        isActive: plan.isActive,
      });
      setSelected(plan.features.map((f) => f.featureKey));
    }
  }, [plan, reset]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !plan) {
    return <ErrorBox>{error?.message || 'Abonnement niet gevonden'}</ErrorBox>;
  }

  const orgCount = plan._count?.organizations ?? 0;
  const planKeys = plan.features.map((f) => f.featureKey);
  const featuresDirty =
    selected.length !== planKeys.length ||
    selected.some((k) => !planKeys.includes(k));
  const forced = catalog ? forcedDependencies(catalog, selected) : new Set<string>();

  const onMetaSubmit = async (data: MetaFormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        description: data.description || null,
        sortOrder: data.sortOrder,
        isActive: data.isActive,
      });
      showToast('Abonnement bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const onFeaturesSave = async () => {
    try {
      await updateMutation.mutateAsync({ featureKeys: selected });
      showToast('Functies bijgewerkt', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const onDelete = async () => {
    if (orgCount > 0) {
      showToast(
        'Dit abonnement is toegewezen aan organisaties en kan niet verwijderd worden',
        'error',
      );
      return;
    }
    const ok = await confirm({
      title: 'Abonnement verwijderen',
      message: `Weet je zeker dat je "${plan.name}" wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(plan.id);
      showToast('Abonnement verwijderd', 'success');
      navigate('/plans');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const tabs: TabDef[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'functies', label: `Functies (${planKeys.length})` },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Plan" entityId={id} />}>
      <div className="space-y-6">
        <div>
          <button
            onClick={() => navigate('/plans')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Terug naar abonnementen
          </button>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{plan.name}</h2>
              <p className="text-sm text-gray-500">
                <span className="font-mono">{plan.slug}</span>
                {' · '}
                {orgCount} organisatie{orgCount === 1 ? '' : 's'}
              </p>
            </div>
            {!plan.isActive && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                Inactief
              </span>
            )}
          </div>
        </div>

        <Tabs tabs={tabs} active={activeTab} onChange={(t) => setActiveTab(t as Tab)} />

        {/* Overzicht — inline bewerkbaar */}
        {activeTab === 'overzicht' && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Algemeen</h3>
              {!isEditing && (
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  Bewerken
                </Button>
              )}
            </div>

            {isEditing ? (
              <form onSubmit={handleSubmit(onMetaSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Naam" error={errors.name?.message} {...register('name')} />
                  <Input
                    label="Sorteervolgorde"
                    type="number"
                    error={errors.sortOrder?.message}
                    {...register('sortOrder')}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Beschrijving
                  </label>
                  <textarea
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
                    {...register('description')}
                  />
                </div>
                <Checkbox label="Actief" {...register('isActive')} />
                <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      reset();
                      setIsEditing(false);
                    }}
                  >
                    Annuleren
                  </Button>
                  <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>
                    Opslaan
                  </Button>
                </div>
              </form>
            ) : (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <InfoField label="Naam" value={plan.name} />
                <InfoField label="Slug" value={plan.slug} />
                <InfoField label="Beschrijving" value={plan.description} />
                <InfoField label="Sorteervolgorde" value={String(plan.sortOrder)} />
                <InfoField label="Status" value={plan.isActive ? 'Actief' : 'Inactief'} />
              </div>
            )}
          </Card>
        )}

        {/* Functies */}
        {activeTab === 'functies' && (
          <Card>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Functies</h3>
                <p className="text-sm text-gray-500">
                  Selecteer de functies die in dit abonnement zitten. Afhankelijke
                  functies worden automatisch geactiveerd bij organisaties.
                </p>
              </div>
              <Button
                disabled={!featuresDirty}
                isLoading={updateMutation.isPending}
                onClick={onFeaturesSave}
              >
                Opslaan
              </Button>
            </div>

            {forced.size > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Automatisch mee-geactiveerd door afhankelijkheden:{' '}
                <span className="font-medium">
                  {[...forced]
                    .map((k) => catalog?.find((f) => f.key === k)?.label ?? k)
                    .join(', ')}
                </span>
              </div>
            )}

            {catalog ? (
              <FeatureChecklist catalog={catalog} selected={selected} onChange={setSelected} />
            ) : (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            )}
          </Card>
        )}

        {/* Instellingen — gevarenzone */}
        {activeTab === 'instellingen' && (
          <Card>
            <h3 className="text-lg font-semibold text-gray-900">Gevarenzone</h3>
            <p className="mt-1 text-sm text-gray-500">
              {orgCount > 0
                ? `Dit abonnement is toegewezen aan ${orgCount} organisatie${
                    orgCount === 1 ? '' : 's'
                  }. Wijs ze eerst een ander abonnement toe voordat je dit verwijdert.`
                : 'Verwijder dit abonnement permanent. Dit kan niet ongedaan worden gemaakt.'}
            </p>
            <div className="mt-4">
              <Button
                variant="danger"
                disabled={orgCount > 0}
                isLoading={deleteMutation.isPending}
                onClick={onDelete}
              >
                Abonnement verwijderen
              </Button>
            </div>
          </Card>
        )}
      </div>
    </DetailPageLayout>
  );
}
