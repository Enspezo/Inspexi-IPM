import { useState } from 'react';
import { Link } from 'react-router-dom';
import { PlanningStatus } from '@/types';
import type { ContactPerson, PlanningItem } from '@/types';
import { Button, Card, Input, StatusBadge, useToast } from '@/components/ui';
import { ACCEPTANCE_STATUS, WORK_ORDER_STATUS } from '@/lib/status';
import { PhaseSelect, PhaseInfoField } from '@/components/projects/phase-select';
import { useFeatures } from '@/providers/feature-provider';
import { useUpdatePlanningItem } from '../hooks/use-planning';
import { useCreateWorkOrder, usePlanningWorkOrders } from '@/pages/work-orders/hooks/use-work-orders';
import { toDatetimeLocal } from './planning-detail-shared';
import { getErrorMessage } from '@/lib/api-client';

export function PlanningAlgemeenTab({
  id,
  item,
  canEditDirectly,
  userCanWrite,
  contactName,
  locationStr,
  editMode,
  setEditMode,
  editProductName,
  setEditProductName,
  editScheduledDate,
  setEditScheduledDate,
  editDurationHours,
  setEditDurationHours,
  editInternalNotes,
  setEditInternalNotes,
  editContactPersonId,
  setEditContactPersonId,
  editLocationId,
  setEditLocationId,
  editingContactPerson,
  setEditingContactPerson,
  quickContactPersonId,
  setQuickContactPersonId,
  allContactPersons,
  editLocations,
  workOrdersData,
}: {
  id: string;
  item: PlanningItem;
  canEditDirectly: boolean;
  userCanWrite: boolean;
  contactName: string;
  locationStr: string;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  editProductName: string;
  setEditProductName: React.Dispatch<React.SetStateAction<string>>;
  editScheduledDate: string;
  setEditScheduledDate: React.Dispatch<React.SetStateAction<string>>;
  editDurationHours: string;
  setEditDurationHours: React.Dispatch<React.SetStateAction<string>>;
  editInternalNotes: string;
  setEditInternalNotes: React.Dispatch<React.SetStateAction<string>>;
  editContactPersonId: string | null;
  setEditContactPersonId: React.Dispatch<React.SetStateAction<string | null>>;
  editLocationId: string | null;
  setEditLocationId: React.Dispatch<React.SetStateAction<string | null>>;
  editingContactPerson: boolean;
  setEditingContactPerson: React.Dispatch<React.SetStateAction<boolean>>;
  quickContactPersonId: string | null;
  setQuickContactPersonId: React.Dispatch<React.SetStateAction<string | null>>;
  allContactPersons: ContactPerson[];
  editLocations: any[];
  workOrdersData: ReturnType<typeof usePlanningWorkOrders>['data'];
}) {
  const { showToast } = useToast();
  const { hasFeature } = useFeatures();
  // PRD-12 §Fase E: fase-koppeling alleen tonen bij de PROJECT_FASEN-entitlement.
  const showPhase = hasFeature('PROJECT_FASEN');
  const updateItem = useUpdatePlanningItem(id);
  const createWorkOrder = useCreateWorkOrder();
  // Fase-koppeling lokaal beheerd (blijft buiten de door de parent doorgegeven edit-state).
  const [editPhaseId, setEditPhaseId] = useState<string | null>(item.projectPhaseId ?? null);

  const handleOpenEdit = () => {
    setEditProductName(item.productName ?? '');
    setEditScheduledDate(toDatetimeLocal(item.scheduledDate));
    setEditDurationHours(item.durationHours ? String(item.durationHours) : '');
    setEditInternalNotes(item.internalNotes ?? '');
    setEditContactPersonId(item.contactPersonId ?? null);
    setEditLocationId(item.locationId ?? null);
    setEditPhaseId(item.projectPhaseId ?? null);
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    try {
      await updateItem.mutateAsync({
        productName: editProductName || undefined,
        scheduledDate: editScheduledDate ? new Date(editScheduledDate).toISOString() : null,
        durationHours: editDurationHours ? Number(editDurationHours) : null,
        internalNotes: editInternalNotes || null,
        contactPersonId: editContactPersonId ?? null,
        locationId: editLocationId ?? undefined,
        ...(editPhaseId !== (item.projectPhaseId ?? null)
          ? { projectPhaseId: editPhaseId }
          : {}),
      });
      setEditMode(false);
      showToast('Planregel bijgewerkt', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Fout bij opslaan'), 'error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Afspraakgegevens */}
      <Card>
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Afspraakgegevens</h3>
            {canEditDirectly && !editMode && (
              <Button variant="secondary" size="sm" onClick={handleOpenEdit}>
                Bewerken
              </Button>
            )}
          </div>

          {editMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contactpersoon (optioneel)</label>
                <select
                  value={editContactPersonId ?? ''}
                  onChange={(e) => setEditContactPersonId(e.target.value || null)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Geen contactpersoon —</option>
                  {allContactPersons.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.firstName} {p.lastName}{p.role?.label ? ` (${p.role.label})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {editLocations.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Locatie (optioneel)</label>
                  <select
                    value={editLocationId ?? ''}
                    onChange={(e) => setEditLocationId(e.target.value || null)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Geen locatie —</option>
                    {editLocations.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {l.name ? `${l.name} — ` : ''}{[l.street, l.houseNumber, l.city].filter(Boolean).join(' ')}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dienst / omschrijving</label>
                <Input
                  value={editProductName}
                  onChange={(e) => setEditProductName(e.target.value)}
                  placeholder="Naam van de dienst"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Datum & tijd</label>
                  <input
                    type="datetime-local"
                    value={editScheduledDate}
                    onChange={(e) => setEditScheduledDate(e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Duur (uur)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.5"
                    value={editDurationHours}
                    onChange={(e) => setEditDurationHours(e.target.value)}
                    placeholder="bijv. 2"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interne notities</label>
                <textarea
                  value={editInternalNotes}
                  onChange={(e) => setEditInternalNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optionele notities..."
                />
              </div>
              {showPhase && (
                <PhaseSelect
                  projectId={item.projectId}
                  value={editPhaseId}
                  onChange={setEditPhaseId}
                />
              )}
              <div className="flex gap-2 pt-1">
                <Button onClick={handleSaveEdit} disabled={updateItem.isPending}>
                  {updateItem.isPending ? 'Opslaan...' : 'Opslaan'}
                </Button>
                <Button variant="secondary" onClick={() => setEditMode(false)}>
                  Annuleren
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm font-medium text-gray-500">Opdrachtgever</dt>
                <dd className="mt-1 text-sm text-gray-900">{contactName}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Contactpersoon</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {editingContactPerson ? (
                    <div className="flex items-center gap-2">
                      <select
                        value={quickContactPersonId ?? ''}
                        onChange={(e) => setQuickContactPersonId(e.target.value || null)}
                        className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        autoFocus
                      >
                        <option value="">— Geen —</option>
                        {allContactPersons.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.firstName} {p.lastName}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={async () => {
                          try {
                            await updateItem.mutateAsync({ contactPersonId: quickContactPersonId });
                            setEditingContactPerson(false);
                            showToast('Contactpersoon opgeslagen', 'success');
                          } catch (err) {
                            showToast(getErrorMessage(err, 'Fout bij opslaan'), 'error');
                          }
                        }}
                        disabled={updateItem.isPending}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 whitespace-nowrap"
                      >
                        {updateItem.isPending ? '…' : 'Opslaan'}
                      </button>
                      <button
                        onClick={() => setEditingContactPerson(false)}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Annuleren
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 group">
                      <span>
                        {item.contactPerson
                          ? `${item.contactPerson.firstName} ${item.contactPerson.lastName}`
                          : '—'}
                      </span>
                      {!item.isCancelled && userCanWrite && (
                        <button
                          onClick={() => {
                            setQuickContactPersonId(item.contactPersonId ?? null);
                            setEditingContactPerson(true);
                          }}
                          className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                          title="Contactpersoon wijzigen"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                          </svg>
                        </button>
                      )}
                    </div>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Locatie</dt>
                <dd className="mt-1 text-sm text-gray-900">{locationStr}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Datum & tijd</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {item.scheduledDate
                    ? new Date(item.scheduledDate).toLocaleString('nl-NL', {
                        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })
                    : 'Nog te plannen'}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500">Duur</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {item.durationHours ? `${item.durationHours} uur` : '—'}
                </dd>
              </div>
              {showPhase && (
                <PhaseInfoField phase={item.projectPhase} projectId={item.projectId} />
              )}
              {item.internalNotes && (
                <div className="col-span-2">
                  <dt className="text-sm font-medium text-gray-500">Interne notities</dt>
                  <dd className="mt-1 text-sm text-gray-900 whitespace-pre-line">{item.internalNotes}</dd>
                </div>
              )}
            </dl>
          )}
        </div>
      </Card>

      {/* Inspectors */}
      <Card>
        <div className="p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Inspecteurs</h3>
          {item.inspectors && item.inspectors.length > 0 ? (
            <div className="space-y-3">
              {item.inspectors.map((inspector) => (
                <div key={inspector.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0"
                      style={{ backgroundColor: inspector.user?.color ?? '#6B7280' }}
                    >
                      {inspector.user?.initials ??
                        `${inspector.user?.firstName?.[0] ?? ''}${inspector.user?.lastName?.[0] ?? ''}`}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {inspector.user?.firstName} {inspector.user?.lastName}
                        {inspector.isPrimary && (
                          <span className="ml-2 text-xs text-gray-500">(Primair)</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">{inspector.user?.email}</div>
                    </div>
                  </div>
                  <StatusBadge status={inspector.acceptanceStatus} map={ACCEPTANCE_STATUS} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Nog geen inspecteurs toegewezen</p>
          )}
        </div>
      </Card>

      {/* Werkbonnen */}
      {(item.status === PlanningStatus.GEPLAND || item.status === PlanningStatus.AFGEROND) && (
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900">Werkbonnen</h3>
              <Button
                variant="secondary"
                onClick={() => {
                  createWorkOrder.mutate({ planningItemId: item.id });
                }}
                disabled={createWorkOrder.isPending}
              >
                Werkbon aanmaken
              </Button>
            </div>
            {workOrdersData?.data && workOrdersData.data.length > 0 ? (
              <div className="space-y-3">
                {workOrdersData.data.map((wo) => (
                  <Link
                    key={wo.id}
                    to={`/work-orders/${wo.id}`}
                    className="flex items-center justify-between hover:bg-gray-50 rounded-lg -mx-2 px-2 py-1 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center text-sm font-medium text-white flex-shrink-0 bg-primary-600">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {wo.workOrderNumber}
                        </div>
                        <div className="text-xs text-gray-500">
                          {wo.startTime
                            ? new Date(wo.startTime).toLocaleString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : 'Geen starttijd'}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={wo.status} map={WORK_ORDER_STATUS} />
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">Nog geen werkbonnen</p>
            )}
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between border-t border-gray-200 pt-6">
        <p className="text-xs text-gray-400">
          Aangemaakt op {new Date(item.createdAt).toLocaleString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          {item.createdByUser && ` door ${item.createdByUser.firstName} ${item.createdByUser.lastName}`}
        </p>
        {canEditDirectly && !editMode && (
          <Button variant="secondary" onClick={handleOpenEdit}>
            Bewerken
          </Button>
        )}
      </div>
    </div>
  );
}
