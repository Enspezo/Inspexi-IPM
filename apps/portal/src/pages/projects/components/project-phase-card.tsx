import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Button,
  Card,
  Checkbox,
  InfoField,
  Input,
  Select,
  Spinner,
  StatusBadge,
  Tabs,
  DragHandle,
  useConfirm,
  useToast,
} from '@/components/ui';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { formatDate, formatCurrency } from '@/lib/format';
import { PHASE_STATUS, MILESTONE_STATUS } from '@/lib/status';
import { PhaseStatus, MilestoneStatus } from '@/types';
import type { ProjectPhase, PhaseMilestone } from '@/types';
import {
  useUpdatePhase,
  useDeletePhase,
  usePhaseMilestones,
  useCreateMilestone,
  useUpdateMilestone,
  useDeleteMilestone,
  usePhaseFollowers,
  useAddPhaseFollower,
  useUpdatePhaseFollower,
  useRemovePhaseFollower,
} from '../hooks/use-project-phases';
import { summarizeMilestones } from './project-phases.helpers';
import { PhaseMilestoneModal } from './phase-milestone-modal';
import { AddFollowerModal } from './add-follower-modal';
import { PhaseActivitySection } from './phase-activity-section';

// ─── Types ─────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
}

interface LinkedEntity {
  id: string;
  projectPhaseId?: string | null;
  [key: string]: unknown;
}

interface PhaseCardProps {
  projectId: string;
  phase: ProjectPhase;
  index: number;
  canWrite: boolean;
  expanded: boolean;
  onToggle: () => void;
  dragHandleProps: Record<string, unknown>;
  locationOptions: SelectOption[];
  contactPersonOptions: SelectOption[];
  projectQuotes: LinkedEntity[];
  projectPlanning: LinkedEntity[];
}

const STATUS_OPTIONS = Object.values(PhaseStatus).map((s) => ({
  value: s,
  label: PHASE_STATUS[s].label,
}));

// ─── Details form ──────────────────────────────────────────

const detailsSchema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  status: z.nativeEnum(PhaseStatus),
  description: z.string().optional(),
  locationId: z.string().optional(),
  contactPersonId: z.string().optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  budgetAmount: z.string().optional(),
});

type DetailsForm = z.infer<typeof detailsSchema>;

// ─── PhaseCard ─────────────────────────────────────────────

