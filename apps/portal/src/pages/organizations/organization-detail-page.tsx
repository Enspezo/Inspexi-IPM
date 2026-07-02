import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Role } from '@/types';
import type { User } from '@/types';
import { Button, Card, Checkbox, ErrorBox, Input, Spinner, Badge, Tabs, useToast } from '@/components/ui';
import { formatDate, formatDateTime } from '@/lib/format';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { AuditHistory } from '@/components/audit-history/audit-history';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import {
  useOrganization,
  useOrganizationUsers,
  useUpdateOrganization,
} from './hooks/use-organizations';
import { OrganizationEntitlementsTab } from './components/organization-entitlements-tab';

type Tab = 'algemeen' | 'gebruikers' | 'abonnement' | 'instellingen';

const settingsSchema = z.object({
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
  chatEnabled: z.boolean(),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

const roleOrder: Role[] = [
  Role.ORG_ADMIN,
  Role.MANAGER,
  Role.BACKOFFICE,
  Role.WERKVOORBEREIDER,
  Role.INSPECTEUR,
];

export default function OrganizationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { user } = useAuth();
  const isSuperuser = hasRole(user, Role.SUPERUSER);
  const { data: org, isLoading, error } = useOrganization(id!);
  const { data: users, isLoading: usersLoading } = useOrganizationUsers(id!);
  const updateMutation = useUpdateOrganization(id!);

  const [activeTab, setActiveTab] = useState<Tab>('algemeen');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
  });

  useEffect(() => {
    if (org) {
      reset({
        name: org.name,
        slug: org.slug,
        primaryColor: org.primaryColor,
        defaultVat: org.defaultVat,
        defaultValidityDays: org.defaultValidityDays,
        chatEnabled: org.chatEnabled ?? true,
      });
    }
  }, [org, reset]);

  const onSettingsSubmit = async (data: SettingsFormData) => {
    try {
      await updateMutation.mutateAsync({
        name: data.name,
        primaryColor: data.primaryColor,
        defaultVat: data.defaultVat,
        defaultValidityDays: data.defaultValidityDays,
        chatEnabled: data.chatEnabled,
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

  if (error || !org) {
    return (
      <ErrorBox>{error?.message || 'Organisatie niet gevonden'}</ErrorBox>
    );
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'algemeen', label: 'Algemeen' },
    { key: 'gebruikers', label: `Gebruikers (${org._count?.users ?? 0})` },
    // Abonnement-beheer is SUPERUSER-only (platform); de endpoints weigeren anders.
    ...(isSuperuser
      ? [{ key: 'abonnement' as Tab, label: 'Abonnement' }]
      : []),
    { key: 'instellingen', label: 'Instellingen' },
  ];

  const sortedUsers = [...(users || [])].sort((a, b) => {
    const aIdx = Math.min(...a.roles.map((r) => { const i = roleOrder.indexOf(r); return i === -1 ? 99 : i; }));
    const bIdx = Math.min(...b.roles.map((r) => { const i = roleOrder.indexOf(r); return i === -1 ? 99 : i; }));
    return aIdx - bIdx;
  });

  return (
    <DetailPageLayout
      sidebar={<AuditHistory entityType="Organization" entityId={id} />}
    >
      <div className="space-y-6">
        {/* Back + Header */}
        <div>
          <button
            onClick={() => navigate('/organizations')}
            className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Terug naar overzicht
          </button>
          <div className="flex items-center gap-3">
            {org.primaryColor && (
              <div
                className="h-8 w-8 rounded-lg border border-gray-200"
                style={{ backgroundColor: org.primaryColor }}
              />
            )}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{org.name}</h2>
              <p className="text-sm text-gray-500">
                {org.slug}.inspexi.nl
              </p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* Tab: Algemeen */}
        {activeTab === 'algemeen' && (
          <Card>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Organisatienaam
                </p>
                <p className="mt-1 text-sm text-gray-900">{org.name}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Slug</p>
                <p className="mt-1 text-sm text-gray-900">
                  <span className="font-mono">{org.slug}</span>
                  <span className="ml-1 text-gray-400">.inspexi.nl</span>
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Primaire kleur
                </p>
                {org.primaryColor ? (
                  <div className="mt-1 flex items-center gap-2">
                    <div
                      className="h-6 w-6 rounded border border-gray-200"
                      style={{ backgroundColor: org.primaryColor }}
                    />
                    <span className="font-mono text-sm text-gray-900">
                      {org.primaryColor}
                    </span>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-gray-400">Niet ingesteld</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Logo</p>
                {org.logoUrl ? (
                  <img
                    src={org.logoUrl}
                    alt={org.name}
                    className="mt-1 h-10 w-10 rounded-lg object-contain"
                  />
                ) : (
                  <p className="mt-1 text-sm text-gray-400">Geen logo</p>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Standaard BTW
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {org.defaultVat}%
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Standaard geldigheid
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {org.defaultValidityDays} dagen
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Aangemaakt op
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {formatDate(org.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Aantal gebruikers
                </p>
                <p className="mt-1 text-sm text-gray-900">
                  {org._count?.users ?? 0}
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Tab: Gebruikers */}
        {activeTab === 'gebruikers' && (
          <Card>
            {usersLoading ? (
              <div className="flex justify-center py-8">
                <Spinner size="sm" />
              </div>
            ) : sortedUsers.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">
                Geen gebruikers in deze organisatie
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Naam
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        E-mail
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Rol
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        Aangemaakt
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sortedUsers.map((user: User) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {user.firstName} {user.lastName}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {user.email}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {user.roles.map((r) => (
                              <Badge key={r} role={r} />
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 text-sm ${
                              user.isActive
                                ? 'text-green-700'
                                : 'text-gray-500'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                user.isActive
                                  ? 'bg-green-500'
                                  : 'bg-gray-300'
                              }`}
                            />
                            {user.isActive ? 'Actief' : 'Inactief'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {formatDateTime(user.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        )}

        {/* Tab: Abonnement (SUPERUSER) */}
        {activeTab === 'abonnement' && isSuperuser && (
          <OrganizationEntitlementsTab orgId={id!} />
        )}

        {/* Tab: Instellingen */}
        {activeTab === 'instellingen' && (
          <Card>
            <form
              onSubmit={handleSubmit(onSettingsSubmit)}
              className="space-y-6"
            >
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
                  helperText="Kies een huiskleur voor de organisatie"
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

              <div className="border-t border-gray-200 pt-4">
                <Checkbox label="Interne chat inschakelen" {...register('chatEnabled')} />
                <p className="mt-1 text-xs text-gray-500">
                  Schakelt de interne chat (incl. inspecteur-app) voor deze organisatie in of uit. Bestaande gesprekken blijven bewaard.
                </p>
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
        )}
      </div>
    </DetailPageLayout>
  );
}
