import { NavLink } from 'react-router-dom';
import { clsx } from 'clsx';
import { useAuth } from '@/providers/auth-provider';
import { hasRole } from '@/lib/has-role';
import { CRM_ROLES } from '@/lib/roles';
import { Role } from '@/types';
import { useSidebarCounts } from './use-sidebar-counts';

interface PersonalModel {
  key: 'favorites' | 'notifications' | 'tasks' | 'notes';
  to: string;
  label: string;
  roles?: Role[];
  icon: React.ReactNode;
}

// Order is fixed: Favorieten, Notificaties, Taken, Notities.
const personalModels: PersonalModel[] = [
  {
    key: 'favorites',
    to: '/favorites',
    label: 'Favorieten',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.562.562 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
      </svg>
    ),
  },
  {
    key: 'notifications',
    to: '/notifications',
    label: 'Notificaties',
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    key: 'tasks',
    to: '/tasks',
    label: 'Taken',
    roles: CRM_ROLES,
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    key: 'notes',
    to: '/notities',
    label: 'Notities',
    roles: CRM_ROLES,
    icon: (
      <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
];

/** Red count pill, styled to match the header notification bell. */
function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-2 -top-1.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}

/**
 * Pinned bar at the very bottom of the sidebar with the four personal models
 * as icons + count badges. Horizontal row when expanded, vertical stack when
 * collapsed (4 icons do not fit side-by-side in the 64px rail).
 */
export function SidebarBottomBar({ collapsed }: { collapsed: boolean }) {
  const { user } = useAuth();
  const counts = useSidebarCounts();

  const visible = personalModels.filter((m) => !m.roles || hasRole(user, m.roles));
  if (visible.length === 0) return null;

  return (
    <div
      className={clsx(
        'shrink-0 border-t border-gray-700 px-2 py-2',
        collapsed ? 'flex flex-col gap-1' : 'flex items-center gap-1',
      )}
    >
      {visible.map((model) => (
        <NavLink
          key={model.key}
          to={model.to}
          title={model.label}
          aria-label={model.label}
          className={({ isActive }) =>
            clsx(
              'relative flex items-center justify-center rounded-lg py-2.5 transition-colors duration-150',
              collapsed ? 'w-full' : 'flex-1',
              isActive
                ? 'bg-gray-800 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white',
            )
          }
        >
          <span className="relative flex">
            {model.icon}
            <CountBadge count={counts[model.key]} />
          </span>
        </NavLink>
      ))}
    </div>
  );
}
