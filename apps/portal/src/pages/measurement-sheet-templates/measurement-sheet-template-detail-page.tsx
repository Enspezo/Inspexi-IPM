// Detailpagina meetstaat-template — host voor de form-builder + versiebeheer.
// Beheer detail-patroon: DetailPageLayout + AuditHistory + tabs + inline-edit Overzicht.
// Alle schrijfacties SUPERUSER-only; bewerken/structuur alleen in CONCEPT (canEdit).

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
  StatusBadge,
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
import { MEASUREMENT_SHEET_STATUS } from '@/lib/status';
import { Role, MeasurementSheetTemplateStatus } from '@/types';
import { useNormTypes } from '@/pages/norm-types/hooks/use-norm-types';
import {
  useMeasurementSheetTemplate,
  useUpdateMeasurementSheetTemplate,
  useDeleteMeasurementSheetTemplate,
  usePublishTemplate,
  useRetireTemplate,
  useNewTemplateVersion,
} from './hooks/use-measurement-sheet-templates';
import { FormBuilderTab } from './components/form-builder-tab';
import { VersionHistoryTab } from './components/version-history-tab';
import { LifecycleModal, type LifecycleSubmit } from './components/lifecycle-modal';

type Tab = 'overzicht' | 'form-builder' | 'historie' | 'instellingen';

type LifecycleKind = 'publish' | 'retire' | 'new-version' | null;

