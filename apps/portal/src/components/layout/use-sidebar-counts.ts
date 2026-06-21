import { useFavoriteKeys } from '@/pages/favorites/hooks/use-favorites';
import { useUnreadCount } from '@/pages/notifications/hooks/use-notifications';
import { useTasks } from '@/pages/tasks/hooks/use-tasks';
import { useNotes } from '@/pages/notes/hooks/use-notes';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { CRM_ROLES } from '@/lib/roles';
import { TaskStatus } from '@/types';

export interface SidebarCounts {
  favorites: number;
  notifications: number;
  tasks: number;
  notes: number;
}

/**
 * Counts for the personal-models icon bar at the bottom of the sidebar.
 *
 * Re-uses existing queries so nothing is over-fetched:
 * - notifications: the same `unread-count` the header bell polls (30s).
 * - tasks: the identical `{ onlyMine, limit: 100 }` query the header already
 *   runs, so this shares its cache — open = not VOLTOOID, counted client-side.
 * - favorites: the `favorites/keys` list that drives the stars.
 * - notes: a minimal `{ limit: 1 }` fetch read only for its `total` (org-wide
 *   root notes, matching the Notities overview); CRM-only, so it is disabled
 *   for roles without notes access to avoid a needless 403.
 *
 * Badges stay live because each source is invalidated by its own mutations.
 */
export function useSidebarCounts(): SidebarCounts {
  const { user } = useAuth();
  const canCrm = hasRole(user, CRM_ROLES);

  const { data: favoriteKeys } = useFavoriteKeys();
  const { data: unread } = useUnreadCount();
  const { data: myTasks } = useTasks({ onlyMine: true, limit: 100 });
  const { data: notes } = useNotes({ limit: 1 }, { enabled: canCrm });

  const openTasks = (myTasks?.data ?? []).filter(
    (t) => t.status !== TaskStatus.VOLTOOID,
  ).length;

  return {
    favorites: favoriteKeys?.length ?? 0,
    notifications: unread?.count ?? 0,
    tasks: canCrm ? openTasks : 0,
    notes: canCrm ? notes?.total ?? 0 : 0,
  };
}
