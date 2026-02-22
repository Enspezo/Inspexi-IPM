import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { Card, Input, Button, Badge, useToast } from '@/components/ui';
import type { User } from '@/types';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht'),
  lastName: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
});

type ProfileFormData = z.infer<typeof profileSchema>;

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileFormData) =>
      apiClient.patch<User>('/users/profile', data),
    onSuccess: () => {
      refreshUser();
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      });
    }
  }, [user, reset]);

  const onSubmit = async (data: ProfileFormData) => {
    try {
      await updateProfileMutation.mutateAsync(data);
      showToast('Profiel bijgewerkt', 'success');
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Profiel bijwerken mislukt',
        'error',
      );
    }
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profiel</h2>
        <p className="mt-1 text-sm text-gray-500">
          Beheer uw persoonlijke gegevens
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Edit form */}
        <div className="lg:col-span-2">
          <Card title="Persoonlijke gegevens">
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <Input
                  label="Voornaam"
                  error={errors.firstName?.message}
                  {...register('firstName')}
                />
                <Input
                  label="Achternaam"
                  error={errors.lastName?.message}
                  {...register('lastName')}
                />
              </div>

              <Input
                label="E-mailadres"
                type="email"
                error={errors.email?.message}
                {...register('email')}
              />

              <div className="flex justify-end border-t border-gray-200 pt-4">
                <Button
                  type="submit"
                  isLoading={updateProfileMutation.isPending}
                  disabled={!isDirty}
                >
                  Opslaan
                </Button>
              </div>
            </form>
          </Card>
        </div>

        {/* Read-only info */}
        <div className="space-y-6">
          <Card title="Accountgegevens">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-medium text-gray-500">Rol</p>
                <div className="mt-1">
                  {user && <Badge role={user.role} />}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">Organisatie</p>
                <p className="mt-1 text-sm text-gray-900">
                  {user?.organization?.name || '-'}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  Account aangemaakt
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(user?.createdAt)}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">
                  E-mail geverifieerd
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {user?.emailVerifiedAt
                    ? formatDate(user.emailVerifiedAt)
                    : 'Niet geverifieerd'}
                </p>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-500">Status</p>
                <p className="mt-1">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm ${
                      user?.isActive ? 'text-green-700' : 'text-gray-500'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 rounded-full ${
                        user?.isActive ? 'bg-green-500' : 'bg-gray-300'
                      }`}
                    />
                    {user?.isActive ? 'Actief' : 'Inactief'}
                  </span>
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
