import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { getErrorMessage } from '@/lib/api-client';
import {
  useCreateLookup,
  useUpdateLookup,
  type LookupKind,
  type LookupRow,
} from '@/lib/lookups';

const schema = z.object({
  code: z.string().min(1, 'Code is verplicht'),
  label: z.string().min(1, 'Label is verplicht'),
  color: z.string().optional(),
  sortOrder: z.coerce.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});
type FormData = z.infer<typeof schema>;

interface Props {
  isOpen: boolean;
  onClose: () => void;
  kind: LookupKind;
  /** Bestaande rij → bewerk-modus; afwezig → aanmaak-modus. */
  row?: LookupRow | null;
}

export function LookupEditModal({ isOpen, onClose, kind, row }: Props) {
  const { showToast } = useToast();
  const createMutation = useCreateLookup(kind);
  const updateMutation = useUpdateLookup(kind);
  const isEdit = !!row;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (isOpen) {
      reset({
        code: row?.code ?? '',
        label: row?.label ?? '',
        color: row?.color ?? '#6B7280',
        sortOrder: row?.sortOrder ?? 0,
        isActive: row?.isActive ?? true,
      });
    }
  }, [isOpen, row, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      if (isEdit && row) {
        await updateMutation.mutateAsync({
          id: row.id,
          data: { label: data.label, color: data.color || null, sortOrder: data.sortOrder, isActive: data.isActive },
        });
        showToast('Waarde bijgewerkt', 'success');
      } else {
        await createMutation.mutateAsync({
          code: data.code,
          label: data.label,
          color: data.color || null,
          sortOrder: data.sortOrder,
          isActive: data.isActive,
        });
        showToast('Waarde toegevoegd', 'success');
      }
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isEdit ? 'Waarde bewerken' : 'Waarde toevoegen'}>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Code"
          placeholder="bijv. in_progress"
          error={errors.code?.message}
          disabled={isEdit}
          {...register('code')}
        />
        <Input label="Label" placeholder="Weergavenaam" error={errors.label?.message} {...register('label')} />
        <div className="grid grid-cols-2 gap-4">
          <Input label="Kleur" type="color" {...register('color')} />
          <Input label="Volgorde" type="number" min={0} {...register('sortOrder')} />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" {...register('isActive')} />
          Actief
        </label>
        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Annuleren</Button>
          <Button type="submit" isLoading={createMutation.isPending || updateMutation.isPending}>
            {isEdit ? 'Opslaan' : 'Toevoegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
