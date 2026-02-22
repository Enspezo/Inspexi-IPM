import { clsx } from 'clsx';
import { Role } from '@/types';

interface BadgeProps {
  role: Role;
  className?: string;
}

const roleConfig: Record<Role, { label: string; classes: string }> = {
  [Role.SUPERUSER]: {
    label: 'Superuser',
    classes: 'bg-purple-100 text-purple-800 ring-purple-600/20',
  },
  [Role.ORG_ADMIN]: {
    label: 'Org Admin',
    classes: 'bg-blue-100 text-blue-800 ring-blue-600/20',
  },
  [Role.MANAGER]: {
    label: 'Manager',
    classes: 'bg-green-100 text-green-800 ring-green-600/20',
  },
  [Role.BACKOFFICE]: {
    label: 'Backoffice',
    classes: 'bg-yellow-100 text-yellow-800 ring-yellow-600/20',
  },
  [Role.WERKVOORBEREIDER]: {
    label: 'Werkvoorbereider',
    classes: 'bg-orange-100 text-orange-800 ring-orange-600/20',
  },
  [Role.INSPECTEUR]: {
    label: 'Inspecteur',
    classes: 'bg-gray-100 text-gray-800 ring-gray-600/20',
  },
};

export function Badge({ role, className }: BadgeProps) {
  const config = roleConfig[role];

  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
        config.classes,
        className,
      )}
    >
      {config.label}
    </span>
  );
}
