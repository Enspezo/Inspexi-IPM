// Detailpagina constatering-template: DetailPageLayout + AuditHistory + tabs.
// Overzicht is inline bewerkbaar (canon: asset-type-detail-page). Bevat een
// standaardclassificatie-editor die per kenmerk van het gekozen model een optie laat kiezen.

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
import { useCategories } from '@/lib/categories';
import { useClassificationModels } from '@/pages/classification-models/hooks/use-classification-models';
import {
  useFindingTemplate,
  useUpdateFindingTemplate,
  useDeleteFindingTemplate,
  useDuplicateFindingTemplate,
  useClassificationModelDetail,
} from './hooks/use-finding-templates';
import { DefaultClassificationEditor } from './components/default-classification-editor';

type Tab = 'overzicht' | 'instellingen';

const MANAGE_ROLES: Role[] = [Role.SUPERUSER, Role.ORG_ADMIN];

const schema = z.object({
  shortDescription: z.string().min(1, 'Omschrijving is verplicht'),
  longDescription: z.string().optional(),
  explanation: z.string().optional(),
  normReference: z.string().optional(),
  code: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

/** Normaliseer een onbekende JSON-waarde naar Record<string,string> voor de editor. */
function toClassificationMap(value: Record<string, unknown> | undefined): Record<string, string> {
  if (!value) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (typeof v === 'string') out[k] = v;
  }
  return out;
}

export default function FindingTemplateDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: template, isLoading, error } = useFindingTemplate(id!);
  const { data: categories } = useCategories();
  const { data: models } = useClassificationModels();
  const updateMutation = useUpdateFindingTemplate();
  const deleteMutation = useDeleteFindingTemplate();
  const duplicateMutation = useDuplicateFindingTemplate();

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);

  // Classificatiemodel + standaardclassificatie buiten react-hook-form (dynamisch object).
  const [modelId, setModelId] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [classification, setClassification] = useState<Record<string, string>>({});

  // Model-detail voor lees-modus weergave van gekozen optienamen.
  const { data: modelDetail } = useClassificationModelDetail(template?.classificationModelId);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  // (Her)vul het formulier + losse state zodra de template laadt of het bewerken stopt.
  useEffect(() => {
    if (template) {
      resetForm({
        shortDescription: template.shortDescription || '',
        longDescription: template.longDescription || '',
        explanation: template.explanation || '',
        normReference: template.normReference || '',
        code: template.code || '',
      });
      setModelId(template.classificationModelId);
      setCategoryId(template.categoryId ?? '');
      setClassification(toClassificationMap(template.defaultClassification));
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
    return <ErrorBox>Constatering-template niet gevonden</ErrorBox>;
  }

  const isManager = !!user && user.roles.some((r) => MANAGE_ROLES.includes(r));
  const isSuperuser = !!user && user.roles.includes(Role.SUPERUSER);
  // Org-admins kunnen systeem-templates niet bewerken, maar wel dupliceren (org-kopie).
  const systemOk = template.isSystem ? isSuperuser : true;
  const canManage = isManager && systemOk;

  const categoryOptions = [
    { value: '', label: '—' },
    ...(categories ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const modelOptions = (models ?? []).map((m) => ({ value: m.id, label: m.name }));

  const categoryName = categories?.find((c) => c.id === template.categoryId)?.name ?? null;
  const modelName = models?.find((m) => m.id === template.classificationModelId)?.name ?? null;

  const tabs: TabDef<Tab>[] = [
    { key: 'overzicht', label: 'Overzicht' },
    { key: 'instellingen', label: 'Instellingen' },
  ];

  // Wijzig het model: schoon classificatie-keys op die niet meer voorkomen in het nieuwe model.
  const handleModelChange = (nextId: string) => {
    setModelId(nextId);
    // We weten de nieuwe kenmerken pas na fetch; reset hier hard naar leeg om stale keys
    // (van het oude model) te voorkomen. De editor vult zich opnieuw op basis van het nieuwe model.
    if (nextId !== template.classificationModelId) {
      setClassification({});
    } else {
      setClassification(toClassificationMap(template.defaultClassification));
    }
  };

  // Read-mode: toon per kenmerk de gekozen optienaam (uit modelDetail).
  const readClassificationRows = (() => {
    const map = toClassificationMap(template.defaultClassification);
    const chars = modelDetail?.characteristics ?? [];
    if (chars.length === 0) return Object.entries(map);
    return chars
      .filter((c) => map[c.code])
      .map((c) => {
        const opt = (c.options ?? []).find((o) => o.code === map[c.code]);
        return [c.name, opt?.name ?? map[c.code]] as [string, string];
      });
  })();

  const onSubmit = async (data: FormData) => {
    if (!modelId) {
      showToast('Kies een classificatiemodel', 'error');
      return;
    }
    try {
      await updateMutation.mutateAsync({
        id: id!,
        data: {
          shortDescription: data.shortDescription,
          longDescription: data.longDescription || undefined,
          explanation: data.explanation || undefined,
          normReference: data.normReference || undefined,
          code: data.code || undefined,
          categoryId: categoryId || undefined,
          classificationModelId: modelId,
          defaultClassification: classification,
        },
      });
      showToast('Constatering-template bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleCancel = () => {
    resetForm();
    setModelId(template.classificationModelId);
    setCategoryId(template.categoryId ?? '');
    setClassification(toClassificationMap(template.defaultClassification));
    setIsEditing(false);
  };

  const handleDuplicate = async () => {
    try {
      const created = await duplicateMutation.mutateAsync({ id: id! });
      showToast('Constatering-template gedupliceerd', 'success');
      navigate(`/finding-templates/${created.id}`);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Constatering-template verwijderen',
      message: `Weet je zeker dat je "${template.shortDescription}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Constatering-template verwijderd', 'success');
      navigate('/finding-templates');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <DetailPageLayout sidebar={<AuditHistory entityType="FindingTemplate" entityId={id} />}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/finding-templates')}
            className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="Terug naar overzicht"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-gray-900">{template.shortDescription}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {template.code && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                  {template.code}
                </span>
              )}
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                {template.isSystem ? 'Systeem' : 'Eigen'}
              </span>
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  template.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {template.isActive ? 'Actief' : 'Inactief'}
              </span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Overzicht — inline bewerkbaar */}
        {activeTab === 'overzicht' && (
          <Card
            title="Template-gegevens"
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
                <Input
                  label="Omschrijving"
                  {...register('shortDescription')}
                  error={errors.shortDescription?.message}
                />
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Toelichting (lang)</label>
                  <textarea
                    {...register('longDescription')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">Uitleg</label>
                  <textarea
                    {...register('explanation')}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Input label="Normreferentie" {...register('normReference')} />
                  <Input label="Code" {...register('code')} />
                </div>
                <Select
                  label="Categorie"
                  options={categoryOptions}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                />
                <Select
                  label="Classificatiemodel"
                  options={modelOptions}
                  placeholder="Kies een model"
                  value={modelId}
                  onChange={(e) => handleModelChange(e.target.value)}
                />
                <div>
                  <p className="mb-2 text-sm font-medium text-gray-700">Standaardclassificatie</p>
                  <DefaultClassificationEditor
                    classificationModelId={modelId}
                    value={classification}
                    onChange={setClassification}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <Button
                    type="submit"
                    disabled={!isDirty && modelId === template.classificationModelId &&
                      categoryId === (template.categoryId ?? '') &&
                      JSON.stringify(classification) === JSON.stringify(toClassificationMap(template.defaultClassification))}
                    isLoading={updateMutation.isPending}
                  >
                    Opslaan
                  </Button>
                  <Button type="button" variant="secondary" onClick={handleCancel}>
                    Annuleren
                  </Button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <InfoField label="Omschrijving" value={template.shortDescription} />
                  </div>
                  <InfoField label="Code" value={template.code} />
                  <InfoField label="Categorie" value={categoryName} />
                  <InfoField label="Normreferentie" value={template.normReference} />
                  <InfoField label="Classificatiemodel" value={modelName} />
                  <InfoField label="Gebruik" value={template.usageCount} />
                  <InfoField label="Herkomst" value={template.isSystem ? 'Systeem' : 'Eigen'} />
                  <InfoField label="Actief" value={template.isActive ? 'Ja' : 'Nee'} />
                  <InfoField label="Aangemaakt" value={formatDate(template.createdAt)} />
                  <div className="sm:col-span-2">
                    <InfoField label="Toelichting (lang)" value={template.longDescription} />
                  </div>
                  <div className="sm:col-span-2">
                    <InfoField label="Uitleg" value={template.explanation} />
                  </div>
                </dl>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-500">Standaardclassificatie</p>
                  {readClassificationRows.length === 0 ? (
                    <p className="text-sm text-gray-400">—</p>
                  ) : (
                    <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {readClassificationRows.map(([label, val]) => (
                        <div key={label} className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                          <span className="text-sm text-gray-500">{label}</span>
                          <span className="text-sm font-medium text-gray-900">{val}</span>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* Instellingen — gevarenzone */}
        {activeTab === 'instellingen' && (
          <div className="space-y-6">
            <Card title="Dupliceren">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">Template dupliceren</p>
                  <p className="text-sm text-gray-500">
                    Maakt een eigen kopie van dit constatering-template binnen jouw organisatie.
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
                  <p className="text-sm font-medium text-gray-900">Template verwijderen</p>
                  <p className="text-sm text-gray-500">Dit verwijdert het template (soft-delete).</p>
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
