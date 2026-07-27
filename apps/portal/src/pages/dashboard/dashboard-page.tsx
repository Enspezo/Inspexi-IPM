import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '@/providers/auth-provider';
import { Card, Spinner } from '@/components/ui';
import { DetailPageLayout } from '@/components/layout/detail-page-layout';
import { useMyActivity } from '@/hooks/use-my-activity';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { useDashboardStats } from './hooks/use-dashboard-stats';
import { useFeatures } from '@/providers/feature-provider';
import { AUDIT_ACTION, getStatusConfig, TASK_STATUS } from '@/lib/status';
import { TaskStatus } from '@/types';
import type { AuditLogEntry, Task } from '@/types';
import {
  getEntityTypeLabel,
  getEntityLink,
  getEntityDisplayName,
} from '@/lib/audit-entity-helpers';

// B-001: statische tegel-definities (label/icoon/kleur); de waarden komen
// runtime uit /portal/stats/staff-dashboard resp. de al opgehaalde taken.
interface StatTileDef {
  key: 'activeInspections' | 'users' | 'openTasks' | 'reports';
  label: string;
  icon: ReactNode;
  bg: string;
  /** SaaS-feature die deze tegel vereist (zelfde gating als de sidebar). */
  feature?: 'BASIS_INSPECTIES';
}

