import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/providers/auth-provider';
import { Card, Input, Button, Spinner, useToast } from '@/components/ui';
import {
  useOrganization,
  useUpdateOrganization,
} from './hooks/use-organization';

const orgSchema = z.object({
  name: z.string().min(1, 'Organisatienaam is verplicht'),
  slug: z.string(),
  primaryColor: z.string().nullable().optional(),
  defaultVat: z.coerce
    .number()
    .min(0, 'BTW moet minimaal 0 zijn')
    .max(100, 'BTW mag maximaal 100 zijn'),
  defaultValidityDays: z.coerce
    .number()
    .int('Moet een geheel getal zijn')
    .min(1, 'Minimaal 1 dag'),
});

type OrgFormData = z.infer<typeof orgSchema>;

export default function OrganizationSettingsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data: organization, isLoading } = useOrganization(user?.orgId);
  const updateMutation = useUpdateOrganization(user?.orgId);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<OrgFormData>({
    resolver: zodResolver(orgSchema),
  });

  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        slug: organization.slug,
        primaryColor: organization.primaryColor,
        defaultVat: organization.defaultVat,
        defaultValidityDays: organization.defaultValidityDays,
      });
    }
  }, [organization, reset]);

  const onSubmit = async (data: OrgFormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        primaryColor: data.primaryColor,
        defaultVat: data.defaultVat,
        defaultValidityDays: data.defaultValidityDays,
      });
      showToast('Organisatie-instellingen opgeslagen', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Opslaan mislukt',
        'error',
      );
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Organisatie-instellingen
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Beheer de instellingen van uw organisatie
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <Input
              label="Organisatienaam"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Slug"
              disabled
              helperText="De slug kan niet worden gewijzigd"
              {...register('slug')}
            />

            <Input
              label="Primaire kleur"
              type="color"
              helperText="Kies een huiskleur voor uw organisatie"
              error={errors.primaryColor?.message}
              {...register('primaryColor')}
            />

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

          <div className="flex justify-end border-t border-gray-200 pt-4">
            <Button
              type="submit"
              isLoading={updateMutation.isPending}
              disabled={!isDirty}
            >
              Opslaan
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
