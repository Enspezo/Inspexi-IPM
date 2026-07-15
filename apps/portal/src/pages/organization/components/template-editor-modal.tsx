import { useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal, ErrorBox, useToast } from '@/components/ui';
import type { AvailabilityTemplate } from '@/types';
import {
  useCreateAvailabilityTemplate,
  useUpdateAvailabilityTemplate,
  type TemplateSlotInput,
} from '@/pages/availability/hooks/use-availability';
import {
  WEEKDAY_LONG,
  computeWeeklyMinutes,
  formatHours,
  minutesToTime,
  timeToMinutes,
} from '@/components/availability/format-availability';

interface SlotDraft {
  start: string; // HH:MM
  end: string; // HH:MM
}

type SlotsByDay = Record<number, SlotDraft[]>; // weekday 1..7 → slots

interface TemplateEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  template?: AvailabilityTemplate | null;
}

function emptySlots(): SlotsByDay {
  return { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
}

function slotsFromTemplate(template: AvailabilityTemplate): SlotsByDay {
  const map = emptySlots();
  for (const s of template.slots) {
    (map[s.weekday] ??= []).push({ start: minutesToTime(s.startMinute), end: minutesToTime(s.endMinute) });
  }
  for (const day of Object.keys(map)) {
    map[Number(day)].sort((a, b) => (timeToMinutes(a.start) ?? 0) - (timeToMinutes(b.start) ?? 0));
  }
  return map;
}

/** Template-editor met per-weekdag tijdsloten + live uren/week-teller (PRD-12 §12.8a). */
export function TemplateEditorModal({ isOpen, onClose, template }: TemplateEditorModalProps) {
  const { showToast } = useToast();
  const isEdit = !!template;
  const createMutation = useCreateAvailabilityTemplate();
  const updateMutation = useUpdateAvailabilityTemplate();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [slots, setSlots] = useState<SlotsByDay>(emptySlots());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setName(template?.name ?? '');
    setDescription(template?.description ?? '');
    setIsActive(template?.isActive ?? true);
    setSlots(template ? slotsFromTemplate(template) : emptySlots());
    setError('');
  }, [isOpen, template]);

  const weeklyMinutes = useMemo(() => {
    const flat: { startMinute: number; endMinute: number }[] = [];
    for (const day of Object.values(slots)) {
      for (const s of day) {
        const startMinute = timeToMinutes(s.start);
        const endMinute = timeToMinutes(s.end);
        if (startMinute != null && endMinute != null && endMinute > startMinute) {
          flat.push({ startMinute, endMinute });
        }
      }
    }
    return computeWeeklyMinutes(flat);
  }, [slots]);

  const addSlot = (weekday: number) => {
    setSlots((prev) => ({
      ...prev,
      [weekday]: [...prev[weekday], { start: '08:00', end: '17:00' }],
    }));
  };

  const updateSlot = (weekday: number, idx: number, field: 'start' | 'end', value: string) => {
    setSlots((prev) => ({
      ...prev,
      [weekday]: prev[weekday].map((s, i) => (i === idx ? { ...s, [field]: value } : s)),
    }));
  };

  const removeSlot = (weekday: number, idx: number) => {
    setSlots((prev) => ({
      ...prev,
      [weekday]: prev[weekday].filter((_, i) => i !== idx),
    }));
  };

  const buildSlots = (): TemplateSlotInput[] | string => {
    const out: TemplateSlotInput[] = [];
    for (let weekday = 1; weekday <= 7; weekday++) {
      for (const s of slots[weekday]) {
        const startMinute = timeToMinutes(s.start);
        const endMinute = timeToMinutes(s.end);
        if (startMinute == null || endMinute == null) {
          return `Ongeldige tijd op ${WEEKDAY_LONG[weekday - 1]}`;
        }
        if (endMinute <= startMinute) {
          return `Eindtijd moet na de starttijd liggen (${WEEKDAY_LONG[weekday - 1]})`;
        }
        out.push({ weekday, startMinute, endMinute });
      }
    }
    return out;
  };

  const handleSubmit = async () => {
    setError('');
    if (!name.trim()) {
      setError('Naam is verplicht');
      return;
    }
    const built = buildSlots();
    if (typeof built === 'string') {
      setError(built);
      return;
    }
    if (built.length === 0) {
      setError('Voeg minimaal één tijdslot toe');
      return;
    }
    const payload = {
      name: name.trim(),
      description: description.trim() || null,
      isActive,
      slots: built,
    };
    try {
      if (isEdit && template) {
        await updateMutation.mutateAsync({ id: template.id, input: payload });
        showToast('Template bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync(payload);
        showToast('Template aangemaakt', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? 'Template bewerken' : 'Template aanmaken'}
      className="flex max-h-[90vh] max-w-3xl flex-col overflow-hidden [&>div:last-child]:overflow-y-auto"
    >
      <div className="space-y-4">
        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Naam"
            placeholder="bv. Standaard 40u"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Omschrijving (optioneel)"
            placeholder="Fulltime ma–vr 08:00–17:30"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Actief (toewijsbaar aan inspecteurs)
        </label>

        {/* Weekdagen + slots */}
        <div className="space-y-2 rounded-lg border border-gray-200 p-3">
          {Array.from({ length: 7 }, (_, i) => i + 1).map((weekday) => (
            <div key={weekday} className="flex items-start gap-3 border-b border-gray-100 py-2 last:border-b-0">
              <div className="w-24 shrink-0 pt-2 text-sm font-medium capitalize text-gray-700">
                {WEEKDAY_LONG[weekday - 1]}
              </div>
              <div className="flex-1 space-y-2">
                {slots[weekday].length === 0 ? (
                  <p className="pt-2 text-xs text-gray-400">Niet beschikbaar</p>
                ) : (
                  slots[weekday].map((s, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="time"
                        value={s.start}
                        onChange={(e) => updateSlot(weekday, idx, 'start', e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                      <span className="text-gray-400">–</span>
                      <input
                        type="time"
                        value={s.end}
                        onChange={(e) => updateSlot(weekday, idx, 'end', e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1 text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeSlot(weekday, idx)}
                        title="Slot verwijderen"
                        className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))
                )}
                <button
                  type="button"
                  onClick={() => addSlot(weekday)}
                  className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-800"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Tijdslot toevoegen
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <p className="text-sm font-medium text-gray-700">
            Totaal: <span className="text-primary-700">{formatHours(weeklyMinutes)}</span> per week
          </p>
          <div className="flex gap-3">
            <Button type="button" variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button type="button" onClick={handleSubmit} isLoading={isPending}>
              {isEdit ? 'Opslaan' : 'Aanmaken'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