const STAT_TILES: StatTileDef[] = [
  {
    key: 'activeInspections',
    label: 'Actieve inspecties',
    feature: 'BASIS_INSPECTIES',
    icon: (
      <svg className="h-6 w-6 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    bg: 'bg-primary-50',
  },
  {
    key: 'users',
    label: 'Gebruikers',
    icon: (
      <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    bg: 'bg-green-50',
  },
  {
    key: 'openTasks',
    label: 'Mijn openstaande taken',
    icon: (
      <svg className="h-6 w-6 text-orange-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    bg: 'bg-orange-50',
  },
  {
    key: 'reports',
    label: 'Rapporten',
    feature: 'BASIS_INSPECTIES',
    icon: (
      <svg className="h-6 w-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    bg: 'bg-purple-50',
  },
];

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
        className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${getStatusConfig(AUDIT_ACTION, entry.action).classes}`}
      >
        {getStatusConfig(AUDIT_ACTION, entry.action).label}
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

// ─── Date helpers ────────────────────────────────────────────────────────────

function getTodayBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function filterTodayTasks(tasks: Task[]): Task[] {
  const { start, end } = getTodayBounds();
  return tasks.filter(
    (t) =>
      t.status !== TaskStatus.VOLTOOID &&
      t.deadline &&
      new Date(t.deadline) >= start &&
      new Date(t.deadline) <= end,
  );
}

function filterUpcomingTasks(tasks: Task[]): Task[] {
  const { end: todayEnd } = getTodayBounds();
  const in5Days = new Date(todayEnd.getTime() + 5 * 24 * 60 * 60 * 1000);
  return tasks.filter(
    (t) =>
      t.status !== TaskStatus.VOLTOOID &&
      t.deadline &&
      new Date(t.deadline) > todayEnd &&
      new Date(t.deadline) <= in5Days,
  );
}

// ─── Task row ────────────────────────────────────────────────────────────────

function DashboardTaskRow({ task }: { task: Task }) {
  return (
    <Link
      to={`/tasks/${task.id}`}
      className="flex items-center gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-gray-50"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{task.title}</p>
        {task.entityName && (
          <p className="truncate text-xs text-gray-400">{task.entityName}</p>
        )}
      </div>
      <span
        className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
          getStatusConfig(TASK_STATUS, task.status).classes
        }`}
      >
        {getStatusConfig(TASK_STATUS, task.status).label}
      </span>
    </Link>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user } = useAuth();
  const { hasFeature } = useFeatures();
  const { data: activityData, isLoading: activityLoading } = useMyActivity({ limit: 5 });
  const { data: myTasksData, isLoading: tasksLoading } = useTasks({ onlyMine: true, limit: 100 });
  const { data: statsData, isLoading: statsLoading } = useDashboardStats();

  const myTasks = myTasksData?.data ?? [];
  const allTodayTasks = filterTodayTasks(myTasks);
  const allUpcomingTasks = filterUpcomingTasks(myTasks);

  // B-001: "Mijn openstaande taken" komt uit de al opgehaalde taken-respons;
  // de overige tellingen uit /portal/stats/staff-dashboard.
  // 'loading' → spinner, 'error' → em-dash, null → tegel verbergen (geen
  // entitlement volgens de backend), number → waarde tonen.
  const openTaskCount = myTasks.filter((t) => t.status !== TaskStatus.VOLTOOID).length;
  const tileValue = (tile: StatTileDef): number | null | 'loading' | 'error' => {
    if (tile.key === 'openTasks') {
      if (tasksLoading) return 'loading';
      return myTasksData ? openTaskCount : 'error';
    }
    if (statsLoading) return 'loading';
    if (!statsData) return 'error';
    switch (tile.key) {
      case 'activeInspections':
        return statsData.activeInspections;
      case 'users':
        return statsData.activeUsers;
      case 'reports':
        return statsData.reports;
    }
  };
  // Zelfde gating als de sidebar: tegel weg zonder feature; ook weg wanneer de
  // backend `null` teruggeeft (org zonder inspectie-entitlement).
  const visibleTiles = STAT_TILES.filter(
    (tile) => !tile.feature || hasFeature(tile.feature),
  ).filter((tile) => tileValue(tile) !== null);

  // Max 10 total — today tasks get priority
  const DISPLAY_LIMIT = 10;
  const todayDisplay = allTodayTasks.slice(0, DISPLAY_LIMIT);
  const upcomingDisplay = allUpcomingTasks.slice(0, Math.max(0, DISPLAY_LIMIT - todayDisplay.length));

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

        {/* Stats grid (B-001: echte tellingen, spinner tijdens laden) */}
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {visibleTiles.map((tile) => {
            const value = tileValue(tile);
            return (
              <Card key={tile.key}>
                <div className="flex items-center gap-4">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${tile.bg}`}>
                    {tile.icon}
                  </div>
                  <div>
                    {value === 'loading' ? (
                      <div className="flex h-8 items-center">
                        <Spinner size="sm" />
                      </div>
                    ) : (
                      <p className="text-2xl font-bold text-gray-900">
                        {value === 'error' ? '—' : value}
                      </p>
                    )}
                    <p className="text-sm text-gray-500">{tile.label}</p>
                  </div>
                </div>
              </Card>
            );
          })}
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
                  to="/profile?tab=activiteiten"
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

          <Card title="Aankomende taken">
            <div className="space-y-5">
              {/* ── Mijn taken vandaag ── */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Mijn taken vandaag
                </p>
                {allTodayTasks.length === 0 ? (
                  <p className="py-3 text-center text-sm text-gray-400">Geen taken voor vandaag</p>
                ) : (
                  <div className="-mx-1 divide-y divide-gray-50">
                    {todayDisplay.map((task) => (
                      <DashboardTaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <Link
                    to="/tasks"
                    className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    alle taken ({allTodayTasks.length})
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>

              {/* ── Aankomende taken (volgende 5 dagen) ── */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Aankomende taken
                </p>
                {allUpcomingTasks.length === 0 ? (
                  <p className="py-3 text-center text-sm text-gray-400">Geen aankomende taken</p>
                ) : (
                  <div className="-mx-1 divide-y divide-gray-50">
                    {upcomingDisplay.map((task) => (
                      <DashboardTaskRow key={task.id} task={task} />
                    ))}
                  </div>
                )}
                <div className="mt-2 border-t border-gray-100 pt-2">
                  <Link
                    to="/tasks"
                    className="flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700"
                  >
                    alle taken ({allUpcomingTasks.length})
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </DetailPageLayout>
  );
}
