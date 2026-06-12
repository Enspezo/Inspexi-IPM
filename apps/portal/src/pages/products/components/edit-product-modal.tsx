import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Select, Button, useToast } from '@/components/ui';
import { useUpdateProduct } from '../hooks/use-products';
import { useProductGroupsCompact } from '@/pages/product-groups/hooks/use-product-groups';
import type { Product } from '@/types';
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
  unit: z.string().min(1, 'Eenheid is verplicht'),
  description: z.string().optional(),
  defaultVat: z.coerce.number().min(0).max(100).optional(),
  productGroupId: z.string().optional(),
  isActive: z.boolean().optional(),
});

type FormData = z.infer<typeof schema>;

interface EditProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product;
  disableGroupSelect?: boolean;
}

export function EditProductModal({ isOpen, onClose, product, disableGroupSelect = false }: EditProductModalProps) {
  const { showToast } = useToast();
  const updateMutation = useUpdateProduct(product.id);
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
  });

  useEffect(() => {
    if (isOpen && product) {
      reset({
        name: product.name,
        unit: product.unit,
        description: product.description || '',
        defaultVat: product.defaultVat,
        productGroupId: product.productGroupId || '',
        isActive: product.isActive,
      });
    }
  }, [isOpen, product, reset]);

  const onSubmit = async (data: FormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        unit: data.unit,
        description: data.description || undefined,
        defaultVat: data.defaultVat,
        productGroupId: data.productGroupId || '',
        isActive: data.isActive,
      });
      showToast('Product bijgewerkt!', 'success');
      onClose();
    } catch (err) {
      showToast(getErrorMessage(err, 'Bijwerken mislukt'), 'error');
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Product bewerken">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          error={errors.name?.message}
          {...register('name')}
        />

        <Select
          label="Eenheid"
          options={unitOptions}
          error={errors.unit?.message}
          {...register('unit')}
        />

        <Input
          label="Beschrijving"
          {...register('description')}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="BTW %"
            type="number"
            error={errors.defaultVat?.message}
            {...register('defaultVat')}
          />
          <div>
            <Select
              label="Productgroep"
              options={groupOptions}
              disabled={disableGroupSelect}
              {...register('productGroupId')}
            />
            {disableGroupSelect && (
              <p className="mt-1 text-xs text-gray-400">
                Wijzig de groep via de productpagina
              </p>
            )}
          </div>
        </div>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            {...register('isActive')}
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm text-gray-700">Actief</span>
        </label>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Annuleren
          </Button>
          <Button type="submit" isLoading={updateMutation.isPending}>
            Opslaan
          </Button>
        </div>
      </form>
    </Modal>
  );
}
