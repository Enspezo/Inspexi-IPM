import { clsx } from 'clsx';
import { Role } from '@/types';
import { ROLE_LABELS } from '@/lib/roles';

interface BadgeProps {
  role: Role;
  className?: string;
}

const roleClasses: Record<Role, string> = {
  [Role.SUPERUSER]: 'bg-purple-100 text-purple-800 ring-purple-600/20',
  [Role.ORG_ADMIN]: 'bg-blue-100 text-blue-800 ring-blue-600/20',
  [Role.MANAGER]: 'bg-green-100 text-green-800 ring-green-600/20',
  [Role.BACKOFFICE]: 'bg-yellow-100 text-yellow-800 ring-yellow-600/20',
  [Role.WERKVOORBEREIDER]: 'bg-orange-100 text-orange-800 ring-orange-600/20',
  [Role.INSPECTEUR]: 'bg-gray-100 text-gray-800 ring-gray-600/20',
};

export function Badge({ role, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        roleClasses[role],
        className,
      )}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}
