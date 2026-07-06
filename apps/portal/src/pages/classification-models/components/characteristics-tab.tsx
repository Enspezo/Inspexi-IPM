// Kenmerken-tab: sleepbare lijst van kenmerken; elk kenmerk is een Card met een
// geneste sleepbare lijst van opties. Toevoegen/bewerken/verwijderen op beide niveaus.
// Verwijderen kan een cascade-waarschuwing teruggeven (templates gebruiken het kenmerk/de optie)
// — dan vraagt de UI een tweede bevestiging en stuurt vervolgens confirm=true.

import { useState } from 'react';
import {
  Button,
  Card,
  SortableList,
  DragHandle,
  useConfirm,
  useToast,
} from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import type { ClassificationCharacteristic, ClassificationOption } from '@/types';
import {
  useReorderCharacteristics,
  useDeleteCharacteristic,
  useReorderOptions,
  useDeleteOption,
  type DeleteResult,
} from '../hooks/use-classification-models';
import { CharacteristicModal } from './characteristic-modal';
import { OptionModal } from './option-modal';

interface Props {
  modelId: string;
  characteristics: ClassificationCharacteristic[];
  canManage: boolean;
}

export function CharacteristicsTab({ modelId, characteristics, canManage }: Props) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const reorderChars = useReorderCharacteristics(modelId);
  const deleteChar = useDeleteCharacteristic(modelId);

  const [charModalOpen, setCharModalOpen] = useState(false);
  const [editingChar, setEditingChar] = useState<ClassificationCharacteristic | null>(null);

  const openCreateChar = () => {
    setEditingChar(null);
    setCharModalOpen(true);
  };
  const openEditChar = (char: ClassificationCharacteristic) => {
    setEditingChar(char);
    setCharModalOpen(true);
  };

  const handleDeleteChar = async (char: ClassificationCharacteristic) => {
    const confirmed = await confirm({
      title: 'Kenmerk verwijderen',
      message: `Weet je zeker dat je het kenmerk "${char.name}" en alle bijbehorende opties wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const result = (await deleteChar.mutateAsync({ charId: char.id })) as DeleteResult;
      // Backend gaf een gebruiks-waarschuwing i.p.v. te verwijderen → tweede bevestiging.
      if (result?.warning) {
        const ack = await confirm({
          title: 'Kenmerk wordt gebruikt',
          message:
            result.message ?? 'Dit kenmerk wordt door templates gebruikt. Toch verwijderen?',
          confirmLabel: 'Toch verwijderen',
          variant: 'danger',
        });
        if (!ack) return;
        await deleteChar.mutateAsync({ charId: char.id, confirm: true });
      }
      showToast('Kenmerk verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Card
      title={`Kenmerken (${characteristics.length})`}
      actions={canManage ? <Button onClick={openCreateChar}>Kenmerk toevoegen</Button> : undefined}
    >
      {characteristics.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">
          Nog geen kenmerken. {canManage && 'Klik op "Kenmerk toevoegen" om te beginnen.'}
        </p>
      ) : (
        <SortableList
          items={characteristics}
          getId={(c) => c.id}
          disabled={!canManage}
          onReorder={(ids) => reorderChars.mutate(ids)}
          className="space-y-3"
          renderItem={(char, { dragHandleProps }) => (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5">
                {canManage && <DragHandle {...dragHandleProps} />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">{char.name}</span>
                    <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                      {char.code}
                    </code>
                    <span className="text-xs text-gray-400">
                      {char.options?.length ?? 0} opties
                    </span>
                  </div>
                  {char.description && (
                    <p className="mt-0.5 truncate text-xs text-gray-500">{char.description}</p>
                  )}
                </div>
                {canManage && (
                  <div className="flex flex-shrink-0 items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => openEditChar(char)}>
                      Bewerken
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleDeleteChar(char)}>
                      Verwijderen
                    </Button>
                  </div>
                )}
              </div>

              <div className="px-3 py-3">
                <OptionsEditor modelId={modelId} characteristic={char} canManage={canManage} />
              </div>
            </div>
          )}
        />
      )}

      <CharacteristicModal
        isOpen={charModalOpen}
        onClose={() => setCharModalOpen(false)}
        modelId={modelId}
        characteristic={editingChar}
      />
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Opties-editor binnen één kenmerk (eigen modal-/edit-state per kenmerk)
// ---------------------------------------------------------------------------

interface OptionsEditorProps {
  modelId: string;
  characteristic: ClassificationCharacteristic;
  canManage: boolean;
}

function OptionsEditor({ modelId, characteristic, canManage }: OptionsEditorProps) {
  const { showToast } = useToast();
  const confirm = useConfirm();

  const reorderOpts = useReorderOptions(modelId, characteristic.id);
  const deleteOpt = useDeleteOption(modelId, characteristic.id);

  const [optModalOpen, setOptModalOpen] = useState(false);
  const [editingOpt, setEditingOpt] = useState<ClassificationOption | null>(null);

  const options = characteristic.options ?? [];

  const openCreateOpt = () => {
    setEditingOpt(null);
    setOptModalOpen(true);
  };
  const openEditOpt = (opt: ClassificationOption) => {
    setEditingOpt(opt);
    setOptModalOpen(true);
  };

  const handleDeleteOpt = async (opt: ClassificationOption) => {
    const confirmed = await confirm({
      title: 'Optie verwijderen',
      message: `Weet je zeker dat je de optie "${opt.name}" wilt verwijderen?`,
      confirmLabel: 'Verwijderen',
      variant: 'danger',
    });
    if (!confirmed) return;
    try {
      const result = (await deleteOpt.mutateAsync({ optionId: opt.id })) as DeleteResult;
      if (result?.warning) {
        const ack = await confirm({
          title: 'Optie wordt gebruikt',
          message:
            result.message ?? 'Deze optie wordt door templates gebruikt. Toch verwijderen?',
          confirmLabel: 'Toch verwijderen',
          variant: 'danger',
        });
        if (!ack) return;
        await deleteOpt.mutateAsync({ optionId: opt.id, confirm: true });
      }
      showToast('Optie verwijderd', 'success');
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Opties</span>
        {canManage && (
          <Button variant="ghost" size="sm" onClick={openCreateOpt}>
            + Optie toevoegen
          </Button>
        )}
      </div>

      {options.length === 0 ? (
        <p className="py-2 text-sm text-gray-500">Nog geen opties.</p>
      ) : (
        <SortableList
          items={options}
          getId={(o) => o.id}
          disabled={!canManage}
          onReorder={(ids) => reorderOpts.mutate(ids)}
          className="space-y-1.5"
          renderItem={(opt, { dragHandleProps }) => (
            <div className="flex items-center gap-3 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2">
              {canManage && <DragHandle {...dragHandleProps} />}
              <span
                className="inline-block h-4 w-4 flex-shrink-0 rounded border border-gray-300"
                style={{ backgroundColor: opt.color }}
                title={opt.color}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{opt.name}</span>
                  <code className="rounded bg-white px-1.5 py-0.5 text-xs text-gray-600">
                    {opt.code}
                  </code>
                  <span className="text-xs text-gray-400">{opt.color}</span>
                </div>
                {opt.description && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">{opt.description}</p>
                )}
              </div>
              {canManage && (
                <div className="flex flex-shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditOpt(opt)}>
                    Bewerken
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDeleteOpt(opt)}>
                    Verwijderen
                  </Button>
                </div>
              )}
            </div>
          )}
        />
      )}

      <OptionModal
        isOpen={optModalOpen}
        onClose={() => setOptModalOpen(false)}
        modelId={modelId}
        charId={characteristic.id}
        option={editingOpt}
      />
    </div>
  );
}
