import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  Button,
  Input,
  Spinner,
  StatusBadge,
  Modal,
  Select,
  useToast,
} from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { WORK_ORDER_STATUS, getStatusConfig } from '@/lib/status';
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
import type { WorkOrder, WorkOrderLine } from '@/types';
import {
  useWorkOrder,
  useUpdateWorkOrder,
  useUpdateWorkOrderStatus,
  useSetWorkOrderLines,
  useDeleteWorkOrder,
} from './hooks/use-work-orders';

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

function InfoField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value || '—'}</dd>
    </div>
  );
}

// ─── Form schemas ────────────────────────────────────────────

const editSchema = z.object({
  internalNotes: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
});

type EditFormData = z.infer<typeof editSchema>;

// ─── Line form ───────────────────────────────────────────────

interface LineFormValues {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  vatRate: number;
}

const defaultLine: LineFormValues = {
  description: '',
  quantity: 1,
  unit: 'stuk',
  unitPrice: 0,
  vatRate: 21,
};

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
  const [newStatus, setNewStatus] = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Meerwerk state
  const [lines, setLines] = useState<LineFormValues[]>([]);
  const [addingLine, setAddingLine] = useState(false);
  const [newLine, setNewLine] = useState<LineFormValues>({ ...defaultLine });

  const { data: workOrder, isLoading } = useWorkOrder(id);
  const updateWorkOrder = useUpdateWorkOrder(id);
  const updateStatus = useUpdateWorkOrderStatus(id);
  const setWorkOrderLines = useSetWorkOrderLines(id);
  const deleteWorkOrder = useDeleteWorkOrder(id);

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
      });
      setIsEditing(false);
      showToast('Werkbon bijgewerkt', 'success');
    } catch {
      showToast('Fout bij opslaan', 'error');
    }
  };

  const handleCancelEdit = () => {
    resetForm({
      internalNotes: workOrder.internalNotes ?? '',
      startTime: toDatetimeLocal(workOrder.startTime),
      endTime: toDatetimeLocal(workOrder.endTime),
    });
    setIsEditing(false);
  };

  const handleStatusChange = async () => {
    if (!newStatus) return;
    try {
      await updateStatus.mutateAsync({
        status: newStatus as WorkOrderStatus,
        note: statusNote || undefined,
      });
      setStatusChangeOpen(false);
      setNewStatus('');
      setStatusNote('');
      showToast('Status bijgewerkt', 'success');
    } catch {
      showToast('Fout bij statuswijziging', 'error');
    }
  };

  const handleDelete = async () => {
    try {
      await deleteWorkOrder.mutateAsync();
      showToast('Werkbon verwijderd', 'success');
      navigate('/work-orders');
    } catch {
      showToast('Fout bij verwijderen', 'error');
    }
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
      showToast('Fout bij opslaan meerwerk', 'error');
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
        <div className="border-b border-gray-200 mb-6">
          <nav className="-mb-px flex gap-6 overflow-x-auto">
            {(['algemeen', 'meerwerk', 'fotos', 'instellingen'] as Tab[]).map(
              (t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                    tab === t
                      ? 'border-primary-600 text-primary-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  {tabLabels[t]}
                  {t === 'meerwerk' && (workOrder.lines?.length ?? 0) > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-100 px-1.5 text-xs font-semibold text-primary-700">
                      {workOrder.lines!.length}
                    </span>
                  )}
                </button>
              ),
            )}
          </nav>
        </div>

        {/* ── Algemeen tab ── */}
        {tab === 'algemeen' && (
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
                    onSubmit={handleSubmit(handleSaveEdit)}
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
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        disabled={!isDirty}
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
        )}

        {/* ── Meerwerk tab ── */}
        {tab === 'meerwerk' && (
          <div className="space-y-6">
            <Card>
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">
                    Meerwerkregels
                  </h3>
                  {userCanWrite &&
                    workOrder.status !== WorkOrderStatus.UITGEVOERD && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setAddingLine(true)}
                      >
                        Regel toevoegen
                      </Button>
                    )}
                </div>

                {lines.length === 0 && !addingLine ? (
                  <p className="text-sm text-gray-500">
                    Nog geen meerwerkregels toegevoegd.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Omschrijving
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Aantal
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Eenheid
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Stukprijs
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            BTW %
                          </th>
                          <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                            Totaal
                          </th>
                          {userCanWrite &&
                            workOrder.status !==
                              WorkOrderStatus.UITGEVOERD && (
                              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                                &nbsp;
                              </th>
                            )}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white">
                        {lines.map((line, idx) => (
                          <tr key={idx}>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-900">
                              {line.description}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 text-right">
                              {line.quantity}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700">
                              {line.unit}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 text-right">
                              {formatCurrency(line.unitPrice)}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm text-gray-700 text-right">
                              {line.vatRate}%
                            </td>
                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-gray-900 text-right">
                              {formatCurrency(line.quantity * line.unitPrice)}
                            </td>
                            {userCanWrite &&
                              workOrder.status !==
                                WorkOrderStatus.UITGEVOERD && (
                                <td className="whitespace-nowrap px-4 py-3 text-right">
                                  <button
                                    onClick={() => handleRemoveLine(idx)}
                                    className="text-red-500 hover:text-red-700"
                                    title="Verwijderen"
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
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </td>
                              )}
                          </tr>
                        ))}
                      </tbody>
                      {lines.length > 0 && (
                        <tfoot>
                          <tr className="border-t-2 border-gray-300">
                            <td
                              colSpan={5}
                              className="px-4 py-3 text-sm font-semibold text-gray-900 text-right"
                            >
                              Totaal (excl. BTW)
                            </td>
                            <td className="px-4 py-3 text-sm font-bold text-gray-900 text-right">
                              {formatCurrency(grandTotal)}
                            </td>
                            {userCanWrite &&
                              workOrder.status !==
                                WorkOrderStatus.UITGEVOERD && <td />}
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                )}

                {/* Save lines button */}
                {linesChanged && userCanWrite && (
                  <div className="mt-4 flex justify-end">
                    <Button
                      onClick={handleSaveLines}
                      isLoading={setWorkOrderLines.isPending}
                    >
                      Meerwerk opslaan
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Add line modal */}
            {addingLine && (
              <Modal
                isOpen={addingLine}
                onClose={() => {
                  setAddingLine(false);
                  setNewLine({ ...defaultLine });
                }}
                title="Meerwerkregel toevoegen"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Omschrijving
                    </label>
                    <Input
                      value={newLine.description}
                      onChange={(e) =>
                        setNewLine((prev) => ({
                          ...prev,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Beschrijving van het meerwerk"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Aantal
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={String(newLine.quantity)}
                        onChange={(e) =>
                          setNewLine((prev) => ({
                            ...prev,
                            quantity: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Eenheid
                      </label>
                      <Input
                        value={newLine.unit}
                        onChange={(e) =>
                          setNewLine((prev) => ({
                            ...prev,
                            unit: e.target.value,
                          }))
                        }
                        placeholder="stuk, uur, m2..."
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Stukprijs
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={String(newLine.unitPrice)}
                        onChange={(e) =>
                          setNewLine((prev) => ({
                            ...prev,
                            unitPrice: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        BTW %
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={String(newLine.vatRate)}
                        onChange={(e) =>
                          setNewLine((prev) => ({
                            ...prev,
                            vatRate: Number(e.target.value) || 0,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setAddingLine(false);
                        setNewLine({ ...defaultLine });
                      }}
                    >
                      Annuleren
                    </Button>
                    <Button
                      onClick={handleAddLine}
                      disabled={!newLine.description.trim()}
                    >
                      Toevoegen
                    </Button>
                  </div>
                </div>
              </Modal>
            )}
          </div>
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
        <Modal
          isOpen={statusChangeOpen}
          onClose={() => {
            setStatusChangeOpen(false);
            setNewStatus('');
            setStatusNote('');
          }}
          title="Status wijzigen"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Nieuwe status
              </label>
              <Select
                options={[
                  { value: '', label: 'Selecteer status...' },
                  ...availableTransitions.map((s) => ({
                    value: s,
                    label: getStatusConfig(WORK_ORDER_STATUS, s).label,
                  })),
                ]}
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Notitie (optioneel)
              </label>
              <textarea
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                rows={3}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                placeholder="Toelichting bij de statuswijziging..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setStatusChangeOpen(false);
                  setNewStatus('');
                  setStatusNote('');
                }}
              >
                Annuleren
              </Button>
              <Button
                onClick={handleStatusChange}
                disabled={!newStatus}
                isLoading={updateStatus.isPending}
              >
                Status wijzigen
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmOpen && (
        <Modal
          isOpen={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          title="Werkbon verwijderen"
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Weet u zeker dat u werkbon{' '}
              <strong>{workOrder.workOrderNumber}</strong> wilt verwijderen? Dit
              kan niet ongedaan gemaakt worden.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Annuleren
              </Button>
              <Button
                variant="danger"
                onClick={handleDelete}
                isLoading={deleteWorkOrder.isPending}
              >
                Verwijderen
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </DetailPageLayout>
  );
}
