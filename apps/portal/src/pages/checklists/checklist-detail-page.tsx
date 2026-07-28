// Detailpagina checklist: DetailPageLayout + AuditHistory + tabs.
// Overzicht is inline bewerkbaar (alleen CONCEPT). Lifecycle-knoppen in de header.
// Spiegelt asset-type-detail-page.tsx + inspection-template-detail-page.tsx.

import { useState, useEffect, useMemo } from 'react';
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
  StatusBadge,
  Tabs,
  useConfirm,
  useToast,
  type TabDef,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { CHECKLIST_STATUS } from '@/lib/status';
import { Role, ChecklistStatus } from '@/types';
import { useNormTypes } from '@/pages/norm-types/hooks/use-norm-types';
import {
  useChecklist,
  useUpdateChecklist,
  useDeleteChecklist,
  usePublishChecklist,
  useRetireChecklist,
  useNewChecklistVersion,
} from './hooks/use-checklists';
import { ChecklistItemsTab } from './components/checklist-items-tab';
import { ChecklistPreviewTab } from './components/checklist-preview-tab';
import { ChecklistHistoryTab } from './components/checklist-history-tab';
import { LifecycleModal } from './components/lifecycle-modal';

type Tab = 'overzicht' | 'items' | 'preview' | 'historie' | 'instellingen';
type LifecycleAction = 'publish' | 'retire' | 'new-version' | null;

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

