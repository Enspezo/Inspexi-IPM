import { useAuth } from '@/providers/auth-provider';
import { Card } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';

const stats = [
  {
    label: 'Actieve inspecties',
    value: '--',
    icon: (
      <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    bg: 'bg-primary-50',
  },
  {
    label: 'Gebruikers',
    value: '--',
    icon: (
      <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    bg: 'bg-green-50',
  },
  {
    label: 'Openstaande taken',
    value: '--',
    icon: (
      <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: 'bg-orange-50',
  },
  {
    label: 'Rapporten',
    value: '--',
    icon: (
      <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    bg: 'bg-purple-50',
  },
];

export default function DashboardPage() {
  const { user } = useAuth();

  return (
    <DetailPageLayout>
    <div className="space-y-6">
      {/* Welcome */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">
          Welkom terug, {user?.firstName}!
        </h2>
        <p className="mt-1 text-gray-500">
          Hier is een overzicht van uw organisatie.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-lg ${stat.bg}`}
              >
                {stat.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900">
                  {stat.value}
                </p>
                <p className="text-sm text-gray-500">{stat.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Placeholder content */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Recente activiteit">
          <div className="flex h-48 items-center justify-center text-gray-400">
            <p className="text-sm">Nog geen recente activiteit</p>
          </div>
        </Card>
        <Card title="Aankomende inspecties">
          <div className="flex h-48 items-center justify-center text-gray-400">
            <p className="text-sm">Geen aankomende inspecties</p>
          </div>
        </Card>
      </div>
    </div>
    </DetailPageLayout>
  );
}