const schema = z.object({
  name: z.string().min(3, 'Minimaal 3 tekens').max(200, 'Maximaal 200 tekens'),
  description: z.string().max(2000).optional(),
  normType: z.string().min(1, 'Normtype is verplicht'),
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

export default function MeasurementSheetTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: template, isLoading, error } = useMeasurementSheetTemplate(id!);
  const { data: normTypes } = useNormTypes();
  const updateMutation = useUpdateMeasurementSheetTemplate(id!);
  const deleteMutation = useDeleteMeasurementSheetTemplate(id!);
  const publishMutation = usePublishTemplate(id!);
  const retireMutation = useRetireTemplate(id!);
  const newVersionMutation = useNewTemplateVersion(id!);

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);
  const [lifecycle, setLifecycle] = useState<LifecycleKind>(null);

  const normTypeOptions = (normTypes ?? []).map((n) => ({ value: n.code, label: n.label }));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (template) {
      resetForm({
        name: template.name || '',
        description: template.description || '',
        normType: template.normTypeCode || '',
        assetTypes: (template.assetTypes ?? []).join(', '),
        locationTypes: (template.locationTypes ?? []).join(', '),
      });
    }
  }, [template, resetForm]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !template) {
    return <ErrorBox>Meetstaat-template niet gevonden</ErrorBox>;
  }

  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  const status = template.status;
  const isConcept = status === MeasurementSheetTemplateStatus.CONCEPT;
  const isActief = status === MeasurementSheetTemplateStatus.ACTIEF;
  const isVervallen = status === MeasurementSheetTemplateStatus.VERVALLEN;
  const canEdit = isSuperuser && isConcept;

  const sections = template.sections ?? [];

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'form-builder', label: 'Form-builder', count: sections.length },
    { key: 'historie', label: 'Versiehistorie' },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        description: data.description || undefined,
        normType: data.normType, // update-body gebruikt normType
        assetTypes: csvToArray(data.assetTypes),
        locationTypes: csvToArray(data.locationTypes),
      });
      showToast('Meetstaat-template bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Meetstaat-template verwijderen',
      message: `Weet je zeker dat je "${template.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync();
      showToast('Meetstaat-template verwijderd', 'success');
      navigate('/measurement-sheet-templates');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const handleLifecycleSubmit = async (data: LifecycleSubmit) => {
    try {
      if (lifecycle === 'publish') {
        await publishMutation.mutateAsync({
          changeDescription: data.changeDescription ?? '',
          approvalReason: data.approvalReason,
        });
        showToast('Template gepubliceerd', 'success');
        setLifecycle(null);
      } else if (lifecycle === 'retire') {
        await retireMutation.mutateAsync({
          changeDescription: data.changeDescription ?? '',
          approvalReason: data.approvalReason,
        });
        showToast('Template ingetrokken', 'success');
        setLifecycle(null);
      } else if (lifecycle === 'new-version') {
        const created = await newVersionMutation.mutateAsync({
          changeDescription: data.changeDescription,
        });
        showToast('Nieuwe versie aangemaakt', 'success');
        setLifecycle(null);
        navigate(`/measurement-sheet-templates/${created.id}`);
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Actie mislukt'), 'error');
    }
  };

  const lifecycleConfig = {
    publish: {
      title: 'Template publiceren',
      description: 'Hiermee wordt de template actief en kan deze gebruikt worden in inspecties.',
      confirmLabel: 'Publiceren',
      requireDescription: true,
      showApprovalReason: true,
      isLoading: publishMutation.isPending,
    },
    retire: {
      title: 'Template intrekken',
      description: 'Hiermee vervalt de template. Bestaande inspecties blijven ongewijzigd.',
      confirmLabel: 'Intrekken',
      requireDescription: true,
      showApprovalReason: true,
      isLoading: retireMutation.isPending,
    },
    'new-version': {
      title: 'Nieuwe versie maken',
      description: 'Maakt een nieuwe CONCEPT-versie als kopie van deze template.',
      confirmLabel: 'Nieuwe versie',
      requireDescription: false,
      showApprovalReason: false,
      isLoading: newVersionMutation.isPending,
    },
  } as const;

  const activeLifecycle = lifecycle ? lifecycleConfig[lifecycle] : null;

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="MeasurementSheetTemplate" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <button
            onClick={() => navigate('/measurement-sheet-templates')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{template.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <StatusBadge status={template.status} map={MEASUREMENT_SHEET_STATUS} />
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {template.code}
              </span>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                v{template.version}
              </span>
            </div>
          </div>

          {/* Lifecycle-acties (SUPERUSER, status-gated) */}
          {isSuperuser && (
            <div className="flex flex-shrink-0 flex-wrap items-center gap-2">
              {isConcept && (
                <Button variant="primary" onClick={() => setLifecycle('publish')}>
                  Publiceren
                </Button>
              )}
              {isActief && (
                <>
                  <Button variant="secondary" onClick={() => setLifecycle('new-version')}>
                    Nieuwe versie
                  </Button>
                  <Button variant="danger" onClick={() => setLifecycle('retire')}>
                    Intrekken
                  </Button>
                </>
              )}
              {isVervallen && (
                <Button variant="secondary" onClick={() => setLifecycle('new-version')}>
                  Nieuwe versie
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Overzicht — inline bewerkbaar */}
        {activeTab === 'overzicht' && (
          <Card
            title="Templategegevens"
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
                <Select
                  label="Normtype"
                  placeholder="Kies een normtype"
                  options={normTypeOptions}
                  error={errors.normType?.message}
                  {...register('normType')}
                />
                <Input
                  label="Asset-types"
                  placeholder="komma-gescheiden, bijv. hoofdverdeler, groepenkast"
                  helperText="Scheid meerdere asset-types met een komma."
                  error={errors.assetTypes?.message}
                  {...register('assetTypes')}
                />
                <Input
                  label="Locatie-types"
                  placeholder="komma-gescheiden (optioneel)"
                  helperText="Scheid meerdere locatie-types met een komma."
                  {...register('locationTypes')}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
                  <textarea
                    {...register('description')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
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
                <InfoField label="Naam" value={template.name} />
                <InfoField label="Code" value={template.code} />
                <InfoField label="Normtype" value={template.normTypeCode} />
                <InfoField label="Versie" value={template.version} />
                <InfoField
                  label="Asset-types"
                  value={template.assetTypes?.length ? template.assetTypes.join(', ') : null}
                />
                <InfoField
                  label="Locatie-types"
                  value={template.locationTypes?.length ? template.locationTypes.join(', ') : null}
                />
                <InfoField label="Aangemaakt" value={formatDate(template.createdAt)} />
                <InfoField label="Bijgewerkt" value={formatDate(template.updatedAt)} />
                {template.publishedAt && (
                  <InfoField label="Gepubliceerd" value={formatDate(template.publishedAt)} />
                )}
                {template.retiredAt && (
                  <InfoField label="Ingetrokken" value={formatDate(template.retiredAt)} />
                )}
                <div className="sm:col-span-2">
                  <InfoField label="Beschrijving" value={template.description} />
                </div>
              </dl>
            )}
          </Card>
        )}

        {/* Form-builder */}
        {activeTab === 'form-builder' && (
          <FormBuilderTab templateId={id!} sections={sections} canEdit={canEdit} />
        )}

        {/* Versiehistorie */}
        {activeTab === 'historie' && <VersionHistoryTab templateId={id!} />}

        {/* Instellingen — gevarenzone */}
        {activeTab === 'instellingen' && (
          <Card title="Gevarenzone" className="border-danger-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Meetstaat-template verwijderen</p>
                <p className="text-sm text-gray-500">
                  Alleen mogelijk zolang de template in concept is. Dit verwijdert ook alle secties
                  en velden.
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

      {/* Lifecycle-modal (publish / retire / new-version) */}
      {activeLifecycle && (
        <LifecycleModal
          isOpen={!!lifecycle}
          onClose={() => setLifecycle(null)}
          title={activeLifecycle.title}
          description={activeLifecycle.description}
          confirmLabel={activeLifecycle.confirmLabel}
          requireDescription={activeLifecycle.requireDescription}
          showApprovalReason={activeLifecycle.showApprovalReason}
          isLoading={activeLifecycle.isLoading}
          onSubmit={handleLifecycleSubmit}
        />
      )}
    </DetailPageLayout>
  );
}