export function PhaseCard({
  projectId,
  phase,
  index,
  canWrite,
  expanded,
  onToggle,
  dragHandleProps,
  locationOptions,
  contactPersonOptions,
  projectQuotes,
  projectPlanning,
}: PhaseCardProps) {
  const summary = summarizeMilestones(phase.milestones);
  const contactPersonName = phase.contactPerson
    ? `${phase.contactPerson.firstName ?? ''} ${phase.contactPerson.lastName ?? ''}`.trim()
    : null;
  const dateRange =
    phase.startDate || phase.expectedEndDate
      ? `${formatDate(phase.startDate)} – ${formatDate(phase.expectedEndDate)}`
      : null;
  const counts = phase._count;

  return (
    <Card className="mb-3">
      {/* Header */}
      <div className="flex items-start gap-3">
        {canWrite && <DragHandle {...dragHandleProps} className="mt-1" />}
        <button
          type="button"
          onClick={onToggle}
          className="flex flex-1 flex-col gap-2 text-left"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-gray-900">
              Fase {index + 1} — {phase.name}
            </span>
            <StatusBadge status={phase.status} map={PHASE_STATUS} />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {phase.location && (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                {phase.location.name}
              </span>
            )}
            {contactPersonName && (
              <span className="inline-flex items-center gap-1">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                {contactPersonName}
              </span>
            )}
            {dateRange && <span>{dateRange}</span>}
            <span className={summary.accent === 'red' ? 'text-red-600' : ''}>
              {summary.label}
            </span>
          </div>
          {counts && (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-400">
              <span>{counts.inspectionPlans} inspectieplan(nen)</span>
              <span>{counts.planningItems} planregel(s)</span>
              <span>{counts.workOrders} werkbon(nen)</span>
              <span>{counts.quotes} offerte(s)</span>
            </div>
          )}
        </button>
        <svg
          className={`mt-1 h-5 w-5 flex-shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <PhaseCardExpanded
          projectId={projectId}
          phase={phase}
          canWrite={canWrite}
          locationOptions={locationOptions}
          contactPersonOptions={contactPersonOptions}
          projectQuotes={projectQuotes}
          projectPlanning={projectPlanning}
        />
      )}
    </Card>
  );
}

// ─── Expanded content (own component so hooks only run when open) ─────────

type Section = 'details' | 'milestones' | 'koppelingen' | 'activiteit';

function PhaseCardExpanded({
  projectId,
  phase,
  canWrite,
  locationOptions,
  contactPersonOptions,
  projectQuotes,
  projectPlanning,
}: {
  projectId: string;
  phase: ProjectPhase;
  canWrite: boolean;
  locationOptions: SelectOption[];
  contactPersonOptions: SelectOption[];
  projectQuotes: LinkedEntity[];
  projectPlanning: LinkedEntity[];
}) {
  const [section, setSection] = useState<Section>('details');
  const { data: followers } = usePhaseFollowers(projectId, phase.id);

  const sections: { key: Section; label: string; count?: number }[] = [
    { key: 'details', label: 'Details' },
    { key: 'milestones', label: 'Milestones', count: phase._count?.milestones },
    { key: 'koppelingen', label: 'Volgers & koppelingen', count: followers?.length },
    { key: 'activiteit', label: 'Taken & documenten' },
  ];

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <Tabs tabs={sections} active={section} onChange={setSection} />

      <div className="mt-4">
        {section === 'details' && (
          <DetailsSection
            projectId={projectId}
            phase={phase}
            canWrite={canWrite}
            locationOptions={locationOptions}
            contactPersonOptions={contactPersonOptions}
          />
        )}
        {section === 'milestones' && (
          <MilestonesSection projectId={projectId} phase={phase} canWrite={canWrite} />
        )}
        {section === 'koppelingen' && (
          <LinksSection
            projectId={projectId}
            phase={phase}
            canWrite={canWrite}
            followers={followers ?? []}
            projectQuotes={projectQuotes}
            projectPlanning={projectPlanning}
          />
        )}
        {section === 'activiteit' && (
          <PhaseActivitySection phaseId={phase.id} canWrite={canWrite} />
        )}
      </div>

      <div className="mt-6">
        <AuditHistory entityType="ProjectPhase" entityId={phase.id} />
      </div>
    </div>
  );
}

// ─── Details section (inline edit) ─────────────────────────

function DetailsSection({
  projectId,
  phase,
  canWrite,
  locationOptions,
  contactPersonOptions,
}: {
  projectId: string;
  phase: ProjectPhase;
  canWrite: boolean;
  locationOptions: SelectOption[];
  contactPersonOptions: SelectOption[];
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const updateMutation = useUpdatePhase(projectId);
  const deleteMutation = useDeletePhase(projectId);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<DetailsForm>({ resolver: zodResolver(detailsSchema) });

  const populate = () =>
    resetForm({
      name: phase.name,
      status: phase.status,
      description: phase.description ?? '',
      locationId: phase.locationId ?? '',
      contactPersonId: phase.contactPersonId ?? '',
      startDate: phase.startDate?.split('T')[0] ?? '',
      expectedEndDate: phase.expectedEndDate?.split('T')[0] ?? '',
      budgetAmount: phase.budgetAmount != null ? String(phase.budgetAmount) : '',
    });

  useEffect(() => {
    populate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const handleSave = async (data: DetailsForm) => {
    try {
      await updateMutation.mutateAsync({
        id: phase.id,
        data: {
          name: data.name,
          status: data.status,
          description: data.description || null,
          locationId: data.locationId || null,
          contactPersonId: data.contactPersonId || null,
          startDate: data.startDate || null,
          expectedEndDate: data.expectedEndDate || null,
          ...(canWrite
            ? {
                budgetAmount:
                  data.budgetAmount != null && data.budgetAmount !== ''
                    ? Number(data.budgetAmount)
                    : null,
              }
            : {}),
        },
      });
      showToast('Fase bijgewerkt', 'success');
      setIsEditing(false);
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Fase verwijderen',
      message: `Weet je zeker dat je "${phase.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(phase.id);
      showToast('Fase verwijderd', 'success');
    } catch (err) {
      // Toont de API-melding met aantallen wanneer er nog koppelingen zijn (§12.4.7).
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const contactPersonName = phase.contactPerson
    ? `${phase.contactPerson.firstName ?? ''} ${phase.contactPerson.lastName ?? ''}`.trim()
    : null;

  if (!isEditing) {
    return (
      <div className="space-y-4">
        <dl className="grid gap-4 sm:grid-cols-2">
          <InfoField label="Naam" value={phase.name} />
          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1">
              <StatusBadge status={phase.status} map={PHASE_STATUS} />
            </dd>
          </div>
          <InfoField label="Beschrijving" value={phase.description} />
          <InfoField label="Locatie" value={phase.location?.name} />
          <InfoField label="Contactpersoon" value={contactPersonName} />
          <InfoField label="Startdatum" value={formatDate(phase.startDate)} />
          <InfoField label="Verwachte einddatum" value={formatDate(phase.expectedEndDate)} />
          {phase.status === PhaseStatus.AFGEROND && (
            <InfoField label="Afgerond op" value={formatDate(phase.completedAt)} />
          )}
          {canWrite && (
            <InfoField label="Budget" value={formatCurrency(phase.budgetAmount ?? null)} />
          )}
        </dl>
        {canWrite && (
          <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
            <Button variant="secondary" onClick={() => setIsEditing(true)}>
              Bewerken
            </Button>
            <Button variant="danger" onClick={handleDelete} isLoading={deleteMutation.isPending}>
              Verwijderen
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Naam *</label>
          <Input {...register('name')} />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Status</label>
          <Select options={STATUS_OPTIONS} {...register('status')} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Beschrijving</label>
        <textarea
          {...register('description')}
          rows={2}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Locatie</label>
          <Select
            options={[{ value: '', label: 'Geen' }, ...locationOptions]}
            {...register('locationId')}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Contactpersoon</label>
          <Select
            options={[{ value: '', label: 'Geen' }, ...contactPersonOptions]}
            {...register('contactPersonId')}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Startdatum</label>
          <Input type="date" {...register('startDate')} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Verwachte einddatum</label>
          <Input type="date" {...register('expectedEndDate')} />
        </div>
        {canWrite && (
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Budget (€)</label>
            <Input type="number" step="0.01" min={0} {...register('budgetAmount')} />
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            populate();
            setIsEditing(false);
          }}
          disabled={updateMutation.isPending}
        >
          Annuleren
        </Button>
        <Button type="submit" isLoading={updateMutation.isPending} disabled={!isDirty}>
          Opslaan
        </Button>
      </div>
    </form>
  );
}

// ─── Milestones section ────────────────────────────────────

function MilestonesSection({
  projectId,
  phase,
  canWrite,
}: {
  projectId: string;
  phase: ProjectPhase;
  canWrite: boolean;
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: milestones, isLoading } = usePhaseMilestones(projectId, phase.id);
  const createMutation = useCreateMilestone(projectId, phase.id);
  const updateMutation = useUpdateMilestone(projectId, phase.id);
  const deleteMutation = useDeleteMilestone(projectId, phase.id);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PhaseMilestone | undefined>();

  const isVerlopen = (m: PhaseMilestone) =>
    m.status === MilestoneStatus.OPEN &&
    new Date(m.dueDate).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);

  const handleStatus = async (m: PhaseMilestone, status: MilestoneStatus) => {
    try {
      await updateMutation.mutateAsync({ id: m.id, data: { status } });
    } catch (err) {
      showToast(getErrorMessage(err, 'Status wijzigen mislukt'), 'error');
    }
  };

  const handleDelete = async (m: PhaseMilestone) => {
    const ok = await confirm({
      title: 'Milestone verwijderen',
      message: `Weet je zeker dat je "${m.title}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(m.id);
      showToast('Milestone verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {(milestones ?? []).length === 0 && (
        <p className="text-sm text-gray-500">Nog geen milestones.</p>
      )}

      {(milestones ?? []).map((m) => {
        const verlopen = isVerlopen(m);
        const assigneeName = m.assignee
          ? `${m.assignee.firstName} ${m.assignee.lastName}`
          : null;
        return (
          <div
            key={m.id}
            className={`rounded-lg border p-3 ${verlopen ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{m.title}</span>
                  <StatusBadge status={m.status} map={MILESTONE_STATUS} />
                  {verlopen && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Verlopen
                    </span>
                  )}
                </div>
                {m.description && (
                  <p className="mt-1 text-xs text-gray-500">{m.description}</p>
                )}
                <p className="mt-1 text-xs text-gray-500">
                  Streefdatum: {formatDate(m.dueDate)}
                  {assigneeName && ` · ${assigneeName}`}
                </p>
              </div>
              {canWrite && (
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Select
                    options={Object.values(MilestoneStatus).map((s) => ({
                      value: s,
                      label: MILESTONE_STATUS[s].label,
                    }))}
                    value={m.status}
                    onChange={(e) => handleStatus(m, e.target.value as MilestoneStatus)}
                  />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setEditing(m);
                      setModalOpen(true);
                    }}
                  >
                    Bewerken
                  </Button>
                  <Button variant="ghost" onClick={() => handleDelete(m)}>
                    Verwijderen
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {canWrite && (
        <button
          type="button"
          onClick={() => {
            setEditing(undefined);
            setModalOpen(true);
          }}
          className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-800"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Milestone
        </button>
      )}

      {modalOpen && (
        <PhaseMilestoneModal
          milestone={editing}
          isSaving={createMutation.isPending || updateMutation.isPending}
          onClose={() => setModalOpen(false)}
          onSubmit={async (data) => {
            try {
              if (editing) {
                await updateMutation.mutateAsync({ id: editing.id, data });
                showToast('Milestone bijgewerkt', 'success');
              } else {
                await createMutation.mutateAsync({
                  title: data.title,
                  description: data.description,
                  dueDate: data.dueDate,
                  assigneeId: data.assigneeId ?? undefined,
                  reminderDaysBefore: data.reminderDaysBefore,
                });
                showToast('Milestone toegevoegd', 'success');
              }
              setModalOpen(false);
            } catch (err) {
              showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Volgers & koppelingen section ─────────────────────────

const PERMISSION_FIELDS = [
  { key: 'canViewGeneral' as const, label: 'Algemeen' },
  { key: 'canViewRequests' as const, label: 'Aanvragen' },
  { key: 'canViewQuotes' as const, label: 'Offertes' },
  { key: 'canViewPlanning' as const, label: 'Planning' },
  { key: 'canViewDocuments' as const, label: 'Documenten' },
];

function LinksSection({
  projectId,
  phase,
  canWrite,
  followers,
  projectQuotes,
  projectPlanning,
}: {
  projectId: string;
  phase: ProjectPhase;
  canWrite: boolean;
  followers: import('@/types').ProjectPhaseFollower[];
  projectQuotes: LinkedEntity[];
  projectPlanning: LinkedEntity[];
}) {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const addFollower = useAddPhaseFollower(projectId, phase.id);
  const updateFollower = useUpdatePhaseFollower(projectId, phase.id);
  const removeFollower = useRemovePhaseFollower(projectId, phase.id);
  const [addOpen, setAddOpen] = useState(false);

  // Offerte-fallback (§12.4.3): eigen fase-offertes, anders die van het project.
  const ownQuotes = projectQuotes.filter((q) => q.projectPhaseId === phase.id);
  const quotesToShow = ownQuotes.length > 0 ? ownQuotes : projectQuotes;
  const quotesAreFallback = ownQuotes.length === 0 && projectQuotes.length > 0;
  const ownPlanning = projectPlanning.filter((p) => p.projectPhaseId === phase.id);

  // Ontkoppelen = projectPhaseId op de entiteit legen (Fase A-API accepteert dit).
  const unlinkMutation = useMutation({
    mutationFn: ({ kind, id }: { kind: 'quotes' | 'planning'; id: string }) =>
      apiClient.patch(`/${kind}/${id}`, { projectPhaseId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      queryClient.invalidateQueries({ queryKey: ['project-phases', projectId] });
    },
  });

  const handleUnlink = async (kind: 'quotes' | 'planning', id: string, label: string) => {
    const ok = await confirm({
      title: 'Ontkoppelen',
      message: `"${label}" ontkoppelen van deze fase?`,
      confirmLabel: 'Ontkoppelen',
    });
    if (!ok) return;
    try {
      await unlinkMutation.mutateAsync({ kind, id });
      showToast('Ontkoppeld', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Ontkoppelen mislukt'), 'error');
    }
  };

  const handleRemoveFollower = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Volger verwijderen',
      message: `${name} als volger verwijderen?`,
      confirmLabel: 'Verwijderen',
    });
    if (!ok) return;
    try {
      await removeFollower.mutateAsync(id);
      showToast('Volger verwijderd', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Verwijderen mislukt'), 'error');
    }
  };

  const counts = phase._count;

  return (
    <div className="space-y-6">
      {/* Volgers */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-gray-900">Volgers</h4>
          {canWrite && (
            <Button variant="secondary" onClick={() => setAddOpen(true)}>
              Volger toevoegen
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {followers.length === 0 && (
            <p className="text-sm text-gray-500">Geen volgers.</p>
          )}
          {followers.map((f) => {
            const isInternal = !!f.userId;
            const name = isInternal
              ? `${f.user?.firstName ?? ''} ${f.user?.lastName ?? ''}`.trim() ||
                f.user?.email ||
                '—'
              : f.name || f.email || '—';
            return (
              <div key={f.id} className="rounded-lg border border-gray-200 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium text-gray-900">{name}</span>
                    {!isInternal && f.email && (
                      <span className="ml-2 text-xs text-gray-500">{f.email}</span>
                    )}
                    {isInternal && (
                      <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                        Medewerker
                      </span>
                    )}
                  </div>
                  {canWrite && (
                    <Button variant="ghost" onClick={() => handleRemoveFollower(f.id, name)}>
                      Verwijderen
                    </Button>
                  )}
                </div>
                {!isInternal && (
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-gray-100 pt-2">
                    {PERMISSION_FIELDS.map(({ key, label }) => (
                      <Checkbox
                        key={key}
                        label={label}
                        checked={f[key]}
                        disabled={!canWrite}
                        onChange={(e) =>
                          updateFollower.mutate({
                            followerId: f.id,
                            data: { [key]: e.target.checked },
                          })
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Gekoppelde entiteiten */}
      <div>
        <h4 className="mb-2 text-sm font-semibold text-gray-900">Gekoppelde items</h4>
        {counts && (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: 'Inspectieplannen', value: counts.inspectionPlans },
              { label: 'Planregels', value: counts.planningItems },
              { label: 'Werkbonnen', value: counts.workOrders },
              { label: 'Offertes', value: counts.quotes },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-gray-100 bg-gray-50 p-2 text-center">
                <div className="text-lg font-bold text-gray-900">{c.value}</div>
                <div className="text-xs text-gray-500">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Offertes met fallback-weergave */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Offertes</span>
            {quotesAreFallback && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                via project
              </span>
            )}
          </div>
          {quotesToShow.length === 0 ? (
            <p className="text-sm text-gray-500">Geen offertes.</p>
          ) : (
            quotesToShow.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
              >
                <Link
                  to={`/quotes/${q.id}`}
                  className="text-sm text-gray-900 hover:text-primary-600"
                >
                  {(q.quoteNumber as string) || (q.subject as string) || 'Offerte'}
                </Link>
                {!quotesAreFallback && canWrite && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      handleUnlink('quotes', q.id, (q.quoteNumber as string) || 'offerte')
                    }
                  >
                    Ontkoppelen
                  </Button>
                )}
              </div>
            ))
          )}
        </div>

        {/* Gekoppelde planregels */}
        {ownPlanning.length > 0 && (
          <div className="mt-3 space-y-2">
            <span className="text-xs font-medium text-gray-500">Planregels</span>
            {ownPlanning.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2"
              >
                <Link
                  to={`/planning/${p.id}`}
                  className="text-sm text-gray-900 hover:text-primary-600"
                >
                  {(p.productName as string) || 'Planregel'}
                </Link>
                {canWrite && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      handleUnlink('planning', p.id, (p.productName as string) || 'planregel')
                    }
                  >
                    Ontkoppelen
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <AddFollowerModal
          projectId={phase.id}
          isAdding={addFollower.isPending}
          onClose={() => setAddOpen(false)}
          onAdd={async (data) => {
            try {
              await addFollower.mutateAsync(data);
              showToast('Volger toegevoegd', 'success');
              setAddOpen(false);
            } catch (err) {
              showToast(getErrorMessage(err, 'Toevoegen mislukt'), 'error');
            }
          }}
        />
      )}
    </div>
  );
}
