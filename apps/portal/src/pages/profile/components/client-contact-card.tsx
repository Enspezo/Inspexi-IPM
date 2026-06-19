import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient, getErrorMessage } from '@/lib/api-client';
import { Card, Input, Button, Checkbox, useToast } from '@/components/ui';
import type { User } from '@/types';

// ─── Contactgegevens inspecteur in klantportaal ───────────
// Aparte velden van de login-e-mail. Worden alleen aan klanten getoond als
// de organisatie dit per kanaal inschakelt én de inspecteur toestemming geeft.

const clientContactSchema = z.object({
  contactPhone: z.string().optional(),
  contactEmail: z
    .union([z.string().email('Voer een geldig e-mailadres in'), z.literal('')])
    .optional(),
  sharePhoneWithClients: z.boolean(),
  shareEmailWithClients: z.boolean(),
});

type ClientContactFormData = z.infer<typeof clientContactSchema>;

export function ClientContactCard() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const updateMutation = useMutation({
    mutationFn: (data: ClientContactFormData) =>
      apiClient.patch<User>('/users/profile', data),
    onSuccess: () => {
      refreshUser();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<ClientContactFormData>({
    resolver: zodResolver(clientContactSchema),
    defaultValues: {
      contactPhone: '',
      contactEmail: '',
      sharePhoneWithClients: false,
      shareEmailWithClients: false,
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        contactPhone: user.contactPhone ?? '',
        contactEmail: user.contactEmail ?? '',
        sharePhoneWithClients: user.sharePhoneWithClients ?? false,
        shareEmailWithClients: user.shareEmailWithClients ?? false,
      });
    }
  }, [user, reset]);

  const phoneValue = watch('contactPhone');
  const emailValue = watch('contactEmail');
  const hasPhone = Boolean(phoneValue && phoneValue.trim());
  const hasEmail = Boolean(emailValue && emailValue.trim());

  // Zet toestemming uit zodra het bijbehorende veld leeg wordt gemaakt.
  useEffect(() => {
    if (!hasPhone) setValue('sharePhoneWithClients', false);
  }, [hasPhone, setValue]);
  useEffect(() => {
    if (!hasEmail) setValue('shareEmailWithClients', false);
  }, [hasEmail, setValue]);

  const onSubmit = async (data: ClientContactFormData) => {
    try {
      await updateMutation.mutateAsync({
        contactPhone: data.contactPhone?.trim() || '',
        contactEmail: data.contactEmail?.trim() || '',
        sharePhoneWithClients: hasPhone ? data.sharePhoneWithClients : false,
        shareEmailWithClients: hasEmail ? data.shareEmailWithClients : false,
      });
      showToast('Contactgegevens klantportaal opgeslagen', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Opslaan mislukt'), 'error');
    }
  };

  return (
    <Card title="Contactgegevens in klantportaal">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        <p className="text-sm text-gray-500">
          Deze gegevens staan los van uw login-e-mailadres. Ze worden alleen aan
          klanten getoond in het klantportaal als uw organisatie dit inschakelt
          én u hieronder toestemming geeft.
        </p>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="space-y-3">
            <Input
              label="Telefoonnummer (klantportaal)"
              placeholder="Bijv. 06 12345678"
              error={errors.contactPhone?.message}
              {...register('contactPhone')}
            />
            <Checkbox
              label="Toon mijn telefoonnummer in het klantportaal"
              disabled={!hasPhone}
              {...register('sharePhoneWithClients')}
            />
            {!hasPhone && (
              <p className="text-xs text-gray-400">
                Vul eerst een telefoonnummer in om dit aan te kunnen zetten.
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Input
              label="E-mailadres (klantportaal)"
              type="email"
              placeholder="Bijv. inspecteur@mijnbedrijf.nl"
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
            <Checkbox
              label="Toon mijn e-mailadres in het klantportaal"
              disabled={!hasEmail}
              {...register('shareEmailWithClients')}
            />
            {!hasEmail && (
              <p className="text-xs text-gray-400">
                Vul eerst een e-mailadres in om dit aan te kunnen zetten.
              </p>
            )}
          </div>
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
  );
}
