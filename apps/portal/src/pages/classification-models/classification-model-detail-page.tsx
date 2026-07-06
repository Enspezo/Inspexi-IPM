// Detailpagina classificatiemodel (SUPERUSER-beheer): DetailPageLayout + AuditHistory + tabs.
// Overzicht is inline bewerkbaar (canon: contact-detail-page / asset-type-detail-page).
// Kenmerken-tab bevat de geneste kenmerken+opties-editor. Schrijven is SUPERUSER-only.

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
  useClassificationModel,
  useUpdateClassificationModel,
  useDeleteClassificationModel,
} from './hooks/use-classification-models';
import { CharacteristicsTab } from './components/characteristics-tab';

type Tab = 'overzicht' | 'kenmerken' | 'instellingen';

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht').max(100, 'Maximaal 100 tekens'),
  description: z.string().max(500, 'Maximaal 500 tekens').optional(),
  isActive: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

export default function ClassificationModelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: model, isLoading, error } = useClassificationModel(id!);
  const updateMutation = useUpdateClassificationModel();
  const deleteMutation = useDeleteClassificationModel();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (model) {
      resetForm({
        name: model.name || '',
        description: model.description || '',
        isActive: model.isActive,
      });
    }
  }, [model, resetForm]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !model) {
    return <ErrorBox>Classificatiemodel niet gevonden</ErrorBox>;
  }

  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const canManage = isSuperuser;

  const characteristics = model.characteristics ?? [];

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'kenmerken', label: 'Kenmerken', count: characteristics.length },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          name: data.name,
          description: data.description || null,
          isActive: data.isActive ?? true,
        },
      });
      showToast('Classificatiemodel bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Classificatiemodel verwijderen',
      message: `Weet je zeker dat je "${model.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Classificatiemodel verwijderd', 'success');
      navigate('/classification-models');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="ClassificationModel" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/classification-models')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{model.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {model.code}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  model.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {model.isActive ? 'Actief' : 'Inactief'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Overzicht — inline bewerkbaar */}
        {activeTab === 'overzicht' && (
          <Card
            title="Modelgegevens"
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
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
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
                <InfoField label="Naam" value={model.name} />
                <InfoField label="Code" value={model.code} />
                <InfoField label="Actief" value={model.isActive ? 'Ja' : 'Nee'} />
                <InfoField label="Aangemaakt" value={formatDate(model.createdAt)} />
                <div className="sm:col-span-2">
                  <InfoField label="Omschrijving" value={model.description} />
                </div>
              </dl>
            )}
          </Card>
        )}

        {/* Kenmerken — geneste kenmerken+opties-editor */}
        {activeTab === 'kenmerken' && (
          <CharacteristicsTab modelId={id!} characteristics={characteristics} canManage={canManage} />
        )}

        {/* Instellingen — gevarenzone */}
        {activeTab === 'instellingen' && (
          <Card title="Gevarenzone" className="border-danger-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Classificatiemodel verwijderen</p>
                <p className="text-sm text-gray-500">
                  Dit deactiveert het model (soft-delete). Lukt niet als het door templates wordt gebruikt.
                </p>
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
    </DetailPageLayout>
  );
}
