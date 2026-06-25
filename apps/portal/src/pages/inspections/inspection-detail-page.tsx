import { useState, useEffect, lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role } from '@/types';
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
import { useInspectionAssets } from './hooks/use-location-images';
import { PlanDefaultInstrumentsSection } from '@/pages/meetmiddelen/components/plan-default-instruments-section';
import { AssetsTab } from './components/assets-tab';
import { DocumentsTab } from './components/documents-tab';

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
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: plan, isLoading, error } = useInspectionPlan(id!);
  const { data: assets = [], isLoading: assetsLoading } = useInspectionAssets(id);
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
    try {
      await updateMutation.mutateAsync({ id: id!, data: payload });
      showToast('Inspectie bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleSubmitForReview = async () => {
    try {
      await submitMutation.mutateAsync(id!);
      showToast('Inspectie ingediend ter beoordeling', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Indienen mislukt'), 'error');
    }
  };

  const handleReview = async (decision: 'approve' | 'reject') => {
    try {
      await reviewMutation.mutateAsync({ id: id!, decision, notes: reviewNotes || undefined });
      showToast(decision === 'approve' ? 'Inspectie goedgekeurd' : 'Inspectie afgekeurd', 'success');
      setReviewNotes('');
    } catch (err) {
      showToast(getErrorMessage(err, 'Beoordeling mislukt'), 'error');
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
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const awaitingReview = !!plan.submittedAt && !plan.reviewedAt;
  const canSubmit = userCanWrite && !plan.submittedAt;

  const tabs = [
    { key: 'overzicht' as const, label: 'Overzicht' },
    { key: 'assets' as const, label: 'Assets', count: assets.length },
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
                  <div className="flex gap-2">
                    <Button type="submit" disabled={!isDirty} isLoading={updateMutation.isPending}>Opslaan</Button>
                    <Button type="button" variant="secondary" onClick={() => { resetForm(); setIsEditing(false); }}>Annuleren</Button>
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

        {activeTab === 'assets' && <AssetsTab assets={assets} isLoading={assetsLoading} />}

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
