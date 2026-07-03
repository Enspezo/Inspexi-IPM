import { Link } from 'react-router-dom';
import type { UseFormRegister, FieldErrors } from 'react-hook-form';
import { Card, Button, InfoField } from '@/components/ui';
import { WORK_ORDER_STATUS, getStatusConfig } from '@/lib/status';
import { WorkOrderStatus } from '@/types';
import type { WorkOrder } from '@/types';
import { PhaseSelect, PhaseInfoField } from '@/components/projects/phase-select';
import { useFeatures } from '@/providers/feature-provider';
import { useUpdateWorkOrder } from '../hooks/use-work-orders';
import type { EditFormData } from './work-order-detail-shared';

export function WorkOrderAlgemeenTab({
  workOrder,
  userCanWrite,
  isEditing,
  setIsEditing,
  contactName,
  locationStr,
  inspectorNames,
  register,
  errors,
  isDirty,
  onSubmit,
  handleCancelEdit,
  updateWorkOrder,
  projectId,
  phaseId,
  setPhaseId,
  phaseDirty,
}: {
  workOrder: WorkOrder;
  userCanWrite: boolean;
  isEditing: boolean;
  setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  contactName: string;
  locationStr: string;
  inspectorNames: string;
  register: UseFormRegister<EditFormData>;
  errors: FieldErrors<EditFormData>;
  isDirty: boolean;
  onSubmit: React.FormEventHandler<HTMLFormElement>;
  handleCancelEdit: () => void;
  updateWorkOrder: ReturnType<typeof useUpdateWorkOrder>;
  projectId: string | null;
  phaseId: string | null;
  setPhaseId: (value: string | null) => void;
  phaseDirty: boolean;
}) {
  const { hasFeature } = useFeatures();
  // PRD-12 §Fase E: fase-koppeling alleen bij de PROJECT_FASEN-entitlement.
  const showPhase = hasFeature('PROJECT_FASEN');
  return (
    <div className="space-y-6">
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">
              Werkbongegevens
            </h3>
            {userCanWrite &&
              !isEditing &&
              workOrder.status !== WorkOrderStatus.UITGEVOERD && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                >
                  Bewerken
                </Button>
              )}
          </div>

          {!isEditing ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoField
                label="Werkbonnummer"
                value={workOrder.workOrderNumber}
              />
              <InfoField
                label="Status"
                value={getStatusConfig(WORK_ORDER_STATUS, workOrder.status).label}
              />
              <div>
                <dt className="text-sm font-medium text-gray-500">
                  Planregel
                </dt>
                <dd className="mt-1 text-sm">
                  {workOrder.planningItem ? (
                    <Link
                      to={`/planning/${workOrder.planningItem.id}`}
                      className="text-primary-600 hover:text-primary-800 hover:underline"
                    >
                      {workOrder.planningItem.productName}
                    </Link>
                  ) : (
                    <span className="text-gray-900">—</span>
                  )}
                </dd>
              </div>
              <InfoField label="Relatie" value={contactName} />
              <InfoField label="Locatie" value={locationStr} />
              <InfoField label="Inspecteur(s)" value={inspectorNames} />
              {showPhase && (
                <PhaseInfoField phase={workOrder.projectPhase} projectId={projectId} />
              )}
              <InfoField
                label="Starttijd"
                value={
                  workOrder.startTime
                    ? new Date(workOrder.startTime).toLocaleString(
                        'nl-NL',
                      )
                    : null
                }
              />
              <InfoField
                label="Eindtijd"
                value={
                  workOrder.endTime
                    ? new Date(workOrder.endTime).toLocaleString('nl-NL')
                    : null
                }
              />
              <div className="sm:col-span-2">
                <InfoField
                  label="Interne notities"
                  value={workOrder.internalNotes}
                />
              </div>
              <InfoField
                label="Aangemaakt op"
                value={new Date(workOrder.createdAt).toLocaleString(
                  'nl-NL',
                )}
              />
              <InfoField
                label="Aangemaakt door"
                value={
                  workOrder.createdByUser
                    ? `${workOrder.createdByUser.firstName} ${workOrder.createdByUser.lastName}`
                    : null
                }
              />
            </dl>
          ) : (
            <form
              onSubmit={onSubmit}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Starttijd
                  </label>
                  <input
                    type="datetime-local"
                    {...register('startTime')}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  {errors.startTime && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.startTime.message}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Eindtijd
                  </label>
                  <input
                    type="datetime-local"
                    {...register('endTime')}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                  />
                  {errors.endTime && (
                    <p className="mt-1 text-xs text-red-600">
                      {errors.endTime.message}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Interne notities
                </label>
                <textarea
                  {...register('internalNotes')}
                  rows={4}
                  className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              {showPhase && (
                <PhaseSelect projectId={projectId} value={phaseId} onChange={setPhaseId} />
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={!isDirty && !phaseDirty}
                  isLoading={updateWorkOrder.isPending}
                >
                  Opslaan
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleCancelEdit}
                >
                  Annuleren
                </Button>
              </div>
            </form>
          )}
        </div>
      </Card>
    </div>
  );
}
