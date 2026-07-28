import { getErrorMessage } from '@/lib/api-client';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Button,
  Spinner,
  StatusBadge,
  Card,
  Tabs,
  useToast,
} from '@/components/ui';
import { WORK_ORDER_STATUS } from '@/lib/status';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import {
  NotesSidebarSection,
  HistorySidebarSection,
  DocumentsSidebarSection,
} from '@/components/layout/sidebar-sections';
import { DocumentsSection } from '@/components/documents/documents-section';
import { useAuth } from '@/providers/auth-provider';
import {
  Role,
  WorkOrderStatus,
  DocumentEntityType,
  NoteEntityType,
} from '@/types';
import {
  useWorkOrder,
  useUpdateWorkOrder,
  useSetWorkOrderLines,
} from './hooks/use-work-orders';
import { editSchema } from './components/work-order-detail-shared';
import type { EditFormData, LineFormValues } from './components/work-order-detail-shared';
import { defaultLine } from './components/work-order-detail-shared';
import { WorkOrderAlgemeenTab } from './components/work-order-algemeen-tab';
import { WorkOrderMeerwerkTab } from './components/work-order-meerwerk-tab';
import {
  WorkOrderStatusChangeModal,
  WorkOrderDeleteModal,
} from './components/work-order-detail-modals';

// ─── Constants ───────────────────────────────────────────────

const statusTransitions: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  [WorkOrderStatus.IN_VOORBEREIDING]: [WorkOrderStatus.IN_UITVOERING, WorkOrderStatus.WACHT_OP_KLANT],
  [WorkOrderStatus.IN_UITVOERING]: [WorkOrderStatus.UITGEVOERD, WorkOrderStatus.WACHT_OP_KLANT],
  [WorkOrderStatus.WACHT_OP_KLANT]: [WorkOrderStatus.IN_UITVOERING, WorkOrderStatus.UITGEVOERD],
  [WorkOrderStatus.UITGEVOERD]: [],
};

const canWrite = [Role.SUPERUSER, Role.ORG_ADMIN, Role.MANAGER, Role.BACKOFFICE, Role.WERKVOORBEREIDER];

// ─── Helpers ─────────────────────────────────────────────────

function toDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Tabs ────────────────────────────────────────────────────

type Tab = 'algemeen' | 'meerwerk' | 'fotos' | 'instellingen';

const tabLabels: Record<Tab, string> = {
  algemeen: 'Algemeen',
  meerwerk: 'Meerwerk',
  fotos: "Foto's",
  instellingen: 'Instellingen',
};

// ─── Main component ──────────────────────────────────────────

