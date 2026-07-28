import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { ManualNumberField } from '@/components/numbering/manual-number-field';
import { useCreateProduct } from '../hooks/use-products';
import { useProductGroupsCompact } from '@/pages/product-groups/hooks/use-product-groups';
import { getErrorMessage } from '@/lib/api-client';

const unitOptions = [
  { value: 'uur', label: 'Uur' },
  { value: 'stuks', label: 'Stuks' },
  { value: 'm2', label: 'm²' },
  { value: 'm', label: 'Meter' },
  { value: 'km', label: 'Kilometer' },
  { value: 'dag', label: 'Dag' },
  { value: 'traject', label: 'Traject' },
];

const schema = z.object({
  name: z.string().min(1, 'Naam is verplicht'),
  productCode: z.string().optional(),
  unit: z.string().min(1, 'Eenheid is verplicht'),
  description: z.string().optional(),
  defaultVat: z.coerce.number().min(0).max(100).optional(),
  productGroupId: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface CreateProductModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateProductModal({ isOpen, onClose }: CreateProductModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateProduct();
  const { data: productGroups } = useProductGroupsCompact();

  const groupOptions = [
    { value: '', label: '— Geen groep —' },
    ...(productGroups ?? []).map((g) => ({ value: g.id, label: g.name })),
  ];

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { unit: 'uur', defaultVat: 21 },
  });

  const onSubmit = async (data: FormData) => {
    try {
      await createMutation.mutateAsync({
        name: data.name,
        productCode: data.productCode?.trim() || undefined,
        unit: data.unit,
        description: data.description || undefined,
        defaultVat: data.defaultVat,
        productGroupId: data.productGroupId || undefined,
      });
      showToast('Product aangemaakt!', 'success');
      reset();
      onClose();
    } catch {
      /* foutmelding wordt centraal getoond via useApiMutation */
    }
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Product aanmaken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="NEN1010 Inspectie"
          error={errors.name?.message}
          {...register('name')}
        />

        <ManualNumberField
          model="PRODUCT"
          label="Productcode"
          registration={register('productCode')}
          error={errors.productCode?.message}
        />

        <Select
          label="Eenheid"
          options={unitOptions}
          error={errors.unit?.message}
          {...register('unit')}
        />

        <Input
          label="Beschrijving"
          placeholder="Optionele beschrijving"
          {...register('description')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="BTW %"
            type="number"
            placeholder="21"
            error={errors.defaultVat?.message}
            {...register('defaultVat')}
          />
          <Select
            label="Productgroep"
            options={groupOptions}
            {...register('productGroupId')}
          />
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={createMutation.isPending}>
            Aanmaken
          </Button>
        </div>
      </form>
    </Modal>
  );
}
