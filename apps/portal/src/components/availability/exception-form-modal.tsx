import { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Modal, Select, useToast } from '@/components/ui';
import { AvailabilityExceptionType } from '@/types';
import type { AvailabilityException } from '@/types';
import {
  useCreateAvailabilityException,
  useUpdateAvailabilityException,
} from '@/pages/availability/hooks/use-availability';
import {
  exceptionFormSchema,
  exceptionFormToInput,
  exceptionToFormValues,
  emptyExceptionForm,
  type ExceptionFormValues,
} from './exception-form-schema';
import { WEEKDAY_SHORT } from './format-availability';

interface ExceptionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  /** Aanwezig = bewerk-modus. */
  exception?: AvailabilityException | null;
}

const TYPE_OPTIONS = [
  { value: AvailabilityExceptionType.GEBLOKKEERD, label: 'Geblokkeerd (niet beschikbaar)' },
  { value: AvailabilityExceptionType.BESCHIKBAAR, label: 'Beschikbaar (extra inzetbaar)' },
];

const INTERVAL_OPTIONS = [
  { value: '1', label: 'Elke week' },
  { value: '2', label: 'Elke 2 weken' },
];

export function ExceptionFormModal({ isOpen, onClose, userId, exception }: ExceptionFormModalProps) {
  const { showToast } = useToast();
  const isEdit = !!exception;
  const createMutation = useCreateAvailabilityException();
  const updateMutation = useUpdateAvailabilityException();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<ExceptionFormValues>({
    resolver: zodResolver(exceptionFormSchema),
    defaultValues: emptyExceptionForm(),
  });

  useEffect(() => {
    if (!isOpen) return;
    reset(exception ? exceptionToFormValues(exception) : emptyExceptionForm());
  }, [isOpen, exception, reset]);

  const mode = watch('mode');
  const allDay = watch('allDay');

  const onSubmit = async (values: ExceptionFormValues) => {
    try {
      if (isEdit && exception) {
        const { userId: _userId, ...input } = exceptionFormToInput(values, userId);
        await updateMutation.mutateAsync({ id: exception.id, input });
        showToast('Uitzondering bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync(exceptionFormToInput(values, userId));
        showToast('Uitzondering toegevoegd', 'success');
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
      title={isEdit ? 'Uitzondering bewerken' : 'Uitzondering toevoegen'}
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Select label="Type" options={TYPE_OPTIONS} error={errors.type?.message} {...register('type')} />

        {/* Modus-schakelaar */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-gray-700">Herhaling</span>
          <Controller
            control={control}
            name="mode"
            render={({ field }) => (
              <div className="inline-flex rounded-lg border border-gray-300 p-0.5">
                {(['eenmalig', 'herhalend'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => field.onChange(m)}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                      field.value === m
                        ? 'bg-primary-600 text-white'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {m === 'eenmalig' ? 'Eenmalig' : 'Wekelijks herhalend'}
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* Hele dag */}
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" {...register('allDay')} className="h-4 w-4 rounded border-gray-300" />
          Hele dag
        </label>

        {/* Tijden (alleen als niet hele dag) */}
        {!allDay && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Van" type="time" error={errors.startTime?.message} {...register('startTime')} />
            <Input label="Tot" type="time" error={errors.endTime?.message} {...register('endTime')} />
          </div>
        )}

        {mode === 'eenmalig' ? (
          <div className="grid grid-cols-2 gap-4">
            <Input label="Datum" type="date" error={errors.date?.message} {...register('date')} />
            {allDay && (
              <Input
                label="T/m (optioneel)"
                type="date"
                helperText="Voor een meerdaagse periode"
                error={errors.endDate?.message}
                {...register('endDate')}
              />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Weekdagen */}
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">Weekdagen</span>
              <Controller
                control={control}
                name="weekdays"
                render={({ field }) => (
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAY_SHORT.map((label, idx) => {
                      const iso = idx + 1;
                      const active = field.value?.includes(iso);
                      return (
                        <button
                          key={iso}
                          type="button"
                          onClick={() =>
                            field.onChange(
                              active
                                ? field.value.filter((d) => d !== iso)
                                : [...(field.value ?? []), iso],
                            )
                          }
                          className={`h-9 w-10 rounded-md text-sm font-medium capitalize transition-colors ${
                            active
                              ? 'bg-primary-600 text-white'
                              : 'border border-gray-300 text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
              />
              {errors.weekdays?.message && (
                <p className="mt-1 text-sm text-danger-600">{errors.weekdays.message}</p>
              )}
            </div>

            <Select
              label="Interval"
              options={INTERVAL_OPTIONS}
              error={errors.intervalWeeks?.message}
              {...register('intervalWeeks', { valueAsNumber: true })}
            />

            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Vanaf"
                type="date"
                error={errors.recurStartDate?.message}
                {...register('recurStartDate')}
              />
              <Input
                label="T/m (optioneel)"
                type="date"
                helperText="Leeg = doorlopend"
                error={errors.recurEndDate?.message}
                {...register('recurEndDate')}
              />
            </div>
          </div>
        )}

        <Input
          label="Reden (optioneel)"
          placeholder="bv. Verlof, studie, cursus"
          error={errors.reason?.message}
          {...register('reason')}
        />

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
