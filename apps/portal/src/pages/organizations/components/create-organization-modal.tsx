import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Modal, Input, Button, useToast } from '@/components/ui';
import { useCreateOrganization } from '../hooks/use-organizations';

const organizationSchema = z.object({
  name: z.string().min(2, 'Naam moet minimaal 2 tekens bevatten'),
  slug: z
    .string()
    .min(1, 'Slug is verplicht')
    .regex(/^[a-z0-9]+$/, 'Slug mag alleen kleine letters en cijfers bevatten'),
  logoUrl: z.string().url('Ongeldige URL').optional().or(z.literal('')),
  primaryColor: z.string().optional(),
  defaultVat: z.coerce.number().min(0).max(100).optional(),
  defaultValidityDays: z.coerce.number().int().min(1).optional(),
});

type OrganizationFormData = z.infer<typeof organizationSchema>;

interface CreateOrganizationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateOrganizationModal({
  isOpen,
  onClose,
}: CreateOrganizationModalProps) {
  const { showToast } = useToast();
  const createMutation = useCreateOrganization();
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<OrganizationFormData>({
    resolver: zodResolver(organizationSchema),
    defaultValues: {
      name: '',
      slug: '',
      logoUrl: '',
      primaryColor: '#1E40AF',
      defaultVat: 21,
      defaultValidityDays: 30,
    },
  });

  const name = watch('name');

  // Auto-generate slug from name until user manually edits slug
  useEffect(() => {
    if (!slugTouched && name) {
      const autoSlug = name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
      setValue('slug', autoSlug);
    }
  }, [name, slugTouched, setValue]);

  const onSubmit = async (data: OrganizationFormData) => {
    try {
      const cleaned: Record<string, any> = {
        name: data.name,
        slug: data.slug,
      };
      if (data.logoUrl) cleaned.logoUrl = data.logoUrl;
      if (data.primaryColor) cleaned.primaryColor = data.primaryColor;
      if (data.defaultVat !== undefined) cleaned.defaultVat = data.defaultVat;
      if (data.defaultValidityDays !== undefined)
        cleaned.defaultValidityDays = data.defaultValidityDays;

      await createMutation.mutateAsync(cleaned as any);
      showToast('Organisatie aangemaakt!', 'success');
      reset();
      setSlugTouched(false);
      onClose();
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Aanmaken mislukt',
        'error',
      );
    }
  };

  const handleClose = () => {
    reset();
    setSlugTouched(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Organisatie aanmaken"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Naam"
          placeholder="Bouwbedrijf De Vries BV"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Slug"
          placeholder="bouwbedrijfdevries"
          helperText="Wordt gebruikt als subdomein (bijv. slug.inspexi.nl)"
          error={errors.slug?.message}
          {...register('slug', {
            onChange: () => setSlugTouched(true),
          })}
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Primaire kleur"
            type="color"
            helperText="Huiskleur voor branding"
            error={errors.primaryColor?.message}
            {...register('primaryColor')}
          />

          <Input
            label="Logo URL"
            placeholder="https://..."
            error={errors.logoUrl?.message}
            {...register('logoUrl')}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="Standaard BTW (%)"
            type="number"
            step="0.01"
            error={errors.defaultVat?.message}
            {...register('defaultVat')}
          />

          <Input
            label="Standaard geldigheid (dagen)"
            type="number"
            error={errors.defaultValidityDays?.message}
            {...register('defaultValidityDays')}
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
