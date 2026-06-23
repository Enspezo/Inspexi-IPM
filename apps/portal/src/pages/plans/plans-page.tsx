import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  ErrorBox,
  Spinner,
  Table,
  type Column,
} from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { PageHeader } from '@/components/layout/page-header';
import type { Plan } from '@/lib/entitlements';
import { usePlans } from './hooks/use-plans';
import { CreatePlanModal } from './components/create-plan-modal';

export default function PlansPage() {
  const navigate = useNavigate();
  const { data: plans, isLoading, error } = usePlans();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const columns: Column<Plan>[] = [
    {
      key: 'name',
      header: 'Naam',
      render: (plan) => (
        <button
          onClick={() => navigate(`/plans/${plan.id}`)}
          className="font-medium text-primary-600 hover:text-primary-800 hover:underline"
        >
          {plan.name}
        </button>
      ),
    },
    {
      key: 'slug',
      header: 'Slug',
      render: (plan) => (
        <span className="font-mono text-sm text-gray-600">{plan.slug}</span>
      ),
    },
    {
      key: 'features',
      header: 'Functies',
      render: (plan) => (
        <span className="text-gray-700">{plan.features.length}</span>
      ),
    },
    {
      key: 'organizations',
      header: 'Organisaties',
      render: (plan) => (
        <span className="text-gray-700">{plan._count?.organizations ?? 0}</span>
      ),
    },
    {
      key: 'isActive',
      header: 'Status',
      render: (plan) =>
        plan.isActive ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-green-700">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            Actief
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-sm text-gray-500">
            <span className="h-2 w-2 rounded-full bg-gray-300" />
            Inactief
          </span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (plan) => (
        <button
          onClick={() => navigate(`/plans/${plan.id}`)}
          className="rounded-lg px-3 py-1.5 text-sm font-medium text-primary-600 transition-colors hover:bg-primary-50"
        >
          Beheren
        </button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error) {
    return <ErrorBox>Fout bij het laden van abonnementen: {error.message}</ErrorBox>;
  }

  return (
    <DetailPageLayout
      sidebar={
        <Card>
          <h3 className="text-sm font-semibold text-gray-900">Over abonnementen</h3>
          <p className="mt-2 text-sm text-gray-500">
            Een abonnement is een sjabloon van functies. Wijs het toe aan een
            organisatie via <span className="font-medium">Organisaties → detail →
            Abonnement</span>. Daar kun je per organisatie functies bij- of
            afschakelen bovenop het abonnement.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Afhankelijkheden worden automatisch afgedwongen: een functie die door
            een andere vereist is, blijft actief.
          </p>
        </Card>
      }
    >
      <div className="space-y-6">
        <PageHeader
          title="Abonnementen"
          description="Beheer de SaaS-abonnementsvormen en hun functies"
          actions={
            <Button onClick={() => setIsCreateOpen(true)}>Nieuw abonnement</Button>
          }
        />

        <Table
          columns={columns}
          data={plans || []}
          keyExtractor={(plan) => plan.id}
          emptyMessage="Nog geen abonnementen. Maak er een aan."
        />

        <CreatePlanModal
          isOpen={isCreateOpen}
          onClose={() => setIsCreateOpen(false)}
        />
      </div>
    </DetailPageLayout>
  );
}
