import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/providers/auth-provider';
import { apiClient } from '@/lib/api-client';
import { formatDate } from '@/lib/format';
import { Card, Input, Button, Badge, Tabs, useToast } from '@/components/ui';
import { Role } from '@/types';
import { hasRole } from '@/lib/has-role';
import type { User } from '@/types';
import { InspectorCard } from './components/inspector-card';
import { ClientContactCard } from './components/client-contact-card';
import { NotificationPrefsCard } from './components/notification-prefs-card';
import { SessionsCard } from './components/sessions-card';
import { AvatarCard } from './components/avatar-card';
import { SignatureCard } from './components/signature-card';
import { HomeAddressCard } from './components/home-address-card';
import { ApprovalDefaultsCard } from './components/approval-defaults-card';
import { MyDefaultInstrumentsSection } from '@/pages/meetmiddelen/components/my-default-instruments-section';
import { ActivityTab } from './components/activity-tab';

const profileSchema = z.object({
  firstName: z.string().min(1, 'Voornaam is verplicht'),
  lastName: z.string().min(1, 'Achternaam is verplicht'),
  email: z.string().email('Ongeldig e-mailadres'),
  initials: z
    .string()
    .max(4, 'Maximaal 4 tekens')
    .regex(/^[A-Z]*$/, 'Alleen hoofdletters (A-Z)')
    .optional()
    .transform((v) => v || undefined),
});

type ProfileFormData = z.infer<typeof profileSchema>;

// ──────────────────────────────────────────────────────────

type ProfileTab = 'profiel' | 'notificaties' | 'activiteiten';

const VALID_TABS: ProfileTab[] = ['profiel', 'notificaties', 'activiteiten'];

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as ProfileTab | null;
  const initialTab = tabParam && VALID_TABS.includes(tabParam) ? tabParam : 'profiel';
  const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);

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
        initials: user.initials ?? '',
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

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'profiel', label: 'Profiel' },
    { key: 'notificaties', label: 'Notificaties' },
    { key: 'activiteiten', label: 'Activiteiten' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Profiel</h2>
        <p className="mt-1 text-sm text-gray-500">
          Beheer uw persoonlijke gegevens
        </p>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      {activeTab === 'profiel' && (
        <>
          {/* Avatar */}
          <AvatarCard />

          {/* Inspector color + iCal (only for inspectors) */}
          {user && hasRole(user, Role.INSPECTEUR) && <InspectorCard />}

          {/* Contactgegevens klantportaal (only for inspectors) */}
          {user && hasRole(user, Role.INSPECTEUR) && <ClientContactCard />}

          {/* Standaard meetmiddelen — niveau 1 (only for inspectors) */}
          {user && hasRole(user, Role.INSPECTEUR) && (
            <Card title="Standaard meetmiddelen">
              <MyDefaultInstrumentsSection />
            </Card>
          )}

          {/* Signature */}
          <SignatureCard />

          {/* Standaard goedkeurder (vrijwillige persoon-goedkeuring) */}
          <ApprovalDefaultsCard />

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

                  <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                    <div>
                      <Input
                        label="Initialen"
                        placeholder="bv. JDV"
                        maxLength={4}
                        error={errors.initials?.message}
                        {...register('initials', {
                          onChange: (e) => {
                            e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '');
                          },
                        })}
                      />
                      <p className="mt-1 text-xs text-gray-500">
                        Max. 4 hoofdletters (A–Z). Wordt gebruikt bij offertes en documentnaamgeving.
                      </p>
                    </div>
                  </div>

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
                      {user && (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((r) => (
                            <Badge key={r} role={r} />
                          ))}
                        </div>
                      )}
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

          {/* Home address */}
          <HomeAddressCard />

          {/* Sessions */}
          <SessionsCard />
        </>
      )}

      {activeTab === 'notificaties' && <NotificationPrefsCard />}

      {activeTab === 'activiteiten' && <ActivityTab />}
    </div>
  );
}
