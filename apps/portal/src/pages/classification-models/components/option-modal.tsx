// Aanmaak/bewerk-modal voor een optie van een kenmerk. Net als characteristic-modal,
// maar met een verplicht kleurveld (color picker + hex-input, gesynchroniseerd).
// Code is immutable bij bewerken (backend accepteert geen code-wijziging).

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, Checkbox, useToast } from '@/components/ui';
import type { ClassificationOption } from '@/types';
import { useCreateOption, useUpdateOption } from '../hooks/use-classification-models';

const HEX = /^#[0-9A-Fa-f]{6}$/;

const schema = z.object({
  code: z
    .string()
    .min(1, 'Code is verplicht')
    .max(50, 'Maximaal 50 tekens')
    .regex(/^[A-Z0-9_]+$/, 'alleen hoofdletters, cijfers en _'),
  name: z.string().min(1, 'Naam is verplicht').max(100, 'Maximaal 100 tekens'),
  description: z.string().max(500, 'Maximaal 500 tekens').optional(),
  color: z.string().regex(HEX, 'Geldige hex-kleur vereist (bijv. #DC2626)'),
  isCritical: z.boolean(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  modelId: string;
  charId: string;
  /** Bestaande optie → bewerk-modus; afwezig → aanmaak-modus. */
  option?: ClassificationOption | null;
}

export function OptionModal({ isOpen, onClose, modelId, charId, option }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateOption(modelId, charId);
  const updateMutation = useUpdateOption(modelId, charId);
  const isEdit = !!option;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const color = watch('color');
  // Native color picker eist een geldige hex; val terug op grijs zolang de input ongeldig is.
  const swatchColor = color && HEX.test(color) ? color : '#6B7280';

  useEffect(() => {
    if (!isOpen) return;
    reset({
      code: option?.code ?? '',
      name: option?.name ?? '',
      description: option?.description ?? '',
      color: option?.color ?? '#16A34A',
      isCritical: option?.isCritical ?? false,
    });
  }, [isOpen, option, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && option) {
        // code is immutable → niet meesturen op update.
        await updateMutation.mutateAsync({
          optionId: option.id,
          data: {
            name: data.name,
            description: data.description || null,
            color: data.color,
            isCritical: data.isCritical,
          },
        });
        showToast('Optie bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({
          code: data.code,
          name: data.name,
          description: data.description || undefined,
          color: data.color,
          isCritical: data.isCritical,
        });
        showToast('Optie toegevoegd', 'success');
      }
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Optie bewerken' : 'Optie toevoegen'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Code"
            placeholder="bijv. GOEDGEKEURD"
            error={errors.code?.message}
            disabled={isEdit}
            helperText={isEdit ? 'De code kan niet worden gewijzigd.' : undefined}
            {...register('code')}
          />
          <Input label="Naam" placeholder="Weergavenaam" error={errors.name?.message} {...register('name')} />
        </div>

        {/* Kleur: native picker + hex-input, gesynchroniseerd via setValue. */}
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Kleur</label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label="Kleurkiezer"
              value={swatchColor}
              onChange={(e) =>
                setValue('color', e.target.value.toUpperCase(), {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              className="h-10 w-12 flex-shrink-0 cursor-pointer rounded border border-gray-300 p-0.5"
            />
            <div className="flex-1">
              <Input placeholder="#RRGGBB" error={errors.color?.message} {...register('color')} />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Omschrijving</label>
          <textarea
            {...register('description')}
            rows={2}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
        </div>

        {/* Kritiek (PRD-14): stuurt Finding.isCritical bij constateringen met deze optie. */}
        <div>
          <Checkbox label="Kritiek" {...register('isCritical')} />
          <p className="mt-1 text-xs text-gray-500">
            Constateringen met deze classificatie-optie tellen als kritiek voor online herstel.
            Werkt door op nieuwe/bijgewerkte constateringen; draai voor bestaande constateringen
            het backfill-script <code>apps/api/scripts/backfill-finding-is-critical.ts</code>.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
