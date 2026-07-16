import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role, AssetNodeType } from '@/types';
import {
  Button,
  Card,
  ErrorBox,
  InfoField,
  Input,
  Select,
  Spinner,
  Tabs,
  LookupBadge,
  useConfirm,
  useToast,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { HistorySidebarSection } from '@/components/layout/sidebar-sections';
import { PageHeader } from '@/components/layout/page-header';
import { useAuth } from '@/providers/auth-provider';
import { useTenant } from '@/providers/tenant-provider';
import { useWindowTabSync } from '@/providers/window-tabs';
import { useLookups } from '@/lib/lookups';
import { getErrorMessage } from '@/lib/api-client';
import type { InspectionPlan } from '@/types';
import {
  useInspectionPlan,
  useUpdateInspectionPlan,
  useReviewInspectionPlan,
  useSubmitInspectionPlan,
  useDeleteInspectionPlan,
} from './hooks/use-inspections';
import { PhaseSelect, PhaseInfoField } from '@/components/projects/phase-select';
import { useFeatures } from '@/providers/feature-provider';
import { usePlanTree } from './hooks/use-asset-nodes';
import { countByType, normalizeTree } from '@/components/asset-tree';
import { PlanDefaultInstrumentsSection } from '@/pages/meetmiddelen/components/plan-default-instruments-section';
import { AssetsTab } from './components/assets-tab';
import { DocumentsTab } from './components/documents-tab';
import { AiReviewPanel } from './components/ai-review-panel';

// Konva-zware tab apart laden: alleen wanneer de gebruiker hem opent.
const FloorPlanTab = lazy(() =>
  import('./components/floor-plan-tab').then((m) => ({ default: m.FloorPlanTab })),
);

type Tab = 'overzicht' | 'assets' | 'plattegrond' | 'documenten' | 'instellingen';

const canWriteRoles = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];
const canReviewRoles = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.WERKVOORBEREIDER];

const schema = z.object({
  projectName: z.string().min(1, 'Projectnaam is verplicht'),
  referenceNumber: z.string().optional(),
  description: z.string().optional(),
  statusCode: z.string().optional(),
  inspectionTypeCode: z.string().optional(),
  plannedDate: z.string().optional(),
  deadline: z.string().optional(),
  notes: z.string().optional(),
  internalNotes: z.string().optional(),
});
type FormData = z.infer<typeof schema>;

function contactName(plan: InspectionPlan): string {
  const c = plan.contact;
  if (!c) return '—';
  return c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—';
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : '';
}

