import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProjectStatus } from '@/types';
import type { Project } from '@/types';
import { Button, InfoField, StatusBadge, Input, Select, Card } from '@/components/ui';
import { PROJECT_STATUS } from '@/lib/status';
import type { ProjectLocation } from '../hooks/use-projects';

// ─── Constants ─────────────────────────────────────────────

const statusOptions = [
  { value: ProjectStatus.ACTIEF, label: 'Actief' },
  { value: ProjectStatus.ON_HOLD, label: 'On hold' },
  { value: ProjectStatus.AFGEROND, label: 'Afgerond' },
  { value: ProjectStatus.GEANNULEERD, label: 'Geannuleerd' },
];

// ─── Settings schema ────────────────────────────────────────

const settingsSchema = z.object({
  title: z.string().min(1, 'Titel is verplicht'),
  description: z.string().optional(),
  status: z.nativeEnum(ProjectStatus),
  projectManagerId: z.string().optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
  endDate: z.string().optional(),
});

type SettingsForm = z.infer<typeof settingsSchema>;

// ─── Overview Tab ──────────────────────────────────────────

export function OverviewTab({
  project,
  contactName,
  canWrite,
  users,
  linkedLocations,
  phaseProgress,
  onUpdate,
  isUpdating,
  onDelete,
}: {
  project: Project;
  contactName: string;
  canWrite: boolean;
  users: { value: string; label: string }[];
  linkedLocations: ProjectLocation[];
  phaseProgress?: { done: number; total: number } | null;
  onUpdate: (data: any) => Promise<void>;
  isUpdating: boolean;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
  });

  // Populate form with project data
  useEffect(() => {
    if (project) {
      resetForm({
        title: project.title,
        description: project.description || '',
        status: project.status,
        projectManagerId: project.projectManagerId || '',
        startDate: project.startDate?.split('T')[0] || '',
        expectedEndDate: project.expectedEndDate?.split('T')[0] || '',
        endDate: project.endDate?.split('T')[0] || '',
      });
    }
  }, [project, resetForm]);

  const handleSave = async (data: SettingsForm) => {
    await onUpdate(data);
    setIsEditing(false);
  };

  const handleCancel = () => {
    resetForm({
      title: project.title,
      description: project.description || '',
      status: project.status,
      projectManagerId: project.projectManagerId || '',
      startDate: project.startDate?.split('T')[0] || '',
      expectedEndDate: project.expectedEndDate?.split('T')[0] || '',
      endDate: project.endDate?.split('T')[0] || '',
    });
    setIsEditing(false);
  };

  return (
    <div className="space-y-6">
      {!isEditing ? (
        /* ── Read-only mode ── */
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <h3 className="mb-4 font-semibold text-gray-900">Projectgegevens</h3>
              <dl className="space-y-3">
                <InfoField label="Projectnummer" value={project.projectNumber} />
                <InfoField label="Titel" value={project.title} />
                <InfoField label="Beschrijving" value={project.description} />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <StatusBadge status={project.status} map={PROJECT_STATUS} />
                  </dd>
                </div>
                {phaseProgress && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Fasen</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {phaseProgress.done} van {phaseProgress.total} fasen afgerond
                    </dd>
                  </div>
                )}
              </dl>
            </Card>

            <Card>
              <h3 className="mb-4 font-semibold text-gray-900">Details</h3>
              <dl className="space-y-3">
                <InfoField label="Relatie" value={contactName} />
                <InfoField
                  label="Projectmanager"
                  value={
                    project.projectManager
                      ? `${project.projectManager.firstName} ${project.projectManager.lastName}`
                      : null
                  }
                />
                <InfoField
                  label="Startdatum"
                  value={project.startDate ? new Date(project.startDate).toLocaleDateString('nl-NL') : null}
                />
                <InfoField
                  label="Verwachte einddatum"
                  value={project.expectedEndDate ? new Date(project.expectedEndDate).toLocaleDateString('nl-NL') : null}
                />
                <InfoField
                  label="Einddatum"
                  value={project.endDate ? new Date(project.endDate).toLocaleDateString('nl-NL') : null}
                />
              </dl>
            </Card>

            <Card>
              <h3 className="mb-4 font-semibold text-gray-900">Locaties</h3>
              {linkedLocations.length > 0 ? (
                <ul className="space-y-2">
                  {linkedLocations.map((loc) => (
                    <li key={loc.id} className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                      <div className="text-sm font-medium text-gray-900">{loc.name}</div>
                      <div className="text-xs text-gray-500">
                        {loc.street} {loc.houseNumber}, {loc.postalCode} {loc.city}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">
                  Nog geen locaties gekoppeld via aanvragen, offertes of planregels.
                </p>
              )}
            </Card>

            {/* Quick counts */}
            {project._count && (
              <Card>
                <h3 className="mb-4 font-semibold text-gray-900">Gekoppelde items</h3>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {project._count.requests}
                    </div>
                    <div className="text-xs text-gray-500">Aanvragen</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {project._count.quotes}
                    </div>
                    <div className="text-xs text-gray-500">Offertes</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {project._count.planningItems}
                    </div>
                    <div className="text-xs text-gray-500">Planregels</div>
                  </div>
                </div>
              </Card>
            )}
          </div>


          {/* Bottom actions */}
          <div className="flex items-center justify-between border-t border-gray-200 pt-6">
            <p className="text-xs text-gray-400">
              Aangemaakt op {new Date(project.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {project.createdByUser && ` door ${project.createdByUser.firstName} ${project.createdByUser.lastName}`}
            </p>
            {canWrite && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setIsEditing(true)}>
                  Bewerken
                </Button>
                <Button variant="danger" onClick={onDelete}>
                  Verwijderen
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ── Edit mode ── */
        <Card>
          <h3 className="mb-4 font-semibold text-gray-900">Project bewerken</h3>
          <form onSubmit={handleSubmit(handleSave)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Titel *
                </label>
                <Input {...register('title')} />
                {errors.title && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.title.message}
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Status
                </label>
                <Select options={statusOptions} {...register('status')} />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Beschrijving
              </label>
              <textarea
                {...register('description')}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                rows={3}
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Projectmanager
              </label>
              <Select
                options={[
                  { value: '', label: 'Geen' },
                  ...users,
                ]}
                {...register('projectManagerId')}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Startdatum
                </label>
                <Input type="date" {...register('startDate')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Verwachte einddatum
                </label>
                <Input type="date" {...register('expectedEndDate')} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Einddatum
                </label>
                <Input type="date" {...register('endDate')} />
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-gray-100 pt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCancel}
                disabled={isUpdating}
              >
                Annuleren
              </Button>
              <Button
                type="submit"
                isLoading={isUpdating}
                disabled={!isDirty}
              >
                Opslaan
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