const schema = z.object({
  name: z.string().min(3, 'Minimaal 3 tekens'),
  description: z.string().optional(),
  code: z.string().optional(),
  normTypeCode: z.string().min(1, 'Normtype is verplicht'),
  assetTypes: z.string().min(1, 'Minimaal één asset-type'),
  locationTypes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function csvToArray(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ChecklistDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: checklist, isLoading, error } = useChecklist(id!);
  const { data: normTypes } = useNormTypes();
  const updateMutation = useUpdateChecklist(id!);
  const deleteMutation = useDeleteChecklist(id!);
  const publishMutation = usePublishChecklist(id!);
  const retireMutation = useRetireChecklist(id!);
  const newVersionMutation = useNewChecklistVersion(id!);

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);
  const [lifecycleAction, setLifecycleAction] = useState<LifecycleAction>(null);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (checklist) {
      resetForm({
        name: checklist.name || '',
        description: checklist.description || '',
        code: checklist.code || '',
        normTypeCode: checklist.normTypeCode || '',
        assetTypes: (checklist.assetTypes ?? []).join(', '),
        locationTypes: (checklist.locationTypes ?? []).join(', '),
      });
    }
  }, [checklist, resetForm]);

  const normTypeOptions = useMemo(
    () => (normTypes ?? []).map((n) => ({ value: n.code, label: `${n.label} (${n.code})` })),
    [normTypes],
  );

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !checklist) {
    return <ErrorBox>Checklist niet gevonden</ErrorBox>;
  }

  const isManager = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));
  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const systemOk = checklist.isSystem ? isSuperuser : true;
  const canManage = isManager && systemOk;
  const isConcept = checklist.status === ChecklistStatus.CONCEPT;
  const isActief = checklist.status === ChecklistStatus.ACTIEF;
  const isVervallen = checklist.status === ChecklistStatus.VERVALLEN;
  // Structurele wijzigingen (overzicht/items) alleen op CONCEPT.
  const canEdit = canManage && isConcept;

  const itemLinks = checklist.itemLinks ?? [];

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'items', label: 'Items', count: itemLinks.length },
    { key: 'preview', label: 'Preview' },
    { key: 'historie', label: 'Versiehistorie' },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        code: data.code || undefined,
        normTypeCode: data.normTypeCode,
        assetTypes: csvToArray(data.assetTypes),
        locationTypes: csvToArray(data.locationTypes),
      });
      showToast('Checklist bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleExport = async () => {
    try {
      const data = await apiClient.get<Record<string, unknown>>(`/checklists/${id}/export`);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checklist-${checklist.code || checklist.id}-v${checklist.version}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(getErrorMessage(err, 'Exporteren mislukt'), 'error');
    }
  };

  const handlePublish = async (body: { changeDescription?: string; approvalReason?: string }) => {
    try {
      await publishMutation.mutateAsync({
        changeDescription: body.changeDescription ?? '',
        approvalReason: body.approvalReason,
      });
      showToast('Checklist gepubliceerd', 'success');
      setLifecycleAction(null);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleRetire = async (body: { changeDescription?: string; approvalReason?: string }) => {
    try {
      await retireMutation.mutateAsync({
        changeDescription: body.changeDescription ?? '',
        approvalReason: body.approvalReason,
      });
      showToast('Checklist ingetrokken', 'success');
      setLifecycleAction(null);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleNewVersion = async (body: { changeDescription?: string }) => {
    try {
      const created = await newVersionMutation.mutateAsync({
        changeDescription: body.changeDescription,
      });
      showToast('Nieuwe versie aangemaakt', 'success');
      setLifecycleAction(null);
      navigate(`/checklists/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Checklist verwijderen',
      message: `Weet je zeker dat je "${checklist.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync();
      showToast('Checklist verwijderd', 'success');
      navigate('/checklists');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="Checklist" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/checklists')}
            className="mt-1 rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{checklist.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={checklist.status} map={CHECKLIST_STATUS} />
              {checklist.code && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {checklist.code}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                v{checklist.version}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {checklist.isSystem ? 'Systeem' : 'Eigen'}
              </span>
            </div>
          </div>

          {/* Lifecycle-acties */}
          <div className="flex flex-shrink-0 flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={handleExport}>
              Exporteren
            </Button>
            {canManage && isConcept && (
              <Button onClick={() => setLifecycleAction('publish')}>Publiceren</Button>
            )}
            {canManage && isActief && (
              <>
                <Button variant="secondary" onClick={() => setLifecycleAction('new-version')}>
                  Nieuwe versie
                </Button>
                <Button variant="danger" onClick={() => setLifecycleAction('retire')}>
                  Intrekken
                </Button>
              </>
            )}
            {canManage && isVervallen && (
              <Button variant="secondary" onClick={() => setLifecycleAction('new-version')}>
                Nieuwe versie
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Overzicht — inline bewerkbaar (alleen CONCEPT) */}
        {activeTab === 'overzicht' && (
          <Card
            title="Checklist-gegevens"
            actions={
              canEdit && !isEditing ? (
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
                  <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Code" {...register('code')} />
                  <Select
                    label="Normtype"
                    placeholder="Kies een normtype"
                    options={normTypeOptions}
                    error={errors.normTypeCode?.message}
                    {...register('normTypeCode')}
                  />
                </div>
                <Input
                  label="Asset-types"
                  placeholder="komma-gescheiden, bijv. verdeler, pomp"
                  helperText="Asset-type codes waarvoor de checklist geldt."
                  error={errors.assetTypes?.message}
                  {...register('assetTypes')}
                />
                <Input
                  label="Locatie-types"
                  placeholder="komma-gescheiden"
                  {...register('locationTypes')}
                />
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
                <InfoField label="Naam" value={checklist.name} />
                <InfoField label="Code" value={checklist.code} />
                <InfoField label="Normtype" value={checklist.normTypeCode} />
                <InfoField label="Versie" value={checklist.version} />
                <InfoField
                  label="Asset-types"
                  value={checklist.assetTypes.length ? checklist.assetTypes.join(', ') : null}
                />
                <InfoField
                  label="Locatie-types"
                  value={checklist.locationTypes.length ? checklist.locationTypes.join(', ') : null}
                />
                <InfoField label="Herkomst" value={checklist.isSystem ? 'Systeem' : 'Eigen'} />
                <InfoField label="Aangemaakt" value={formatDate(checklist.createdAt)} />
                <InfoField label="Gepubliceerd" value={checklist.publishedAt ? formatDate(checklist.publishedAt) : null} />
                <div className="sm:col-span-2">
                  <InfoField label="Beschrijving" value={checklist.description} />
                </div>
              </dl>
            )}
          </Card>
        )}

        {/* Items */}
        {activeTab === 'items' && (
          <ChecklistItemsTab checklistId={id!} itemLinks={itemLinks} canEdit={canEdit} />
        )}

        {/* Preview */}
        {activeTab === 'preview' && <ChecklistPreviewTab checklistId={id!} />}

        {/* Versiehistorie */}
        {activeTab === 'historie' && <ChecklistHistoryTab checklistId={id!} />}

        {/* Instellingen — gevarenzone */}
        {activeTab === 'instellingen' && (
          <Card title="Gevarenzone" className="border-danger-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Checklist verwijderen</p>
                <p className="text-sm text-gray-500">
                  Alleen mogelijk voor checklists met status CONCEPT.
                </p>
              </div>
              <Button
                variant="danger"
                onClick={handleDelete}
                isLoading={deleteMutation.isPending}
                disabled={!canEdit}
              >
                Verwijderen
              </Button>
            </div>
          </Card>
        )}
      </div>

      {/* Lifecycle-modals */}
      <LifecycleModal
        isOpen={lifecycleAction === 'publish'}
        onClose={() => setLifecycleAction(null)}
        title="Checklist publiceren"
        confirmLabel="Publiceren"
        withApprovalReason
        descriptionRequired
        isLoading={publishMutation.isPending}
        onSubmit={handlePublish}
      />
      <LifecycleModal
        isOpen={lifecycleAction === 'retire'}
        onClose={() => setLifecycleAction(null)}
        title="Checklist intrekken"
        confirmLabel="Intrekken"
        withApprovalReason
        descriptionRequired
        isLoading={retireMutation.isPending}
        onSubmit={handleRetire}
      />
      <LifecycleModal
        isOpen={lifecycleAction === 'new-version'}
        onClose={() => setLifecycleAction(null)}
        title="Nieuwe versie aanmaken"
        confirmLabel="Aanmaken"
        descriptionRequired={false}
        isLoading={newVersionMutation.isPending}
        onSubmit={handleNewVersion}
      />
    </DetailPageLayout>
  );
}