export default function InspectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { orgBranding } = useTenant();
  const { hasFeature } = useFeatures();
  // PRD-12 §Fase E: fase-koppeling alleen bij de PROJECT_FASEN-entitlement.
  const showPhase = hasFeature('PROJECT_FASEN');
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: plan, isLoading, error } = useInspectionPlan(id!);
  const { data: planTree } = usePlanTree(id);
  const assetCount = countByType(normalizeTree(planTree), AssetNodeType.ASSET);
  const updateMutation = useUpdateInspectionPlan();
  const reviewMutation = useReviewInspectionPlan();
  const submitMutation = useSubmitInspectionPlan();
  const deleteMutation = useDeleteInspectionPlan();

  const { data: planStatuses } = useLookups('plan-status-types');
  const { data: inspectionTypes } = useLookups('inspection-types');

  // Keep this record's in-window tab title fresh, and flag it if the record 404s.
  useWindowTabSync('inspection', id, {
    title: plan?.projectName,
    notFound: !isLoading && (!!error || !plan),
  });

  const [activeTab, setActiveTab] = useState<Tab>('overzicht');
  const [isEditing, setIsEditing] = useState(false);
  const [reviewNotes, setReviewNotes] = useState('');
  // Fase-koppeling via custom control (buiten react-hook-form).
  const [phaseId, setPhaseId] = useState<string | null>(plan?.projectPhaseId ?? null);
  const phaseDirty = phaseId !== (plan?.projectPhaseId ?? null);

  const userCanWrite = !!user && user.roles.some((r) => canWriteRoles.includes(r));
  const userCanReview = !!user && user.roles.some((r) => canReviewRoles.includes(r));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (plan) {
      resetForm({
        projectName: plan.projectName || '',
        referenceNumber: plan.referenceNumber || '',
        description: plan.description || '',
        statusCode: plan.statusCode || '',
        inspectionTypeCode: plan.inspectionTypeCode || '',
        plannedDate: toDateInput(plan.plannedDate),
        deadline: toDateInput(plan.deadline),
        notes: plan.notes || '',
        internalNotes: plan.internalNotes || '',
      });
      setPhaseId(plan.projectPhaseId ?? null);
    }
  }, [plan, resetForm]);

  if (isLoading) return <div className="flex h-64 items-center justify-center"><Spinner size="lg" /></div>;
  if (error) return <ErrorBox>Fout bij het laden van de inspectie: {getErrorMessage(error, '')}</ErrorBox>;
  if (!plan) return <ErrorBox>Inspectie niet gevonden</ErrorBox>;

  const statusOptions = [
    { value: '', label: '— Kies status —' },
    ...(planStatuses ?? []).map((s) => ({ value: s.code, label: s.label })),
  ];
  const typeOptions = [
    { value: '', label: '— Kies type —' },
    ...(inspectionTypes ?? []).map((t) => ({ value: t.code, label: t.label })),
  ];

  const onSubmit = async (data: FormData) => {
    const payload: Record<string, unknown> = {
      projectName: data.projectName,
      referenceNumber: data.referenceNumber || null,
      description: data.description || null,
      notes: data.notes || null,
      internalNotes: data.internalNotes || null,
      plannedDate: data.plannedDate || null,
      deadline: data.deadline || null,
    };
    if (data.statusCode) payload.statusCode = data.statusCode;
    if (data.inspectionTypeCode) payload.inspectionTypeCode = data.inspectionTypeCode;
    if (phaseDirty) payload.projectPhaseId = phaseId;
    try {
      await updateMutation.mutateAsync({ id: id!, data: payload });
      showToast('Inspectie bijgewerkt', 'success');
      setIsEditing(false);
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleSubmitForReview = async () => {
    try {
      await submitMutation.mutateAsync(id!);
      showToast('Inspectie ingediend ter beoordeling', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleReview = async (decision: 'approve' | 'reject') => {
    try {
      await reviewMutation.mutateAsync({ id: id!, decision, notes: reviewNotes || undefined });
      showToast(decision === 'approve' ? 'Inspectie goedgekeurd' : 'Inspectie afgekeurd', 'success');
      setReviewNotes('');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleDelete = async () => {
    const confirmed = await confirm({
      title: 'Inspectie verwijderen',
      message: `Weet je zeker dat je "${plan.projectName}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!confirmed) return;
    try {
      await deleteMutation.mutateAsync(id!);
      showToast('Inspectie verwijderd', 'success');
      navigate('/inspections');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  // Vier-ogen-toggle (PRD-13): met de org-vlag uit vervalt de submit-/review-flow
  // en kan een schrijver het plan direct afronden. Default (vlag onbekend) = aan.
  const reviewRequired = orgBranding?.inspectionReviewEnabled !== false;
  const showAiPanel = hasFeature('AI_REVIEW');

  const awaitingReview = reviewRequired && !!plan.submittedAt && !plan.reviewedAt;
  const canSubmit = reviewRequired && userCanWrite && !plan.submittedAt;
  const canComplete =
    !reviewRequired && userCanWrite && plan.statusCode !== 'completed' && plan.statusCode !== 'approved';

  const handleComplete = async () => {
    try {
      await updateMutation.mutateAsync({ id: id!, data: { statusCode: 'completed' } });
      showToast('Inspectie afgerond', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const tabs = [
    { key: 'overzicht' as const, label: 'Overzicht' },
    { key: 'assets' as const, label: 'Assets', count: assetCount },
    { key: 'plattegrond' as const, label: 'Plattegrond' },
    { key: 'documenten' as const, label: 'Documenten' },
    { key: 'instellingen' as const, label: 'Instellingen' },
  ];

  return (
    <DetailPageLayout
      iconStrip
      sidebar={<HistorySidebarSection entityType="InspectionPlan" entityId={id} />}
    >
      <div className="space-y-6">
        <button
          onClick={() => navigate('/inspections')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Terug naar inspecties
        </button>

        <PageHeader
          title={plan.projectName}
          description={contactName(plan)}
          actions={
            <div className="flex items-center gap-3">
              <LookupBadge kind="plan-status-types" code={plan.statusCode} />
              {canSubmit && (
                <Button variant="secondary" onClick={handleSubmitForReview} isLoading={submitMutation.isPending}>
                  Indienen
                </Button>
              )}
              {canComplete && (
                <Button variant="secondary" onClick={handleComplete} isLoading={updateMutation.isPending}>
                  Afronden
                </Button>
              )}
            </div>
          }
        />

        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {activeTab === 'overzicht' && (
          <div className="space-y-6">
            {awaitingReview && userCanReview && (
              <Card title="Beoordeling" className="border-orange-200 bg-orange-50">
                <div className="space-y-3">
                  <p className="text-sm text-gray-700">Deze inspectie is ingediend en wacht op beoordeling.</p>
                  <textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    placeholder="Opmerkingen (optioneel)"
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                  <div className="flex gap-2">
                    <Button onClick={() => handleReview('approve')} isLoading={reviewMutation.isPending}>Goedkeuren</Button>
                    <Button variant="danger" onClick={() => handleReview('reject')} isLoading={reviewMutation.isPending}>Afkeuren</Button>
                  </div>
                </div>
              </Card>
            )}

            {showAiPanel && (
              <AiReviewPanel
                planId={id!}
                canReview={userCanReview}
                aiEnabled={orgBranding?.aiReviewEnabled === true}
                onOpenAssets={() => setActiveTab('assets')}
              />
            )}

            <Card
              title="Inspectiegegevens"
              actions={
                userCanWrite && !isEditing ? (
                  <Button variant="secondary" onClick={() => setIsEditing(true)}>Bewerken</Button>
                ) : undefined
              }
            >
              {isEditing ? (
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <Input label="Projectnaam" {...register('projectName')} error={errors.projectName?.message} />
                  <Input label="Referentienummer" {...register('referenceNumber')} />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Select label="Status" options={statusOptions} {...register('statusCode')} />
                    <Select label="Inspectietype" options={typeOptions} {...register('inspectionTypeCode')} />
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input label="Geplande datum" type="date" {...register('plannedDate')} />
                    <Input label="Deadline" type="date" {...register('deadline')} />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
                    <textarea {...register('description')} rows={3} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Notities</label>
                    <textarea {...register('notes')} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-gray-700">Interne notities</label>
                    <textarea {...register('internalNotes')} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500" />
                  </div>
                  {showPhase && (
                    <PhaseSelect projectId={plan.projectId} value={phaseId} onChange={setPhaseId} />
                  )}
                  <div className="flex gap-2">
                    <Button type="submit" disabled={!isDirty && !phaseDirty} isLoading={updateMutation.isPending}>Opslaan</Button>
                    <Button type="button" variant="secondary" onClick={() => { resetForm(); setPhaseId(plan.projectPhaseId ?? null); setIsEditing(false); }}>Annuleren</Button>
                  </div>
                </form>
              ) : (
                <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <InfoField label="Projectnaam" value={plan.projectName} />
                  <InfoField label="Referentienummer" value={plan.referenceNumber} />
                  <InfoField label="Status" value={<LookupBadge kind="plan-status-types" code={plan.statusCode} />} />
                  <InfoField label="Inspectietype" value={<LookupBadge kind="inspection-types" code={plan.inspectionTypeCode} />} />
                  <InfoField label="Normtype" value={plan.normTypeCode} />
                  <InfoField label="Opdrachtgever" value={contactName(plan)} />
                  {showPhase && (
                    <PhaseInfoField phase={plan.projectPhase} projectId={plan.projectId} />
                  )}
                  <InfoField label="Geplande datum" value={plan.plannedDate ? new Date(plan.plannedDate).toLocaleDateString('nl-NL') : null} />
                  <InfoField label="Deadline" value={plan.deadline ? new Date(plan.deadline).toLocaleDateString('nl-NL') : null} />
                  <InfoField label="Omschrijving" value={plan.description} />
                  <InfoField label="Notities" value={plan.notes} />
                </dl>
              )}
            </Card>

            <Card title="Standaard meetmiddelen">
              <PlanDefaultInstrumentsSection planId={id!} canEdit={userCanWrite} />
            </Card>
          </div>
        )}

        {activeTab === 'assets' && <AssetsTab planId={id!} canWrite={userCanWrite} />}

        {activeTab === 'plattegrond' && (
          <Suspense
            fallback={
              <div className="flex justify-center py-10">
                <Spinner size="lg" />
              </div>
            }
          >
            <FloorPlanTab planId={id!} canWrite={userCanWrite} />
          </Suspense>
        )}

        {activeTab === 'documenten' && (
          <DocumentsTab planId={id!} canWrite={userCanWrite} canFinalize={userCanReview} />
        )}

        {activeTab === 'instellingen' && (
          <Card title="Gevarenzone" className="border-danger-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Inspectie verwijderen</p>
                <p className="text-sm text-gray-500">Dit verwijdert de inspectie (soft-delete).</p>
              </div>
              <Button variant="danger" onClick={handleDelete} isLoading={deleteMutation.isPending} disabled={!userCanWrite}>
                Verwijderen
              </Button>
            </div>
          </Card>
        )}
      </div>
    </DetailPageLayout>
  );
}
