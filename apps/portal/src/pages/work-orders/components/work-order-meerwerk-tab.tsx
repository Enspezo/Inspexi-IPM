import { Card, Button, Input, Modal } from '@/components/ui';
import { formatCurrency } from '@/lib/format';
import { WorkOrderStatus } from '@/types';
import type { WorkOrder } from '@/types';
import { useSetWorkOrderLines } from '../hooks/use-work-orders';
import { defaultLine } from './work-order-detail-shared';
import type { LineFormValues } from './work-order-detail-shared';

export function WorkOrderMeerwerkTab({
  workOrder,
  userCanWrite,
  lines,
  addingLine,
  setAddingLine,
  newLine,
  setNewLine,
  handleAddLine,
  handleRemoveLine,
  handleSaveLines,
  linesChanged,
  grandTotal,
  setWorkOrderLines,
}: {
  workOrder: WorkOrder;
  userCanWrite: boolean;
  lines: LineFormValues[];
  addingLine: boolean;
  setAddingLine: React.Dispatch<React.SetStateAction<boolean>>;
  newLine: LineFormValues;
  setNewLine: React.Dispatch<React.SetStateAction<LineFormValues>>;
  handleAddLine: () => void;
  handleRemoveLine: (index: number) => void;
  handleSaveLines: () => Promise<void>;
  linesChanged: boolean;
  grandTotal: number;
  setWorkOrderLines: ReturnType<typeof useSetWorkOrderLines>;
}) {
  return (
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
  );
}
