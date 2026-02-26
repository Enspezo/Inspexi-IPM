import { Link } from 'react-router-dom';
import { useAuth } from '@/providers/auth-provider';
import { Card, Spinner } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useMyActivity } from '@/hooks/use-my-activity';
import { AuditAction } from '@/types';
import type { AuditLogEntry } from '@/types';
import {
  getEntityTypeLabel,
  getEntityLink,
  getEntityDisplayName,
} from '@/lib/audit-entity-helpers';

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

const actionBadgeClasses: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'bg-green-100 text-green-800',
  [AuditAction.UPDATE]: 'bg-blue-100 text-blue-800',
  [AuditAction.DELETE]: 'bg-red-100 text-red-800',
};

const actionLabels: Record<AuditAction, string> = {
  [AuditAction.CREATE]: 'Aangemaakt',
  [AuditAction.UPDATE]: 'Bijgewerkt',
  [AuditAction.DELETE]: 'Verwijderd',
};

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const diff = now - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`;
  return new Date(dateStr).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function ActivityRow({ entry }: { entry: AuditLogEntry }) {
  const link = getEntityLink(entry.entityType, entry.entityId, entry.snapshot);
  const name = getEntityDisplayName(entry.entityType, entry.snapshot);
  const typeLabel = getEntityTypeLabel(entry.entityType);

  const content = (
    <div className="flex items-start gap-3 px-1 py-2">
      <span
        className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${actionBadgeClasses[entry.action]}`}
      >
        {actionLabels[entry.action]}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-gray-800">
          <span className="font-medium">{typeLabel}</span>
          {name !== typeLabel && (
            <span className="text-gray-500"> &mdash; {name}</span>
          )}
        </p>
        <p className="text-xs text-gray-400">{formatRelativeTime(entry.createdAt)}</p>
      </div>
      {link && (
        <svg className="h-4 w-4 shrink-0 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </div>
  );

  if (link) {
    return (
      <Link
        to={link}
        className="block rounded-lg transition-colors hover:bg-gray-50"
      >
        {content}
      </Link>
    );
  }

  return <div className="rounded-lg">{content}</div>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data: activityData, isLoading: activityLoading } = useMyActivity({ limit: 5 });

  const hasActivity = activityData && activityData.data.length > 0;

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
                <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${stat.bg}`}>
                  {stat.icon}
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  <p className="text-sm text-gray-500">{stat.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Bottom sections */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recente activiteit */}
          <Card title="Recente activiteit">
            {activityLoading && (
              <div className="flex h-48 items-center justify-center">
                <Spinner size="sm" />
              </div>
            )}

            {!activityLoading && !hasActivity && (
              <div className="flex h-32 items-center justify-center text-gray-400">
                <p className="text-sm">Nog geen recente activiteit</p>
              </div>
            )}

            {!activityLoading && hasActivity && (
              <div className="-mx-1 divide-y divide-gray-50">
                {activityData.data.map((entry) => (
                  <ActivityRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}

            {!activityLoading && (
              <div className="mt-3 border-t border-gray-100 pt-3">
                <Link
                  to="/activiteiten"
                  className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
                >
                  Alle activiteiten
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            )}
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