export default function WorkOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [tab, setTab] = useState<Tab>('algemeen');
  const [isEditing, setIsEditing] = useState(false);
  const [statusChangeOpen, setStatusChangeOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  // Fase-koppeling via custom control (buiten react-hook-form).
  const [phaseId, setPhaseId] = useState<string | null>(null);

  // Meerwerk state
  const [lines, setLines] = useState<LineFormValues[]>([]);
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState<LineFormValues>({ ...defaultLine });

  const { data: workOrder, isLoading } = useWorkOrder(id);
  const updateWorkOrder = useUpdateWorkOrder(id);
  const setWorkOrderLines = useSetWorkOrderLines(id);

  const userCanWrite = user && user.roles.some((r) => canWrite.includes(r));

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isDirty },
  } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
  });

  // Populate form when data loads
  useEffect(() => {
    if (workOrder) {
      resetForm({
        internalNotes: workOrder.internalNotes ?? '',
        startTime: toDatetimeLocal(workOrder.startTime),
        endTime: toDatetimeLocal(workOrder.endTime),
      });
      setPhaseId(workOrder.projectPhaseId ?? null);
    }
  }, [workOrder, resetForm]);

  // Sync lines from server
  useEffect(() => {
    if (workOrder?.lines) {
      setLines(
        workOrder.lines.map((l) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
        })),
      );
    }
  }, [workOrder?.lines]);

  if (isLoading) {
    return (
      <DetailPageLayout>
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      </DetailPageLayout>
    );
  }

  if (!workOrder) {
    return (
      <DetailPageLayout>
        <div className="py-12 text-center text-gray-500">
          Werkbon niet gevonden
        </div>
      </DetailPageLayout>
    );
  }

  // ─── Derived values ──────────────────────────────────────────

  const contactName = workOrder.planningItem?.contact
    ? workOrder.planningItem.contact.companyName ||
      `${workOrder.planningItem.contact.firstName ?? ''} ${workOrder.planningItem.contact.lastName ?? ''}`.trim()
    : '—';

  const locationStr = workOrder.planningItem?.location
    ? [
        workOrder.planningItem.location.street,
        workOrder.planningItem.location.houseNumber,
        workOrder.planningItem.location.city,
      ]
        .filter(Boolean)
        .join(' ')
    : '—';

  const inspectorNames = workOrder.planningItem?.inspectors
    ?.map((i) =>
      i.user ? `${i.user.firstName} ${i.user.lastName}` : '—',
    )
    .join(', ') || '—';

  const availableTransitions = statusTransitions[workOrder.status] ?? [];

  // Werkbon heeft geen eigen projectId; het projectcontext komt van de planregel
  // of van de al-gekoppelde fase (§12.4.2).
  const workOrderProjectId =
    workOrder.planningItem?.project?.id ??
    workOrder.projectPhase?.projectId ??
    null;
  const phaseDirty = phaseId !== (workOrder.projectPhaseId ?? null);

  const lineTotals = lines.map(
    (l) => l.quantity * l.unitPrice,
  );
  const grandTotal = lineTotals.reduce((sum, t) => sum + t, 0);

  // ─── Handlers ────────────────────────────────────────────────

  const handleSaveEdit = async (data: EditFormData) => {
    try {
      await updateWorkOrder.mutateAsync({
        internalNotes: data.internalNotes || undefined,
        startTime: data.startTime ? new Date(data.startTime).toISOString() : undefined,
        endTime: data.endTime ? new Date(data.endTime).toISOString() : undefined,
        ...(phaseDirty ? { projectPhaseId: phaseId } : {}),
      });
      setIsEditing(false);
      showToast('Werkbon bijgewerkt', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleCancelEdit = () => {
    resetForm({
      internalNotes: workOrder.internalNotes ?? '',
      startTime: toDatetimeLocal(workOrder.startTime),
      endTime: toDatetimeLocal(workOrder.endTime),
    });
    setPhaseId(workOrder.projectPhaseId ?? null);
    setIsEditing(false);
  };

  const handleAddLine = () => {
    if (!newLine.description.trim()) return;
    setLines((prev) => [...prev, { ...newLine }]);
    setNewLine({ ...defaultLine });
    setAddingLine(false);
  };

  const handleRemoveLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveLines = async () => {
    try {
      await setWorkOrderLines.mutateAsync({
        lines: lines.map((l, i) => ({
          description: l.description,
          quantity: l.quantity,
          unit: l.unit,
          unitPrice: l.unitPrice,
          vatRate: l.vatRate,
          sortOrder: i,
        })),
      });
      showToast('Meerwerk opgeslagen', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  // Check if lines changed from server state
  const serverLines = workOrder.lines ?? [];
  const linesChanged =
    lines.length !== serverLines.length ||
    lines.some(
      (l, i) =>
        !serverLines[i] ||
        l.description !== serverLines[i].description ||
        l.quantity !== serverLines[i].quantity ||
        l.unit !== serverLines[i].unit ||
        l.unitPrice !== serverLines[i].unitPrice ||
        l.vatRate !== serverLines[i].vatRate,
    );

  // ─── Render ──────────────────────────────────────────────────

  return (
    <DetailPageLayout
      iconStrip
      sidebar={
        <>
          <NotesSidebarSection
            entityType={NoteEntityType.WORK_ORDER}
            entityId={id!}
          />
          <DocumentsSidebarSection
            entityType={DocumentEntityType.WORK_ORDER}
            entityId={id!}
            canUpload={!!userCanWrite}
          />
          <HistorySidebarSection entityType="WorkOrder" entityId={id} />
        </>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div>
          <button
            onClick={() => navigate('/work-orders')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Terug naar werkbonnen
          </button>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-gray-900">
                {workOrder.workOrderNumber}
              </h2>
              <StatusBadge status={workOrder.status} map={WORK_ORDER_STATUS} />
            </div>
            {userCanWrite && availableTransitions.length > 0 && (
              <Button
                variant="primary"
                onClick={() => setStatusChangeOpen(true)}
              >
                Status wijzigen
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="mb-6">
          <Tabs
            tabs={(['algemeen', 'meerwerk', 'fotos', 'instellingen'] as Tab[]).map((t) => ({
              key: t,
              label: tabLabels[t],
              count: t === 'meerwerk' ? workOrder.lines?.length ?? 0 : undefined,
            }))}
            active={tab}
            onChange={setTab}
          />
        </div>

        {/* ── Algemeen tab ── */}
        {tab === 'algemeen' && (
          <WorkOrderAlgemeenTab
            workOrder={workOrder}
            userCanWrite={!!userCanWrite}
            isEditing={isEditing}
            setIsEditing={setIsEditing}
            contactName={contactName}
            locationStr={locationStr}
            inspectorNames={inspectorNames}
            register={register}
            errors={errors}
            isDirty={isDirty}
            onSubmit={handleSubmit(handleSaveEdit)}
            handleCancelEdit={handleCancelEdit}
            updateWorkOrder={updateWorkOrder}
            projectId={workOrderProjectId}
            phaseId={phaseId}
            setPhaseId={setPhaseId}
            phaseDirty={phaseDirty}
          />
        )}

        {/* ── Meerwerk tab ── */}
        {tab === 'meerwerk' && (
          <WorkOrderMeerwerkTab
            workOrder={workOrder}
            userCanWrite={!!userCanWrite}
            lines={lines}
            addingLine={addingLine}
            setAddingLine={setAddingLine}
            newLine={newLine}
            setNewLine={setNewLine}
            handleAddLine={handleAddLine}
            handleRemoveLine={handleRemoveLine}
            handleSaveLines={handleSaveLines}
            linesChanged={linesChanged}
            grandTotal={grandTotal}
            setWorkOrderLines={setWorkOrderLines}
          />
        )}

        {/* ── Foto's tab ── */}
        {tab === 'fotos' && (
          <div className="space-y-6">
            <DocumentsSection
              entityType={DocumentEntityType.WORK_ORDER}
              entityId={workOrder.id}
              canUpload={!!userCanWrite}
            />
          </div>
        )}

        {/* ── Instellingen tab ── */}
        {tab === 'instellingen' && (
          <div className="space-y-6">
            {workOrder.status === WorkOrderStatus.IN_VOORBEREIDING &&
              userCanWrite && (
                <Card>
                  <div className="p-6">
                    <h3 className="font-semibold text-red-600 mb-2">
                      Gevarenzone
                    </h3>
                    <p className="text-sm text-gray-500 mb-4">
                      Deze werkbon permanent verwijderen. Dit kan niet ongedaan
                      gemaakt worden.
                    </p>
                    <Button
                      variant="danger"
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      Werkbon verwijderen
                    </Button>
                  </div>
                </Card>
              )}
            {(workOrder.status !== WorkOrderStatus.IN_VOORBEREIDING ||
              !userCanWrite) && (
              <div className="py-12 text-center text-gray-400 text-sm">
                Geen instellingen beschikbaar voor deze werkbon.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Status change modal */}
      {statusChangeOpen && (
        <WorkOrderStatusChangeModal
          id={id}
          statusChangeOpen={statusChangeOpen}
          setStatusChangeOpen={setStatusChangeOpen}
          availableTransitions={availableTransitions}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmOpen && (
        <WorkOrderDeleteModal
          id={id}
          workOrder={workOrder}
          deleteConfirmOpen={deleteConfirmOpen}
          setDeleteConfirmOpen={setDeleteConfirmOpen}
        />
      )}
    </DetailPageLayout>
  );
}
